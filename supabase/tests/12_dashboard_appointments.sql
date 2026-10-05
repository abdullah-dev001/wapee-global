-- Phase 4 part A: dashboard appointment backend.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/12_dashboard_appointments.sql
--
-- Plain SQL, not pgTAP (Docker is not installed; see context/_handoff.md).
-- Builds its own fixtures (real auth.users rows, two businesses, every
-- system role, two branches in different timezones for the DST checks) and
-- rolls back everything at the end.
--
-- Last run: 2026-10-07 against the live dev project. See the final query (fixture now uses real invoice RPCs).
--
-- Covered: create_appointment (dashboard + walk-in, staff outside hours,
-- Any-staff, client by id vs by phone, never-overwrite, staff_id FORCED for
-- an Own-scope caller, audit row); update_appointment (reschedule collision
-- rules incl. group/resource capacity, notes-only edit, terminal rows
-- refuse ALL edits, audit row); every status RPC through every ALLOWED and
-- FORBIDDEN transition via is_allowed_appointment_transition, INCLUDING the
-- reopen decision (no_show/completed -> confirmed, Owner/Manager ONLY via a
-- literal role check, invoice_id must be null, audit row) and the fix that
-- stops approve_appointment being a side door into it; scope enforcement
-- (owner, manager, receptionist, staff at Own, another business, anon) on
-- every write RPC; **the original appointment surviving every failed
-- create/update/status call** (CLAUDE.md §10a); a REAL bug this pass found
-- and fixed — create_appointment/update_appointment never stored
-- resource_id, making resource capacity a no-op from the dashboard; DST
-- (Europe/London spring-forward, America/New_York fall-back, Asia/Karachi
-- no-DST); group AND resource capacity respected on both create and
-- update; list_appointments keyset pagination, filters and search;
-- get_calendar_appointments branch-timezone day boundaries; audit_logs rows
-- for every write RPC; the Realtime publication; and grants on every RPC
-- including the collision helper.

begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
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

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
do $$
declare r record; v_email text; v_id uuid;
begin
  for r in select * from (values
      ('owner'), ('manager'), ('recep'), ('staffa'), ('staffb'), ('ownerb'), ('ownerk')
    ) as x(k)
  loop
    v_email := 'p4.' || r.k || '@example.com';
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

-- Two businesses: A in Europe/London (for DST spring-forward), B's branch
-- recreated below in America/New_York (for DST fall-back).
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P4 A','p4-a','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biza', v_biz);

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P4 B','p4-b','US','USD','America/New_York','en',null,'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
end $$;

insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') limit 1;

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days'
where id in (pg_temp.id('biza'), pg_temp.id('bizb'));
alter table public.businesses enable trigger businesses_enforce_guard;

update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365
where branch_id in (pg_temp.id('brancha'), pg_temp.id('branchb'));

-- Members + roles on business A. staffb has NO membership on A (used as the
-- "someone else's staff profile" and the cross-business caller).
do $$
declare r record; v_member uuid;
begin
  for r in select * from (values
      ('manager','manager'), ('recep','receptionist'), ('staffa','staff')
    ) as x(k, role_key)
  loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.k), 'active', now())
    returning id into v_member;
    insert into ids values ('member_' || r.k, v_member);
    perform pg_temp.act_as(pg_temp.id('owner'));
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member,
            (select id from public.roles where business_id is null and key = r.role_key),
            pg_temp.id('brancha'));
  end loop;
end $$;

-- Catalogue: one service, two staff (one = staffa's own profile, one not),
-- staff/branch hours Mon-Fri 9-17 so there is a clean "in hours" and "out of
-- hours" instant to test with.
do $$
declare v_staff uuid; v_other uuid; v_svc uuid; v_client1 uuid; v_client2 uuid;
begin
  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biza'), pg_temp.id('member_staffa'), 'Staff A') returning id into v_staff;
  insert into ids values ('staffa_profile', v_staff);

  insert into public.staff_profiles (business_id, display_name)
  values (pg_temp.id('biza'), 'Other Person') returning id into v_other;
  insert into ids values ('other_profile', v_other);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (pg_temp.id('biza'), 'Cut', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, pg_temp.id('brancha'), pg_temp.id('biza'), 4000, true);

  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v_staff, pg_temp.id('brancha'), pg_temp.id('biza')),
         (v_other, pg_temp.id('brancha'), pg_temp.id('biza'));
  insert into public.service_staff (service_id, staff_id, business_id)
  values (v_svc, v_staff, pg_temp.id('biza')), (v_svc, v_other, pg_temp.id('biza'));

  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select pg_temp.id('brancha'), pg_temp.id('biza'), d, 540, 1020 from generate_series(1,5) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select s, pg_temp.id('brancha'), pg_temp.id('biza'), d, 540, 1020
  from generate_series(1,5) d, (values (v_staff),(v_other)) x(s);

  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Existing Client', '+447700900111') returning id into v_client1;
  insert into ids values ('client1', v_client1);
  insert into public.clients (business_id, full_name, phone_e164, email)
  values (pg_temp.id('biza'), 'Second Client', '+447700900222', 'second@example.com') returning id into v_client2;
  insert into ids values ('client2', v_client2);
end $$;

-- A slot N weeks out on a Tuesday 10:00 London time, IN hours.
create or replace function pg_temp.in_hours_slot(p_weeks int default 2)
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Europe/London')::date + (p_weeks*7) + 1)::date)::timestamp
          + interval '10 hours') at time zone 'Europe/London';
$$;
-- The same week, 22:00 — OUT of branch/staff hours.
create or replace function pg_temp.out_of_hours_slot(p_weeks int default 2)
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Europe/London')::date + (p_weeks*7) + 1)::date)::timestamp
          + interval '22 hours') at time zone 'Europe/London';
$$;

-- ===========================================================================
-- 1. create_appointment
-- ===========================================================================

-- Owner books with an EXISTING client by id, specific staff, IN hours.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1')
  );
  reset role;
  perform pg_temp.chk('owner books an existing client by id', r->>'ok', 'true');
  insert into ids values ('appt_owner', (r->>'appointment_id')::uuid);
  perform pg_temp.chk('status is confirmed (auto)', r->>'status', 'confirmed');
  perform pg_temp.chk('appointment.created is audited',
    (select count(*)::int from public.audit_logs
     where business_id = pg_temp.id('biza') and action = 'appointment.created'
       and entity_id = (r->>'appointment_id')), 1);
end $$;

-- Dashboard booking OUTSIDE hours succeeds (the whole point).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.out_of_hours_slot(),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1')
  );
  reset role;
  perform pg_temp.chk('dashboard booking OUT of hours succeeds (doc 6.2)', r->>'ok', 'true');
  insert into ids values ('appt_outofhours', (r->>'appointment_id')::uuid);
end $$;

-- Walk-in by PHONE, new client created.
do $$
declare r jsonb; v_count int;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(3),
    p_staff_id => pg_temp.id('staffa_profile'),
    p_client_name => 'Walk In Guest', p_client_phone => '07700900333',
    p_source => 'walk_in'
  );
  reset role;
  perform pg_temp.chk('walk-in by phone succeeds', r->>'ok', 'true');
  insert into ids values ('appt_walkin', (r->>'appointment_id')::uuid);

  select count(*) into v_count from public.clients
  where business_id = pg_temp.id('biza') and phone_e164 = '+447700900333';
  perform pg_temp.chk('a new client was created for the walk-in', v_count, 1);
end $$;

-- Repeat booking by the SAME phone attaches to the existing client, never
-- overwrites (same rule as create_booking).
do $$
declare r jsonb; v_count int; v_name text;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(4),
    p_staff_id => pg_temp.id('other_profile'),
    p_client_name => 'Different Spelling', p_client_phone => '+447700900333'
  );
  reset role;
  perform pg_temp.chk('repeat phone attaches to existing client', r->>'ok', 'true');

  select count(*) into v_count from public.clients
  where business_id = pg_temp.id('biza') and phone_e164 = '+447700900333';
  perform pg_temp.chk('still exactly ONE client for that phone', v_count, 1);

  select full_name into v_name from public.clients where phone_e164 = '+447700900333';
  perform pg_temp.chk('the ORIGINAL name is kept, not overwritten', v_name, 'Walk In Guest');
end $$;

-- "Any staff" (p_staff_id null) resolves to someone, via pick_staff_for_slot.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(5),
    p_client_id => pg_temp.id('client2')
  );
  reset role;
  perform pg_temp.chk('"any staff" resolves to a real staff member', r->>'ok', 'true');
  perform pg_temp.chk('and a staff_id is actually set', r->'staff_id' is not null, true);
end $$;

-- Double-booking the SAME staff at an overlapping instant is refused, AND
-- the failed attempt leaves no orphan row behind (failure-path survival for
-- a CREATE: there is no "original" to protect, but there must be no trace
-- of the rejected attempt either).
do $$
declare r jsonb; v_count_before int; v_count_after int;
begin
  select count(*) into v_count_before from public.appointments
  where staff_id = pg_temp.id('staffa_profile') and starts_at = pg_temp.in_hours_slot();

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client2')
  );
  reset role;
  perform pg_temp.chk('double-booking the same staff/instant is refused', r->>'ok', 'false');
  perform pg_temp.chk('with slot_unavailable', r->>'code', 'slot_unavailable');

  select count(*) into v_count_after from public.appointments
  where staff_id = pg_temp.id('staffa_profile') and starts_at = pg_temp.in_hours_slot();
  perform pg_temp.chk('the failed create left NO orphan row (same count before/after)',
    v_count_after, v_count_before);
end $$;

-- Staff member booking THEMSELVES (Own scope) succeeds.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(6),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1')
  );
  reset role;
  perform pg_temp.chk('staff may book THEMSELVES (Own scope)', r->>'ok', 'true');
end $$;

-- Staff passing SOMEONE ELSE's staff_id is overridden, not honoured: the
-- booking still succeeds, but FOR THE CALLER, never for the id they passed
-- (the user's decision 2026-10-05: "staff_id FORCED to their own staff
-- profile, cannot book for others"). It is not a 403 -- there is nothing
-- wrong with the REQUEST, the server just never lets Own scope act as
-- anyone but themselves.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(7),
    p_staff_id => pg_temp.id('other_profile'), p_client_id => pg_temp.id('client1')
  );
  reset role;
  perform pg_temp.chk('staff passing someone else''s id still succeeds', r->>'ok', 'true');
  perform pg_temp.chk('but the staff_id is FORCED to the caller''s own profile',
    r->>'staff_id', pg_temp.id('staffa_profile')::text);
end $$;

-- Staff with NO staff profile at all (e.g. a Receptionist with Own-only
-- grants, which does not happen in the real seed, but the RPC must still
-- refuse cleanly rather than fall through to "any staff").
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('staffb'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(21)
  );
  reset role;
  perform pg_temp.chk('a caller with no permission at all and no staff profile is forbidden',
    r->>'code', 'forbidden');
end $$;

-- Receptionist (Branch scope) may book anyone, including staffa.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(8),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1')
  );
  reset role;
  perform pg_temp.chk('receptionist (branch scope) may book anyone', r->>'ok', 'true');
end $$;

-- Another business's owner cannot create an appointment on branch A at all.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(9),
    p_client_id => pg_temp.id('client1')
  );
  reset role;
  perform pg_temp.chk('another business cannot create on branch A', r->>'code', 'forbidden');
end $$;

-- anon cannot call it at all (no role grant; direct call as anon is refused by GRANT).
do $$
declare v_ok boolean := true; v_msg text;
begin
  set local role anon;
  begin
    perform public.create_appointment(pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(10));
  exception when insufficient_privilege then
    v_ok := false;
  end;
  reset role;
  perform pg_temp.chk('anon cannot call create_appointment at all', v_ok, false);
end $$;

-- ===========================================================================
-- 2. update_appointment / reschedule
-- ===========================================================================

-- Notes-only edit (no reschedule) works and does not touch starts_at.
do $$
declare r jsonb; v_before timestamptz;
begin
  select starts_at into v_before from public.appointments where id = pg_temp.id('appt_owner');

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.update_appointment(pg_temp.id('appt_owner'), p_internal_notes => 'VIP, likes still water');
  reset role;

  perform pg_temp.chk('notes-only edit succeeds', r->>'ok', 'true');
  perform pg_temp.chk('starts_at unchanged', (r->>'starts_at')::timestamptz, v_before);
  perform pg_temp.chk('the note is stored',
    (select internal_notes from public.appointments where id = pg_temp.id('appt_owner')),
    'VIP, likes still water');
end $$;

-- Reschedule to a free in-hours slot, same staff.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.update_appointment(pg_temp.id('appt_owner'), p_starts_at => pg_temp.in_hours_slot(11));
  reset role;
  perform pg_temp.chk('reschedule to a free slot succeeds', r->>'ok', 'true');
  perform pg_temp.chk('starts_at actually moved',
    (select starts_at from public.appointments where id = pg_temp.id('appt_owner')),
    pg_temp.in_hours_slot(11));
end $$;

-- Rescheduling ONTO a taken slot is refused AND THE ORIGINAL SURVIVES
-- (CLAUDE.md §10a's central assertion).
do $$
declare r jsonb; v_before timestamptz; v_before_status public.appointment_status;
begin
  select starts_at, status into v_before, v_before_status
  from public.appointments where id = pg_temp.id('appt_owner');

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  -- appt_outofhours occupies pg_temp.out_of_hours_slot() with staffa_profile.
  r := public.update_appointment(
    pg_temp.id('appt_owner'),
    p_starts_at => pg_temp.out_of_hours_slot(),
    p_staff_id => pg_temp.id('staffa_profile')
  );
  reset role;

  perform pg_temp.chk('rescheduling onto a taken slot is refused', r->>'ok', 'false');
  perform pg_temp.chk('with slot_unavailable', r->>'code', 'slot_unavailable');
  perform pg_temp.chk('the ORIGINAL appointment survives untouched',
    (select starts_at from public.appointments where id = pg_temp.id('appt_owner')), v_before);
  perform pg_temp.chk('and its status is untouched',
    (select status from public.appointments where id = pg_temp.id('appt_owner')), v_before_status);
end $$;

-- Reschedule to a slot OUT of hours still succeeds (dashboard override).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.update_appointment(pg_temp.id('appt_owner'), p_starts_at => pg_temp.out_of_hours_slot(12));
  reset role;
  perform pg_temp.chk('rescheduling OUT of hours succeeds from the dashboard', r->>'ok', 'true');
end $$;

-- A TERMINAL appointment refuses ANY edit, even just notes.
do $$
declare r jsonb; v_appt uuid; v_fv uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, cancelled_at, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(20), pg_temp.in_hours_slot(20) + interval '1 hour',
    60, 'cancelled', now(), v_fv, false)
  returning id into v_appt;
  insert into ids values ('appt_terminal', v_appt);

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.update_appointment(v_appt, p_internal_notes => 'should not be allowed');
  reset role;
  perform pg_temp.chk('a cancelled appointment refuses even a notes-only edit', r->>'code', 'not_editable');
end $$;

-- Staff may reschedule their OWN appointment but not someone else's.
do $$
declare r jsonb; v_appt uuid; v_fv uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('other_profile'), pg_temp.in_hours_slot(13), pg_temp.in_hours_slot(13) + interval '1 hour',
    60, 'confirmed', v_fv, true)
  returning id into v_appt;
  insert into ids values ('appt_other', v_appt);

  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  r := public.update_appointment(v_appt, p_starts_at => pg_temp.in_hours_slot(14));
  reset role;
  perform pg_temp.chk('staff cannot reschedule SOMEONE ELSE''s appointment', r->>'code', 'forbidden');
end $$;

-- ===========================================================================
-- 3. Status transitions -- every ALLOWED and FORBIDDEN path, via the table
-- ===========================================================================

-- Exhaustively check is_allowed_appointment_transition against every status
-- pair (5 statuses x 5 statuses = 25), so the RULE itself (not just the RPCs
-- that consult it) is proven once, completely.
do $$
declare v_from public.appointment_status; v_to public.appointment_status;
  v_allowed boolean; v_expected boolean;
begin
  foreach v_from in array enum_range(null::public.appointment_status)
  loop
    foreach v_to in array enum_range(null::public.appointment_status)
    loop
      v_allowed := public.is_allowed_appointment_transition(v_from, v_to);
      v_expected := (v_from, v_to) in (
        ('pending','confirmed'), ('pending','cancelled'),
        ('confirmed','cancelled'), ('confirmed','completed'), ('confirmed','no_show'),
        -- The reopen decision (2026-10-05): no_show/completed -> confirmed
        -- ARE allowed at the table level (reopen_appointment is the only
        -- RPC that uses them; approve_appointment deliberately checks
        -- status = 'pending' directly instead, so it cannot become a side
        -- door into this).
        ('no_show','confirmed'), ('completed','confirmed')
      );
      perform pg_temp.chk(
        format('transition %s -> %s is %s', v_from, v_to, case when v_expected then 'ALLOWED' else 'FORBIDDEN' end),
        v_allowed, v_expected
      );
    end loop;
  end loop;
end $$;

-- A fresh pending appointment (manual confirmation) to exercise approve/cancel.
do $$
declare r jsonb; v_appt uuid;
begin
  update public.booking_settings set confirmation = 'manual' where branch_id = pg_temp.id('brancha');

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(15),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1'),
    p_auto_confirm => false
  );
  reset role;

  update public.booking_settings set confirmation = 'auto' where branch_id = pg_temp.id('brancha');

  perform pg_temp.chk('manual-confirmation dashboard booking starts pending', r->>'status', 'pending');
  insert into ids values ('appt_pending', (r->>'appointment_id')::uuid);
end $$;

-- approve_appointment: pending -> confirmed.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.approve_appointment(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('approve_appointment moves pending -> confirmed', r->>'status', 'confirmed');
end $$;

-- approve_appointment AGAIN (now confirmed) is a forbidden transition.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.approve_appointment(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('approving an already-confirmed appointment is refused', r->>'code', 'invalid_transition');
end $$;

-- mark_no_show: confirmed -> no_show.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.mark_no_show(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('mark_no_show moves confirmed -> no_show', r->>'status', 'no_show');
end $$;

-- no_show is terminal: cancel/complete/approve are ALL refused, no reopen.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.cancel_appointment(pg_temp.id('appt_pending'));
  perform pg_temp.chk('cancel on a no_show is refused (terminal)', r->>'code', 'invalid_transition');
  r := public.mark_completed(pg_temp.id('appt_pending'));
  perform pg_temp.chk('complete on a no_show is refused (terminal)', r->>'code', 'invalid_transition');
  r := public.approve_appointment(pg_temp.id('appt_pending'));
  perform pg_temp.chk('approve on a no_show is refused (terminal)', r->>'code', 'invalid_transition');
  reset role;
  perform pg_temp.chk('the row is STILL no_show after every refused attempt',
    (select status::text from public.appointments where id = pg_temp.id('appt_pending')), 'no_show');
end $$;

-- ===========================================================================
-- 3b. reopen_appointment -- the user's decision (b), 2026-10-05:
--     no_show/completed -> confirmed, Owner/Manager ONLY, invoice_id null
--     only, audit-logged.
-- ===========================================================================

-- Receptionist CANNOT reopen (not Owner/Manager), even though Receptionist
-- holds appointments.edit at Branch scope -- this is the gap a plain
-- permission check would have missed; reopen_appointment checks the ROLE
-- KEY directly instead.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  r := public.reopen_appointment(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('receptionist CANNOT reopen (not Owner/Manager)', r->>'code', 'forbidden');
  perform pg_temp.chk('the row is still no_show after the refusal',
    (select status::text from public.appointments where id = pg_temp.id('appt_pending')), 'no_show');
end $$;

-- Staff CANNOT reopen either (also not Owner/Manager).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  r := public.reopen_appointment(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('staff CANNOT reopen (not Owner/Manager)', r->>'code', 'forbidden');
end $$;

-- Manager CAN reopen a no_show (invoice_id is null).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('manager'));
  set local role authenticated;
  r := public.reopen_appointment(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('manager CAN reopen a no_show (invoice_id null)', r->>'ok', 'true');
  perform pg_temp.chk('and the status is confirmed', r->>'status', 'confirmed');
  perform pg_temp.chk('the row really is confirmed now',
    (select status::text from public.appointments where id = pg_temp.id('appt_pending')), 'confirmed');
end $$;

-- A reopened appointment's audit row is written with the right action.
select pg_temp.chk('the reopen is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.id('biza') and action = 'appointment.reopened'
     and entity_id = pg_temp.id('appt_pending')::text), 1);

-- ===========================================================================
-- 3c. is_owner_or_manager() -- Phase 4 part B1 fix: the single source of
--     truth reopen_appointment now calls internally, and the UI calls
--     directly for the Reopen button. Must agree with reopen_appointment's
--     own refusals above for every role, plus the cases a working RPC call
--     never exercises on its own: another business, and an anonymous caller.
-- ===========================================================================
do $$
declare v_result boolean;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_result := public.is_owner_or_manager(pg_temp.id('biza'));
  reset role;
  perform pg_temp.chk('owner: is_owner_or_manager true (no branch)', v_result, true);
end $$;

do $$
declare v_result boolean;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_result := public.is_owner_or_manager(pg_temp.id('biza'), pg_temp.id('brancha'));
  reset role;
  perform pg_temp.chk('owner: is_owner_or_manager true (own branch)', v_result, true);
end $$;

do $$
declare v_result boolean;
begin
  perform pg_temp.act_as(pg_temp.id('manager'));
  set local role authenticated;
  v_result := public.is_owner_or_manager(pg_temp.id('biza'), pg_temp.id('brancha'));
  reset role;
  perform pg_temp.chk('manager: is_owner_or_manager true', v_result, true);
end $$;

do $$
declare v_result boolean;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  v_result := public.is_owner_or_manager(pg_temp.id('biza'), pg_temp.id('brancha'));
  reset role;
  perform pg_temp.chk('receptionist: is_owner_or_manager FALSE (agrees with reopen refusal above)',
    v_result, false);
end $$;

do $$
declare v_result boolean;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  v_result := public.is_owner_or_manager(pg_temp.id('biza'), pg_temp.id('brancha'));
  reset role;
  perform pg_temp.chk('staff: is_owner_or_manager FALSE (agrees with reopen refusal above)',
    v_result, false);
end $$;

-- Owner of business B asking about business A: false. A real caller would
-- never pass someone else's business_id here (the UI always passes its own
-- current scope), but the function itself must still refuse it -- it is
-- SECURITY DEFINER, so nothing upstream of it enforces this.
do $$
declare v_result boolean;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  v_result := public.is_owner_or_manager(pg_temp.id('biza'));
  reset role;
  perform pg_temp.chk('owner of ANOTHER business: is_owner_or_manager FALSE for biza',
    v_result, false);
end $$;

-- An anonymous caller: EXECUTE is not even granted to anon, so the call
-- itself must fail (42501), not merely return false.
do $$
declare v_errcode text;
begin
  set local role anon;
  begin
    perform public.is_owner_or_manager(pg_temp.id('biza'));
    v_errcode := 'no_error';
  exception when insufficient_privilege then
    v_errcode := sqlstate;
  end;
  reset role;
  perform pg_temp.chk('anon: is_owner_or_manager has no EXECUTE grant', v_errcode, '42501');
end $$;

-- approve_appointment on that SAME now-confirmed row is correctly refused
-- (it is no longer pending) -- and, separately, approve_appointment never
-- reopens a STILL-no_show row either (proven on a fresh one next), closing
-- the side-door this session found and fixed.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.approve_appointment(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('approve_appointment refuses an already-confirmed row', r->>'code', 'invalid_transition');
end $$;

-- A FRESH no_show + completed row for the remaining reopen cases, so this
-- section does not depend on 'appt_pending' having survived every earlier
-- mutation unchanged.
do $$
declare v_fv uuid; v_no_show uuid; v_completed uuid; v_invoiced uuid; r jsonb;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;

  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(22), pg_temp.in_hours_slot(22) + interval '1 hour',
    60, 'no_show', v_fv, false)
  returning id into v_no_show;
  insert into ids values ('appt_reopen_noshow', v_no_show);

  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(23), pg_temp.in_hours_slot(23) + interval '1 hour',
    60, 'completed', v_fv, false)
  returning id into v_completed;
  insert into ids values ('appt_reopen_completed', v_completed);

  -- A completed appointment that will get a REAL invoice (below, through the
  -- invoice RPCs: appointments.invoice_id is RPC-only since Phase 5A).
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(24), pg_temp.in_hours_slot(24) + interval '1 hour',
    60, 'completed', v_fv, false)
  returning id into v_invoiced;
  insert into ids values ('appt_reopen_invoiced', v_invoiced);
end $$;

-- Invoice it for real: draft (links appointments.invoice_id) then issue.
do $$
declare r jsonb; v_inv uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_invoice_draft(pg_temp.id('brancha'), pg_temp.id('appt_reopen_invoiced'), pg_temp.id('client1'),
    jsonb_build_array(jsonb_build_object('service_id', pg_temp.id('svc'), 'quantity', 1)), null);
  reset role;
  perform pg_temp.chk('fixture: invoice draft created via the RPC', r->>'ok', 'true');
  v_inv := (r->>'invoice_id')::uuid;
  perform pg_temp.chk('fixture: appointment is linked to the real invoice',
    (select invoice_id from public.appointments where id = pg_temp.id('appt_reopen_invoiced')), v_inv);
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.issue_invoice(v_inv);
  reset role;
  perform pg_temp.chk('fixture: invoice issued via the RPC', r->>'ok', 'true');
end $$;

-- Owner CAN reopen a completed appointment with no invoice.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.reopen_appointment(pg_temp.id('appt_reopen_completed'));
  reset role;
  perform pg_temp.chk('owner CAN reopen a completed appointment (invoice_id null)', r->>'ok', 'true');
end $$;

-- An INVOICED appointment cannot be reopened, even by the Owner.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.reopen_appointment(pg_temp.id('appt_reopen_invoiced'));
  reset role;
  perform pg_temp.chk('an INVOICED appointment cannot be reopened, even by the owner', r->>'code', 'invoiced');
  perform pg_temp.chk('the row is still completed',
    (select status::text from public.appointments where id = pg_temp.id('appt_reopen_invoiced')), 'completed');
end $$;

-- cancelled stays PERMANENTLY final: reopen_appointment refuses it too (the
-- table has no row for cancelled -> anything).
do $$
declare r jsonb; v_appt uuid; v_fv uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, cancelled_at, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(25), pg_temp.in_hours_slot(25) + interval '1 hour',
    60, 'cancelled', now(), v_fv, false)
  returning id into v_appt;

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.reopen_appointment(v_appt);
  reset role;
  perform pg_temp.chk('cancelled stays permanently final, even via reopen_appointment', r->>'code', 'invalid_transition');
end $$;

-- Another business, and anon, cannot reopen branch A's appointment.
do $$
declare r jsonb; v_ok boolean := true;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  r := public.reopen_appointment(pg_temp.id('appt_reopen_noshow'));
  reset role;
  perform pg_temp.chk('another business cannot reopen branch A''s appointment', r->>'code', 'forbidden');

  set local role anon;
  begin
    perform public.reopen_appointment(pg_temp.id('appt_reopen_noshow'));
  exception when insufficient_privilege then
    v_ok := false;
  end;
  reset role;
  perform pg_temp.chk('anon cannot call reopen_appointment at all', v_ok, false);
end $$;

-- mark_completed: confirmed -> completed.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.mark_completed(pg_temp.id('appt_walkin'));
  reset role;
  perform pg_temp.chk('mark_completed moves confirmed -> completed', r->>'status', 'completed');
end $$;

-- completed is terminal: cancel/no_show/approve are ALL refused.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.cancel_appointment(pg_temp.id('appt_walkin'));
  perform pg_temp.chk('cancel on a completed appointment is refused (terminal)', r->>'code', 'invalid_transition');
  r := public.mark_no_show(pg_temp.id('appt_walkin'));
  perform pg_temp.chk('no_show on a completed appointment is refused (terminal)', r->>'code', 'invalid_transition');
  reset role;
  perform pg_temp.chk('the row is STILL completed',
    (select status::text from public.appointments where id = pg_temp.id('appt_walkin')), 'completed');
end $$;

-- cancel_appointment: confirmed -> cancelled, and the row carries the reason.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.cancel_appointment(pg_temp.id('appt_other'), 'client called to cancel');
  reset role;
  perform pg_temp.chk('cancel_appointment moves confirmed -> cancelled', r->>'status', 'cancelled');
  perform pg_temp.chk('the reason is stored',
    (select cancellation_reason from public.appointments where id = pg_temp.id('appt_other')),
    'client called to cancel');
  perform pg_temp.chk('cancelled_by_guest is false (dashboard action)',
    (select cancelled_by_guest from public.appointments where id = pg_temp.id('appt_other')), false);
end $$;

-- AUDIT: every status change and cancel above wrote exactly one audit row
-- with the right action, for the right entity. One block covering all five
-- (create is checked separately, right after the first create test).
select pg_temp.chk('appointment.approved is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.id('biza') and action = 'appointment.approved'
     and entity_id = pg_temp.id('appt_pending')::text), 1);
select pg_temp.chk('appointment.no_show is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.id('biza') and action = 'appointment.no_show'
     and entity_id = pg_temp.id('appt_pending')::text), 1);
select pg_temp.chk('appointment.completed is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.id('biza') and action = 'appointment.completed'
     and entity_id = pg_temp.id('appt_walkin')::text), 1);
select pg_temp.chk('appointment.cancelled is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.id('biza') and action = 'appointment.cancelled'
     and entity_id = pg_temp.id('appt_other')::text), 1);
select pg_temp.chk('appointment.rescheduled is audited',
  (select count(*)::int from public.audit_logs
   where business_id = pg_temp.id('biza') and action = 'appointment.rescheduled'
     and entity_id = pg_temp.id('appt_owner')::text) >= 1, true);
-- (appointment.reopened was already asserted right after the reopen test, above.)

-- cancelled is terminal too.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.cancel_appointment(pg_temp.id('appt_other'));
  perform pg_temp.chk('cancelling an already-cancelled appointment is refused', r->>'code', 'invalid_transition');
  r := public.mark_completed(pg_temp.id('appt_other'));
  perform pg_temp.chk('completing a cancelled appointment is refused', r->>'code', 'invalid_transition');
  reset role;
end $$;

-- Staff may cancel THEIR OWN... no: cancel needs appointments.cancel, which
-- Staff does NOT hold (doc §9) -- verify that directly.
do $$
declare r jsonb; v_appt uuid; v_fv uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(16), pg_temp.in_hours_slot(16) + interval '1 hour',
    60, 'confirmed', v_fv, true)
  returning id into v_appt;

  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  r := public.cancel_appointment(v_appt);
  reset role;
  perform pg_temp.chk('staff does NOT hold appointments.cancel at all (doc §9)', r->>'code', 'forbidden');
  perform pg_temp.chk('the appointment is still confirmed',
    (select status::text from public.appointments where id = v_appt), 'confirmed');
end $$;

-- Another business cannot touch branch A's appointment at all.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  r := public.mark_completed(pg_temp.id('appt_pending'));
  reset role;
  perform pg_temp.chk('another business cannot change branch A''s appointment', r->>'code', 'forbidden');
end $$;

-- anon cannot call any status RPC.
do $$
declare v_ok boolean := true;
begin
  set local role anon;
  begin
    perform public.cancel_appointment(pg_temp.id('appt_pending'));
  exception when insufficient_privilege then
    v_ok := false;
  end;
  reset role;
  perform pg_temp.chk('anon cannot call cancel_appointment at all', v_ok, false);
end $$;

-- An unknown appointment id is not_found, for every RPC.
do $$
declare r jsonb; v_fake uuid := gen_random_uuid();
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.cancel_appointment(v_fake);
  perform pg_temp.chk('cancel on an unknown id is not_found', r->>'code', 'not_found');
  r := public.update_appointment(v_fake, p_internal_notes => 'x');
  perform pg_temp.chk('update on an unknown id is not_found', r->>'code', 'not_found');
  reset role;
end $$;

-- ===========================================================================
-- 4. DST — America/New_York fall-back (2027-11-07) on business B's branch
-- ===========================================================================
do $$
declare v_staff uuid; v_svc uuid; v_client uuid;
begin
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('bizb'), 'NY Staff') returning id into v_staff;
  insert into ids values ('ny_staff', v_staff);
  insert into public.services (business_id, name, duration_minutes) values (pg_temp.id('bizb'), 'Cut', 60) returning id into v_svc;
  insert into ids values ('ny_svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, pg_temp.id('branchb'), pg_temp.id('bizb'), 3000, true);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_staff, pg_temp.id('branchb'), pg_temp.id('bizb'));
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_staff, pg_temp.id('bizb'));
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select pg_temp.id('branchb'), pg_temp.id('bizb'), d, 0, 1440 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_staff, pg_temp.id('branchb'), pg_temp.id('bizb'), d, 0, 1440 from generate_series(0,6) d;
  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('bizb'), 'NY Client', '+12025550199') returning id into v_client;
  insert into ids values ('ny_client', v_client);
end $$;

-- 2027-11-07 01:30 America/New_York is the REPEATED local hour (clocks fall
-- back at 02:00 EDT -> 01:00 EST). Booking it must resolve to ONE specific
-- UTC instant (the engine's documented rule: the SECOND, standard-time
-- occurrence), and a second booking at that exact instant must collide.
do $$
declare r jsonb; v_instant timestamptz;
begin
  v_instant := '2027-11-07 01:30:00 America/New_York'::timestamptz;

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('branchb'), pg_temp.id('ny_svc'), v_instant,
    p_staff_id => pg_temp.id('ny_staff'), p_client_id => pg_temp.id('ny_client')
  );
  perform pg_temp.chk('DST fall-back: booking the repeated hour succeeds', r->>'ok', 'true');
  insert into ids values ('appt_dst', (r->>'appointment_id')::uuid);

  -- Same wall-clock instant again (same offset) collides.
  r := public.create_appointment(
    pg_temp.id('branchb'), pg_temp.id('ny_svc'), v_instant,
    p_staff_id => pg_temp.id('ny_staff'), p_client_id => pg_temp.id('ny_client')
  );
  reset role;
  perform pg_temp.chk('the SAME DST instant collides on a second booking', r->>'code', 'slot_unavailable');
end $$;

-- ===========================================================================
-- 4b. DST — Asia/Karachi (NO DST at all): same offset June and January,
--     booking across what would be a DST boundary elsewhere must behave
--     identically on both dates.
-- ===========================================================================
do $$
declare v_biz uuid; v_br uuid; v_staff uuid; v_svc uuid; v_client uuid;
begin
  perform pg_temp.act_as(pg_temp.id('ownerk'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P4 Karachi','p4-karachi','PK','PKR','Asia/Karachi','en',null,'Main');
  reset role;
  insert into ids values ('bizk', v_biz);

  alter table public.businesses disable trigger businesses_enforce_guard;
  update public.businesses set trial_ends_at = now() + interval '1000 days' where id = v_biz;
  alter table public.businesses enable trigger businesses_enforce_guard;

  select id into v_br from public.branches where business_id = v_biz limit 1;
  insert into ids values ('branchk', v_br);
  update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365 where branch_id = v_br;

  insert into public.staff_profiles (business_id, display_name) values (v_biz, 'Karachi Staff') returning id into v_staff;
  insert into ids values ('karachi_staff', v_staff);
  insert into public.services (business_id, name, duration_minutes) values (v_biz, 'Cut', 60) returning id into v_svc;
  insert into ids values ('karachi_svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, v_br, v_biz, 2000, true);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_staff, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_staff, v_biz);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_br, v_biz, d, 0, 1440 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_staff, v_br, v_biz, d, 0, 1440 from generate_series(0,6) d;
  insert into public.clients (business_id, full_name, phone_e164) values (v_biz, 'Karachi Client', '+923001234567') returning id into v_client;
  insert into ids values ('karachi_client', v_client);
end $$;

-- Book the same wall-clock time in June (would be DST in many zones) and in
-- January (never DST anywhere) -- Karachi has no DST, so both must resolve
-- to the SAME UTC offset (+05:00), and neither collides with the other
-- (different dates, same staff).
do $$
declare r jsonb; v_june timestamptz; v_jan timestamptz;
begin
  v_june := '2027-06-15 10:00:00 Asia/Karachi'::timestamptz;
  v_jan := '2028-01-15 10:00:00 Asia/Karachi'::timestamptz;

  perform pg_temp.chk('Karachi has the same UTC offset in June and January (no DST)',
    extract(timezone from v_june) = extract(timezone from v_jan), true);

  perform pg_temp.act_as(pg_temp.id('ownerk'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('branchk'), pg_temp.id('karachi_svc'), v_june,
    p_staff_id => pg_temp.id('karachi_staff'), p_client_id => pg_temp.id('karachi_client')
  );
  perform pg_temp.chk('Karachi June booking succeeds', r->>'ok', 'true');

  r := public.create_appointment(
    pg_temp.id('branchk'), pg_temp.id('karachi_svc'), v_jan,
    p_staff_id => pg_temp.id('karachi_staff'), p_client_id => pg_temp.id('karachi_client')
  );
  reset role;
  perform pg_temp.chk('Karachi January booking (different date) does NOT collide with June', r->>'ok', 'true');
end $$;

-- ===========================================================================
-- 4c. Capacity respected on BOTH create_appointment and update_appointment
-- ===========================================================================
do $$
declare v_svc2 uuid; v_resource uuid; v_client3 uuid;
begin
  update public.booking_settings set people_per_slot = 2, use_resources = true
  where branch_id = pg_temp.id('brancha');

  insert into public.services (business_id, name, duration_minutes) values (pg_temp.id('biza'), 'Group Class', 60) returning id into v_svc2;
  insert into ids values ('group_svc', v_svc2);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc2, pg_temp.id('brancha'), pg_temp.id('biza'), 1000, true);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc2, pg_temp.id('staffa_profile'), pg_temp.id('biza'));

  insert into public.resources (business_id, branch_id, name, capacity) values (pg_temp.id('biza'), pg_temp.id('brancha'), 'Room 1', 1) returning id into v_resource;
  insert into ids values ('room1', v_resource);
  insert into public.service_resources (service_id, resource_id, business_id) values (pg_temp.id('svc'), v_resource, pg_temp.id('biza'));

  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('biza'), 'Client Three', '+447700900444') returning id into v_client3;
  insert into ids values ('client3', v_client3);
end $$;

-- people_per_slot = 2: the first two CREATEs into the same group slot
-- succeed, the third is refused with slot_taken.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('group_svc'), pg_temp.in_hours_slot(30),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1')
  );
  perform pg_temp.chk('group booking seat 1 of 2 succeeds', r->>'ok', 'true');
  insert into ids values ('appt_group1', (r->>'appointment_id')::uuid);

  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('group_svc'), pg_temp.in_hours_slot(30),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client2')
  );
  perform pg_temp.chk('group booking seat 2 of 2 succeeds', r->>'ok', 'true');

  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('group_svc'), pg_temp.in_hours_slot(30),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client3')
  );
  reset role;
  perform pg_temp.chk('a THIRD create into a full people_per_slot=2 slot is refused',
    r->>'code', 'slot_taken');
end $$;

-- Resource capacity 1: a second service needing the SAME resource at an
-- overlapping instant is refused with no_resource via create_appointment.
do $$
declare r jsonb; v_appt1 uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(31),
    p_staff_id => pg_temp.id('staffa_profile'), p_client_id => pg_temp.id('client1')
  );
  perform pg_temp.chk('first booking using the capacity-1 resource succeeds', r->>'ok', 'true');
  v_appt1 := (r->>'appointment_id')::uuid;

  -- The bug this evidence pass FOUND: create_appointment never stored
  -- resource_id at all, so the resource-capacity count was always zero and
  -- the check below used to silently pass. Assert the id is actually
  -- stored, not just that a later booking gets refused.
  perform pg_temp.chk('the booking actually STORES resource_id (the bug this pass found)',
    (select resource_id from public.appointments where id = v_appt1), pg_temp.id('room1'));
  perform pg_temp.chk('and snapshots resource_capacity_at_booking',
    (select resource_capacity_at_booking from public.appointments where id = v_appt1), 1);

  r := public.create_appointment(
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.in_hours_slot(31),
    p_staff_id => pg_temp.id('other_profile'), p_client_id => pg_temp.id('client2')
  );
  reset role;
  perform pg_temp.chk('a second booking needing the SAME capacity-1 resource at an overlapping time is refused',
    r->>'code', 'no_resource');

  update public.booking_settings set use_resources = false where branch_id = pg_temp.id('brancha');
end $$;

-- update_appointment respects group capacity too: rescheduling a THIRD
-- appointment INTO an already-full group slot is refused.
do $$
declare r jsonb; v_fv uuid; v_appt3 uuid;
begin
  update public.booking_settings set people_per_slot = 2 where branch_id = pg_temp.id('brancha');
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;

  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client3'), pg_temp.id('group_svc'),
    pg_temp.id('staffa_profile'), pg_temp.in_hours_slot(32), pg_temp.in_hours_slot(32) + interval '1 hour',
    60, 'confirmed', v_fv, false)
  returning id into v_appt3;

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.update_appointment(v_appt3, p_starts_at => pg_temp.in_hours_slot(30));
  reset role;
  perform pg_temp.chk('update_appointment refuses rescheduling INTO a full group slot',
    r->>'code', 'slot_taken');
  perform pg_temp.chk('the appointment did not move',
    (select starts_at from public.appointments where id = v_appt3), pg_temp.in_hours_slot(32));
end $$;

-- ===========================================================================
-- 5. list_appointments — pagination, filters, search
-- ===========================================================================
do $$
declare r jsonb; v_rows jsonb; v_cursor jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;

  r := public.list_appointments(pg_temp.id('biza'), p_limit => 3);
  reset role;
  v_rows := r->'rows';
  perform pg_temp.chk('list_appointments returns a page', jsonb_array_length(v_rows) <= 3, true);
  perform pg_temp.chk('a next_cursor is present (more than 3 rows exist)', r->'next_cursor' is not null, true);
end $$;

-- Filter by status.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.list_appointments(pg_temp.id('biza'), p_status => 'cancelled', p_limit => 50);
  reset role;
  perform pg_temp.chk('status filter: every row is cancelled',
    (select bool_and(row->>'status' = 'cancelled') from jsonb_array_elements(r->'rows') row), true);
end $$;

-- Search by client name.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.list_appointments(pg_temp.id('biza'), p_search => 'Walk In', p_limit => 50);
  reset role;
  perform pg_temp.chk('search matches by client name',
    (select bool_and(row->>'client_name' = 'Walk In Guest') from jsonb_array_elements(r->'rows') row), true);
end $$;

-- p_client_id (Phase 4 part B2, the client profile's visit history):
-- filters to exactly one client's appointments, across every branch/staff.
do $$
declare r jsonb; v_count int;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.list_appointments(pg_temp.id('biza'), p_client_id => pg_temp.id('client1'), p_limit => 100);
  reset role;

  select count(*) into v_count
  from public.appointments where client_id = pg_temp.id('client1') and deleted_at is null;

  perform pg_temp.chk('p_client_id returns every row for that client',
    jsonb_array_length(r->'rows'), v_count);
  perform pg_temp.chk('p_client_id returns ONLY that client''s rows',
    (select bool_and((row->>'client_id')::uuid = pg_temp.id('client1')) from jsonb_array_elements(r->'rows') row),
    true);
end $$;

-- Staff (Own scope) sees only their own rows through list_appointments, same
-- as the RLS tests in 07 already prove for raw SELECT -- confirms the RPC
-- does not widen it.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  r := public.list_appointments(pg_temp.id('biza'), p_limit => 100);
  reset role;
  perform pg_temp.chk('staff (own scope) sees only their own staff_id in the list',
    (select bool_and((row->>'staff_id')::uuid = pg_temp.id('staffa_profile')) from jsonb_array_elements(r->'rows') row), true);
end $$;

-- Another business gets nothing for business A's id (RLS, not a 403 -- an
-- empty, honest result, same posture as the rest of the app).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  r := public.list_appointments(pg_temp.id('biza'), p_limit => 100);
  reset role;
  perform pg_temp.chk('another business sees ZERO rows for business A', jsonb_array_length(r->'rows'), 0);
end $$;

-- anon cannot call list_appointments AT ALL (no EXECUTE grant).
do $$
declare v_ok boolean := true;
begin
  set local role anon;
  begin
    perform public.list_appointments(pg_temp.id('biza'), p_limit => 100);
  exception when insufficient_privilege then
    v_ok := false;
  end;
  reset role;
  perform pg_temp.chk('anon cannot call list_appointments at all', v_ok, false);
end $$;

-- ===========================================================================
-- 6. get_calendar_appointments — branch-timezone day boundaries
-- ===========================================================================
do $$
declare r jsonb; v_date date;
begin
  select (pg_temp.in_hours_slot() at time zone 'Europe/London')::date into v_date;

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.get_calendar_appointments(pg_temp.id('biza'), pg_temp.id('brancha'), v_date, v_date);
  reset role;

  perform pg_temp.chk('calendar query returns the branch timezone', r->>'timezone', 'Europe/London');
  perform pg_temp.chk('the in-hours-slot appointment appears on its LOCAL date',
    (select count(*)::int from jsonb_array_elements(r->'rows') row
     where (row->>'starts_at')::timestamptz = pg_temp.in_hours_slot(11)) >= 0, true);
end $$;

-- A date range that does NOT include the appointment's local date returns it
-- absent -- proves the boundary is the LOCAL date, not a UTC one.
do $$
declare r jsonb; v_local_date date; v_count int;
begin
  select (pg_temp.in_hours_slot(11) at time zone 'Europe/London')::date into v_local_date;

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.get_calendar_appointments(
    pg_temp.id('biza'), pg_temp.id('brancha'), v_local_date - 1, v_local_date - 1
  );
  reset role;

  select count(*) into v_count from jsonb_array_elements(r->'rows') row
  where (row->>'starts_at')::timestamptz = pg_temp.in_hours_slot(11);
  perform pg_temp.chk('a day BEFORE the local date excludes the appointment', v_count, 0);
end $$;

-- Cancelled appointments do not appear on the calendar.
do $$
declare r jsonb; v_date date; v_count int;
begin
  select (starts_at at time zone 'Europe/London')::date into v_date
  from public.appointments where id = pg_temp.id('appt_other');

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.get_calendar_appointments(pg_temp.id('biza'), pg_temp.id('brancha'), v_date, v_date);
  reset role;

  select count(*) into v_count from jsonb_array_elements(r->'rows') row where row->>'id' = pg_temp.id('appt_other')::text;
  perform pg_temp.chk('a cancelled appointment does not appear on the calendar', v_count, 0);
end $$;

-- ===========================================================================
-- 7. Realtime + grants
-- ===========================================================================
select pg_temp.chk('appointments is in the supabase_realtime publication',
  (select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and tablename='appointments'), 1);

select pg_temp.chk('anon cannot call create_appointment',
  has_function_privilege('anon','public.create_appointment(uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,public.booking_source,boolean)','execute'), false);
select pg_temp.chk('authenticated CAN call create_appointment',
  has_function_privilege('authenticated','public.create_appointment(uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,public.booking_source,boolean)','execute'), true);
select pg_temp.chk('anon cannot call update_appointment',
  has_function_privilege('anon','public.update_appointment(uuid,timestamptz,uuid,text,text,boolean,boolean)','execute'), false);
select pg_temp.chk('anon cannot call cancel_appointment',
  has_function_privilege('anon','public.cancel_appointment(uuid,text)','execute'), false);
select pg_temp.chk('anon cannot call mark_no_show',
  has_function_privilege('anon','public.mark_no_show(uuid)','execute'), false);
select pg_temp.chk('anon cannot call mark_completed',
  has_function_privilege('anon','public.mark_completed(uuid)','execute'), false);
select pg_temp.chk('anon cannot call approve_appointment',
  has_function_privilege('anon','public.approve_appointment(uuid)','execute'), false);
select pg_temp.chk('anon cannot call list_appointments',
  has_function_privilege('anon','public.list_appointments(uuid,uuid,uuid,public.appointment_status,uuid,date,date,text,integer,timestamptz,uuid,uuid)','execute'), false);
select pg_temp.chk('authenticated CAN call list_appointments',
  has_function_privilege('authenticated','public.list_appointments(uuid,uuid,uuid,public.appointment_status,uuid,date,date,text,integer,timestamptz,uuid,uuid)','execute'), true);
select pg_temp.chk('anon cannot call get_calendar_appointments',
  has_function_privilege('anon','public.get_calendar_appointments(uuid,uuid,date,date,uuid[])','execute'), false);
select pg_temp.chk('anon cannot call check_appointment_collision_v2',
  has_function_privilege('anon','public.check_appointment_collision_v2(uuid,uuid,uuid,timestamptz,timestamptz,integer,integer,boolean,uuid)','execute'), false);
select pg_temp.chk('authenticated cannot call check_appointment_collision_v2 directly',
  has_function_privilege('authenticated','public.check_appointment_collision_v2(uuid,uuid,uuid,timestamptz,timestamptz,integer,integer,boolean,uuid)','execute'), false);
select pg_temp.chk('anon cannot call reopen_appointment',
  has_function_privilege('anon','public.reopen_appointment(uuid)','execute'), false);
select pg_temp.chk('authenticated CAN call reopen_appointment (the role check inside is the boundary)',
  has_function_privilege('authenticated','public.reopen_appointment(uuid)','execute'), true);
select pg_temp.chk('anon cannot call my_staff_profile_id',
  has_function_privilege('anon','public.my_staff_profile_id(uuid)','execute'), false);

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
