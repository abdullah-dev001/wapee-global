-- Phase 4 part B2: Clients dashboard UI.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/13_clients_dashboard.sql
--
-- Plain SQL, not pgTAP (Docker not installed; see context/_handoff.md).
-- clients_select/insert/update RLS (20261003100000_clients_and_appointments.sql)
-- is UNCHANGED this round — this suite proves the NEW dashboard code paths
-- (plain .from('clients') queries, the archive-via-deleted_at pattern, and
-- list_appointments' new p_client_id filter) actually behave as the UI
-- assumes, for every role, another business, and anon. Builds its own
-- fixtures and rolls back everything at the end.

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
-- Users, one business, every system role, two branches.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_email text; v_id uuid;
begin
  for r in select * from (values
      ('owner'), ('manager'), ('recep'), ('staffa'), ('staffb'), ('ownerb')
    ) as x(k)
  loop
    v_email := 'p4b2.' || r.k || '@example.com';
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P4B2 A','p4b2-a','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biza', v_biz);

  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('P4B2 B','p4b2-b','US','USD','America/New_York','en',null,'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
end $$;

insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') limit 1;

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days'
where id in (pg_temp.id('biza'), pg_temp.id('bizb'));
alter table public.businesses enable trigger businesses_enforce_guard;

-- A SECOND branch on business A, for the "visit history spans every branch" check.
do $$
declare v_br2 uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  insert into public.branches (business_id, name, timezone, is_primary, country_code, currency, invoice_prefix)
  values (pg_temp.id('biza'), 'Second', 'Europe/London', false, 'GB', 'GBP', 'SEC')
  returning id into v_br2;
  reset role;
  insert into ids values ('branchc', v_br2);
end $$;

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

-- Catalogue: one service, one staff profile for staffa (for the "own clients" rule).
do $$
declare v_staff uuid; v_svc uuid;
begin
  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biza'), pg_temp.id('member_staffa'), 'Staff A') returning id into v_staff;
  insert into ids values ('staffa_profile', v_staff);

  insert into public.services (business_id, name, duration_minutes)
  values (pg_temp.id('biza'), 'Cut', 60) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, pg_temp.id('brancha'), pg_temp.id('biza'), 4000, true);
  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v_staff, pg_temp.id('brancha'), pg_temp.id('biza'));
  insert into public.service_staff (service_id, staff_id, business_id)
  values (v_svc, v_staff, pg_temp.id('biza'));
end $$;

-- ===========================================================================
-- 1. clients_insert / clients_update — role gating via can()
-- ===========================================================================

-- Owner can create a client.
do $$
declare v_id uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Client One', '+447700900001')
  returning id into v_id;
  reset role;
  insert into ids values ('client1', v_id);
  perform pg_temp.chk('owner can create a client', v_id is not null, true);
end $$;

-- Staff (Own scope, no clients.create) CANNOT create a client directly.
do $$
declare v_failed boolean := false;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  begin
    insert into public.clients (business_id, full_name, phone_e164)
    values (pg_temp.id('biza'), 'Should Fail', '+447700900099');
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;
  perform pg_temp.chk('staff (own scope) cannot create a client directly (RLS)', v_failed, true);
end $$;

-- Receptionist (Branch, clients.edit) can update a client.
do $$
declare v_name text;
begin
  perform pg_temp.act_as(pg_temp.id('recep'));
  set local role authenticated;
  update public.clients set notes = 'Prefers afternoons' where id = pg_temp.id('client1');
  reset role;
  select notes into v_name from public.clients where id = pg_temp.id('client1');
  perform pg_temp.chk('receptionist can edit a client', v_name, 'Prefers afternoons');
end $$;

-- ===========================================================================
-- 2. Phone uniqueness per business — the "clear message with a link" case
-- ===========================================================================
do $$
declare v_errcode text;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  begin
    insert into public.clients (business_id, full_name, phone_e164)
    values (pg_temp.id('biza'), 'Duplicate Phone', '+447700900001');
    v_errcode := 'no_error';
  exception when unique_violation then
    v_errcode := sqlstate;
  end;
  reset role;
  perform pg_temp.chk('duplicate phone (same business) is refused with 23505', v_errcode, '23505');
end $$;

-- The SAME phone on a DIFFERENT business is fine (business-scoped uniqueness).
do $$
declare v_id uuid;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('bizb'), 'Same Phone Other Biz', '+447700900001')
  returning id into v_id;
  reset role;
  perform pg_temp.chk('the same phone on ANOTHER business is allowed', v_id is not null, true);
end $$;

-- ===========================================================================
-- 3. Archive / unarchive via deleted_at (soft delete, no new RPC)
-- ===========================================================================
do $$
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  update public.clients set deleted_at = now() where id = pg_temp.id('client1');
  reset role;
  perform pg_temp.chk('client is archived (deleted_at set)',
    (select deleted_at is not null from public.clients where id = pg_temp.id('client1')), true);
end $$;

-- An archived client is EXCLUDED by default (the UI's includeArchived=false
-- filter is just `.is('deleted_at', null)` client-side, proven here at the
-- RLS/table level: the row is still visible via clients_select, so the
-- hiding is correctly the CALLER's filter, not a new RLS rule).
select pg_temp.chk('an archived client still has clients_select visibility (RLS unchanged)',
  (select count(*)::int from public.clients
   where id = pg_temp.id('client1') and business_id = pg_temp.id('biza')), 1);

-- Unarchive.
do $$
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  update public.clients set deleted_at = null where id = pg_temp.id('client1');
  reset role;
  perform pg_temp.chk('client is restored (deleted_at cleared)',
    (select deleted_at is null from public.clients where id = pg_temp.id('client1')), true);
end $$;

-- ===========================================================================
-- 4. clients_select — Own scope sees ONLY clients they have an appointment
--    with (pre-existing RLS, unchanged — proven here against the NEW
--    dashboard query path, a plain .from('clients') select, not just the
--    original migration's own test suite).
-- ===========================================================================

-- A second client, with an appointment booked for staffa.
do $$
declare v_client2 uuid; v_fv uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Client Two (staffa''s)', '+447700900002')
  returning id into v_client2;
  reset role;
  insert into ids values ('client2', v_client2);

  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('brancha'), v_client2, pg_temp.id('svc'),
    pg_temp.id('staffa_profile'), now() + interval '1 day', now() + interval '1 day 1 hour',
    60, 'confirmed', v_fv, true);
end $$;

-- Staff (Own scope) sees client2 (has an appointment with them) but NOT
-- client1 (no appointment with staffa at all).
do $$
declare v_sees_client2 boolean; v_sees_client1 boolean;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  select exists(select 1 from public.clients where id = pg_temp.id('client2')) into v_sees_client2;
  select exists(select 1 from public.clients where id = pg_temp.id('client1')) into v_sees_client1;
  reset role;
  perform pg_temp.chk('staff (own scope) SEES a client they have an appointment with',
    v_sees_client2, true);
  perform pg_temp.chk('staff (own scope) does NOT see a client with no appointment with them',
    v_sees_client1, false);
end $$;

-- Manager (Branch scope) sees both.
do $$
declare v_count int;
begin
  perform pg_temp.act_as(pg_temp.id('manager'));
  set local role authenticated;
  select count(*) into v_count from public.clients
  where id in (pg_temp.id('client1'), pg_temp.id('client2'));
  reset role;
  perform pg_temp.chk('manager (branch scope) sees every client', v_count, 2);
end $$;

-- Another business sees neither.
do $$
declare v_count int;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  set local role authenticated;
  select count(*) into v_count from public.clients
  where id in (pg_temp.id('client1'), pg_temp.id('client2'));
  reset role;
  perform pg_temp.chk('another business sees neither client', v_count, 0);
end $$;

-- anon has NO table grant at all on clients (CLAUDE.md §6 Traps: "anon has
-- NO table privileges any more") -- not merely RLS filtering it to zero
-- rows, the query itself is refused at the GRANT level.
do $$
declare v_errcode text;
begin
  set local role anon;
  begin
    perform count(*) from public.clients where business_id = pg_temp.id('biza');
    v_errcode := 'no_error';
  exception when insufficient_privilege then
    v_errcode := sqlstate;
  end;
  reset role;
  perform pg_temp.chk('anon has no GRANT on clients at all', v_errcode, '42501');
end $$;

-- ===========================================================================
-- 5. list_appointments(p_client_id) — visit history spans EVERY branch
--    (decided with the user, 2026-10-05: "a client is business-wide").
-- ===========================================================================
do $$
declare v_fv uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  -- client2 has one appointment on brancha (above) and one on branchc.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biza'), pg_temp.id('branchc'), pg_temp.id('client2'), pg_temp.id('svc'),
    null, now() + interval '2 days', now() + interval '2 days 1 hour', 60, 'confirmed', v_fv, false);
end $$;

do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.list_appointments(pg_temp.id('biza'), p_client_id => pg_temp.id('client2'), p_limit => 100);
  reset role;
  perform pg_temp.chk('visit history includes appointments from EVERY branch',
    jsonb_array_length(r->'rows'), 2);
  perform pg_temp.chk('and only client2''s rows',
    (select bool_and((row->>'client_id')::uuid = pg_temp.id('client2')) from jsonb_array_elements(r->'rows') row),
    true);
end $$;

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
