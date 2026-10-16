-- Suite 43: booking-form answers (appointment_field_values) honour Own scope
-- and the sensitive gate, for reads AND updates.
--
-- Why this suite exists (2026-10-16): the answers policies call
-- `can(...'appointments.view'/'.edit')`, and `can()` ignores the Own scope, so
-- a code read suggested Staff could see every answer in their branch. It
-- cannot: the policies' `exists (select ... from appointments ...)` sub-query
-- runs WITH the caller's RLS, and `appointments_select`/`_update` do honour Own.
-- Proven by this suite on the unchanged policies; it guards that behaviour now
-- that the dashboard shows answers (appointment drawer + client profile).
--
-- Fixture: one business, one branch, two staff (A has a login with the Staff
-- role; B has none), one client, two appointments (A's and B's), each with one
-- normal and one sensitive answer = 4 answer rows. Plus a second business's
-- owner who must see nothing.
--
-- Expected per caller: owner 4, manager 4, receptionist 2 (no sensitive),
-- staff A 2 (only their own appointment, sensitive included: Staff holds
-- clients.view_sensitive at Own), other business 0. Staff A cannot update an
-- answer on B's appointment (0 rows, stored value unchanged) but can on their own.
--
-- Run: supabase db query --linked -f supabase/tests/43_appointment_answers_scope.sql
-- Self-contained: everything rolls back.

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
  execute format('grant usage on schema %I to authenticated', v_schema);
  execute format('grant select, insert on %I.ids to authenticated', v_schema);
  execute format('grant select, insert on %I.res to authenticated', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated', v_schema);
end $$;

-- Users
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'), ('manager'), ('recep'), ('staffa'), ('stranger')) as x(k)
  loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      's43.' || r.k || '.' || substr(v_id::text, 1, 8) || '@example.com',
      extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

-- Businesses
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('S43 A', 's43-a-' || substr(pg_temp.id('owner')::text, 1, 8),
    'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  insert into ids values ('biz', v_biz);

  perform pg_temp.act_as(pg_temp.id('stranger'));
  set local role authenticated;
  v_biz := public.create_business_with_owner('S43 B', 's43-b-' || substr(pg_temp.id('stranger')::text, 1, 8),
    'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
end $$;

insert into ids select 'branch', id from public.branches where business_id = pg_temp.id('biz') limit 1;

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days'
where id in (pg_temp.id('biz'), pg_temp.id('bizb'));
alter table public.businesses enable trigger businesses_enforce_guard;

-- Members (Manager, Receptionist, Staff) at the branch
do $$
declare r record; v_member uuid;
begin
  for r in select * from (values ('manager','manager'), ('recep','receptionist'), ('staffa','staff')) as x(k, role_key)
  loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biz'), pg_temp.id(r.k), 'active', now())
    returning id into v_member;
    insert into ids values ('member_' || r.k, v_member);
    perform pg_temp.act_as(pg_temp.id('owner'));
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member, (select id from public.roles where business_id is null and key = r.role_key),
            pg_temp.id('branch'));
  end loop;
end $$;

-- Catalogue, two appointments, two fields, four answers (written as the table owner)
do $$
declare v_a uuid; v_b uuid; v_svc uuid; v_client uuid; v_f1 uuid; v_f2 uuid; v_fv uuid;
  v_appt_a uuid; v_appt_b uuid; v_start timestamptz := now() + interval '30 days';
begin
  perform set_config('request.jwt.claims', '', true);

  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biz'), pg_temp.id('member_staffa'), 'Staff A') returning id into v_a;
  insert into public.staff_profiles (business_id, display_name)
  values (pg_temp.id('biz'), 'Staff B') returning id into v_b;

  insert into public.services (business_id, name, duration_minutes)
  values (pg_temp.id('biz'), 'Consult', 30) returning id into v_svc;

  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biz'), 'S43 Client', '+447700943001') returning id into v_client;

  insert into public.custom_fields (business_id, label, field_type, is_sensitive, applies_to_all_services, sort_order)
  values (pg_temp.id('biz'), 'Preferred name', 'short_text', false, true, 1) returning id into v_f1;
  insert into public.custom_fields (business_id, label, field_type, is_sensitive, applies_to_all_services, sort_order)
  values (pg_temp.id('biz'), 'Medical history', 'long_text', true, true, 2) returning id into v_f2;
  v_fv := public.ensure_form_version(pg_temp.id('biz'));

  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('branch'), v_client, v_svc, v_a,
          v_start, v_start + interval '30 minutes', 30, 'confirmed', v_fv, true)
  returning id into v_appt_a;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('branch'), v_client, v_svc, v_b,
          v_start, v_start + interval '30 minutes', 30, 'confirmed', v_fv, true)
  returning id into v_appt_b;

  insert into public.appointment_field_values (business_id, appointment_id, custom_field_id, form_version_id, value, is_sensitive)
  values (pg_temp.id('biz'), v_appt_a, v_f1, v_fv, 'Sam', false),
         (pg_temp.id('biz'), v_appt_a, v_f2, v_fv, 'A: asthma', true),
         (pg_temp.id('biz'), v_appt_b, v_f1, v_fv, 'Jo', false),
         (pg_temp.id('biz'), v_appt_b, v_f2, v_fv, 'B: allergy', true);

  insert into ids values ('appt_a', v_appt_a), ('appt_b', v_appt_b), ('field1', v_f1);
end $$;

create or replace function pg_temp.visible(p_user uuid) returns int language plpgsql as $$
declare v int;
begin
  perform pg_temp.act_as(p_user);
  set local role authenticated;
  select count(*)::int into v from public.appointment_field_values
  where appointment_id in (pg_temp.id('appt_a'), pg_temp.id('appt_b'));
  reset role;
  return v;
end; $$;

create or replace function pg_temp.visible_on(p_user uuid, p_appt uuid) returns int language plpgsql as $$
declare v int;
begin
  perform pg_temp.act_as(p_user);
  set local role authenticated;
  select count(*)::int into v from public.appointment_field_values where appointment_id = p_appt;
  reset role;
  return v;
end; $$;

-- Reads
do $$
begin
  perform pg_temp.chk('owner sees all 4 answers (incl. sensitive)', pg_temp.visible(pg_temp.id('owner')), 4);
  perform pg_temp.chk('manager (Branch) sees all 4 answers (holds view_sensitive)', pg_temp.visible(pg_temp.id('manager')), 4);
  perform pg_temp.chk('receptionist (Branch) sees the 2 non-sensitive answers only', pg_temp.visible(pg_temp.id('recep')), 2);
  perform pg_temp.chk('staff A (Own) sees only the 2 answers on their OWN appointment', pg_temp.visible(pg_temp.id('staffa')), 2);
  perform pg_temp.chk('staff A sees NOTHING on staff B''s appointment',
    pg_temp.visible_on(pg_temp.id('staffa'), pg_temp.id('appt_b')), 0);
  perform pg_temp.chk('another business''s owner sees nothing', pg_temp.visible(pg_temp.id('stranger')), 0);
end $$;

-- Updates
do $$
declare v_rows int;
begin
  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  update public.appointment_field_values set value = 'tampered'
  where appointment_id = pg_temp.id('appt_b') and custom_field_id = pg_temp.id('field1');
  get diagnostics v_rows = row_count;
  reset role;
  perform pg_temp.chk('staff A cannot update an answer on staff B''s appointment', v_rows, 0);
  perform pg_temp.chk('and the stored answer is unchanged',
    (select value from public.appointment_field_values
     where appointment_id = pg_temp.id('appt_b') and custom_field_id = pg_temp.id('field1')), 'Jo');

  perform pg_temp.act_as(pg_temp.id('staffa'));
  set local role authenticated;
  update public.appointment_field_values set value = 'Samantha'
  where appointment_id = pg_temp.id('appt_a') and custom_field_id = pg_temp.id('field1');
  get diagnostics v_rows = row_count;
  reset role;
  perform pg_temp.chk('staff A can update an answer on their own appointment', v_rows, 1);
end $$;

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
