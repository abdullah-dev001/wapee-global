-- Phase 3 step 6: the guest manage link.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/11_guest_manage_link.sql
--
-- Plain SQL, not pgTAP (Docker is not installed; see context/_handoff.md).
-- Builds its own fixtures (including real auth.users rows) and rolls back.
--
-- Last run: 2026-10-04 against the live dev project. 91/91 passing.
--
-- Covered: get_booking's whole contract and its PRIVACY limits (first name only;
-- no phone, email, full name or ids); every token failure returning the same
-- `invalid_token` so the endpoint is not a guessing oracle; a token for another
-- appointment opening only that one; cancel inside and outside the cutoff;
-- customer_can_cancel = false; a completed booking; an EXPIRED token; token
-- revocation on cancel and REPLAY being refused; the freed slot becoming
-- bookable; reschedule succeeding and freeing the old slot; **the original
-- booking surviving every failed reschedule** (the assertion that caught the
-- cancelled-on-failure bug); out of hours, notice, window, same_slot, full group
-- slot; manual confirmation sending a reschedule back to PENDING; resend
-- invalidating the old token and issuing exactly one live token; resend's
-- permission check, audit row, and refusal on a cancelled booking; and grants.

-- Guest manage link: get / cancel / reschedule / resend, and every rejection.
begin;

create temporary table ids (k text primary key, v text) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns text language sql as $$ select v from ids where k=$1 $$;
create or replace function pg_temp.uid(text) returns uuid language sql as $$ select v::uuid from ids where k=$1 $$;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin insert into res (name, pass, detail) values (p_name, p_got::text is not distinct from p_want::text,
  'got '||coalesce(p_got::text,'<null>')||' want '||coalesce(p_want::text,'<null>')); end; $$;

-- A slot N weeks out at a given local minute, so tests never depend on today.
create or replace function pg_temp.slot(p_minute int, p_weeks int default 2)
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Europe/London')::date + (p_weeks*7))::date)::timestamp
          + make_interval(mins => p_minute)) at time zone 'Europe/London';
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare v_biz uuid; v_br uuid; v_svc uuid; v_ann uuid; v_bob uuid;
begin
  insert into public.businesses (name, slug, status, language, trial_ends_at)
  values ('Manage Lab', 'manage-lab-check', 'trialing', 'en', now() + interval '999 days')
  returning id into v_biz;
  insert into ids values ('biz', v_biz::text);

  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_biz, 'London', true, 'GB', 'GBP', 'Europe/London', 'MGL') returning id into v_br;
  insert into ids values ('br', v_br::text);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (v_biz, 'Cut', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc::text);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, v_br, v_biz, 4000, true);

  insert into public.staff_profiles (business_id, display_name, sort_order)
  values (v_biz, 'Ann', 1) returning id into v_ann;
  insert into ids values ('ann', v_ann::text);
  insert into public.staff_profiles (business_id, display_name, sort_order)
  values (v_biz, 'Bob', 2) returning id into v_bob;
  insert into ids values ('bob', v_bob::text);

  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v_ann, v_br, v_biz), (v_bob, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id)
  values (v_svc, v_ann, v_biz), (v_svc, v_bob, v_biz);

  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select s, v_br, v_biz, d, 540, 1020 from generate_series(0,6) d, (values (v_ann),(v_bob)) x(s);

  update public.booking_settings
  set minimum_notice_minutes = 0, booking_window_days = 365, slot_interval = 'min_60',
      customer_can_cancel = true, cancel_cutoff_hours = 24
  where branch_id = v_br;
end $$;

-- Make a booking the normal way, so the token is real.
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.uid('br'), pg_temp.uid('svc'), pg_temp.slot(600),
    pg_temp.uid('ann'), 'Sarah Connor', '07700 900123', 'sarah@example.com');
  insert into ids values ('appt', r->>'appointment_id');
  insert into ids values ('token', r->>'manage_token');
  perform pg_temp.chk('fixture booking created', r->>'ok', 'true');
end $$;

-- ---------------------------------------------------------------------------
-- 1. get_booking
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.get_booking(pg_temp.id('token'));
  perform pg_temp.chk('get_booking with a valid token works', r->>'ok', 'true');
  perform pg_temp.chk('returns the service name', r->>'service_name', 'Cut');
  perform pg_temp.chk('returns the staff display name', r->>'staff_name', 'Ann');
  perform pg_temp.chk('returns the branch name', r->>'branch_name', 'London');
  perform pg_temp.chk('returns the business name', r->>'business_name', 'Manage Lab');
  perform pg_temp.chk('returns the branch timezone', r->>'timezone', 'Europe/London');
  perform pg_temp.chk('returns the local minute', r->>'local_minute', '600');
  perform pg_temp.chk('can_cancel is true (well inside the window)', r->>'can_cancel', 'true');
  perform pg_temp.chk('can_reschedule is true', r->>'can_reschedule', 'true');

  -- PRIVACY: first name only, and nothing else about the client.
  perform pg_temp.chk('FIRST NAME only', r->>'client_first_name', 'Sarah');
  perform pg_temp.chk('no full name', r ? 'client_name', false);
  perform pg_temp.chk('no phone', (r::text like '%900123%'), false);
  perform pg_temp.chk('no email', (r::text like '%sarah@example.com%'), false);
  perform pg_temp.chk('no client_id', r ? 'client_id', false);
  perform pg_temp.chk('no business_id', r ? 'business_id', false);
  perform pg_temp.chk('no appointment_id', r ? 'appointment_id', false);
end $$;

-- Token failures are all indistinguishable.
do $$
declare r jsonb;
begin
  r := public.get_booking('not-a-real-token-but-long-enough-to-be-hashed-0000');
  perform pg_temp.chk('an unknown token returns invalid_token', r->>'code', 'invalid_token');
  r := public.get_booking('short');
  perform pg_temp.chk('a too-short token returns invalid_token', r->>'code', 'invalid_token');
  r := public.get_booking(null);
  perform pg_temp.chk('a null token returns invalid_token', r->>'code', 'invalid_token');
  r := public.get_booking(repeat('f', 64));
  perform pg_temp.chk('a well-formed but wrong token returns invalid_token', r->>'code', 'invalid_token');
end $$;

-- A token for ANOTHER appointment must not open this one.
do $$
declare r jsonb; r2 jsonb;
begin
  r2 := public.create_booking(pg_temp.uid('br'), pg_temp.uid('svc'), pg_temp.slot(660),
    pg_temp.uid('bob'), 'Other Person', '07700 900222');
  insert into ids values ('appt2', r2->>'appointment_id');
  insert into ids values ('token2', r2->>'manage_token');

  r := public.get_booking(pg_temp.id('token2'));
  perform pg_temp.chk('the second token opens the SECOND booking', r->>'staff_name', 'Bob');
  perform pg_temp.chk('and not the first', r->>'local_minute', '660');
end $$;

-- last_used_at is recorded (a replay is allowed but visible).
select pg_temp.chk('using a token records last_used_at',
  (select last_used_at is not null from public.booking_manage_tokens
   where appointment_id = pg_temp.uid('appt')), true);

-- ---------------------------------------------------------------------------
-- 2. cancel_booking
-- ---------------------------------------------------------------------------
-- Outside the window first (24h cutoff, booking is weeks away => allowed).
do $$
declare r jsonb;
begin
  r := public.cancel_booking(pg_temp.id('token2'), 'Changed my mind');
  perform pg_temp.chk('cancel inside the allowed window works', r->>'ok', 'true');
  perform pg_temp.chk('status is cancelled', r->>'status', 'cancelled');
end $$;

select pg_temp.chk('the appointment really is cancelled',
  (select status::text from public.appointments where id = pg_temp.uid('appt2')), 'cancelled');
select pg_temp.chk('cancelled_by_guest is recorded',
  (select cancelled_by_guest from public.appointments where id = pg_temp.uid('appt2')), true);
select pg_temp.chk('the reason is stored',
  (select cancellation_reason from public.appointments where id = pg_temp.uid('appt2')), 'Changed my mind');
select pg_temp.chk('the TOKEN was revoked on cancel',
  (select revoked_at is not null from public.booking_manage_tokens
   where appointment_id = pg_temp.uid('appt2')), true);

-- REPLAY: the revoked token is now dead, and says only invalid_token.
do $$
declare r jsonb;
begin
  r := public.get_booking(pg_temp.id('token2'));
  perform pg_temp.chk('a revoked token cannot read the booking', r->>'code', 'invalid_token');
  r := public.cancel_booking(pg_temp.id('token2'));
  perform pg_temp.chk('a revoked token cannot cancel again (replay blocked)', r->>'code', 'invalid_token');
end $$;

-- The slot the cancelled booking held is free again.
select pg_temp.chk('cancelling freed the slot for a new booking',
  (select count(*)::int from public.get_free_slots(pg_temp.uid('br'), pg_temp.uid('svc'),
     pg_temp.uid('bob'), (pg_temp.slot(660) at time zone 'Europe/London')::date,
     (pg_temp.slot(660) at time zone 'Europe/London')::date)
   where starts_at = pg_temp.slot(660)), 1);

-- Cancel OUTSIDE the window.
do $$
declare r jsonb; v_t text;
begin
  -- A booking 2 hours from now, with a 24h cutoff => too late to cancel.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  select pg_temp.uid('biz'), pg_temp.uid('br'), c.id, pg_temp.uid('svc'), pg_temp.uid('ann'),
    now() + interval '2 hours', now() + interval '3 hours', 60, 'confirmed',
    (select id from public.form_versions where business_id = pg_temp.uid('biz') order by version desc limit 1),
    true
  from public.clients c where c.business_id = pg_temp.uid('biz') limit 1;

  insert into ids select 'appt_soon', id::text from public.appointments
  where business_id = pg_temp.uid('biz') and starts_at > now() and starts_at < now() + interval '3 hours'
  limit 1;

  v_t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into ids values ('token_soon', v_t);
  insert into public.booking_manage_tokens (business_id, appointment_id, token_hash, expires_at)
  values (pg_temp.uid('biz'), pg_temp.uid('appt_soon'),
          encode(extensions.digest(v_t, 'sha256'), 'hex'), now() + interval '3 hours');

  r := public.get_booking(v_t);
  perform pg_temp.chk('a booking inside the cutoff reports can_cancel false', r->>'can_cancel', 'false');

  r := public.cancel_booking(v_t);
  perform pg_temp.chk('cancelling inside the cutoff is REFUSED', r->>'code', 'cancel_window_passed');
  perform pg_temp.chk('and tells the page the cutoff', r->'cutoff_hours', '24'::jsonb);
  perform pg_temp.chk('the booking is still confirmed',
    (select status::text from public.appointments where id = pg_temp.uid('appt_soon')), 'confirmed');
end $$;

-- customer_can_cancel = false blocks it entirely.
do $$
declare r jsonb;
begin
  update public.booking_settings set customer_can_cancel = false where branch_id = pg_temp.uid('br');
  r := public.cancel_booking(pg_temp.id('token'));
  perform pg_temp.chk('customer_can_cancel=false refuses a cancel', r->>'code', 'cancel_not_allowed');
  r := public.get_booking(pg_temp.id('token'));
  perform pg_temp.chk('and get_booking reports can_cancel false', r->>'can_cancel', 'false');
  update public.booking_settings set customer_can_cancel = true where branch_id = pg_temp.uid('br');
end $$;

-- A completed booking is not cancellable.
do $$
declare r jsonb;
begin
  update public.appointments set status = 'completed' where id = pg_temp.uid('appt');
  r := public.cancel_booking(pg_temp.id('token'));
  perform pg_temp.chk('a completed booking is not cancellable', r->>'code', 'not_cancellable');
  perform pg_temp.chk('and says which status', r->>'status', 'completed');
  update public.appointments set status = 'confirmed' where id = pg_temp.uid('appt');
end $$;

-- An EXPIRED token is dead.
do $$
declare r jsonb; v_t text;
begin
  v_t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  select pg_temp.uid('biz'), pg_temp.uid('br'), c.id, pg_temp.uid('svc'), pg_temp.uid('bob'),
    now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 60, 'completed',
    (select id from public.form_versions where business_id = pg_temp.uid('biz') order by version desc limit 1),
    true
  from public.clients c where c.business_id = pg_temp.uid('biz') limit 1;

  insert into public.booking_manage_tokens (business_id, appointment_id, token_hash, expires_at)
  select pg_temp.uid('biz'), a.id, encode(extensions.digest(v_t,'sha256'),'hex'),
         now() - interval '1 day'
  from public.appointments a
  where a.business_id = pg_temp.uid('biz') and a.starts_at < now() limit 1;

  r := public.get_booking(v_t);
  perform pg_temp.chk('an EXPIRED token returns invalid_token', r->>'code', 'invalid_token');
  r := public.cancel_booking(v_t);
  perform pg_temp.chk('an expired token cannot cancel', r->>'code', 'invalid_token');
end $$;

-- ---------------------------------------------------------------------------
-- 3. reschedule_booking
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; v_old timestamptz;
begin
  select starts_at into v_old from public.appointments where id = pg_temp.uid('appt');
  r := public.reschedule_booking(pg_temp.id('token'), pg_temp.slot(780));
  perform pg_temp.chk('reschedule to a free slot works', r->>'ok', 'true');
  perform pg_temp.chk('the new local minute is 13:00', r->>'local_minute', '780');
  perform pg_temp.chk('status stays confirmed (auto confirmation)', r->>'status', 'confirmed');
  perform pg_temp.chk('needs_approval is false', r->>'needs_approval', 'false');

  perform pg_temp.chk('the appointment moved',
    (select starts_at from public.appointments where id = pg_temp.uid('appt')), pg_temp.slot(780));
  perform pg_temp.chk('and is NOT left cancelled',
    (select status::text from public.appointments where id = pg_temp.uid('appt')), 'confirmed');
  perform pg_temp.chk('cancelled_at was cleared',
    (select cancelled_at from public.appointments where id = pg_temp.uid('appt')), null::timestamptz);

  -- THE OLD SLOT IS FREE AGAIN, in the same transaction.
  perform pg_temp.chk('the OLD slot is free again',
    (select count(*)::int from public.get_free_slots(pg_temp.uid('br'), pg_temp.uid('svc'),
       pg_temp.uid('ann'), (v_old at time zone 'Europe/London')::date,
       (v_old at time zone 'Europe/London')::date)
     where starts_at = v_old), 1);
end $$;

-- The SAME token still works after a reschedule, and its expiry moved.
do $$
declare r jsonb;
begin
  r := public.get_booking(pg_temp.id('token'));
  perform pg_temp.chk('the same token still works after a reschedule', r->>'ok', 'true');
  perform pg_temp.chk('and shows the new time', r->>'local_minute', '780');
  perform pg_temp.chk('the token expiry followed the appointment',
    (select t.expires_at = a.ends_at from public.booking_manage_tokens t
     join public.appointments a on a.id = t.appointment_id
     where a.id = pg_temp.uid('appt') and t.revoked_at is null), true);
end $$;

-- Rescheduling ONTO a taken slot is refused and the original survives.
do $$
declare r jsonb; v_before timestamptz;
begin
  -- Give Ann a booking at 15:00 to collide with.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  select pg_temp.uid('biz'), pg_temp.uid('br'), c.id, pg_temp.uid('svc'), pg_temp.uid('ann'),
    pg_temp.slot(900), pg_temp.slot(900) + interval '1 hour', 60, 'confirmed',
    (select id from public.form_versions where business_id = pg_temp.uid('biz') order by version desc limit 1),
    true
  from public.clients c where c.business_id = pg_temp.uid('biz') limit 1;

  select starts_at into v_before from public.appointments where id = pg_temp.uid('appt');
  r := public.reschedule_booking(pg_temp.id('token'), pg_temp.slot(900), pg_temp.uid('ann'));
  perform pg_temp.chk('rescheduling onto a taken slot is refused', r->>'ok', 'false');
  perform pg_temp.chk('with slot_unavailable', r->>'code', 'slot_unavailable');
  -- CRITICAL: the original booking must survive the failed attempt.
  perform pg_temp.chk('the ORIGINAL booking is untouched after a failed reschedule',
    (select starts_at from public.appointments where id = pg_temp.uid('appt')), v_before);
  perform pg_temp.chk('and still confirmed, not cancelled',
    (select status::text from public.appointments where id = pg_temp.uid('appt')), 'confirmed');
end $$;

-- Out of hours.
do $$
declare r jsonb; v_before timestamptz;
begin
  select starts_at into v_before from public.appointments where id = pg_temp.uid('appt');
  r := public.reschedule_booking(pg_temp.id('token'), pg_temp.slot(1320));
  perform pg_temp.chk('rescheduling to 22:00 (out of hours) is refused', r->>'ok', 'false');
  perform pg_temp.chk('the original survives',
    (select starts_at from public.appointments where id = pg_temp.uid('appt')), v_before);
end $$;

-- Minimum notice and booking window.
do $$
declare r jsonb;
begin
  update public.booking_settings set minimum_notice_minutes = 2880 where branch_id = pg_temp.uid('br');
  r := public.reschedule_booking(pg_temp.id('token'),
    (((now() at time zone 'Europe/London')::date + 1)::timestamp + interval '10 hours') at time zone 'Europe/London');
  perform pg_temp.chk('rescheduling inside the minimum notice is refused', r->>'code', 'too_soon');
  update public.booking_settings set minimum_notice_minutes = 0 where branch_id = pg_temp.uid('br');

  update public.booking_settings set booking_window_days = 7 where branch_id = pg_temp.uid('br');
  r := public.reschedule_booking(pg_temp.id('token'), pg_temp.slot(600, 20));
  perform pg_temp.chk('rescheduling beyond the booking window is refused', r->>'code', 'outside_window');
  update public.booking_settings set booking_window_days = 365 where branch_id = pg_temp.uid('br');
end $$;

-- Same slot = no-op.
do $$
declare r jsonb; v_now timestamptz;
begin
  select starts_at into v_now from public.appointments where id = pg_temp.uid('appt');
  r := public.reschedule_booking(pg_temp.id('token'), v_now);
  perform pg_temp.chk('rescheduling to the same slot reports same_slot', r->>'code', 'same_slot');
end $$;

-- Reschedule outside the cancel window is refused.
do $$
declare r jsonb;
begin
  r := public.reschedule_booking(pg_temp.id('token_soon'), pg_temp.slot(600, 3));
  perform pg_temp.chk('rescheduling inside the cutoff is refused', r->>'code', 'cancel_window_passed');
end $$;

-- An invalid token cannot reschedule.
do $$
declare r jsonb;
begin
  r := public.reschedule_booking(repeat('e', 64), pg_temp.slot(600, 3));
  perform pg_temp.chk('an invalid token cannot reschedule', r->>'code', 'invalid_token');
end $$;

-- MANUAL CONFIRMATION: a reschedule goes back to pending.
do $$
declare r jsonb;
begin
  update public.booking_settings set confirmation = 'manual' where branch_id = pg_temp.uid('br');
  r := public.reschedule_booking(pg_temp.id('token'), pg_temp.slot(960));
  perform pg_temp.chk('reschedule under manual confirmation succeeds', r->>'ok', 'true');
  perform pg_temp.chk('and goes back to PENDING', r->>'status', 'pending');
  perform pg_temp.chk('and tells the page it needs approval', r->>'needs_approval', 'true');
  perform pg_temp.chk('the row really is pending',
    (select status::text from public.appointments where id = pg_temp.uid('appt')), 'pending');
  update public.booking_settings set confirmation = 'auto' where branch_id = pg_temp.uid('br');
end $$;

-- A pending booking can still be rescheduled and cancelled by the guest.
do $$
declare r jsonb;
begin
  r := public.get_booking(pg_temp.id('token'));
  perform pg_temp.chk('a pending booking is still manageable', r->>'can_cancel', 'true');
end $$;

-- Group capacity on reschedule.
do $$
declare r jsonb; v_fv uuid; v_c uuid;
begin
  update public.booking_settings set people_per_slot = 2 where branch_id = pg_temp.uid('br');
  select id into v_fv from public.form_versions where business_id = pg_temp.uid('biz') order by version desc limit 1;
  select id into v_c from public.clients where business_id = pg_temp.uid('biz') limit 1;
  -- Fill a slot with 2 group bookings on Bob.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  select pg_temp.uid('biz'), pg_temp.uid('br'), v_c, pg_temp.uid('svc'), pg_temp.uid('bob'),
    pg_temp.slot(600, 5), pg_temp.slot(600, 5) + interval '1 hour', 60, 'confirmed', v_fv, false
  from generate_series(1,2);

  r := public.reschedule_booking(pg_temp.id('token'), pg_temp.slot(600, 5), pg_temp.uid('bob'));
  perform pg_temp.chk('rescheduling into a FULL group slot is refused', r->>'ok', 'false');
  update public.booking_settings set people_per_slot = 1 where branch_id = pg_temp.uid('br');
end $$;

-- ---------------------------------------------------------------------------
-- 4. resend_manage_link (dashboard, permission-checked)
-- ---------------------------------------------------------------------------
do $$
declare v_user uuid; v_member uuid; v_schema text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'manage.owner@example.com',
    extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '')
  returning id into v_user;
  insert into ids values ('owner', v_user::text);

  insert into public.business_members (business_id, user_id, status, joined_at)
  values (pg_temp.uid('biz'), v_user, 'active', now()) returning id into v_member;
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  values (v_member, (select id from public.roles where business_id is null and key='owner'), null);

  -- A staff-only user, to prove the permission check.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'manage.nobody@example.com',
    extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '')
  returning id into v_user;
  insert into ids values ('nobody', v_user::text);

  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

do $$
declare r jsonb; v_new text; v_old text;
begin
  select token_hash into v_old from public.booking_manage_tokens
  where appointment_id = pg_temp.uid('appt') and revoked_at is null;

  v_new := encode(extensions.gen_random_bytes(32), 'hex');

  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.resend_manage_link(pg_temp.uid('appt'), v_new);
  reset role;

  perform pg_temp.chk('an owner can resend the manage link', r->>'ok', 'true');
  perform pg_temp.chk('and gets the NEW raw token once', r->>'manage_token', v_new);

  -- THE KEY PROPERTY: the old token is dead, the new one works.
  perform pg_temp.chk('the OLD token was revoked',
    (select revoked_at is not null from public.booking_manage_tokens where token_hash = v_old), true);
  perform pg_temp.chk('the OLD token no longer opens the booking',
    (public.get_booking(pg_temp.id('token')))->>'code', 'invalid_token');
  perform pg_temp.chk('the NEW token does',
    (public.get_booking(v_new))->>'ok', 'true');
  perform pg_temp.chk('exactly ONE live token per appointment',
    (select count(*)::int from public.booking_manage_tokens
     where appointment_id = pg_temp.uid('appt') and revoked_at is null), 1);
  insert into ids values ('token3', v_new);
end $$;

-- Not signed in, and without permission.
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', null, true);
  r := public.resend_manage_link(pg_temp.uid('appt'), encode(extensions.gen_random_bytes(32),'hex'));
  perform pg_temp.chk('resend without a session is refused', r->>'code', 'not_signed_in');

  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('nobody'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.resend_manage_link(pg_temp.uid('appt'), encode(extensions.gen_random_bytes(32),'hex'));
  reset role;
  perform pg_temp.chk('resend by a non-member is FORBIDDEN', r->>'code', 'forbidden');
end $$;

-- An unknown appointment.
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.resend_manage_link(gen_random_uuid(), encode(extensions.gen_random_bytes(32),'hex'));
  reset role;
  perform pg_temp.chk('resend for an unknown appointment is not_found', r->>'code', 'not_found');
end $$;

-- A resend writes an audit row.
select pg_temp.chk('resending is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.uid('biz') and action = 'appointment.manage_link_resent'), 1);

-- A short caller token is replaced with a strong one rather than accepted.
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.resend_manage_link(pg_temp.uid('appt'), 'tiny');
  reset role;
  perform pg_temp.chk('a too-short supplied token is replaced', length(r->>'manage_token'), 64);
end $$;

-- Cancelled booking: no new link.
do $$
declare r jsonb;
begin
  update public.appointments set status='cancelled', cancelled_at=now() where id = pg_temp.uid('appt2');
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.resend_manage_link(pg_temp.uid('appt2'), encode(extensions.gen_random_bytes(32),'hex'));
  reset role;
  perform pg_temp.chk('no manage link for a cancelled booking', r->>'code', 'not_cancellable');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
select pg_temp.chk('anon cannot call get_booking',
  has_function_privilege('anon','public.get_booking(text)','execute'), false);
select pg_temp.chk('authenticated cannot call get_booking',
  has_function_privilege('authenticated','public.get_booking(text)','execute'), false);
select pg_temp.chk('service_role CAN call get_booking',
  has_function_privilege('service_role','public.get_booking(text)','execute'), true);
select pg_temp.chk('anon cannot call cancel_booking',
  has_function_privilege('anon','public.cancel_booking(text,text)','execute'), false);
select pg_temp.chk('anon cannot call reschedule_booking',
  has_function_privilege('anon','public.reschedule_booking(text,timestamptz,uuid)','execute'), false);
select pg_temp.chk('anon cannot call resolve_manage_token',
  has_function_privilege('anon','public.resolve_manage_token(text)','execute'), false);
select pg_temp.chk('anon cannot call resend_manage_link',
  has_function_privilege('anon','public.resend_manage_link(uuid,text)','execute'), false);
select pg_temp.chk('authenticated CAN call resend_manage_link (can() is the boundary)',
  has_function_privilege('authenticated','public.resend_manage_link(uuid,text)','execute'), true);

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
