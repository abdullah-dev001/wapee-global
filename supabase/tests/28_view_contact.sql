-- Phase 11A: clients.view_contact is a DATABASE boundary (clients.phone_e164 / email are not granted;
-- clients_v blanks them without the permission).
--
--   supabase db query --linked -f supabase/tests/28_view_contact.sql
--
-- Plain SQL, own fixtures, rolled back. Roles: Owner, Manager, Receptionist (allowed by default), Staff at
-- own scope (blocked), a stranger from another business. Also proves search, the invoice print view, the
-- duplicate-phone lookup, list_appointments, booking-side RPCs (service_role) are unaffected (and nothing is published to Realtime).
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid, p_aal2 boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', case when p_aal2 then 'aal2' else 'aal1' end)::text, true);
end; $$;

-- Run a jsonb-returning statement as a signed-in user.
create or replace function pg_temp.as_(p_user text, p_sql text, p_aal2 boolean default false) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user), p_aal2);
  set local role authenticated;
  begin
    execute p_sql into r;
  exception when others then
    reset role;
    return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm);
  end;
  reset role;
  return r;
end $$;
-- Run a SCALAR query as a user: its text value, or ERR:<sqlstate>
create or replace function pg_temp.as_q(p_user text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    reset role;
    return 'ERR:' || sqlstate;
  end;
  reset role;
  return v;
end $$;
create or replace function pg_temp.as_anon(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    execute p_sql into r;
  exception when others then
    reset role;
    return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm);
  end;
  reset role;
  return r;
end $$;
-- scalar as postgres
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;
-- run a statement as postgres: 'ok' or '<sqlstate>'
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
-- run a statement as a user: 'ok' or '<sqlstate>'
create or replace function pg_temp.try_as(p_user text, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  begin execute p_sql; exception when others then reset role; return sqlstate; end;
  reset role; return 'ok';
end $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

create or replace function pg_temp.rid(p_key text) returns uuid language sql as $$
  select id from public.roles where business_id is null and key = p_key
$$;
create or replace function pg_temp.perms(p_role uuid) returns text language sql as $$
  select coalesce(string_agg(permission || ':' || scope, ',' order by permission), '') from public.role_permissions where role_id = p_role
$$;
create or replace function pg_temp.audit_n(p_action text) returns text language sql as $$
  select count(*)::text from public.audit_logs where action = p_action
$$;
create or replace function pg_temp.member(p_biz text, p_user text) returns uuid language sql as $$
  select id from public.business_members where business_id = pg_temp.id(p_biz) and user_id = pg_temp.id(p_user)
$$;
create or replace function pg_temp.add_member(p_biz text, p_user text, p_role_key text, p_branch text default null) returns uuid language plpgsql as $$
declare v_m uuid;
begin
  select id into v_m from public.business_members where business_id = pg_temp.id(p_biz) and user_id = pg_temp.id(p_user);
  if v_m is null then
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id(p_biz), pg_temp.id(p_user), 'active', now()) returning id into v_m;
  end if;
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  values (v_m, pg_temp.rid(p_role_key), case when p_branch is null then null else pg_temp.id(p_branch) end);
  return v_m;
end $$;


create or replace function pg_temp.int_as(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  execute p_sql into r;
  return r;
end $$;
-- rows visible to a user: count of a select
create or replace function pg_temp.vis(p_user text, p_sql text) returns text language sql as $$
  select pg_temp.as_q(p_user, 'select count(*)::text from (' || p_sql || ') x')
$$;
create or replace function pg_temp.inv_state(p_biz text) returns text language sql as $$
  select coalesce((select string_agg(b.invoice_next_no::text || '/' || b.credit_note_next_no::text, ',' order by b.id) from public.branches b where b.business_id = pg_temp.id(p_biz)), '')
$$;
create or replace function pg_temp.stock(p_k text) returns text language sql as $$
  select stock_qty::text from public.products where id = pg_temp.id(p_k)
$$;
create or replace function pg_temp.draft(p_user text, p_client text, p_items text) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.as_(p_user, format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), case when p_client is null then null else pg_temp.id(p_client) end, p_items));
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'draft failed: %', r; end if;
  return (r->>'invoice_id')::uuid;
end $$;
create or replace function pg_temp.issue(p_user text, p_inv uuid) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format($q$select public.issue_invoice(%L)$q$, p_inv))
$$;
create or replace function pg_temp.appt(p_key text, p_client text, p_service text, p_staff text, p_status text, p_hour int) returns void language plpgsql as $$
declare v_fv uuid; v_id uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, cancelled_at)
  values (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id(p_client), pg_temp.id(p_service), pg_temp.id(p_staff),
          timestamptz '2027-05-03 06:00+00' + make_interval(hours => p_hour), timestamptz '2027-05-03 06:30+00' + make_interval(hours => p_hour),
          30, 0, p_status::public.appointment_status, 'dashboard', v_fv, 1000, case when p_status = 'cancelled' then now() end) returning id into v_id;
  insert into ids values (p_key, v_id);
end $$;

-- run a jsonb-returning statement as service_role (what the Edge Functions use)
create or replace function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin execute p_sql into r; exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.uid_of(p_key text) returns uuid language sql as $$ select pg_temp.id(p_key) $$;
do $$
declare s text;
begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to service_role', s);
  execute format('grant select, insert on %I.ids to service_role', s);
  execute format('grant select, insert on %I.res to service_role', s);
end $$;

-- Fixtures
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr'),('recep'),('staff'),('ownerb')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11vc.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11 Alpha','p11-a','GB','GBP','Europe/London','en',null,'Alpha');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11 Beta','p11-b','GB','GBP','Europe/London','en',null,'Beta');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgr', 'manager', 'bra');
select pg_temp.add_member('biza', 'recep', 'receptionist', 'bra');
select pg_temp.add_member('biza', 'staff', 'staff', 'bra');
select set_config('request.jwt.claims', '', true);
do $$
declare v_svc uuid; v_ann uuid; v_c uuid; v_br uuid := pg_temp.id('bra'); v_biz uuid := pg_temp.id('biza'); v_fv uuid;
begin
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Cut', 60, 0) returning id into v_svc; insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 4000, true);
  insert into public.staff_profiles (business_id, display_name, sort_order, member_id) values (v_biz, 'Ann', 1, pg_temp.member('biza', 'staff')) returning id into v_ann; insert into ids values ('ann', v_ann);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Alice Adams', '+447700910001', 'alice@example.com', v_br) returning id into v_c; insert into ids values ('alice', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Alicia Brown', '+447700910002', 'alicia@example.com', v_br) returning id into v_c; insert into ids values ('brown', v_c);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Carol Clarke', '+447700910003', v_br) returning id into v_c; insert into ids values ('carol', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email) values (pg_temp.id('bizb'), 'Bob Beta', '+447700910009', 'bob@example.com') returning id into v_c; insert into ids values ('bobb', v_c);
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
  -- Ann (the Staff member) has an appointment with Alice only: Alice is her "own" client.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (v_biz, v_br, pg_temp.id('alice'), v_svc, v_ann, now() + interval '2 days', now() + interval '2 days 1 hour', 60, 0, 'confirmed', 'dashboard', v_fv, 4000);
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (v_biz, v_br, pg_temp.id('brown'), v_svc, null, now() + interval '3 days', now() + interval '3 days 1 hour', 60, 0, 'confirmed', 'dashboard', v_fv, 4000);
end $$;

update public.clients set notes = 'NOTE-' || full_name where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'));

-- ===========================================================================
-- 1. The columns are NOT granted: direct reads fail for every role, including the Owner
-- ===========================================================================
do $$
declare u text;
begin
  foreach u in array array['owner','mgr','recep','staff','ownerb'] loop
    perform pg_temp.chk(u || ': select phone_e164 / email / * from clients is refused (42501)',
      pg_temp.try_as(u, 'select phone_e164 from public.clients') || pg_temp.try_as(u, 'select email from public.clients') || pg_temp.try_as(u, 'select * from public.clients')
      || pg_temp.try_as(u, 'select id from public.clients where phone_e164 = ''+447700910001''') || pg_temp.try_as(u, 'select id from public.clients where email = ''alice@example.com''') || pg_temp.try_as(u, 'select notes from public.clients') || pg_temp.try_as(u, 'select id from public.clients where notes is not null'),
      '42501425014250142501425014250142501');
    perform pg_temp.chk(u || ': non-contact columns of clients are still readable',
      pg_temp.try_as(u, 'select id, business_id, full_name, first_branch_id, source, created_at, updated_at, deleted_at, created_by from public.clients'), 'ok');
  end loop;
  perform pg_temp.chk('anon has no access to clients or clients_v', (pg_temp.as_anon('select to_jsonb(count(*)) from public.clients')->>'state') || (pg_temp.as_anon('select to_jsonb(count(*)) from public.clients_v')->>'state'), '4250142501');
end $$;

-- ===========================================================================
-- 2. clients_v: contact only with clients.view_contact; rows still follow RLS
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('owner: sees all 3 clients with phone AND email', pg_temp.as_q('owner', 'select count(*) filter (where phone_e164 is not null)::text || count(*) filter (where email is not null)::text || count(*)::text from public.clients_v'), '323');
  perform pg_temp.chk('manager: same', pg_temp.as_q('mgr', 'select count(*) filter (where phone_e164 is not null)::text || count(*) filter (where email is not null)::text || count(*)::text from public.clients_v'), '323');
  perform pg_temp.chk('receptionist (allowed by default): same', pg_temp.as_q('recep', 'select count(*) filter (where phone_e164 is not null)::text || count(*) filter (where email is not null)::text || count(*)::text from public.clients_v'), '323');
  perform pg_temp.chk('staff (own scope): sees ONLY their own client, with phone and email NULL',
    pg_temp.as_q('staff', 'select count(*)::text || count(*) filter (where phone_e164 is not null)::text || count(*) filter (where email is not null)::text || min(full_name) from public.clients_v'), '100Alice Adams');
  perform pg_temp.chk('other business owner: sees only their own client (their own contact), nothing of Alpha',
    pg_temp.as_q('ownerb', 'select count(*)::text || min(phone_e164) || (select count(*)::text from public.clients_v where business_id = ''' || pg_temp.id('biza') || ''') from public.clients_v'), '1+4477009100090');
  perform pg_temp.chk('the stored values come back exactly (owner)', pg_temp.as_q('owner', 'select phone_e164 || email from public.clients_v where full_name = ''Alice Adams'''), '+447700910001alice@example.com');
end $$;

-- ===========================================================================
-- 3. Search by name (trigram) and by phone: the phone search is not an oracle for blocked roles
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('owner: name search "alic" finds both Alices; phone search finds exactly one', pg_temp.as_q('owner', 'select (select count(*) from public.clients_v where full_name ilike ''%alic%'')::text || (select count(*) from public.clients_v where phone_e164 ilike ''%910002%'')::text'), '21');
  perform pg_temp.chk('staff: name search works on their own client; phone search and email search find NOTHING (even for their own client)',
    pg_temp.as_q('staff', 'select (select count(*) from public.clients_v where full_name ilike ''%alic%'')::text || (select count(*) from public.clients_v where phone_e164 ilike ''%910001%'')::text || (select count(*) from public.clients_v where email ilike ''%alice%'')::text'), '100');
  perform pg_temp.chk('the trigram indexes on the base table still exist (DEFINER paths and the planner use them)', (select count(*)::text from pg_indexes where tablename = 'clients' and indexname in ('clients_name_trgm_idx', 'clients_phone_trgm_idx')), '2');
end $$;

-- ===========================================================================
-- 4. No helper to bypass the view; no leaky filter can probe rows the caller may not see
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('the per-row contact helpers are gone (client_phone / client_email); only the view can return contact data',
    coalesce(to_regprocedure('public.client_phone(uuid)')::text, '-') || coalesce(to_regprocedure('public.client_email(uuid)')::text, '-'), '--');
  perform pg_temp.chk('anon cannot execute contact_business_ids', has_function_privilege('anon', 'public.contact_business_ids()', 'execute')::text, 'false');
  perform pg_temp.chk('security barrier: a filter that RAISES on one specific invisible row (Carol, not Staff''s client) is never run against it',
    pg_temp.try_as('staff', 'select count(*) from public.clients_v where 1 / (case when full_name = ''Carol Clarke'' then 0 else 1 end) = 1'), 'ok');
  perform pg_temp.chk('...and the same filter DOES raise for a caller who may see Carol (so the probe is real)',
    pg_temp.try_as('owner', 'select count(*) from public.clients_v where 1 / (case when full_name = ''Carol Clarke'' then 0 else 1 end) = 1'), '22012');
  perform pg_temp.chk('the view is a barrier view and not security_invoker (the owner reads the columns, the rule is in the view)',
    (select array_to_string(reloptions, ',') from pg_class where relname = 'clients_v'), 'security_barrier=true');
end $$;

-- ===========================================================================
-- 4b. clients.notes follows clients.view_contact; the view returns only the rows RLS lets the caller see
-- ===========================================================================
do $$
declare u text; o text; n text; bad text := '';
begin
  perform pg_temp.chk('owner / manager / receptionist read notes through the view (all 3 clients)',
    pg_temp.as_q('owner', 'select count(notes)::text from public.clients_v') || pg_temp.as_q('mgr', 'select count(notes)::text from public.clients_v') || pg_temp.as_q('recep', 'select count(notes)::text from public.clients_v'), '333');
  perform pg_temp.chk('staff sees their own client row but the notes are NULL; searching notes finds nothing',
    pg_temp.as_q('staff', 'select count(*)::text || count(notes)::text from public.clients_v') || '/' || pg_temp.as_q('staff', 'select count(*)::text from public.clients_v where notes ilike ''%NOTE-%'''), '10/0');
  perform pg_temp.chk('the other business sees only its own notes; anon cannot read the view', pg_temp.as_q('ownerb', 'select string_agg(notes, '','') from public.clients_v') || '/' || (pg_temp.as_anon('select to_jsonb(count(*)) from public.clients_v')->>'state'), 'NOTE-Bob Beta/42501');
  perform pg_temp.chk('the stored text is exact', pg_temp.as_q('owner', 'select notes from public.clients_v where full_name = ''Alice Adams'''), 'NOTE-Alice Adams');
  foreach u in array array['owner','mgr','recep','staff','ownerb'] loop
    o := pg_temp.as_q(u, 'select coalesce(md5(string_agg(id::text, '','' order by id)), ''none'') from public.clients');
    n := pg_temp.as_q(u, 'select coalesce(md5(string_agg(id::text, '','' order by id)), ''none'') from public.clients_v');
    if o is distinct from n then bad := bad || u || ' '; end if;
  end loop;
  perform pg_temp.chk('clients_v returns only (and all of) the rows the caller can see under RLS on clients: owner, manager, receptionist, staff, other business', bad, '');
  perform pg_temp.chk('...and the sets differ per caller (3 / 3 / 3 / 1 / 1), so the comparison means something',
    pg_temp.vis('owner', 'select 1 from public.clients') || pg_temp.vis('mgr', 'select 1 from public.clients') || pg_temp.vis('recep', 'select 1 from public.clients') || pg_temp.vis('staff', 'select 1 from public.clients') || pg_temp.vis('ownerb', 'select 1 from public.clients'), '33311');
end $$;

-- ===========================================================================
-- 5. Writes still work (writing a number does not reveal one)
-- ===========================================================================
do $$
declare v_new uuid;
begin
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  insert into public.clients (business_id, full_name, phone_e164, email) values (pg_temp.id('biza'), 'Dina Davis', '+447700910004', 'dina@example.com') returning id into v_new;
  reset role; insert into ids values ('dina', v_new);
  perform pg_temp.chk('receptionist: insert ... returning id works', (v_new is not null)::text, 'true');
  perform pg_temp.chk('receptionist: update phone / email works', pg_temp.try_as('recep', format('update public.clients set phone_e164 = ''+447700910014'', email = ''dina2@example.com'' where id = %L', v_new)), 'ok');
  perform pg_temp.chk('...stored exactly', (select phone_e164 || email::text from public.clients where id = v_new), '+447700910014dina2@example.com');
  perform pg_temp.chk('duplicate phone: still a 23505 and the duplicate lookup (clients_v by phone) finds the holder for a contact-permitted role',
    pg_temp.try_as('recep', format('insert into public.clients (business_id, full_name, phone_e164) values (%L, ''Dup'', ''+447700910001'')', pg_temp.id('biza'))) || '/' ||
    pg_temp.as_q('recep', format('select full_name from public.clients_v where business_id = %L and phone_e164 = ''+447700910001'' and deleted_at is null', pg_temp.id('biza'))), '23505/Alice Adams');
  perform pg_temp.chk('staff: cannot insert a client (no clients.create)', pg_temp.try_as('staff', format('insert into public.clients (business_id, full_name, phone_e164) values (%L, ''X'', ''+447700910077'')', pg_temp.id('biza'))), '42501');
  perform pg_temp.chk('stranger: cannot update Alpha''s client (0 rows) and cannot insert into Alpha',
    pg_temp.as_q('ownerb', format('with u as (update public.clients set full_name = ''HACK'' where id = %L returning 1) select count(*)::text from u', pg_temp.id('alice'))) || '/' ||
    pg_temp.try_as('ownerb', format('insert into public.clients (business_id, full_name, phone_e164) values (%L, ''X'', ''+447700910078'')', pg_temp.id('biza'))), '0/42501');
end $$;

-- ===========================================================================
-- 6. Other readers: list_appointments, the invoice print view, booking RPCs, Realtime
-- ===========================================================================
do $$
declare v_inv uuid;
begin
  perform pg_temp.chk('list_appointments: owner and receptionist get client_phone',
    (pg_temp.as_('owner', format('select public.list_appointments(%L)', pg_temp.id('biza')))->'rows'->0->>'client_phone' is not null)::text ||
    (pg_temp.as_('recep', format('select public.list_appointments(%L)', pg_temp.id('biza')))->'rows'->0->>'client_phone' is not null)::text, 'truetrue');
  perform pg_temp.chk('list_appointments: staff gets the row but client_phone is null, and searching by the phone finds nothing',
    (pg_temp.as_('staff', format('select public.list_appointments(%L)', pg_temp.id('biza')))->'rows'->0->>'client_name') || '/' ||
    coalesce(pg_temp.as_('staff', format('select public.list_appointments(%L)', pg_temp.id('biza')))->'rows'->0->>'client_phone', '-') || '/' ||
    jsonb_array_length(pg_temp.as_('staff', format($q$select public.list_appointments(%L, p_search => '910001')$q$, pg_temp.id('biza')))->'rows')::text ||
    jsonb_array_length(pg_temp.as_('owner', format($q$select public.list_appointments(%L, p_search => '910001')$q$, pg_temp.id('biza')))->'rows')::text,
    'Alice Adams/-/01');
  v_inv := pg_temp.draft('recep', 'alice', '[{"description":"x","unit_price_minor":1000}]');
  perform pg_temp.chk('invoice print view: receptionist still gets the phone; the Manager too', (pg_temp.as_('recep', format($q$select public.get_invoice_print_data(%L)$q$, v_inv))->'client'->>'phone') || (pg_temp.as_('mgr', format($q$select public.get_invoice_print_data(%L)$q$, v_inv))->'client'->>'phone'), '+447700910001+447700910001');
  perform pg_temp.chk('booking side (service_role, DEFINER): a client lookup by phone / email still works',
    pg_temp.svc(format($q$select to_jsonb((select count(*) from public.clients where business_id = %L and phone_e164 = '+447700910001'))$q$, pg_temp.id('biza')))::text || pg_temp.svc(format($q$select to_jsonb((select count(*) from public.clients where business_id = %L and email = 'alice@example.com'))$q$, pg_temp.id('biza')))::text, '11');
  perform pg_temp.chk('no Realtime: nothing is published (no contact column can ride a change event), and appointments is still readable by a dashboard member',
    coalesce((select string_agg(tablename, ',') from pg_publication_tables where pubname = 'supabase_realtime'), 'none') || '/' || pg_temp.try_as('staff', 'select id, status, client_id from public.appointments'), 'none/ok');
  perform pg_temp.chk('portal_client_ids (email -> clients, DEFINER) still resolves', public.portal_client_ids(pg_temp.id('biza'), 'alice@example.com')::text, '{' || pg_temp.id('alice')::text || '}');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
