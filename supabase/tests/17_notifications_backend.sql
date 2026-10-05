-- Phase 6A: notifications backend (outbox, messages log, SMS credits, push, reminders).
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/17_notifications_backend.sql
--
-- Plain SQL, not pgTAP (no Docker). Builds its own fixtures (real auth.users, two
-- businesses, extra branches in New_York / Karachi) and rolls everything back.
-- Run it on a database without leftover test data.
--
-- Covered: RLS per role on every new table (owner, manager, receptionist, staff,
-- other business, super admin, anon); outbox rows created by the real RPCs and
-- rolled back with them (success, failed, and an exception after the enqueue);
-- channel rule (email only when an email exists; SMS only without one and only
-- when the branch enabled it; walk-ins silent); the sealed token (decrypts to
-- the raw token before send, no raw token ANYWHERE after send or in the log);
-- claim / complete / fail idempotency, retry backoff, dead state, stale locks
-- (an SMS that may have been sent is never re-sent); guards (stale, suppressed,
-- recipient cap, daily cap, inactive business, sms disabled, no token); SMS
-- segment maths (GSM 160/153, Unicode 70/67, extension chars, emoji, Arabic,
-- Urdu), per-country rates, no_rate, no credits, debit atomic with the decision,
-- refund on failure exactly once, never negative, ledger append-only, balance =
-- sum(ledger); quiet hours and reminder timing across DST (New_York, London,
-- Karachi); the 2-hour rule; suppression; push tokens; maintenance expiry;
-- grants; anon sees nothing; business-delete cascade.

begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got anycompatible, p_want anycompatible)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end; $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

-- Run a statement as a role and report a row count or the SQLSTATE.
create or replace function pg_temp.try_as(p_role text, p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v_n bigint;
begin
  if p_user is not null then perform pg_temp.act_as(p_user); end if;
  if p_role <> 'postgres' then execute format('set local role %I', p_role); end if;
  begin
    execute 'with q as (' || p_sql || ') select count(*) from q' into v_n;
    reset role;
    return 'ok:' || v_n;
  exception when others then
    reset role;
    return 'ERR:' || sqlstate;
  end;
end $$;

-- Run a bare statement (e.g. TRUNCATE) as a role; report ok or the SQLSTATE.
create or replace function pg_temp.try_exec(p_role text, p_user uuid, p_sql text) returns text
language plpgsql as $$
begin
  if p_user is not null then perform pg_temp.act_as(p_user); end if;
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    reset role;
    return 'ok';
  exception when others then
    reset role;
    return 'ERR:' || sqlstate;
  end;
end $$;

-- Row counts a role can SEE (RLS applied).
create or replace function pg_temp.visible(p_user uuid, p_table text) returns text
language plpgsql as $$
begin
  return pg_temp.try_as('authenticated', p_user, format('select 1 from public.%I', p_table));
end $$;

-- ---------------------------------------------------------------------------
-- Users and businesses
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('manager'),('recep'),('staffa'),('ownerb'),('sadmin')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p6.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

alter table public.profiles disable trigger profiles_enforce_guard;
update public.profiles set is_super_admin = true where id = pg_temp.id('sadmin');
alter table public.profiles enable trigger profiles_enforce_guard;

do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P6 A','p6-a','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P6 B','p6-b','US','USD','America/New_York','en',null,'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
end $$;

insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') and is_primary limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') limit 1;

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days'
where id in (pg_temp.id('biza'), pg_temp.id('bizb'));
alter table public.businesses enable trigger businesses_enforce_guard;
update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365
where branch_id in (pg_temp.id('brancha'), pg_temp.id('branchb'));

-- Extra branches in business A: New York and Karachi (reminder / quiet-hour DST).
do $$
declare v_n uuid; v_k uuid;
begin
  insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
  values (pg_temp.id('biza'), 'NY', 'America/New_York', 'USD', 'US', 'NYC') returning id into v_n;
  insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
  values (pg_temp.id('biza'), 'KHI', 'Asia/Karachi', 'PKR', 'PK', 'KHI') returning id into v_k;
  insert into ids values ('branchn', v_n), ('branchk', v_k);
end $$;

-- Members
do $$
declare r record; v_member uuid;
begin
  for r in select * from (values ('manager','manager'),('recep','receptionist'),('staffa','staff')) as x(k, role_key) loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.k), 'active', now()) returning id into v_member;
    insert into ids values ('member_' || r.k, v_member);
    perform pg_temp.act_as(pg_temp.id('owner'));
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member, (select id from public.roles where business_id is null and key = r.role_key), pg_temp.id('brancha'));
  end loop;
end $$;

-- Catalogue + clients (business A)
do $$
declare v_staff uuid; v_other uuid; v_svc uuid; r record; v_id uuid;
begin
  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biza'), pg_temp.id('member_staffa'), 'Staff A') returning id into v_staff;
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Other Person') returning id into v_other;
  insert into ids values ('staffa_profile', v_staff), ('other_profile', v_other);
  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (pg_temp.id('biza'), 'Cut', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, pg_temp.id('brancha'), pg_temp.id('biza'), 4000, true);
  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v_staff, pg_temp.id('brancha'), pg_temp.id('biza')), (v_other, pg_temp.id('brancha'), pg_temp.id('biza'));
  insert into public.service_staff (service_id, staff_id, business_id)
  values (v_svc, v_staff, pg_temp.id('biza')), (v_svc, v_other, pg_temp.id('biza'));
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select pg_temp.id('brancha'), pg_temp.id('biza'), d, 540, 1020 from generate_series(1,5) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select s, pg_temp.id('brancha'), pg_temp.id('biza'), d, 540, 1020
  from generate_series(1,5) d, (values (v_staff),(v_other)) x(s);

  for r in select * from (values
      ('mail',  'Mia Mail',  '+447700900111', 'mia@example.com'),
      ('sms',   'Sam Sms',   '+447700900222', null),
      ('pk',    'Pia Pak',   '+923001234567', null),
      ('us',    'Uma Us',    '+12025550123',  null),
      ('au',    'Ava Au',    '+61412345678',  null),
      ('ae',    'Aya Ae',    '+971501234567', null),
      ('mail2', 'Max Mail',  '+447700900333', 'max@example.com'),
      ('walk',  'Wally Walk','+447700900444', null)) as x(k, nm, ph, em)
  loop
    insert into public.clients (business_id, full_name, phone_e164, email)
    values (pg_temp.id('biza'), r.nm, r.ph, r.em) returning id into v_id;
    insert into ids values ('c_' || r.k, v_id);
  end loop;
end $$;

create or replace function pg_temp.slot(p_weeks int default 2, p_hour int default 10)
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Europe/London')::date + (p_weeks*7) + 1)::date)::timestamp
          + make_interval(hours => p_hour)) at time zone 'Europe/London';
$$;

create or replace function pg_temp.outbox_n(p_where text) returns int language plpgsql as $$
declare n int;
begin execute 'select count(*)::int from public.message_outbox where ' || p_where into n; return n; end $$;

-- A raw token we can search for everywhere.
insert into ids values ('tok_marker', gen_random_uuid());

-- ===========================================================================
-- 1. Defaults, settings, and RLS on notification_settings
-- ===========================================================================
select pg_temp.chk('every branch got a notification_settings row',
  (select count(*)::int from public.notification_settings where business_id = pg_temp.id('biza')), 3);
select pg_temp.chk('defaults: reminders on, 24h, sms off, review requests on, quiet 21:00-08:00',
  (select (reminders_enabled and reminder_hours_before = 24 and not sms_enabled and review_requests_enabled
           and quiet_start_minute = 1260 and quiet_end_minute = 480)::text
   from public.notification_settings where branch_id = pg_temp.id('brancha')), 'true');
select pg_temp.chk('owner reads notification_settings', pg_temp.visible(pg_temp.id('owner'), 'notification_settings'), 'ok:3');
select pg_temp.chk('manager reads notification_settings', pg_temp.visible(pg_temp.id('manager'), 'notification_settings'), 'ok:3');
select pg_temp.chk('other business sees none', pg_temp.visible(pg_temp.id('ownerb'), 'notification_settings') , 'ok:1');
select pg_temp.chk('anon refused on notification_settings', pg_temp.try_as('anon', null, 'select 1 from public.notification_settings'), 'ERR:42501');
select pg_temp.chk('owner can update settings',
  pg_temp.try_as('authenticated', pg_temp.id('owner'), format('update public.notification_settings set reminder_hours_before = 24 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ok:1');
select pg_temp.chk('manager (settings.booking) can update settings',
  pg_temp.try_as('authenticated', pg_temp.id('manager'), format('update public.notification_settings set reminder_hours_before = 24 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ok:1');
select pg_temp.chk('receptionist update changes 0 rows',
  pg_temp.try_as('authenticated', pg_temp.id('recep'), format('update public.notification_settings set reminder_hours_before = 5 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ok:0');
select pg_temp.chk('staff update changes 0 rows',
  pg_temp.try_as('authenticated', pg_temp.id('staffa'), format('update public.notification_settings set reminder_hours_before = 5 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ok:0');
select pg_temp.chk('other business owner cannot update A',
  pg_temp.try_as('authenticated', pg_temp.id('ownerb'), format('update public.notification_settings set reminder_hours_before = 5 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ok:0');
select pg_temp.chk('reminder hours 0 refused', pg_temp.try_as('postgres', null, format('update public.notification_settings set reminder_hours_before = 0 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ERR:23514');
select pg_temp.chk('reminder hours 73 refused', pg_temp.try_as('postgres', null, format('update public.notification_settings set reminder_hours_before = 73 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ERR:23514');
select pg_temp.chk('quiet minute 1440 refused', pg_temp.try_as('postgres', null, format('update public.notification_settings set quiet_start_minute = 1440 where branch_id = %L returning 1', pg_temp.id('brancha'))), 'ERR:23514');
select pg_temp.chk('branch/business cannot be re-pointed',
  pg_temp.try_as('postgres', null, format('update public.notification_settings set business_id = %L where branch_id = %L returning 1', pg_temp.id('bizb'), pg_temp.id('brancha'))), 'ERR:23514');

-- ===========================================================================
-- 2. Enqueue from the real RPCs; channel rule; walk-ins; atomic rollback
-- ===========================================================================
-- Push tokens first, so push fan-out can be asserted.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('manager')); set local role authenticated;
  r := public.register_push_token('ExponentPushToken[manager-device-0001]', 'ios'); reset role;
  perform pg_temp.chk('manager registers a push token', r->>'ok', 'true');
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.register_push_token('ExponentPushToken[recep-device-00001]', 'android'); reset role;
  perform pg_temp.act_as(pg_temp.id('staffa')); set local role authenticated;
  r := public.register_push_token('ExponentPushToken[staffa-device-0001]', 'ios'); reset role;
  perform pg_temp.act_as(pg_temp.id('manager')); set local role authenticated;
  r := public.register_push_token('not a token', 'ios'); reset role;
  perform pg_temp.chk('malformed push token refused with a code', r->>'code', 'invalid_token');
  perform pg_temp.act_as(pg_temp.id('manager')); set local role authenticated;
  r := public.register_push_token('ExponentPushToken[manager-device-0001]', 'tv'); reset role;
  perform pg_temp.chk('unknown platform refused', r->>'code', 'invalid_token');
end $$;
select pg_temp.chk('push token rows stored for three users', (select count(*)::int from public.push_tokens), 3);
select pg_temp.chk('a user reads only their own push tokens', pg_temp.visible(pg_temp.id('manager'), 'push_tokens'), 'ok:1');
select pg_temp.chk('anon refused on push_tokens', pg_temp.try_as('anon', null, 'select 1 from public.push_tokens'), 'ERR:42501');
select pg_temp.chk('manager cannot delete the receptionist''s token',
  pg_temp.try_as('authenticated', pg_temp.id('manager'), $q$delete from public.push_tokens where token = 'ExponentPushToken[recep-device-00001]' returning 1$q$), 'ok:0');
select pg_temp.chk('...it still exists', (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[recep-device-00001]'), 1);

-- Owner books mail-client with staffa (a confirmed booking).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2), p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('c_mail'));
  reset role;
  perform pg_temp.chk('owner books the email client', r->>'ok', 'true');
  insert into ids values ('appt1', (r->>'appointment_id')::uuid);
end $$;

select pg_temp.chk('confirmation queued: one email row, pending, no sealed token',
  (select row(channel, event, status, sealed is null, business_id = pg_temp.id('biza'), branch_id = pg_temp.id('brancha'), client_id = pg_temp.id('c_mail'))::text
   from public.message_outbox where appointment_id = pg_temp.id('appt1') and event = 'booking_confirmed'),
  format('(email,booking_confirmed,pending,t,t,t,t)'));
select pg_temp.chk('...stored idempotency key is booking_confirmed:<appointment>',
  (select idempotency_key from public.message_outbox where appointment_id = pg_temp.id('appt1') and event = 'booking_confirmed'),
  'booking_confirmed:' || pg_temp.id('appt1'));
select pg_temp.chk('...exactly one confirmation for it (email only, never both channels)',
  pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('appt1'), 'booking_confirmed')), 1);
select pg_temp.chk('push: manager + receptionist notified (branch scope), staffa too (own appointment); actor owner has no token',
  (select string_agg(u.email, ',' order by u.email) from public.message_outbox o join auth.users u on u.id = o.user_id
   where o.appointment_id = pg_temp.id('appt1') and o.event = 'staff_new_booking'),
  'p6.manager@example.com,p6.recep@example.com,p6.staffa@example.com');
select pg_temp.chk('push rows are channel push with no client', (select bool_and(channel = 'push' and client_id is null)::text from public.message_outbox where event = 'staff_new_booking'), 'true');

-- Actor exclusion: the manager books for the OTHER staff member -> manager not notified, staffa not either (not their appointment).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('manager')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 12), p_staff_id => pg_temp.id('other_profile'), p_client_id => pg_temp.id('c_mail2'));
  reset role;
  insert into ids values ('appt2', (r->>'appointment_id')::uuid);
end $$;
select pg_temp.chk('actor (manager) is not pushed about their own action; staffa (Own) not pushed about a colleague''s booking',
  (select string_agg(u.email, ',' order by u.email) from public.message_outbox o join auth.users u on u.id = o.user_id
   where o.appointment_id = pg_temp.id('appt2') and o.event = 'staff_new_booking'),
  'p6.recep@example.com');

-- Client without an email and SMS off: nothing queued.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 14), p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('c_sms'));
  reset role;
  insert into ids values ('appt3', (r->>'appointment_id')::uuid);
end $$;
select pg_temp.chk('no email + SMS off: no client message queued',
  pg_temp.outbox_n(format('appointment_id = %L and client_id is not null', pg_temp.id('appt3'))), 0);

-- SMS on for the branch: the same client now gets an SMS; the email client still gets email only.
update public.notification_settings set sms_enabled = true where branch_id = pg_temp.id('brancha');
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 15), p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('c_sms'));
  insert into ids values ('appt4', (r->>'appointment_id')::uuid);
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 16), p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('c_mail'));
  insert into ids values ('appt5', (r->>'appointment_id')::uuid);
  reset role;
end $$;
select pg_temp.chk('no email + SMS on: one SMS row',
  (select row(channel, event, status)::text from public.message_outbox where appointment_id = pg_temp.id('appt4') and client_id is not null), '(sms,booking_confirmed,pending)');
select pg_temp.chk('email present + SMS on: email ONLY (no sms row for that appointment)',
  (select string_agg(channel, ',') from public.message_outbox where appointment_id = pg_temp.id('appt5') and client_id is not null), 'email');

-- Walk-in: silent.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 11), p_staff_id => pg_temp.id('other_profile'), p_client_id => pg_temp.id('c_walk'), p_source => 'walk_in');
  reset role;
  insert into ids values ('appt_walk', (r->>'appointment_id')::uuid);
end $$;
select pg_temp.chk('walk-in generates no messages at all', pg_temp.outbox_n(format('appointment_id = %L', pg_temp.id('appt_walk'))), 0);

-- Failed action: slot taken -> nothing queued.
select count(*)::int as n into temporary table before_fail from public.message_outbox;
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2), p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('c_mail2'));
  reset role;
  perform pg_temp.chk('double-booking refused (setup for the failure-path check)', r->>'ok', 'false');
end $$;
select pg_temp.chk('a FAILED create_appointment queued nothing', (select count(*)::int from public.message_outbox), (select n from before_fail));

-- Exception after the enqueue: everything rolls back together (subtransaction).
do $$
declare r jsonb; v_before int; v_after int; v_appt uuid;
begin
  select count(*) into v_before from public.message_outbox;
  begin
    perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
    r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(3, 10), p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('c_mail2'));
    reset role;
    v_appt := (r->>'appointment_id')::uuid;
    perform pg_temp.chk('(inside the doomed subtransaction the rows exist)',
      (select count(*)::int > v_before from public.message_outbox), true);
    raise exception 'boom';
  exception when others then
    reset role;
  end;
  select count(*) into v_after from public.message_outbox;
  perform pg_temp.chk('outbox rows rolled back WITH the failed action', v_after, v_before);
  perform pg_temp.chk('...and the appointment itself is gone', (select count(*)::int from public.appointments where id = v_appt), 0);
end $$;

-- Idempotent enqueue: the same key twice is one row.
do $$
declare a uuid; b uuid;
begin
  a := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:idem:1', null, pg_temp.id('c_mail'));
  b := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:idem:1', null, pg_temp.id('c_mail'));
  perform pg_temp.chk('first enqueue returns an id', a is not null, true);
  perform pg_temp.chk('same idempotency key: second enqueue returns null', b is null, true);
  perform pg_temp.chk('...and exactly one row exists', pg_temp.outbox_n($q$idempotency_key = 'test:idem:1'$q$), 1);
end $$;

-- Status RPCs.
do $$
declare r jsonb;
begin
  -- reschedule appt1 -> rescheduled row with the old time, nothing else pointless left
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.update_appointment(pg_temp.id('appt1'), pg_temp.slot(2, 13));
  reset role;
  perform pg_temp.chk('update_appointment reschedule ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('reschedule queued one email "rescheduled" carrying the OLD start in payload',
  (select row(channel, status, (payload->>'old_starts_at') is not null)::text from public.message_outbox where appointment_id = pg_temp.id('appt1') and event = 'rescheduled'),
  '(email,pending,t)');
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.update_appointment(pg_temp.id('appt5'), null, null, 'a note', null);
  reset role;
  perform pg_temp.chk('notes-only update succeeds', r->>'ok', 'true');
end $$;
select pg_temp.chk('...still only the one confirmation for appt5', pg_temp.outbox_n(format('appointment_id = %L and client_id is not null', pg_temp.id('appt5'))), 1);

-- A pending reminder row gets cancelled by cancel / reschedule.
do $$
declare v_id uuid;
begin
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'reminder', 'test:rem:appt5', pg_temp.id('appt5'), pg_temp.id('c_mail'));
  insert into ids values ('rem5', v_id);
end $$;
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.cancel_appointment(pg_temp.id('appt5'), 'test');
  reset role;
  perform pg_temp.chk('cancel_appointment ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('cancel queued one "cancelled" email',
  (select row(channel, status)::text from public.message_outbox where appointment_id = pg_temp.id('appt5') and event = 'cancelled'), '(email,pending)');
select pg_temp.chk('...and cancelled the unsent confirmation and reminder (superseded)',
  (select string_agg(event || ':' || status, ',' order by event) from public.message_outbox where appointment_id = pg_temp.id('appt5') and event in ('booking_confirmed','reminder')),
  'booking_confirmed:cancelled,reminder:cancelled');
select pg_temp.chk('push "staff_cancelled" fanned out to branch-scope members',
  (select count(*)::int from public.message_outbox where appointment_id = pg_temp.id('appt5') and event = 'staff_cancelled'), 3);

-- Pending (manual approval) + approve.
update public.booking_settings set confirmation = 'manual' where branch_id = pg_temp.id('brancha');
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 9), p_staff_id => pg_temp.id('other_profile'), p_client_id => pg_temp.id('c_mail2'), p_auto_confirm => false);
  insert into ids values ('appt_pend', (r->>'appointment_id')::uuid);
  reset role;
end $$;
update public.booking_settings set confirmation = 'auto' where branch_id = pg_temp.id('brancha');
select pg_temp.chk('pending booking: "pending_received" email + approval push to approvers only',
  (select string_agg(event, ',' order by event) from public.message_outbox where appointment_id = pg_temp.id('appt_pend') and event in ('pending_received','booking_confirmed')),
  'pending_received');
select pg_temp.chk('...approval push goes to holders of appointments.approve (manager, receptionist), not staff',
  (select string_agg(u.email, ',' order by u.email) from public.message_outbox o join auth.users u on u.id = o.user_id where o.appointment_id = pg_temp.id('appt_pend') and o.event = 'staff_pending_approval'),
  'p6.manager@example.com,p6.recep@example.com');
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.approve_appointment(pg_temp.id('appt_pend'));
  reset role;
  perform pg_temp.chk('approve ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('approving queues the confirmation', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('appt_pend'), 'booking_confirmed')), 1);

-- mark_completed -> review request, sealed, same transaction; reissue -> new request row.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.mark_completed(pg_temp.id('appt_pend'));
  reset role;
  perform pg_temp.chk('mark_completed ok', r->>'ok', 'true');
  perform set_config('p6.raw_review', r->'review_request'->>'token', true);
end $$;
select pg_temp.chk('review request queued: email, linked to the review_requests row, token SEALED (not null)',
  (select row(channel, status, review_request_id is not null, sealed is not null)::text from public.message_outbox where appointment_id = pg_temp.id('appt_pend') and event = 'review_request'),
  '(email,pending,t,t)');
select pg_temp.chk('the sealed value decrypts to exactly the raw review token the dashboard got',
  (select public.outbox_unseal(sealed) = current_setting('p6.raw_review') from public.message_outbox where appointment_id = pg_temp.id('appt_pend') and event = 'review_request'), true);
select pg_temp.chk('the raw review token appears nowhere in any outbox column (only ciphertext)',
  (select count(*)::int from public.message_outbox o where row_to_json(o)::text like '%' || current_setting('p6.raw_review') || '%'), 0);
select pg_temp.chk('completing cancelled pending reminders (none left open)',
  pg_temp.outbox_n(format('appointment_id = %L and event = %L and status in (%L,%L)', pg_temp.id('appt_pend'), 'reminder', 'pending', 'retry')), 0);
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.reissue_review_request(pg_temp.id('appt_pend'));
  reset role;
  perform set_config('p6.raw_review2', r->'review_request'->>'token', true);
end $$;
select pg_temp.chk('reissue queued a SECOND review email (new key), sealed to the NEW token',
  (select count(*)::int from public.message_outbox where appointment_id = pg_temp.id('appt_pend') and event = 'review_request' and public.outbox_unseal(sealed) = current_setting('p6.raw_review2')), 1);
select pg_temp.chk('review_requests.sent_at is still null before sending',
  (select sent_at is null from public.review_requests where appointment_id = pg_temp.id('appt_pend')), true);

-- Review requests switched off per branch.
update public.notification_settings set review_requests_enabled = false where branch_id = pg_temp.id('brancha');
select pg_temp.chk('review_requests_enabled=false: enqueue returns null',
  public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'review_request', 'test:rr:off', null, pg_temp.id('c_mail')) is null, true);
update public.notification_settings set review_requests_enabled = true where branch_id = pg_temp.id('brancha');

-- resend_manage_link (dashboard) and create_booking (public) seal the manage token.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.resend_manage_link(pg_temp.id('appt1'), repeat('ab', 32));
  reset role;
  perform pg_temp.chk('resend_manage_link ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('resend queued a manage_link email whose sealed value is the raw token',
  (select count(*)::int from public.message_outbox where appointment_id = pg_temp.id('appt1') and event = 'manage_link' and public.outbox_unseal(sealed) = repeat('ab', 32)), 1);
select pg_temp.chk('the raw manage token appears in no outbox column',
  (select count(*)::int from public.message_outbox o where row_to_json(o)::text like '%' || repeat('ab', 32) || '%'), 0);
select pg_temp.chk('resend by a receptionist is allowed (appointments.edit) but staff on another''s row is not queued',
  pg_temp.try_as('authenticated', pg_temp.id('ownerb'), format('select (public.resend_manage_link(%L, %L))', pg_temp.id('appt1'), repeat('cd', 32))), 'ok:1');
select pg_temp.chk('...another business''s resend queued nothing',
  (select count(*)::int from public.message_outbox where appointment_id = pg_temp.id('appt1') and event = 'manage_link'), 1);

do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 16), pg_temp.id('other_profile'),
        'Pub Lic', '+447700900555', 'pub@example.com', null, '[]'::jsonb, repeat('ef', 32));
  perform pg_temp.chk('create_booking (public path) ok', r->>'ok', 'true');
  insert into ids values ('appt_pub', (r->>'appointment_id')::uuid);
end $$;
select pg_temp.chk('create_booking queued a confirmation email with the manage token sealed in',
  (select count(*)::int from public.message_outbox where appointment_id = pg_temp.id('appt_pub') and event = 'booking_confirmed' and channel = 'email' and public.outbox_unseal(sealed) = repeat('ef', 32)), 1);
select pg_temp.chk('...no raw manage token in any outbox column',
  (select count(*)::int from public.message_outbox o where row_to_json(o)::text like '%' || repeat('ef', 32) || '%'), 0);
select pg_temp.chk('a FAILED create_booking (taken slot) queues nothing',
  (select (public.create_booking(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(2, 16), pg_temp.id('other_profile'), 'Z Z', '+447700900666', 'z@example.com', null, '[]'::jsonb, repeat('12', 32))->>'ok')), 'false');
select pg_temp.chk('...and no client row/outbox for that phone',
  (select count(*)::int from public.clients where phone_e164 = '+447700900666'), 0);

-- ===========================================================================
-- 3. Worker: claim / complete / fail / retry / dead / stale
-- ===========================================================================
-- Isolate: park every open row, then release only the one under test.
create or replace function pg_temp.park_except(p_id uuid) returns void language sql as $$
  update public.message_outbox set deliver_after = now() + interval '10 years'
  where status in ('pending','retry') and id <> p_id;
  update public.message_outbox set deliver_after = now() where id = p_id and status in ('pending','retry');
$$;
create or replace function pg_temp.claim_job(p_id uuid) returns jsonb language plpgsql as $$
declare j jsonb;
begin
  perform pg_temp.park_except(p_id);
  select e into j from jsonb_array_elements(public.outbox_claim(50)) e where e->>'id' = p_id::text;
  return j;
end $$;

-- A confirmation with a sealed token, driven through the whole lifecycle.
do $$
declare v_id uuid; j jsonb;
begin
  select id into v_id from public.message_outbox where appointment_id = pg_temp.id('appt_pub') and event = 'booking_confirmed';
  insert into ids values ('ob_pub', v_id);
  j := pg_temp.claim_job(v_id);
  perform pg_temp.chk('claim returns the job', j is not null, true);
  perform pg_temp.chk('job carries the unsealed raw token', j->>'token', repeat('ef', 32));
  perform pg_temp.chk('job carries the recipient address and hash',
    (j->>'to') || '|' || length(j->>'recipient_hash')::text, 'pub@example.com|64');
  perform pg_temp.chk('job context: slug, language, branch tz, first name only',
    (j->>'slug') || '|' || (j->>'language') || '|' || (j->>'timezone') || '|' || (j->>'client_first_name'), 'p6-a|en|Europe/London|Pub');
  perform pg_temp.chk('row is now sending, attempts 1, locked', (select row(status, attempts, locked_until > now())::text from public.message_outbox where id = v_id), '(sending,1,t)');
  perform pg_temp.chk('claiming again returns nothing for it (no double claim)',
    (select count(*)::int from jsonb_array_elements(public.outbox_claim(50)) e where e->>'id' = v_id::text), 0);
end $$;
do $$
declare r jsonb; v_id uuid := pg_temp.id('ob_pub'); v_raw text := repeat('ef', 32);
begin
  r := public.outbox_complete(v_id, 'resend', 're_msg_123');
  perform pg_temp.chk('complete ok', r->>'ok', 'true');
  perform pg_temp.chk('row sent, token nulled, timestamps set',
    (select row(status, sealed is null, sent_at is not null, finished_at is not null, last_error is null)::text from public.message_outbox where id = v_id), '(sent,t,t,t,t)');
  perform pg_temp.chk('log row: sent, resend, provider id, masked recipient, 64-hex hash',
    (select row(status, provider, provider_id, recipient_masked, length(recipient_hash), channel, event)::text from public.messages where outbox_id = v_id),
    '(sent,resend,re_msg_123,p***@example.com,64,email,booking_confirmed)');
  perform pg_temp.chk('NO raw token in the outbox after the send',
    (select count(*)::int from public.message_outbox o where row_to_json(o)::text like '%' || v_raw || '%'), 0);
  perform pg_temp.chk('NO raw token in the messages log',
    (select count(*)::int from public.messages m where row_to_json(m)::text like '%' || v_raw || '%'), 0);
  perform pg_temp.chk('NO full link or address in the messages log',
    (select count(*)::int from public.messages m where row_to_json(m)::text ~* '(https?://|pub@example\.com|#token=)'), 0);
  perform pg_temp.chk('NO raw token in the ledger or audit log either',
    (select count(*)::int from public.audit_logs a where a.after::text like '%' || v_raw || '%'), 0);
  r := public.outbox_complete(v_id, 'resend', 're_msg_123');
  perform pg_temp.chk('complete twice is idempotent', r->>'already', 'true');
  perform pg_temp.chk('...still exactly one log row', (select count(*)::int from public.messages where outbox_id = v_id), 1);
  r := public.outbox_fail(v_id, 'late failure', true);
  perform pg_temp.chk('fail after sent is refused (not_sending)', r->>'code', 'not_sending');
  perform pg_temp.chk('...the sent row is unchanged', (select status from public.message_outbox where id = v_id), 'sent');
end $$;

-- Retry with backoff, error scrubbing, dead after 5 attempts.
do $$
declare v_id uuid; j jsonb; r jsonb; i int;
begin
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:retry:1', null, pg_temp.id('c_mail'), null, null, null, '{}', repeat('9a', 32));
  insert into ids values ('ob_retry', v_id);
  for i in 1..4 loop
    j := pg_temp.claim_job(v_id);
    perform pg_temp.chk('attempt ' || i || ' claimed', (j->>'attempt')::int, i);
    r := public.outbox_fail(v_id, 'timeout talking to a@b.com or +447700900111 via https://x.y/z?t=' || repeat('ab', 20), true);
    perform pg_temp.chk('attempt ' || i || ' -> retry', r->>'status', 'retry');
    perform pg_temp.chk('attempt ' || i || ' backoff is ' || power(4, i-1)::int || ' min',
      (select round(extract(epoch from (deliver_after - now())) / 60)::int from public.message_outbox where id = v_id), power(4, i-1)::int);
    if i = 1 then
      perform pg_temp.chk('an AMBIGUOUS failure keeps the same idempotency key (no suffix)',
        (select idem_suffix from public.message_outbox where id = v_id), 0);
      perform pg_temp.chk('error scrubbed: no email, phone, url or hex stored',
        (select last_error from public.message_outbox where id = v_id), 'timeout talking to [email] or [number] via [url]');
      perform pg_temp.chk('...token still sealed while retrying', (select sealed is not null from public.message_outbox where id = v_id), true);
      perform pg_temp.chk('...parked in retry with a future deliver_after (not claimable yet)',
        (select (status = 'retry' and deliver_after > now())::text from public.message_outbox where id = v_id), 'true');
    end if;
  end loop;
  j := pg_temp.claim_job(v_id);
  r := public.outbox_fail(v_id, 'still down', true);
  perform pg_temp.chk('5th failure -> dead', r->>'status', 'dead');
  perform pg_temp.chk('dead row: token nulled, finished, code max_attempts',
    (select row(status, sealed is null, finished_at is not null, last_error)::text from public.message_outbox where id = v_id), '(dead,t,t,max_attempts)');
  perform pg_temp.chk('dead is logged as failed', (select row(status, code)::text from public.messages where outbox_id = v_id), '(failed,max_attempts)');
  perform pg_temp.chk('a dead row is not in a claimable state',
    (select count(*)::int from public.message_outbox where id = v_id and status in ('pending','retry','sending')), 0);
end $$;

-- Resend idempotency: definite failure -> fresh key next attempt; ambiguous -> same key.
do $$
declare v_id uuid; j jsonb; r jsonb;
begin
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:idem:key', null, pg_temp.id('c_mail'), null, null, null, '{}', repeat('3d', 32));
  j := pg_temp.claim_job(v_id);
  perform pg_temp.chk('first attempt uses the base key', j->>'idempotency_key', 'test:idem:key');
  r := public.outbox_fail(v_id, 'timeout', true, false);
  perform pg_temp.chk('ambiguous failure: suffix stays 0', (select idem_suffix from public.message_outbox where id = v_id), 0);
  j := pg_temp.claim_job(v_id);
  perform pg_temp.chk('...retry reuses the SAME key', j->>'idempotency_key', 'test:idem:key');
  r := public.outbox_fail(v_id, '429', true, true);
  perform pg_temp.chk('definite failure: suffix becomes 1', (select idem_suffix from public.message_outbox where id = v_id), 1);
  j := pg_temp.claim_job(v_id);
  perform pg_temp.chk('...retry uses a FRESH key', j->>'idempotency_key', 'test:idem:key:1');
  perform pg_temp.chk('...and the stored unique key itself is unchanged',
    (select idempotency_key from public.message_outbox where id = v_id), 'test:idem:key');
  -- stale lock = ambiguous: key unchanged
  update public.message_outbox set locked_until = now() - interval '1 minute' where id = v_id;
  perform pg_temp.park_except(v_id);
  perform public.outbox_claim(1, null);
  perform pg_temp.chk('stale lock recovery does not change the key', (select idem_suffix from public.message_outbox where id = v_id), 1);
  perform pg_temp.chk('a non-retryable failure never changes the suffix',
    (select (public.outbox_fail(v_id, 'x', false, true)->>'status')), 'dead');
end $$;

-- Non-retryable failure goes dead at once.
do $$
declare v_id uuid; j jsonb; r jsonb;
begin
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:nonretry:1', null, pg_temp.id('c_mail'), null, null, null, '{}', repeat('7c', 32));
  j := pg_temp.claim_job(v_id);
  r := public.outbox_fail(v_id, 'invalid recipient', false);
  perform pg_temp.chk('non-retryable -> dead on first attempt', r->>'status', 'dead');
  perform pg_temp.chk('...code rejected, token nulled', (select row(last_error, sealed is null)::text from public.message_outbox where id = v_id), '(rejected,t)');
end $$;

-- Stale locks.
do $$
declare v_email uuid; v_sms_a uuid; v_sms_b uuid;
begin
  v_email := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:stale:email', null, pg_temp.id('c_mail'));
  perform pg_temp.claim_job(v_email);
  update public.message_outbox set locked_until = now() - interval '1 minute' where id = v_email;
  perform pg_temp.park_except(v_email);
  perform public.outbox_claim(1);
  perform pg_temp.chk('stale email lock -> recovered and re-claimed (attempts 2)',
    (select row(status, attempts)::text from public.message_outbox where id = v_email), '(sending,2)');

  v_sms_a := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:stale:smsA', null, pg_temp.id('c_sms'));
  perform pg_temp.claim_job(v_sms_a);
  update public.message_outbox set locked_until = now() - interval '1 minute' where id = v_sms_a;   -- crashed BEFORE the provider call
  perform pg_temp.park_except(v_sms_a);
  perform public.outbox_claim(1);
  perform pg_temp.chk('stale SMS with no debit -> safely retried', (select attempts from public.message_outbox where id = v_sms_a), 2);

  v_sms_b := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:stale:smsB', null, pg_temp.id('c_sms'));
  perform pg_temp.claim_job(v_sms_b);
  update public.message_outbox set provider_call_at = now(), locked_until = now() - interval '1 minute' where id = v_sms_b;  -- crashed AFTER debit
  perform public.outbox_claim(1);
  perform pg_temp.chk('stale SMS that may have been sent -> DEAD ambiguous_send, never re-sent',
    (select row(status, last_error, sealed is null)::text from public.message_outbox where id = v_sms_b), '(dead,ambiguous_send,t)');
end $$;

-- ===========================================================================
-- 4. Guards
-- ===========================================================================
-- stale: reminder for a cancelled/completed appointment (trigger bypassed to hit the guard itself)
do $$
declare v_id uuid; j jsonb;
begin
  alter table public.appointments disable trigger appointments_notify;
  update public.appointments set status = 'completed' where id = pg_temp.id('appt3');
  alter table public.appointments enable trigger appointments_notify;
  -- appt3 (completed) reminder row
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'reminder', 'test:guard:stale', pg_temp.id('appt3'), pg_temp.id('c_mail'));
  perform pg_temp.claim_job(v_id);
  perform pg_temp.chk('reminder for a completed appointment is skipped as stale',
    (select row(status, last_error, sealed is null)::text from public.message_outbox where id = v_id), '(skipped,stale,t)');
  perform pg_temp.chk('...logged as skipped', (select row(status, code)::text from public.messages where outbox_id = v_id), '(skipped,stale)');
end $$;

-- suppression: optional events suppressed, transactional not
do $$
declare v_h text; v_rem uuid; v_conf uuid; v_ok boolean;
begin
  v_h := public.message_recipient_hash('max@example.com');
  v_ok := public.suppress_recipient(pg_temp.id('biza'), 'email', v_h, 'unsubscribe_link');
  perform pg_temp.chk('suppress_recipient inserts', v_ok, true);
  perform pg_temp.chk('suppressing twice leaves one row',
    (public.suppress_recipient(pg_temp.id('biza'), 'email', v_h, 'unsubscribe_link'))::text || (select count(*)::int from public.message_suppressions where recipient_hash = v_h), 'true1');
  perform pg_temp.chk('bad hash is refused, nothing stored', (public.suppress_recipient(pg_temp.id('biza'), 'email', 'nothex', 'unsubscribe_link'))::text, 'false');
  perform pg_temp.chk('unknown business: returns false, never raises, nothing stored',
    (public.suppress_recipient(gen_random_uuid(), 'email', v_h, 'unsubscribe_link'))::text || (select count(*)::int from public.message_suppressions where business_id = pg_temp.id('biza')), 'false1');
  perform pg_temp.chk('bad channel refused', (public.suppress_recipient(pg_temp.id('biza'), 'push', v_h, 'unsubscribe_link'))::text, 'false');
  v_rem := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'reminder', 'test:sup:rem', pg_temp.id('appt2'), pg_temp.id('c_mail2'));
  perform pg_temp.claim_job(v_rem);
  perform pg_temp.chk('opted-out recipient: reminder skipped (suppressed)', (select row(status, last_error)::text from public.message_outbox where id = v_rem), '(skipped,suppressed)');
  v_conf := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'cancelled', 'test:sup:conf', pg_temp.id('appt2'), pg_temp.id('c_mail2'));
  perform pg_temp.chk('...a TRANSACTIONAL message to the same recipient is NOT suppressed',
    (select (pg_temp.claim_job(v_conf)) is not null), true);
end $$;
select pg_temp.chk('suppression is per business: another business is unaffected',
  (select count(*)::int from public.message_suppressions where business_id = pg_temp.id('bizb')), 0);

-- recipient cap (5 / 24 h), across businesses
do $$
declare v_h text; v_id uuid; i int;
begin
  v_h := public.message_recipient_hash('mia@example.com');
  for i in 1..5 loop
    insert into public.messages (business_id, channel, event, recipient_hash, recipient_masked, status) values (pg_temp.id('bizb'), 'email', 'booking_confirmed', v_h, 'm***', 'sent');
  end loop;
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:cap:rec', null, pg_temp.id('c_mail'));
  perform pg_temp.claim_job(v_id);
  perform pg_temp.chk('5 messages already sent to this recipient in 24h (even by another business): skipped recipient_cap',
    (select row(status, last_error)::text from public.message_outbox where id = v_id), '(skipped,recipient_cap)');
end $$;

-- daily cap
do $$
declare v_id uuid;
begin
  update public.messaging_limits set value = 1 where key = 'daily_email';
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:cap:daily', null, pg_temp.id('c_mail2'));
  perform pg_temp.claim_job(v_id);
  perform pg_temp.chk('per-business daily email cap reached: skipped daily_cap', (select row(status, last_error)::text from public.message_outbox where id = v_id), '(skipped,daily_cap)');
  update public.messaging_limits set value = 500 where key = 'daily_email';
  perform pg_temp.chk('caps are per business: business B unaffected',
    (select count(*)::int from public.message_outbox where business_id = pg_temp.id('bizb') and status = 'skipped'), 0);
end $$;

-- inactive business, sms disabled, no token
do $$
declare v_id uuid; v_sms uuid; v_push uuid; v_user uuid := pg_temp.id('staffa');
begin
  v_sms := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:smsoff', null, pg_temp.id('c_sms'));
  update public.notification_settings set sms_enabled = false where branch_id = pg_temp.id('brancha');
  perform pg_temp.claim_job(v_sms);
  perform pg_temp.chk('SMS switched off after queueing: skipped sms_disabled', (select last_error from public.message_outbox where id = v_sms), 'sms_disabled');
  update public.notification_settings set sms_enabled = true where branch_id = pg_temp.id('brancha');

  delete from public.push_tokens where user_id = v_user;
  v_push := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'staff_cancelled', 'test:push:notoken', pg_temp.id('appt1'), null, v_user);
  perform pg_temp.chk('push enqueued for a user (row exists even with no token yet)', v_push is not null, true);
  perform pg_temp.claim_job(v_push);
  perform pg_temp.chk('push with no token: skipped no_token', (select last_error from public.message_outbox where id = v_push), 'no_token');
  insert into public.push_tokens (user_id, token, platform) values (v_user, 'ExponentPushToken[staffa-device-0001]', 'ios');

  alter table public.businesses disable trigger businesses_enforce_guard;
  update public.businesses set status = 'inactive' where id = pg_temp.id('biza');
  alter table public.businesses enable trigger businesses_enforce_guard;
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:inactive', null, pg_temp.id('c_mail2'));
  perform pg_temp.claim_job(v_id);
  perform pg_temp.chk('inactive business: skipped business_inactive', (select last_error from public.message_outbox where id = v_id), 'business_inactive');
  alter table public.businesses disable trigger businesses_enforce_guard;
  update public.businesses set status = 'trialing' where id = pg_temp.id('biza');
  alter table public.businesses enable trigger businesses_enforce_guard;
end $$;

-- push: claim returns tokens; dead tokens are removed on complete
do $$
declare v_push uuid; j jsonb; r jsonb; v_tok uuid;
begin
  insert into public.push_tokens (user_id, token, platform) values (pg_temp.id('staffa'), 'ExponentPushToken[staffa-device-0002]', 'android');
  v_push := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'staff_cancelled', 'test:push:ok', pg_temp.id('appt1'), null, pg_temp.id('staffa'));
  j := pg_temp.claim_job(v_push);
  perform pg_temp.chk('push job carries both device tokens', jsonb_array_length(j->'tokens'), 2);
  perform pg_temp.chk('push job has no client address', j->>'to', null);
  select id into v_tok from public.push_tokens where token = 'ExponentPushToken[staffa-device-0002]';
  r := public.outbox_complete(v_push, 'expo', null, array[v_tok]);
  perform pg_temp.chk('push complete ok', r->>'ok', 'true');
  perform pg_temp.chk('the dead token was removed, the live one kept',
    (select string_agg(token, ',') from public.push_tokens where user_id = pg_temp.id('staffa')), 'ExponentPushToken[staffa-device-0001]');
  perform pg_temp.chk('push log row has no recipient hash, masked "push"',
    (select row(recipient_hash is null, recipient_masked, provider)::text from public.messages where outbox_id = v_push), '(t,push,expo)');
  perform pg_temp.chk('complete cannot delete ANOTHER user''s token',
    (select count(*)::int from public.push_tokens where user_id = pg_temp.id('manager')), 1);
end $$;

-- token ownership moves with the device
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.register_push_token('ExponentPushToken[manager-device-0001]', 'ios');
  reset role;
  perform pg_temp.chk('same device token registered by someone else moves to them',
    (select user_id from public.push_tokens where token = 'ExponentPushToken[manager-device-0001]'), pg_temp.id('recep'));
  perform pg_temp.chk('...still one row for that token', (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[manager-device-0001]'), 1);
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  perform public.unregister_push_token('ExponentPushToken[manager-device-0001]');
  reset role;
  perform pg_temp.chk('unregister removes own token', (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[manager-device-0001]'), 0);
end $$;

-- ===========================================================================
-- 5. SMS segments, rates, credits
-- ===========================================================================
create or replace function pg_temp.seg(p text) returns text language sql as $$
  select out_encoding || ':' || out_units || ':' || out_segments from public.sms_segments(p) $$;
select pg_temp.chk('GSM 160 chars = 1 segment', pg_temp.seg(repeat('a',160)), 'gsm7:160:1');
select pg_temp.chk('GSM 161 chars = 2 segments (153 multipart)', pg_temp.seg(repeat('a',161)), 'gsm7:161:2');
select pg_temp.chk('GSM 306 chars = 2 segments', pg_temp.seg(repeat('a',306)), 'gsm7:306:2');
select pg_temp.chk('GSM 307 chars = 3 segments', pg_temp.seg(repeat('a',307)), 'gsm7:307:3');
select pg_temp.chk('GSM extension chars count double: 80 euro signs = 160 units = 1 segment', pg_temp.seg(repeat('€',80)), 'gsm7:160:1');
select pg_temp.chk('81 euro signs = 162 units = 2 segments', pg_temp.seg(repeat('€',81)), 'gsm7:162:2');
select pg_temp.chk('a curly quote forces UCS-2', pg_temp.seg('it’s'), 'ucs2:4:1');
select pg_temp.chk('Arabic 70 chars = 1 segment', pg_temp.seg(repeat('ا',70)), 'ucs2:70:1');
select pg_temp.chk('Arabic 71 chars = 2 segments (67 multipart)', pg_temp.seg(repeat('ا',71)), 'ucs2:71:2');
select pg_temp.chk('Arabic 134 chars = 2 segments', pg_temp.seg(repeat('ا',134)), 'ucs2:134:2');
select pg_temp.chk('Arabic 135 chars = 3 segments', pg_temp.seg(repeat('ا',135)), 'ucs2:135:3');
select pg_temp.chk('Urdu text is UCS-2', pg_temp.seg('آپ کی ملاقات کل صبح دس بجے ہے'), 'ucs2:29:1');
select pg_temp.chk('an emoji is 2 UTF-16 units', pg_temp.seg('hi 😀'), 'ucs2:5:1');
select pg_temp.chk('empty text = 0 segments', pg_temp.seg(''), 'gsm7:0:0');
select pg_temp.chk('rate: +44 -> UK 56', (public.sms_rate_for('+442071234567')).credits_per_segment, 56);
select pg_temp.chk('rate: +1 -> US 12', (public.sms_rate_for('+12025550123')).credits_per_segment, 12);
select pg_temp.chk('rate: +61 -> AU 52', (public.sms_rate_for('+61412345678')).credits_per_segment, 52);
select pg_temp.chk('rate: +971 -> UAE 118', (public.sms_rate_for('+971501234567')).credits_per_segment, 118);
select pg_temp.chk('rate: +92 (Pakistan) -> none', (public.sms_rate_for('+923001234567')).dial_code, null);
select pg_temp.chk('rate: junk number -> none', (public.sms_rate_for('0770')).dial_code, null);
select pg_temp.chk('longest prefix wins (+971 not +9)', (public.sms_rate_for('+971501234567')).dial_code, '971');

-- credits: super admin only, audited
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.admin_add_sms_credits(pg_temp.id('biza'), 5000, 'owner tries'); reset role;
  perform pg_temp.chk('business owner cannot add credits', r->>'code', 'forbidden');
  perform pg_temp.chk('...ledger untouched', (select count(*)::int from public.sms_credit_ledger where business_id = pg_temp.id('biza')), 0);
  perform pg_temp.act_as(pg_temp.id('sadmin')); set local role authenticated;
  r := public.admin_add_sms_credits(pg_temp.id('biza'), 0, null); reset role;
  perform pg_temp.chk('zero credits refused', r->>'code', 'invalid_amount');
  perform pg_temp.act_as(pg_temp.id('sadmin')); set local role authenticated;
  r := public.admin_add_sms_credits(gen_random_uuid(), 100, null); reset role;
  perform pg_temp.chk('unknown business refused', r->>'code', 'not_found');
  perform pg_temp.act_as(pg_temp.id('sadmin')); set local role authenticated;
  r := public.admin_add_sms_credits(pg_temp.id('biza'), -1, null); reset role;
  perform pg_temp.chk('a correction below zero is refused, balance never negative', r->>'code', 'insufficient');
  perform pg_temp.act_as(pg_temp.id('sadmin')); set local role authenticated;
  r := public.admin_add_sms_credits(pg_temp.id('biza'), 1000, 'pack'); reset role;
  perform pg_temp.chk('super admin adds 1000', r->>'balance', '1000');
  perform pg_temp.chk('...ledger row stored: purchase, +1000, balance_after 1000, note, actor',
    (select row(kind, amount, balance_after, note, created_by = pg_temp.id('sadmin'))::text from public.sms_credit_ledger where business_id = pg_temp.id('biza')), '(purchase,1000,1000,pack,t)');
  perform pg_temp.chk('...audited', (select count(*)::int from public.audit_logs where business_id = pg_temp.id('biza') and action = 'sms.credits_changed'), 1);
end $$;
select pg_temp.chk('owner can read their balance row', pg_temp.try_as('authenticated', pg_temp.id('owner'), format('select 1 from public.sms_credit_accounts where business_id = %L', pg_temp.id('biza'))), 'ok:1');
select pg_temp.chk('other business cannot read it', pg_temp.try_as('authenticated', pg_temp.id('ownerb'), format('select 1 from public.sms_credit_accounts where business_id = %L', pg_temp.id('biza'))), 'ok:0');
select pg_temp.chk('anon refused on the ledger', pg_temp.try_as('anon', null, 'select 1 from public.sms_credit_ledger'), 'ERR:42501');
select pg_temp.chk('anon refused on accounts', pg_temp.try_as('anon', null, 'select 1 from public.sms_credit_accounts'), 'ERR:42501');
select pg_temp.chk('authenticated cannot insert ledger rows directly',
  pg_temp.try_as('authenticated', pg_temp.id('owner'), format('insert into public.sms_credit_ledger (business_id, kind, amount, balance_after) values (%L, %L, 5, 5) returning 1', pg_temp.id('biza'), 'purchase')), 'ERR:42501');
select pg_temp.chk('rates are readable by authenticated, writable only through the RPC',
  pg_temp.try_as('authenticated', pg_temp.id('owner'), $q$insert into public.sms_country_rates (dial_code, country_code, credits_per_segment) values ('92','PK',10) returning 1$q$), 'ERR:42501');
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.admin_set_sms_rate('92', 'PK', 50, 'pk'); reset role;
  perform pg_temp.chk('business owner cannot set a rate', r->>'code', 'forbidden');
  perform pg_temp.chk('...Pakistan still has no rate', (select count(*)::int from public.sms_country_rates where dial_code = '92'), 0);
end $$;

-- SMS lifecycle: reserve / complete / fail / refund
do $$
declare v_id uuid; j jsonb; r jsonb; v_bal bigint;
begin
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:sms:uk', null, pg_temp.id('c_sms'));
  insert into ids values ('ob_sms', v_id);
  j := pg_temp.claim_job(v_id);
  perform pg_temp.chk('sms job claimed with the phone', j->>'to', '+447700900222');
  r := public.outbox_reserve_sms(v_id, 'Your booking: https://x.test/l#t=abc');
  perform pg_temp.chk('reserve ok: 1 segment, gsm7, 56 credits (UK)', (r->>'ok') || ':' || (r->>'segments') || ':' || (r->>'encoding') || ':' || (r->>'credits'), 'true:1:gsm7:56');
  perform pg_temp.chk('...balance is 944', (select balance from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 944);
  perform pg_temp.chk('...ledger debit stored: -56, balance_after 944, outbox, attempt 1, dial 44, 1 segment',
    (select row(kind, amount, balance_after, outbox_id = v_id, attempt, dial_code, segments, encoding)::text from public.sms_credit_ledger where outbox_id = v_id and kind = 'debit'),
    '(debit,-56,944,t,1,44,1,gsm7)');
  perform pg_temp.chk('...provider_call_at marked', (select provider_call_at is not null from public.message_outbox where id = v_id), true);
  r := public.outbox_reserve_sms(v_id, 'Your booking: https://x.test/l#t=abc');
  perform pg_temp.chk('a repeated reserve does NOT debit twice', (select count(*)::int from public.sms_credit_ledger where outbox_id = v_id and kind = 'debit'), 1);
  perform pg_temp.chk('...and returns the same ledger id', (r->>'ledger_id')::bigint, (select id from public.sms_credit_ledger where outbox_id = v_id and kind = 'debit'));
  -- provider failure: refund once
  r := public.outbox_fail(v_id, 'carrier rejected', true);
  perform pg_temp.chk('failure -> retry', r->>'status', 'retry');
  perform pg_temp.chk('...balance restored to 1000', (select balance from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 1000);
  perform pg_temp.chk('...refund row: +56 referencing the debit',
    (select row(l.kind, l.amount, l.balance_after, l.ref_ledger_id = d.id)::text from public.sms_credit_ledger l join public.sms_credit_ledger d on d.id = l.ref_ledger_id where l.outbox_id = v_id and l.kind = 'refund'), '(refund,56,1000,t)');
  r := public.outbox_fail(v_id, 'again', true);
  perform pg_temp.chk('failing a non-sending row again does not refund twice', (select count(*)::int from public.sms_credit_ledger where outbox_id = v_id and kind = 'refund'), 1);
  -- retry: attempt 2 debits again, success completes with cost recorded
  j := pg_temp.claim_job(v_id);
  perform pg_temp.chk('retry attempt is 2', j->>'attempt', '2');
  r := public.outbox_reserve_sms(v_id, 'Your booking: https://x.test/l#t=abc');
  perform pg_temp.chk('attempt 2 debits again (new key)', (select count(*)::int from public.sms_credit_ledger where outbox_id = v_id and kind = 'debit'), 2);
  r := public.outbox_complete(v_id, 'twilio', 'SMabc');
  perform pg_temp.chk('complete ok', r->>'ok', 'true');
  perform pg_temp.chk('log row records encoding, segments, credits, masked phone, no body',
    (select row(encoding, segments, credits, recipient_masked, provider_id)::text from public.messages where outbox_id = v_id and status = 'sent'), '(gsm7,1,56,+447*******22,SMabc)');
  perform pg_temp.chk('balance 944 after the successful send', (select balance from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 944);
end $$;

-- per country and per segment maths
do $$
declare v_id uuid; r jsonb; j jsonb;
begin
  -- US: 12/segment, 161 GSM chars = 2 segments = 24
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:sms:us', null, pg_temp.id('c_us'));
  perform pg_temp.claim_job(v_id);
  r := public.outbox_reserve_sms(v_id, repeat('a', 161));
  perform pg_temp.chk('US 161 GSM chars = 2 segments x 12 = 24', (r->>'segments') || ':' || (r->>'credits'), '2:24');
  -- AU unicode: Arabic 71 chars = 2 segments x 52 = 104
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:sms:au', null, pg_temp.id('c_au'));
  perform pg_temp.claim_job(v_id);
  r := public.outbox_reserve_sms(v_id, repeat('ا', 71));
  perform pg_temp.chk('AU Arabic 71 chars = 2 segments x 52 = 104 (ucs2)', (r->>'segments') || ':' || (r->>'credits') || ':' || (r->>'encoding'), '2:104:ucs2');
  -- Pakistan: no rate -> refused, logged no_rate, no debit
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:sms:pk', null, pg_temp.id('c_pk'));
  perform pg_temp.claim_job(v_id);
  r := public.outbox_reserve_sms(v_id, 'hello');
  perform pg_temp.chk('Pakistan (no rate row): refused with no_rate', r->>'code', 'no_rate');
  perform pg_temp.chk('...row skipped, token gone, logged no_rate',
    (select row(o.status, o.sealed is null, m.status, m.code)::text from public.message_outbox o join public.messages m on m.outbox_id = o.id where o.id = v_id), '(skipped,t,skipped,no_rate)');
  perform pg_temp.chk('...no ledger row for it', (select count(*)::int from public.sms_credit_ledger where outbox_id = v_id), 0);
  -- UAE: 118/segment; drain to < 118 then refuse
  update public.sms_credit_accounts set balance = 100 where business_id = pg_temp.id('biza');
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:sms:ae', null, pg_temp.id('c_ae'));
  perform pg_temp.claim_job(v_id);
  r := public.outbox_reserve_sms(v_id, 'hello');
  perform pg_temp.chk('UAE costs 118; balance 100: skipped_no_credits', r->>'code', 'skipped_no_credits');
  perform pg_temp.chk('...balance untouched (never negative)', (select balance from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 100);
  perform pg_temp.chk('...skipped and logged skipped_no_credits',
    (select row(o.status, m.code)::text from public.message_outbox o join public.messages m on m.outbox_id = o.id where o.id = v_id), '(skipped,skipped_no_credits)');
  perform pg_temp.chk('...no debit row', (select count(*)::int from public.sms_credit_ledger where outbox_id = v_id), 0);
  update public.sms_credit_accounts set balance = 816 where business_id = pg_temp.id('biza');   -- restore the true balance (the ledger sums to 816)
  -- bad bodies
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:sms:empty', null, pg_temp.id('c_us'));
  perform pg_temp.claim_job(v_id);
  r := public.outbox_reserve_sms(v_id, '   ');
  perform pg_temp.chk('blank SMS body refused (dead bad_body), no debit', (r->>'code') || ':' || (select count(*)::int from public.sms_credit_ledger where outbox_id = v_id), 'bad_body:0');
  r := public.outbox_reserve_sms(v_id, 'x');
  perform pg_temp.chk('reserve on a non-sending row refused', r->>'code', 'not_sending');
end $$;
-- invariant: balance = sum of ledger (we set it by hand above, so recompute against the ledger first)
do $$
declare v_sum bigint;
begin
  select coalesce(sum(amount), 0) into v_sum from public.sms_credit_ledger where business_id = pg_temp.id('biza');
  -- ledger: +1000, -56, +56, -56, -24, -104 => 816 (the hand-set balances above were test scaffolding)
  perform pg_temp.chk('ledger arithmetic: +1000 -56 +56 -56 -24 -104 = 816', v_sum, 816);
  perform pg_temp.chk('balance equals the sum of the ledger', (select balance from public.sms_credit_accounts where business_id = pg_temp.id('biza')), v_sum);
end $$;
select pg_temp.chk('ledger is append-only: UPDATE refused', pg_temp.try_as('postgres', null, 'update public.sms_credit_ledger set note = ''x'' returning 1'), 'ERR:23514');
select pg_temp.chk('ledger is append-only: DELETE refused', pg_temp.try_as('postgres', null, 'delete from public.sms_credit_ledger returning 1'), 'ERR:23514');
select pg_temp.chk('balance CHECK backstop: negative refused', pg_temp.try_as('postgres', null, 'update public.sms_credit_accounts set balance = -1 returning 1'), 'ERR:23514');
select pg_temp.chk('sms_ledger_post refuses (returns) a debit larger than the balance',
  (public.sms_ledger_post(pg_temp.id('biza'), 'debit', -999999, null, null, null, null, null, null, null, null)->>'code'), 'insufficient');
select pg_temp.chk('...and nothing was written for it', (select count(*)::int from public.sms_credit_ledger where amount = -999999), 0);

-- ===========================================================================
-- 6. Quiet hours (SMS reminders and review requests only), DST
-- ===========================================================================
create or replace function pg_temp.next_allowed(p_branch text, p_at text, p_start text default null)
returns text language sql as $$
  select to_char(public.notification_next_allowed(pg_temp.id(p_branch), p_at::timestamptz, p_start::timestamptz) at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
$$;
-- London (BST in summer): 22:30 local = 21:30Z
select pg_temp.chk('London 22:30 -> 08:00 next morning', pg_temp.next_allowed('brancha', '2027-06-14 21:30Z'), '2027-06-15 07:00');
select pg_temp.chk('London 03:00 -> 08:00 same morning', pg_temp.next_allowed('brancha', '2027-06-15 02:00Z'), '2027-06-15 07:00');
select pg_temp.chk('London 12:00 is not quiet -> unchanged', pg_temp.next_allowed('brancha', '2027-06-15 11:00Z'), '2027-06-15 11:00');
select pg_temp.chk('London 20:59 is not quiet; 21:00 is', pg_temp.next_allowed('brancha', '2027-06-14 19:59Z') || ' / ' || pg_temp.next_allowed('brancha', '2027-06-14 20:00Z'), '2027-06-14 19:59 / 2027-06-15 07:00');
select pg_temp.chk('08:00 exactly is not quiet', pg_temp.next_allowed('brancha', '2027-06-15 07:00Z'), '2027-06-15 07:00');
select pg_temp.chk('2-hour rule: appointment at 09:30 local -> deferred only to 07:30, not 08:00',
  pg_temp.next_allowed('brancha', '2027-06-14 21:30Z', '2027-06-15 08:30Z'), '2027-06-15 06:30');
select pg_temp.chk('2-hour rule: appointment 23:00 local the same evening -> too close, send NOW',
  pg_temp.next_allowed('brancha', '2027-06-14 21:30Z', '2027-06-14 22:00Z'), '2027-06-14 21:30');
-- DST: New York spring-forward 2027-03-14 (02:00 -> 03:00)
select pg_temp.chk('New York 23:00 EST the night before spring-forward -> 08:00 EDT = 12:00Z',
  pg_temp.next_allowed('branchn', '2027-03-14 04:00Z'), '2027-03-14 12:00');
select pg_temp.chk('New York fall-back 2027-11-07: 23:00 EDT -> 08:00 EST = 13:00Z',
  pg_temp.next_allowed('branchn', '2027-11-07 03:00Z'), '2027-11-07 13:00');
select pg_temp.chk('London spring-forward 2027-03-28: 23:00 GMT -> 08:00 BST = 07:00Z',
  pg_temp.next_allowed('brancha', '2027-03-27 23:00Z'), '2027-03-28 07:00');
select pg_temp.chk('London fall-back 2027-10-31: 23:00 BST (22:00Z) -> 08:00 GMT = 08:00Z',
  pg_temp.next_allowed('brancha', '2027-10-30 22:00Z'), '2027-10-31 08:00');
select pg_temp.chk('Karachi (no DST) 23:00 PKT = 18:00Z -> 08:00 PKT = 03:00Z next day',
  pg_temp.next_allowed('branchk', '2027-03-13 18:00Z'), '2027-03-14 03:00');
select pg_temp.chk('Karachi summer is the same offset',
  pg_temp.next_allowed('branchk', '2027-07-13 18:00Z'), '2027-07-14 03:00');
-- Disabled quiet hours
update public.notification_settings set quiet_end_minute = quiet_start_minute where branch_id = pg_temp.id('branchk');
select pg_temp.chk('quiet start = quiet end disables quiet hours', pg_temp.next_allowed('branchk', '2027-03-13 18:00Z'), '2027-03-13 18:00');
update public.notification_settings set quiet_start_minute = 1260, quiet_end_minute = 480 where branch_id = pg_temp.id('branchk');
-- Through enqueue: SMS review request deferred, email and transactional never
do $$
declare v_sms uuid; v_mail uuid; v_conf uuid; v_when text;
begin
  v_sms := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'review_request', 'test:q:sms', null, pg_temp.id('c_sms'), null, null, '2027-06-14 21:30Z');
  v_mail := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'review_request', 'test:q:mail', null, pg_temp.id('c_mail'), null, null, '2027-06-14 21:30Z');
  v_conf := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:q:conf', null, pg_temp.id('c_sms'), null, null, '2027-06-14 21:30Z');
  perform pg_temp.chk('SMS review request at 22:30 local is deferred to 08:00 local (07:00Z)',
    (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where id = v_sms), '2027-06-15 07:00');
  perform pg_temp.chk('EMAIL review request is never deferred',
    (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where id = v_mail), '2027-06-14 21:30');
  perform pg_temp.chk('transactional SMS (manage link) is never deferred',
    (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where id = v_conf), '2027-06-14 21:30');
end $$;

-- ===========================================================================
-- 7. Reminders: timing across DST, rules
-- ===========================================================================
-- Insert confirmed appointments directly (any instant), booked long ago.
create or replace function pg_temp.mk_appt(p_key text, p_branch text, p_starts text, p_client text default 'c_mail', p_status text default 'confirmed', p_source text default 'dashboard')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, starts_at, ends_at, duration_minutes, form_version_id, status, source, scheduled_at, cancelled_at)
  values (pg_temp.id('biza'), pg_temp.id(p_branch), pg_temp.id(p_client), pg_temp.id('svc'), p_starts::timestamptz, p_starts::timestamptz + interval '1 hour', 60,
          (select id from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1), p_status::public.appointment_status, p_source::public.booking_source, '2020-01-01', case when p_status = 'cancelled' then now() else null end)
  returning id into v_id;
  insert into ids values (p_key, v_id);
  return v_id;
end $$;
create or replace function pg_temp.rem_n(p_appt text) returns int language sql as $$
  select count(*)::int from public.message_outbox where appointment_id = pg_temp.id(p_appt) and event = 'reminder' and status = 'pending' $$;

-- Wall-clock reminders (24h): the 10:00 appointment is reminded at 10:00 the day before.
select pg_temp.mk_appt('ny_spring', 'branchn', '2027-03-14 14:00Z');   -- 10:00 EDT, the day clocks spring forward
select pg_temp.mk_appt('ny_fall',   'branchn', '2027-11-07 15:00Z');   -- 10:00 EST, the day clocks fall back
select pg_temp.mk_appt('ldn_spring','brancha', '2027-03-28 09:00Z');   -- 10:00 BST
select pg_temp.mk_appt('ldn_fall',  'brancha', '2027-10-31 10:00Z');   -- 10:00 GMT
select pg_temp.mk_appt('khi',       'branchk', '2027-03-14 05:00Z');   -- 10:00 PKT
select pg_temp.chk('sanity: nothing is due a week early', public.enqueue_due_reminders_at('2027-03-01 00:00Z'), 0);
-- Karachi: no DST, plain 24h
select pg_temp.chk('Karachi: not due at 04:59Z', (public.enqueue_due_reminders_at('2027-03-13 04:59Z') >= 0)::text || pg_temp.rem_n('khi'), 'true0');
select pg_temp.chk('Karachi: due at 05:00Z', (public.enqueue_due_reminders_at('2027-03-13 05:00Z') >= 1)::text || pg_temp.rem_n('khi'), 'true1');

-- New York spring-forward: reminder = 2027-03-13 10:00 EST = 15:00Z (25 elapsed hours before)
select pg_temp.chk('NY spring: not due 1 min before 15:00Z', (public.enqueue_due_reminders_at('2027-03-13 14:59Z') >= 0)::text || pg_temp.rem_n('ny_spring'), 'true0');
select pg_temp.chk('NY spring: due at 15:00Z (10:00 EST the day before, NOT 14:00Z)', (public.enqueue_due_reminders_at('2027-03-13 15:00Z') >= 1)::text || pg_temp.rem_n('ny_spring'), 'true1');
select pg_temp.chk('NY spring: stored key and deliver_after',
  (select row(idempotency_key = 'reminder:' || pg_temp.id('ny_spring') || ':' || extract(epoch from '2027-03-14 14:00Z'::timestamptz)::bigint, to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), channel, status)::text
   from public.message_outbox where appointment_id = pg_temp.id('ny_spring') and event = 'reminder'), '(t,"2027-03-13 15:00",email,pending)');
select pg_temp.chk('NY spring: running the job again does not duplicate', (public.enqueue_due_reminders_at('2027-03-13 15:30Z') >= 0)::text || pg_temp.rem_n('ny_spring'), 'true1');
-- New York fall-back: reminder = 2027-11-06 10:00 EDT = 14:00Z (25 hours before)
select pg_temp.chk('NY fall: not due at 13:59Z', (public.enqueue_due_reminders_at('2027-11-06 13:59Z') >= 0)::text || pg_temp.rem_n('ny_fall'), 'true0');
select pg_temp.chk('NY fall: due at 14:00Z', (public.enqueue_due_reminders_at('2027-11-06 14:00Z') >= 1)::text || pg_temp.rem_n('ny_fall'), 'true1');
-- London spring-forward: reminder = 2027-03-27 10:00 GMT = 10:00Z (23 elapsed hours)
select pg_temp.chk('London spring: not due at 09:59Z', (public.enqueue_due_reminders_at('2027-03-27 09:59Z') >= 0)::text || pg_temp.rem_n('ldn_spring'), 'true0');
select pg_temp.chk('London spring: due at 10:00Z', (public.enqueue_due_reminders_at('2027-03-27 10:00Z') >= 1)::text || pg_temp.rem_n('ldn_spring'), 'true1');
-- London fall-back: reminder = 2027-10-30 10:00 BST = 09:00Z (25 hours)
select pg_temp.chk('London fall: not due at 08:59Z', (public.enqueue_due_reminders_at('2027-10-30 08:59Z') >= 0)::text || pg_temp.rem_n('ldn_fall'), 'true0');
select pg_temp.chk('London fall: due at 09:00Z', (public.enqueue_due_reminders_at('2027-10-30 09:00Z') >= 1)::text || pg_temp.rem_n('ldn_fall'), 'true1');
-- Per-branch hours setting (48h) and the off switch
update public.notification_settings set reminder_hours_before = 48 where branch_id = pg_temp.id('branchk');
select pg_temp.mk_appt('khi48', 'branchk', '2027-04-14 05:00Z');
select pg_temp.chk('48h setting: not due 1 min early', (public.enqueue_due_reminders_at('2027-04-12 04:59Z') >= 0)::text || pg_temp.rem_n('khi48'), 'true0');
select pg_temp.chk('48h setting: due at 48h', (public.enqueue_due_reminders_at('2027-04-12 05:00Z') >= 1)::text || pg_temp.rem_n('khi48'), 'true1');
update public.notification_settings set reminders_enabled = false where branch_id = pg_temp.id('branchk');
select pg_temp.mk_appt('khi_off', 'branchk', '2027-05-14 05:00Z');
select pg_temp.chk('reminders switched off: nothing queued', (public.enqueue_due_reminders_at('2027-05-13 05:00Z') >= 0)::text || pg_temp.rem_n('khi_off'), 'true0');
update public.notification_settings set reminders_enabled = true, reminder_hours_before = 24 where branch_id = pg_temp.id('branchk');

-- Skips: cancelled / completed / walk-in / pending / booked after the reminder time
select pg_temp.mk_appt('r_cancel', 'branchk', '2027-06-14 05:00Z', 'c_mail', 'cancelled');
select pg_temp.mk_appt('r_done',   'branchk', '2027-06-14 06:00Z', 'c_mail', 'completed');
select pg_temp.mk_appt('r_walk',   'branchk', '2027-06-14 07:00Z', 'c_mail', 'confirmed', 'walk_in');
select pg_temp.mk_appt('r_pend',   'branchk', '2027-06-14 08:00Z', 'c_mail', 'pending');
select pg_temp.mk_appt('r_late',   'branchk', '2027-06-14 09:00Z');
update public.appointments set scheduled_at = '2027-06-13 12:00Z' where id = pg_temp.id('r_late');   -- chosen AFTER the reminder time (09:00Z the day before)
select pg_temp.mk_appt('r_ok',     'branchk', '2027-06-14 10:00Z');
select public.enqueue_due_reminders_at('2027-06-13 12:00Z');
select pg_temp.chk('cancelled appointment: no reminder', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('r_cancel'), 'reminder')), 0);
select pg_temp.chk('completed appointment: no reminder', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('r_done'), 'reminder')), 0);
select pg_temp.chk('walk-in: no reminder', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('r_walk'), 'reminder')), 0);
select pg_temp.chk('pending (unapproved): no reminder', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('r_pend'), 'reminder')), 0);
select pg_temp.chk('booked after the reminder time: no instant reminder', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('r_late'), 'reminder')), 0);
select pg_temp.chk('a normal confirmed appointment: reminded', pg_temp.rem_n('r_ok'), 1);
-- A reminder is cancelled when the appointment is moved, and a new one is made for the new time
do $$
declare r jsonb; v_old bigint;
begin
  update public.appointments set starts_at = '2027-06-20 10:00Z', ends_at = '2027-06-20 11:00Z' where id = pg_temp.id('r_ok');
  perform pg_temp.chk('moving the appointment cancels its pending reminder',
    (select count(*)::int from public.message_outbox where appointment_id = pg_temp.id('r_ok') and event = 'reminder' and status = 'cancelled'), 1);
  perform pg_temp.chk('...and queued a "rescheduled" email', pg_temp.outbox_n(format('appointment_id = %L and event = %L', pg_temp.id('r_ok'), 'rescheduled')), 1);
  perform pg_temp.chk('...scheduled_at was refreshed by the move', (select scheduled_at > now() - interval '1 minute' from public.appointments where id = pg_temp.id('r_ok')), true);
  perform pg_temp.chk('...a new reminder is NOT made before the new reminder time', (public.enqueue_due_reminders_at('2027-06-19 09:59Z') >= 0)::text || pg_temp.rem_n('r_ok'), 'true0');
  perform pg_temp.chk('...and IS made at the new reminder time (15:00 PKT the day before = 10:00Z)', (public.enqueue_due_reminders_at('2027-06-19 10:00Z') >= 1)::text || pg_temp.rem_n('r_ok'), 'true1');
end $$;
-- SMS client: quiet hours + the 2-hour rule on reminders (Karachi quiet hours enabled again)
update public.notification_settings set sms_enabled = true where branch_id = pg_temp.id('branchk');
select pg_temp.mk_appt('khi_sms_early', 'branchk', '2027-08-14 02:00Z', 'c_sms');   -- 07:00 PKT: reminder 07:00 PKT the day before (quiet)
select pg_temp.mk_appt('khi_sms_day',   'branchk', '2027-08-15 05:00Z', 'c_sms');   -- 10:00 PKT: reminder 10:00 PKT (not quiet)
select pg_temp.mk_appt('khi_sms_close', 'branchk', '2027-08-16 00:00Z', 'c_sms');   -- 05:00 PKT: reminder 05:00 PKT the day before (quiet, <2h rule)
select public.enqueue_due_reminders_at('2027-08-13 02:00Z');   -- 07:00 PKT, due for early
select public.enqueue_due_reminders_at('2027-08-14 05:00Z');   -- due for day
select public.enqueue_due_reminders_at('2027-08-15 00:00Z');   -- due for close
select pg_temp.chk('SMS reminder due at 07:00 local (quiet) deferred to 08:00 local = 03:00Z, but not past 2h before (appointment 07:00 local the next day: limit is 05:00 next day) -> 08:00 local the SAME day',
  (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where appointment_id = pg_temp.id('khi_sms_early') and event = 'reminder'), '2027-08-13 03:00');
select pg_temp.chk('SMS reminder at 10:00 local is not deferred',
  (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where appointment_id = pg_temp.id('khi_sms_day') and event = 'reminder'), '2027-08-14 05:00');
select pg_temp.chk('SMS reminder inside quiet hours whose window end would be < 2h before... (05:00 reminder, appt 05:00 next day) is deferred to 08:00 same day',
  (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where appointment_id = pg_temp.id('khi_sms_close') and event = 'reminder'), '2027-08-15 03:00');
select pg_temp.chk('...and the SMS channel was chosen (client has no email)',
  (select channel from public.message_outbox where appointment_id = pg_temp.id('khi_sms_close') and event = 'reminder'), 'sms');
-- The 2-hour rule through the real reminder job (3h reminder, 06:00 PKT appointment).
update public.notification_settings set reminder_hours_before = 3 where branch_id = pg_temp.id('branchk');
select pg_temp.mk_appt('khi_2h_a', 'branchk', '2027-09-15 01:00Z', 'c_sms');   -- 06:00 PKT; reminder 03:00 PKT = 22:00Z (quiet)
select public.enqueue_due_reminders_at('2027-09-14 22:00Z');
select pg_temp.chk('3h reminder at 03:00 local (quiet): deferred only to 2h before (04:00 local = 23:00Z), NOT 08:00',
  (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where appointment_id = pg_temp.id('khi_2h_a') and event = 'reminder'), '2027-09-14 23:00');
update public.notification_settings set reminder_hours_before = 1 where branch_id = pg_temp.id('branchk');
select pg_temp.mk_appt('khi_2h_b', 'branchk', '2027-09-16 01:00Z', 'c_sms');   -- 06:00 PKT; reminder 05:00 PKT = 00:00Z (quiet; 2h-before already passed)
select public.enqueue_due_reminders_at('2027-09-16 00:00Z');
select pg_temp.chk('1h reminder inside quiet hours with <2h to go: sent NOW (not deferred)',
  (select to_char(deliver_after at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.message_outbox where appointment_id = pg_temp.id('khi_2h_b') and event = 'reminder'), '2027-09-16 00:00');
update public.notification_settings set reminder_hours_before = 24 where branch_id = pg_temp.id('branchk');
-- Staff push reminder
insert into public.push_tokens (user_id, token, platform) values (pg_temp.id('staffa'), 'ExponentPushToken[staffa-device-0003]', 'ios') on conflict do nothing;
select pg_temp.mk_appt('r_staff', 'brancha', '2027-10-12 09:00Z');
update public.appointments set staff_id = pg_temp.id('staffa_profile') where id = pg_temp.id('r_staff');
select public.enqueue_due_reminders_at('2027-10-11 09:00Z');
select pg_temp.chk('assigned staff member gets a staff_reminder push (and only them)',
  (select string_agg(u.email, ',') from public.message_outbox o join auth.users u on u.id = o.user_id where o.appointment_id = pg_temp.id('r_staff') and o.event = 'staff_reminder'), 'p6.staffa@example.com');

-- ===========================================================================
-- 8. Maintenance: 48 h expiry nulls tokens; 30-day purge
-- ===========================================================================
do $$
declare v_id uuid; r jsonb; v_old uuid;
begin
  v_id := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:maint:old', null, pg_temp.id('c_mail'), null, null, null, '{}', repeat('5e', 32));
  update public.message_outbox set created_at = now() - interval '49 hours' where id = v_id;
  perform pg_temp.chk('an open row with a sealed token exists before maintenance', (select sealed is not null from public.message_outbox where id = v_id), true);
  r := public.outbox_maintenance();
  perform pg_temp.chk('maintenance expired it: dead, expired, token nulled',
    (select row(status, last_error, sealed is null)::text from public.message_outbox where id = v_id), '(dead,expired,t)');
  perform pg_temp.chk('...logged', (select row(status, code)::text from public.messages where outbox_id = v_id), '(failed,expired)');
  perform pg_temp.chk('NO sealed token older than 48h survives anywhere',
    (select count(*)::int from public.message_outbox where sealed is not null and created_at < now() - interval '48 hours'), 0);
  v_old := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'manage_link', 'test:maint:purge', null, pg_temp.id('c_mail'));
  update public.message_outbox set status = 'sent', sent_at = now() - interval '31 days', finished_at = now() - interval '31 days' where id = v_old;
  r := public.outbox_maintenance();
  perform pg_temp.chk('finished rows older than 30 days are purged', (select count(*)::int from public.message_outbox where id = v_old), 0);
  perform pg_temp.chk('...their log rows survive (outbox_id set null)', (select count(*)::int from public.messages where outbox_id is null and event = 'manage_link') >= 0, true);
end $$;
select pg_temp.chk('CHECK: a sealed token on a terminal row is impossible',
  pg_temp.try_as('postgres', null, $q$update public.message_outbox set sealed = '\x00'::bytea where status = 'sent' returning 1$q$), 'ERR:23514');
select pg_temp.chk('CHECK: a token key in payload is refused',
  pg_temp.try_as('postgres', null, $q$update public.message_outbox set payload = '{"token":"x"}' where status = 'pending' returning 1$q$), 'ERR:23514');

-- ===========================================================================
-- 9. RLS per role on the log / outbox / suppressions / limits
-- ===========================================================================
select pg_temp.chk('owner reads the messages log (settings.business)', (pg_temp.visible(pg_temp.id('owner'), 'messages') like 'ok:%' and pg_temp.visible(pg_temp.id('owner'), 'messages') <> 'ok:0')::text, 'true');
select pg_temp.chk('manager (settings.booking) reads the messages log of their branch', (pg_temp.visible(pg_temp.id('manager'), 'messages') <> 'ok:0')::text, 'true');
select pg_temp.chk('receptionist sees no messages', pg_temp.visible(pg_temp.id('recep'), 'messages'), 'ok:0');
select pg_temp.chk('staff sees no messages', pg_temp.visible(pg_temp.id('staffa'), 'messages'), 'ok:0');
select pg_temp.chk('other business sees no messages of A',
  pg_temp.try_as('authenticated', pg_temp.id('ownerb'), format('select 1 from public.messages where business_id = %L', pg_temp.id('biza'))), 'ok:0');
select pg_temp.chk('super admin reads messages', (pg_temp.visible(pg_temp.id('sadmin'), 'messages') <> 'ok:0')::text, 'true');
select pg_temp.chk('anon refused on messages', pg_temp.try_as('anon', null, 'select 1 from public.messages'), 'ERR:42501');
select pg_temp.chk('NO business role reads message_outbox', pg_temp.visible(pg_temp.id('owner'), 'message_outbox') || pg_temp.visible(pg_temp.id('manager'), 'message_outbox'), 'ok:0ok:0');
select pg_temp.chk('super admin reads message_outbox', (pg_temp.visible(pg_temp.id('sadmin'), 'message_outbox') <> 'ok:0')::text, 'true');
select pg_temp.chk('anon refused on message_outbox', pg_temp.try_as('anon', null, 'select 1 from public.message_outbox'), 'ERR:42501');
select pg_temp.chk('owner cannot write to message_outbox',
  pg_temp.try_as('authenticated', pg_temp.id('owner'), 'insert into public.message_outbox (business_id, branch_id, channel, event, idempotency_key, client_id) select business_id, branch_id, ''email'', ''reminder'', ''x'', null from public.message_outbox limit 1 returning 1'), 'ERR:42501');
select pg_temp.chk('no business role reads suppressions', pg_temp.visible(pg_temp.id('owner'), 'message_suppressions'), 'ok:0');
select pg_temp.chk('anon refused on suppressions', pg_temp.try_as('anon', null, 'select 1 from public.message_suppressions'), 'ERR:42501');
select pg_temp.chk('no business role reads messaging_limits', pg_temp.visible(pg_temp.id('owner'), 'messaging_limits'), 'ok:0');
select pg_temp.chk('anon refused on messaging_limits', pg_temp.try_as('anon', null, 'select 1 from public.messaging_limits'), 'ERR:42501');
select pg_temp.chk('anon refused on sms_country_rates', pg_temp.try_as('anon', null, 'select 1 from public.sms_country_rates'), 'ERR:42501');
select pg_temp.chk('authenticated reads rates', pg_temp.visible(pg_temp.id('owner'), 'sms_country_rates'), 'ok:4');

-- ===========================================================================
-- 10. Grants
-- ===========================================================================
select pg_temp.chk('NO internal function is executable by anon or authenticated',
  (select string_agg(f, ', ') from (values
    ('internal_secret(text)'), ('outbox_seal(text)'), ('outbox_unseal(bytea)'), ('message_recipient_hash(text)'),
    ('sms_segments(text)'), ('sms_rate_for(text)'), ('notification_next_allowed(uuid,timestamptz,timestamptz)'),
    ('push_recipient_users(uuid,uuid,uuid,text,uuid)'), ('outbox_enqueue(uuid,uuid,text,text,uuid,uuid,uuid,uuid,timestamptz,jsonb,text)'),
    ('outbox_attach_token(uuid,text)'), ('outbox_cancel_unsent(uuid,text[],text)'), ('notify_appointment_change()'),
    ('outbox_guard(uuid)'), ('outbox_job(uuid)'), ('outbox_finish(uuid,text,text,text)'), ('outbox_log(uuid,text,text,text,text,text,integer,text,integer)'),
    ('outbox_recipient(uuid)'), ('sms_ledger_post(uuid,text,bigint,uuid,integer,bigint,text,integer,text,text,uuid)'),
    ('enqueue_due_reminders_at(timestamptz)'), ('enqueue_due_reminders()'), ('outbox_maintenance(timestamptz)'),
    ('invoke_outbox_worker()'), ('create_review_request_internal(uuid)'), ('outbox_clean_error(text)')) as t(f)
   where has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute')), null);
select pg_temp.chk('worker RPCs: service_role yes, anon no, authenticated no',
  (select string_agg(f, ', ') from (values
    ('outbox_claim(integer,text[])'), ('outbox_reserve_sms(uuid,text)'), ('outbox_complete(uuid,text,text,uuid[])'),
    ('outbox_fail(uuid,text,boolean,boolean)'), ('suppress_recipient(uuid,text,text,text)'), ('outbox_worker_authorize(text)')) as t(f)
   where not has_function_privilege('service_role', 'public.' || f, 'execute')
      or has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute')), null);
select pg_temp.chk('register/unregister push token: authenticated yes, anon no',
  has_function_privilege('authenticated', 'public.register_push_token(text,text)', 'execute')::text || has_function_privilege('anon', 'public.register_push_token(text,text)', 'execute')::text
  || has_function_privilege('authenticated', 'public.unregister_push_token(text)', 'execute')::text || has_function_privilege('anon', 'public.unregister_push_token(text)', 'execute')::text, 'truefalsetruefalse');
select pg_temp.chk('admin RPCs: authenticated yes (the is_super_admin check is the boundary), anon no',
  has_function_privilege('authenticated', 'public.admin_add_sms_credits(uuid,bigint,text)', 'execute')::text || has_function_privilege('anon', 'public.admin_add_sms_credits(uuid,bigint,text)', 'execute')::text
  || has_function_privilege('anon', 'public.admin_set_sms_rate(text,text,integer,text)', 'execute')::text, 'truefalsefalse');
select pg_temp.chk('anon cannot call the worker via REST-style role switch',
  pg_temp.try_as('anon', null, 'select public.outbox_claim(1, null)'), 'ERR:42501');
select pg_temp.chk('channel filter: an SMS-only claim never returns email rows',
  (select count(*)::int from jsonb_array_elements(public.outbox_claim(100, array['sms'])) e where e->>'channel' <> 'sms'), 0);
select pg_temp.chk('push_remove_dead_tokens is service_role only',
  has_function_privilege('service_role', 'public.push_remove_dead_tokens(uuid,uuid[])', 'execute')::text || has_function_privilege('authenticated', 'public.push_remove_dead_tokens(uuid,uuid[])', 'execute')::text || has_function_privilege('anon', 'public.push_remove_dead_tokens(uuid,uuid[])', 'execute')::text, 'truefalsefalse');
select pg_temp.chk('authenticated cannot call outbox_claim', pg_temp.try_as('authenticated', pg_temp.id('owner'), 'select public.outbox_claim(1, null)'), 'ERR:42501');
select pg_temp.chk('worker token check: right token true, wrong false, empty false',
  public.outbox_worker_authorize(public.internal_secret('outbox_worker_token'))::text || public.outbox_worker_authorize('nope')::text || public.outbox_worker_authorize('')::text, 'truefalsefalse');
select pg_temp.chk('the three cron jobs exist',
  (select string_agg(jobname, ',' order by jobname) from cron.job where jobname like 'outbox-%'), 'outbox-maintenance,outbox-reminders,outbox-worker');
select pg_temp.chk('Vault keys exist', (select count(*)::int from vault.secrets where name in ('outbox_seal_key','message_hash_key','outbox_worker_token')), 3);
select pg_temp.chk('the recipient hash is stable and normalised (case/space insensitive)',
  (public.message_recipient_hash(' Mia@Example.com ') = public.message_recipient_hash('mia@example.com'))::text, 'true');
select pg_temp.chk('the hash is not a plain sha256 (keyed)',
  (public.message_recipient_hash('mia@example.com') <> encode(extensions.digest('mia@example.com', 'sha256'), 'hex'))::text, 'true');
select pg_temp.chk('masks never contain the full address',
  public.mask_email('mia@example.com') || '|' || public.mask_phone('+447700900111'), 'm***@example.com|+447*******11');

-- ===========================================================================
-- 10b. Phase 6B backend: push preferences, appointment send status
-- ===========================================================================
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.save_push_preferences(pg_temp.id('biza'), '{"cancelled": false}'::jsonb); reset role;
  perform pg_temp.chk('a member saves a push preference', r->>'ok', 'true');
  perform pg_temp.chk('...stored: cancelled off, the others default on',
    (select row(new_booking, pending_approval, cancelled, reminder)::text from public.push_preferences where user_id = pg_temp.id('recep') and business_id = pg_temp.id('biza')), '(t,t,f,t)');
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.save_push_preferences(pg_temp.id('biza'), '{"reminder": false}'::jsonb); reset role;
  perform pg_temp.chk('a second save changes only the key given (merge)',
    (select row(cancelled, reminder)::text from public.push_preferences where user_id = pg_temp.id('recep') and business_id = pg_temp.id('biza')), '(f,f)');
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.save_push_preferences(pg_temp.id('biza'), '{"bogus": true}'::jsonb); reset role;
  perform pg_temp.chk('unknown key refused', r->>'code', 'invalid');
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.save_push_preferences(pg_temp.id('biza'), '{"cancelled": "no"}'::jsonb); reset role;
  perform pg_temp.chk('non-boolean refused', r->>'code', 'invalid');
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  r := public.save_push_preferences(pg_temp.id('biza'), '{"cancelled": false}'::jsonb); reset role;
  perform pg_temp.chk('a non-member cannot set preferences for another business', r->>'code', 'forbidden');
end $$;
select pg_temp.chk('a user reads only their own preferences', pg_temp.visible(pg_temp.id('recep'), 'push_preferences') || pg_temp.visible(pg_temp.id('manager'), 'push_preferences'), 'ok:1ok:0');
select pg_temp.chk('anon refused on push_preferences', pg_temp.try_as('anon', null, 'select 1 from public.push_preferences'), 'ERR:42501');
select pg_temp.chk('authenticated cannot write push_preferences directly',
  pg_temp.try_as('authenticated', pg_temp.id('recep'), format('update public.push_preferences set cancelled = true where user_id = %L returning 1', pg_temp.id('recep'))), 'ERR:42501');
do $$
declare a uuid; b uuid;
begin
  insert into public.push_tokens (user_id, token, platform) values (pg_temp.id('recep'), 'ExponentPushToken[recep-device-00002]', 'ios') on conflict do nothing;
  a := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'staff_cancelled', 'test:pref:off', pg_temp.id('appt1'), null, pg_temp.id('recep'));
  b := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'staff_new_booking', 'test:pref:on', pg_temp.id('appt1'), null, pg_temp.id('recep'));
  perform pg_temp.chk('a push event the user switched off is not queued', a is null, true);
  perform pg_temp.chk('...an event they left on is', b is not null, true);
  a := public.outbox_enqueue(pg_temp.id('biza'), pg_temp.id('brancha'), 'staff_cancelled', 'test:pref:other', pg_temp.id('appt1'), null, pg_temp.id('manager'));
  perform pg_temp.chk('...and another user without preferences still gets everything', a is not null, true);
end $$;

do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  r := public.get_appointment_messages(pg_temp.id('appt1')); reset role;
  perform pg_temp.chk('owner reads the send status of an appointment', r->>'ok', 'true');
  perform pg_temp.chk('...items carry event/channel/status/code/at and NOTHING else (no recipient, body or link)',
    (select (count(*) filter (where (select array_agg(k order by k) from jsonb_object_keys(e) k) = array['at','channel','code','event','status']) = count(*))::text from jsonb_array_elements(r->'items') e), 'true');
  perform pg_temp.chk('...no staff push events leak into it', (select count(*)::int from jsonb_array_elements(r->'items') e where e->>'event' like 'staff\_%'), 0);
  perform pg_temp.chk('...queued rows show as queued', (select count(*)::int from jsonb_array_elements(r->'items') e where e->>'status' = 'queued') > 0, true);
  perform pg_temp.chk('...the serialised answer contains no address', r::text !~* '(@|https?://|\+44)', true);
  perform pg_temp.act_as(pg_temp.id('staffa')); set local role authenticated;
  r := public.get_appointment_messages(pg_temp.id('appt1')); reset role;
  perform pg_temp.chk('Staff (Own scope) get nothing, even for their own appointment', r->>'code', 'forbidden');
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  r := public.get_appointment_messages(pg_temp.id('appt1')); reset role;
  perform pg_temp.chk('receptionist (branch scope) can read it', r->>'ok', 'true');
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  r := public.get_appointment_messages(pg_temp.id('appt1')); reset role;
  perform pg_temp.chk('another business is refused', r->>'code', 'forbidden');
  perform pg_temp.chk('an unknown appointment is not_found', public.get_appointment_messages(gen_random_uuid())->>'code', 'not_found');
end $$;
select pg_temp.chk('anon cannot call get_appointment_messages', has_function_privilege('anon', 'public.get_appointment_messages(uuid)', 'execute'), false);
select pg_temp.chk('anon cannot call save_push_preferences', has_function_privilege('anon', 'public.save_push_preferences(uuid,jsonb)', 'execute'), false);

select pg_temp.chk('unsubscribe is a reserved slug', (select count(*)::int from public.reserved_slugs where slug = 'unsubscribe'), 1);
-- Least privilege project-wide (migration 20261009100000)
select pg_temp.chk('no public table lets authenticated TRUNCATE / REFERENCES / TRIGGER',
  (select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')), 0);
select pg_temp.chk('anon holds only SELECT on reserved_slugs',
  (select string_agg(table_name || ':' || privilege_type, ',') from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'), 'reserved_slugs:SELECT');
select pg_temp.chk('a write privilege exists only where an RLS policy for that command exists',
  (select count(*)::int from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type in ('INSERT','UPDATE','DELETE')
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = g.table_name
                     and (p.cmd = g.privilege_type or p.cmd = 'ALL') and (p.roles && array['authenticated'::name,'public'::name]))
     and g.table_name in (select tablename from pg_tables where schemaname = 'public')), 0);
select pg_temp.chk('authenticated cannot TRUNCATE the audit log', pg_temp.try_exec('authenticated', pg_temp.id('owner'), 'truncate public.audit_logs'), 'ERR:42501');

-- ===========================================================================
-- 11. Cascade: deleting the business releases every new row (no trigger blocks it)
-- ===========================================================================
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
do $$
begin
  delete from public.businesses where id = pg_temp.id('biza');
exception when others then
  perform pg_temp.chk('business delete cascade works with outbox/messages/ledger/settings: ' || sqlerrm, false, true);
end $$;
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
select pg_temp.chk('cascade removed outbox', (select count(*)::int from public.message_outbox where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed messages', (select count(*)::int from public.messages where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed ledger and account',
  (select count(*)::int from public.sms_credit_ledger where business_id = pg_temp.id('biza')) + (select count(*)::int from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed notification_settings', (select count(*)::int from public.notification_settings where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed suppressions', (select count(*)::int from public.message_suppressions where business_id = pg_temp.id('biza')), 0);

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
