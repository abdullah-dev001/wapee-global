-- Phase 3: RLS per role for the booking tables.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/07_booking_rls_per_role.sql
--
-- Plain SQL, not pgTAP (Docker is not installed; see context/_handoff.md). It
-- creates real auth.users rows, two businesses via create_business_with_owner,
-- and a manager / receptionist / staff member, then asserts what each role can
-- see and change. Everything ROLLS BACK.
--
-- Last run: 2026-10-03 against the live dev project. 54/54 passing.
--
-- Roles covered: owner, manager, receptionist, staff (Own scope), another
-- business, and anon (which must be refused outright on all 8 tables).
-- Also: the sensitive-answer gate, soft-delete-only appointments, form
-- versions being unwritable even by the owner, manage tokens being RPC-only,
-- and an expired trial hiding operational data while leaving settings reachable.

-- Phase 3 RLS: owner / manager / receptionist / staff / other business / anon.
-- Rolled back at the end.
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
-- Become a user.
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end; $$;

-- The assertions run as `authenticated` / `anon`, and those roles need to read
-- the temp fixture tables and call the temp helpers. `pg_temp` is an alias that
-- GRANT does not accept, so the real schema name is resolved first.
do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace
  where oid = pg_my_temp_schema();
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
      ('owner'), ('manager'), ('recep'), ('staffa'), ('ownerb')
    ) as x(k)
  loop
    v_email := 'p3.' || r.k || '@example.com';
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Two businesses, created the real way (so roles and settings are real)
-- ---------------------------------------------------------------------------
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P3 A','p3-a','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biza', v_biz);

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P3 B','p3-b','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
end $$;

insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') limit 1;

-- Give both businesses a long trial so business_is_active() is true.
-- `enforce_business_guard` refuses tenant-side changes to plan/status/trial
-- (Phase 1, by design), so it is disabled for this transaction only.
alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days'
where id in (pg_temp.id('biza'), pg_temp.id('bizb'));

-- Add manager, receptionist and staff to business A.
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
    -- `enforce_role_assignment_guard` refuses granting a permission the actor
    -- does not hold, and this block otherwise runs as `postgres` (no grants).
    -- Act as the Owner, who holds everything.
    perform pg_temp.act_as(pg_temp.id('owner'));
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member,
            (select id from public.roles where business_id is null and key = r.role_key),
            pg_temp.id('brancha'));
  end loop;
end $$;

-- A staff PROFILE linked to the staff user, so Own scope has something to match.
do $$
declare v_staff uuid; v_other uuid; v_svc uuid; v_client uuid; v_fv uuid;
begin
  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biza'), pg_temp.id('member_staffa'), 'Staff A') returning id into v_staff;
  insert into ids values ('staffprofile', v_staff);

  -- A second staff profile with no login, to be "someone else's" appointments.
  insert into public.staff_profiles (business_id, display_name)
  values (pg_temp.id('biza'), 'Other Person') returning id into v_other;
  insert into ids values ('otherprofile', v_other);

  insert into public.services (business_id, name, duration_minutes)
  values (pg_temp.id('biza'), 'Cut', 60) returning id into v_svc;
  insert into ids values ('svc', v_svc);

  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Client One', '+447700900111') returning id into v_client;
  insert into ids values ('client1', v_client);
  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Client Two', '+447700900222') returning id into v_client;
  insert into ids values ('client2', v_client);

  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into ids values ('fv', v_fv);

  -- One appointment for the staff user, one for someone else.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client1'), v_svc, v_staff,
    now() + interval '2 days', now() + interval '2 days 1 hour', 60, 'confirmed', v_fv, true);
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('client2'), v_svc, v_other,
    now() + interval '3 days', now() + interval '3 days 1 hour', 60, 'confirmed', v_fv, true);
end $$;

-- ---------------------------------------------------------------------------
-- booking_settings
-- ---------------------------------------------------------------------------
-- Owner: reads and writes.
do $$
declare v int;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select count(*) into v from public.booking_settings where business_id = pg_temp.id('biza');
  perform pg_temp.chk('owner reads booking_settings', v, 1);
  update public.booking_settings set booking_window_days = 45 where branch_id = pg_temp.id('brancha');
  select booking_window_days into v from public.booking_settings where branch_id = pg_temp.id('brancha');
  perform pg_temp.chk('owner writes booking_settings', v, 45);
  reset role;
end $$;

-- Manager: has settings.booking (doc §9), so reads AND writes.
do $$
declare v int;
begin
  perform pg_temp.act_as(pg_temp.id('manager'));
  set local role authenticated;
  select count(*) into v from public.booking_settings where business_id = pg_temp.id('biza');
  perform pg_temp.chk('manager reads booking_settings', v, 1);
  update public.booking_settings set booking_window_days = 60 where branch_id = pg_temp.id('brancha');
  select booking_window_days into v from public.booking_settings where branch_id = pg_temp.id('brancha');
  perform pg_temp.chk('manager writes booking_settings (doc §9 grants it)', v, 60);
  reset role;
end $$;

-- Receptionist: reads (the calendar needs it) but CANNOT write.
do $$
declare v int; v_rows int;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  select count(*) into v from public.booking_settings where business_id = pg_temp.id('biza');
  perform pg_temp.chk('receptionist reads booking_settings', v, 1);
  update public.booking_settings set booking_window_days = 99 where branch_id = pg_temp.id('brancha');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('receptionist CANNOT write booking_settings', v_rows, 0);
  reset role;
end $$;

-- Staff: reads, cannot write.
do $$
declare v int; v_rows int;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  select count(*) into v from public.booking_settings where business_id = pg_temp.id('biza');
  perform pg_temp.chk('staff reads booking_settings', v, 1);
  update public.booking_settings set booking_window_days = 99 where branch_id = pg_temp.id('brancha');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('staff CANNOT write booking_settings', v_rows, 0);
  reset role;
end $$;

-- Other business: sees nothing, writes nothing.
do $$
declare v int; v_rows int;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  select count(*) into v from public.booking_settings where business_id = pg_temp.id('biza');
  perform pg_temp.chk('other business sees NO booking_settings of A', v, 0);
  update public.booking_settings set booking_window_days = 99 where branch_id = pg_temp.id('brancha');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('other business CANNOT write A''s booking_settings', v_rows, 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- custom_fields
-- ---------------------------------------------------------------------------
do $$
declare v_rows int; v_err text;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  insert into public.custom_fields (business_id, label, field_type)
  values (pg_temp.id('biza'), 'Allergies', 'long_text');
  perform pg_temp.chk('owner creates a custom field',
    (select count(*)::int from public.custom_fields where business_id = pg_temp.id('biza')), 1);
  reset role;

  -- Manager too (settings.booking).
  perform pg_temp.act_as(pg_temp.id('manager'));
  set local role authenticated;
  insert into public.custom_fields (business_id, label, field_type)
  values (pg_temp.id('biza'), 'Referred by', 'short_text');
  perform pg_temp.chk('manager creates a custom field',
    (select count(*)::int from public.custom_fields where business_id = pg_temp.id('biza')), 2);
  reset role;

  -- Receptionist cannot.
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  v_err := 'no error';
  begin
    insert into public.custom_fields (business_id, label, field_type)
    values (pg_temp.id('biza'), 'Sneaky', 'short_text');
    v_err := 'INSERT SUCCEEDED';
  exception when insufficient_privilege then v_err := 'refused'; end;
  perform pg_temp.chk('receptionist CANNOT create a custom field', v_err, 'refused');
  -- but can read the form
  perform pg_temp.chk('receptionist reads custom fields',
    (select count(*)::int from public.custom_fields where business_id = pg_temp.id('biza')), 2);
  reset role;

  -- Other business sees none.
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  perform pg_temp.chk('other business sees NO custom fields of A',
    (select count(*)::int from public.custom_fields where business_id = pg_temp.id('biza')), 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- form_versions: readable, never writable by anyone
-- ---------------------------------------------------------------------------
do $$
declare v_err text;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  perform pg_temp.chk('owner reads form versions',
    (select count(*)::int > 0 from public.form_versions where business_id = pg_temp.id('biza')), true);
  v_err := 'no error';
  begin
    insert into public.form_versions (business_id, version, fields, fields_hash)
    values (pg_temp.id('biza'), 999, '[]'::jsonb, 'deadbeef');
    v_err := 'INSERT SUCCEEDED';
  exception when insufficient_privilege then v_err := 'refused'; end;
  perform pg_temp.chk('even the OWNER cannot insert a form version', v_err, 'refused');
  reset role;

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  perform pg_temp.chk('other business sees NO form versions of A',
    (select count(*)::int from public.form_versions where business_id = pg_temp.id('biza')), 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
do $$
declare v int; v_rows int; v_err text;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select count(*) into v from public.clients where business_id = pg_temp.id('biza');
  perform pg_temp.chk('owner sees all clients', v, 2);
  reset role;

  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  select count(*) into v from public.clients where business_id = pg_temp.id('biza');
  perform pg_temp.chk('receptionist sees all clients (branch scope)', v, 2);
  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Walk In', '+447700900333');
  perform pg_temp.chk('receptionist can create a client',
    (select count(*)::int from public.clients where business_id = pg_temp.id('biza')), 3);
  reset role;

  -- Staff hold clients.view at OWN scope: only clients they have an
  -- appointment with. client1 is theirs, client2 and the walk-in are not.
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  select count(*) into v from public.clients where business_id = pg_temp.id('biza');
  perform pg_temp.chk('staff sees ONLY their own clients (own scope)', v, 1);
  perform pg_temp.chk('and it is the right one',
    (select full_name from public.clients where business_id = pg_temp.id('biza')), 'Client One');
  reset role;

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  select count(*) into v from public.clients where business_id = pg_temp.id('biza');
  perform pg_temp.chk('other business sees NO clients of A', v, 0);
  update public.clients set full_name = 'Hacked' where business_id = pg_temp.id('biza');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('other business cannot update A''s clients', v_rows, 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- appointments: Own scope is the interesting one
-- ---------------------------------------------------------------------------
do $$
declare v int; v_rows int;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select count(*) into v from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('owner sees both appointments', v, 2);
  reset role;

  perform pg_temp.act_as(pg_temp.id('manager'));
  set local role authenticated;
  select count(*) into v from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('manager sees both appointments', v, 2);
  reset role;

  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  select count(*) into v from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('receptionist sees both appointments', v, 2);
  reset role;

  -- The point: Staff sees only their own.
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  select count(*) into v from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('staff sees ONLY their own appointment (own scope)', v, 1);
  perform pg_temp.chk('and it is the one assigned to them',
    (select staff_id from public.appointments where business_id = pg_temp.id('biza')),
    pg_temp.id('staffprofile'));
  -- and cannot edit someone else's
  update public.appointments set internal_notes = 'mine now'
  where staff_id = pg_temp.id('otherprofile');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('staff cannot edit another person''s appointment', v_rows, 0);
  -- but can edit their own
  update public.appointments set internal_notes = 'running late'
  where staff_id = pg_temp.id('staffprofile');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('staff CAN edit their own appointment', v_rows, 1);
  reset role;

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  select count(*) into v from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('other business sees NO appointments of A', v, 0);
  update public.appointments set status = 'cancelled', cancelled_at = now()
  where business_id = pg_temp.id('biza');
  get diagnostics v_rows = row_count;
  perform pg_temp.chk('other business cannot cancel A''s appointments', v_rows, 0);
  reset role;
end $$;

-- Nobody can hard-delete an appointment (no DELETE policy).
do $$
declare v_rows int;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  begin
    delete from public.appointments where business_id = pg_temp.id('biza');
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then
    v_rows := 0;   -- since 2026-10-09 the privilege itself is revoked (no DELETE policy exists)
  end;
  perform pg_temp.chk('even the owner cannot DELETE an appointment (soft delete only)', v_rows, 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- appointment_field_values: the sensitive gate
-- ---------------------------------------------------------------------------
do $$
declare v_field uuid; v_appt uuid; v int;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select id into v_field from public.custom_fields
  where business_id = pg_temp.id('biza') and label = 'Allergies';
  select id into v_appt from public.appointments
  where business_id = pg_temp.id('biza') and staff_id = pg_temp.id('otherprofile');
  -- One ordinary answer and one sensitive answer, on an appointment that is
  -- NOT the staff user's.
  insert into public.appointment_field_values
    (business_id, appointment_id, custom_field_id, form_version_id, value, is_sensitive)
  values (pg_temp.id('biza'), v_appt, v_field,
    (select id from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1),
    'penicillin', true);
  reset role;
  insert into ids values ('sensfield', v_field);
  insert into ids values ('sensappt', v_appt);

  -- Owner holds clients.view_sensitive: sees it.
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select count(*) into v from public.appointment_field_values where business_id = pg_temp.id('biza');
  perform pg_temp.chk('owner sees a sensitive answer (holds clients.view_sensitive)', v, 1);
  reset role;

  -- Receptionist does NOT hold clients.view_sensitive (doc §9): must not see it.
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  select count(*) into v from public.appointment_field_values where business_id = pg_temp.id('biza');
  perform pg_temp.chk('receptionist CANNOT see a sensitive answer', v, 0);
  reset role;

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  select count(*) into v from public.appointment_field_values where business_id = pg_temp.id('biza');
  perform pg_temp.chk('other business sees NO answers of A', v, 0);
  reset role;
end $$;

-- Add a NON-sensitive answer and confirm the receptionist sees that one.
do $$
declare v_field uuid; v int;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select id into v_field from public.custom_fields
  where business_id = pg_temp.id('biza') and label = 'Referred by';
  insert into public.appointment_field_values
    (business_id, appointment_id, custom_field_id, form_version_id, value, is_sensitive)
  values (pg_temp.id('biza'), pg_temp.id('sensappt'), v_field,
    (select id from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1),
    'Instagram', false);
  reset role;

  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  select count(*) into v from public.appointment_field_values where business_id = pg_temp.id('biza');
  perform pg_temp.chk('receptionist sees the NON-sensitive answer only', v, 1);
  perform pg_temp.chk('and it is the right one',
    (select value from public.appointment_field_values where business_id = pg_temp.id('biza')), 'Instagram');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- booking_manage_tokens: readable with appointments.view, never writable
-- ---------------------------------------------------------------------------
do $$
declare v_err text;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_err := 'no error';
  begin
    insert into public.booking_manage_tokens (business_id, appointment_id, token_hash, expires_at)
    values (pg_temp.id('biza'), pg_temp.id('sensappt'), repeat('a', 64), now() + interval '1 day');
    v_err := 'INSERT SUCCEEDED';
  exception when insufficient_privilege then v_err := 'refused'; end;
  perform pg_temp.chk('nobody can insert a manage token directly (RPC only)', v_err, 'refused');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- anon: absolutely nothing
-- ---------------------------------------------------------------------------
do $$
declare v_err text; r record;
begin
  perform set_config('request.jwt.claims', null, true);
  for r in select unnest(array['booking_settings','custom_fields','custom_field_services',
                               'form_versions','clients','appointments',
                               'appointment_field_values','booking_manage_tokens']) as t
  loop
    set local role anon;
    v_err := 'no error';
    begin
      execute format('select count(*) from public.%I', r.t);
      v_err := 'SELECT SUCCEEDED';
    exception when insufficient_privilege then v_err := 'refused'; end;
    reset role;
    insert into res (name, pass, detail)
    values ('anon cannot even SELECT from ' || r.t, v_err = 'refused', v_err);
  end loop;
end $$;

-- anon cannot call the slot engine.
do $$
declare v_err text := 'no error';
begin
  set local role anon;
  begin
    perform public.get_free_slots(pg_temp.id('brancha'), pg_temp.id('svc'));
    v_err := 'CALL SUCCEEDED';
  exception when insufficient_privilege then v_err := 'refused'; end;
  reset role;
  insert into res (name, pass, detail) values ('anon cannot call get_free_slots', v_err = 'refused', v_err);
end $$;

-- authenticated cannot call it either.
do $$
declare v_err text := 'no error';
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  begin
    perform public.get_free_slots(pg_temp.id('brancha'), pg_temp.id('svc'));
    v_err := 'CALL SUCCEEDED';
  exception when insufficient_privilege then v_err := 'refused'; end;
  reset role;
  insert into res (name, pass, detail)
  values ('even an OWNER cannot call get_free_slots (service_role only)', v_err = 'refused', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- An expired trial locks operational data
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  -- Guard already disabled at the top of this transaction.
  update public.businesses set status = 'trialing', trial_ends_at = now() - interval '1 day'
  where id = pg_temp.id('biza');

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  select count(*) into v from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('an expired trial hides appointments (can() gates on active)', v, 0);
  select count(*) into v from public.clients where business_id = pg_temp.id('biza');
  perform pg_temp.chk('an expired trial hides clients', v, 0);
  -- booking_settings SELECT is is_member(), not can(), so settings stay reachable.
  select count(*) into v from public.booking_settings where business_id = pg_temp.id('biza');
  perform pg_temp.chk('but booking SETTINGS stay readable on an expired trial', v, 1);
  reset role;

  update public.businesses set trial_ends_at = now() + interval '1000 days'
  where id = pg_temp.id('biza');
end $$;

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
select n, name, detail from res where not pass order by n;

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;

rollback;
