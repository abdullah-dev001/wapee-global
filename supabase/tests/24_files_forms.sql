-- Phase 10B: add-ons Files & Photos and Forms & Consent (schema, RPCs, storage, public link).
--
--   supabase db query --linked -f supabase/tests/24_files_forms.sql
--
-- Plain SQL, own fixtures, rolled back. RLS per role and other business, anon gets nothing, the private
-- bucket cannot be listed / read / written through the API, consent gating, failure-path survival,
-- immutability, token expiry / replay, add-on off / on, stored values. Real parallel sessions:
-- 25_forms_concurrency.sh.
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
create or replace function pg_temp.fcount(p_user text, p_where text) returns text language sql as $$
  select pg_temp.as_q(p_user, 'select count(*)::text from public.files where ' || p_where)
$$;
-- prepare + finalize a ready file as a user (helper for fixtures)
create or replace function pg_temp.mkfile(p_user text, p_client text, p_mime text, p_cat text, p_appt text default null, p_name text default 'x.jpg') returns uuid language plpgsql as $$
declare r jsonb; v_id uuid;
begin
  r := pg_temp.as_(p_user, format($q$select public.files_prepare_upload(%L, %L, %L, %L, %L, 1000)$q$, pg_temp.id(p_client), case when p_appt is null then null else pg_temp.id(p_appt) end, p_cat, p_name, p_mime));
  if not (r->>'ok')::boolean then raise exception 'prepare failed: %', r; end if;
  v_id := (r->>'file_id')::uuid;
  r := pg_temp.svc(format($q$select public.files_finalize(%L, %L, %L, 1000)$q$, v_id, pg_temp.id(p_user), p_mime));
  if not (r->>'ok')::boolean then raise exception 'finalize failed: %', r; end if;
  return v_id;
end $$;

-- ===========================================================================
-- Fixtures
-- ===========================================================================
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr'),('recep'),('staffa'),('staffb'),('ownerb'),('stranger')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p10bt.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P10B Alpha','p10b-alpha','GB','GBP','Europe/London','en',null,'Alpha');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P10B Beta','p10b-beta','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgr', 'manager', 'bra');
select pg_temp.add_member('biza', 'recep', 'receptionist', 'bra');
select pg_temp.add_member('biza', 'staffa', 'staff', 'bra');
select pg_temp.add_member('biza', 'staffb', 'staff', 'bra');
do $$
declare v_c uuid; v_svc uuid;
begin
  insert into public.staff_profiles (business_id, display_name, is_active, member_id) values (pg_temp.id('biza'), 'Staff A', true, pg_temp.member('biza', 'staffa')) returning id into v_c; insert into ids values ('s_a', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name, is_active, member_id) values (pg_temp.id('biza'), 'Staff B', true, pg_temp.member('biza', 'staffb')) returning id into v_c; insert into ids values ('s_b', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Tattoo', 60, 0) returning id into v_svc; insert into ids values ('svc', v_svc);
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Piercing', 30, 0) returning id into v_svc; insert into ids values ('svc2', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) select id, pg_temp.id('bra'), pg_temp.id('biza'), 1000, true from public.services where business_id = pg_temp.id('biza');
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('bizb'), 'B svc', 30, 0) returning id into v_svc; insert into ids values ('svcb', v_svc);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (pg_temp.id('biza'), 'Client One', '+4477002' || lpad((random()*99999)::int::text, 5, '0'), 'one@example.com', pg_temp.id('bra')) returning id into v_c; insert into ids values ('c1', v_c);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (pg_temp.id('biza'), 'Client Two', '+4477003' || lpad((random()*99999)::int::text, 5, '0'), pg_temp.id('bra')) returning id into v_c; insert into ids values ('c2', v_c);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (pg_temp.id('bizb'), 'Client Beta', '+4477004' || lpad((random()*99999)::int::text, 5, '0'), pg_temp.id('branchb')) returning id into v_c; insert into ids values ('cb', v_c);
end $$;
select pg_temp.appt('ap1', 'c1', 'svc', 's_a', 'confirmed', 1);
select pg_temp.appt('ap2', 'c2', 'svc', 's_b', 'confirmed', 1);
select pg_temp.appt('ap3', 'c1', 'svc2', 's_a', 'confirmed', 2);

-- ===========================================================================
-- 1. Seed
-- ===========================================================================
select pg_temp.chk('seed: Staff holds files.view AND files.upload at OWN scope only',
  (select string_agg(permission || ':' || scope, ',' order by permission) from public.role_permissions where role_id = pg_temp.rid('staff') and permission like 'files.%'), 'files.upload:own,files.view:own');
select pg_temp.chk('seed: Receptionist uploads + views; forms.manage is Owner/Manager only',
  (select string_agg(permission, ',' order by permission) from public.role_permissions where role_id = pg_temp.rid('receptionist') and (permission like 'files.%' or permission like 'forms.%')) || '/' ||
  (select string_agg(r.key, ',' order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id where rp.permission = 'forms.manage' and r.business_id is null), 'files.upload,files.view/manager,owner');

-- ===========================================================================
-- 2. The private bucket cannot be touched through the API
-- ===========================================================================
select pg_temp.chk('bucket: private, 10 MB, only jpeg/png/webp/pdf',
  (select concat_ws('|', public, file_size_limit, (select string_agg(m, ',' order by m) from unnest(allowed_mime_types) m)) from storage.buckets where id = 'client-files'),
  'f|10485760|application/pdf,image/jpeg,image/png,image/webp');
insert into storage.objects (bucket_id, name, owner) values ('client-files', pg_temp.id('biza')::text || '/' || pg_temp.id('c1')::text || '/probe.jpg', null);
select pg_temp.chk('storage: authenticated (owner) sees NO object in the bucket', pg_temp.as_q('owner', $q$select count(*)::text from storage.objects where bucket_id = 'client-files'$q$), '0');
select pg_temp.chk('storage: even the other business sees none, and anon sees none', pg_temp.as_q('ownerb', $q$select count(*)::text from storage.objects where bucket_id = 'client-files'$q$) || '/' || (pg_temp.as_anon($q$select to_jsonb(count(*)) from storage.objects where bucket_id = 'client-files'$q$))::text, '0/0');
select pg_temp.chk('storage: authenticated cannot WRITE an object (insert refused)', pg_temp.try_as('owner', format($q$insert into storage.objects (bucket_id, name, owner) values ('client-files', %L, null)$q$, pg_temp.id('biza')::text || '/x/y.jpg')), '42501');
select pg_temp.chk('storage: authenticated cannot delete one either (no privilege)', pg_temp.as_q('owner', $q$with u as (delete from storage.objects where bucket_id = 'client-files' returning 1) select count(*)::text from u$q$), 'ERR:42501');
select pg_temp.chk('storage: no policy exists for the bucket at all', (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') like '%client-files%' or coalesce(with_check, '') like '%client-files%')), '0');

-- ===========================================================================
-- 3. Photo consent
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('consent: default is OFF, for any viewer', (pg_temp.as_('recep', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c1')))->>'photo_consent'), 'false');
  perform pg_temp.chk('consent: a staff member (no clients.edit) is refused', pg_temp.as_('staffa', format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('c1')))->>'code', 'forbidden');
  perform pg_temp.chk('consent: another business and a stranger are refused', (pg_temp.as_('ownerb', format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('c1')))->>'code') || (pg_temp.as_('stranger', format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('c1')))->>'code'), 'forbiddenforbidden');
  perform pg_temp.chk('consent: anon has no EXECUTE', pg_temp.as_anon(format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('c1')))->>'state', '42501');
  perform pg_temp.chk('...refusals stored nothing', (select count(*)::text from public.client_consents) || '/' || pg_temp.audit_n('client.photo_consent_changed'), '0/0');
  perform pg_temp.chk('consent: invalid value', pg_temp.as_('recep', format($q$select public.set_photo_consent(%L, null)$q$, pg_temp.id('c1')))->>'code', 'invalid_value');
  perform pg_temp.chk('consent: the receptionist records it', pg_temp.as_('recep', format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('c1')))->>'ok', 'true');
  perform pg_temp.chk('stored: consent on, date set, recorded_by = the receptionist, audited', (select concat_ws('|', photo_consent, recorded_at > now() - interval '1 minute', recorded_by = pg_temp.id('recep')) from public.client_consents where client_id = pg_temp.id('c1')) || '/' || pg_temp.audit_n('client.photo_consent_changed'), 't|t|t/1');
  perform pg_temp.chk('consent: the same value again is a no-op (no second audit row)', (pg_temp.as_('recep', format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('c1')))->>'unchanged') || '/' || pg_temp.audit_n('client.photo_consent_changed'), 'true/1');
  perform pg_temp.chk('state: staff A on their own client: can upload, cannot edit consent', (pg_temp.as_('staffa', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c1')))->>'can_upload') || '/' || (pg_temp.as_('staffa', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c1')))->>'can_edit_consent'), 'true/false');
  perform pg_temp.chk('state: the receptionist sees who recorded it and may edit it', (select (r->>'recorded_by_name') is not null from (select pg_temp.as_('recep', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c1'))) r) x)::text || '/' || (pg_temp.as_('recep', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c1')))->>'can_edit_consent'), 'false/true');
  perform pg_temp.chk('state: a colleague''s client is not visible to staff A', pg_temp.as_('staffa', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c2')))->>'code', 'forbidden');
end $$;

-- ===========================================================================
-- 4. Upload: prepare -> finalize
-- ===========================================================================
do $$
declare r jsonb; v_id uuid; v_before text;
begin
  -- c2 has NO consent: a photo is refused, a PDF is fine
  perform pg_temp.chk('photo without consent is refused (and nothing is stored)', (pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c2')))->>'code') || '/' || (select count(*)::text from public.files), 'photo_consent_required/0');
  r := pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'document', 'Referral letter.pdf', 'application/pdf', 5000)$q$, pg_temp.id('c2')));
  perform pg_temp.chk('a PDF is allowed without photo consent', r->>'ok', 'true');
  insert into ids values ('f_pdf', (r->>'file_id')::uuid);
  perform pg_temp.chk('stored pending row: kind, category, status, mime, size, creator, uuid path under business/client', (select concat_ws('|', kind, category, status, mime_type, size_bytes, created_by = pg_temp.id('recep'), storage_path = pg_temp.id('biza')::text || '/' || pg_temp.id('c2')::text || '/' || id::text || '.pdf', original_name) from public.files where id = pg_temp.id('f_pdf')), 'document|document|pending|application/pdf|5000|t|t|Referral letter.pdf');
  perform pg_temp.chk('a pending file is invisible to everyone (not ready)', pg_temp.fcount('owner', 'true'), '0');
  r := pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1')));
  perform pg_temp.chk('photo with consent: ok', r->>'ok', 'true');
  insert into ids values ('f_jpg_pending', (r->>'file_id')::uuid);
  perform pg_temp.chk('...path is <biz>/<client>/<uuid>.jpg and the file name is NEVER part of the path', (select (storage_path ~ ('^' || pg_temp.id('biza')::text || '/' || pg_temp.id('c1')::text || '/[0-9a-f-]{36}\.jpg$'))::text from public.files where id = pg_temp.id('f_jpg_pending')), 'true');
  -- every refusal
  v_before := (select count(*)::text from public.files);
  perform pg_temp.chk('unsupported type (heic)', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.heic', 'image/heic', 1000)$q$, pg_temp.id('c1')))->>'code', 'unsupported_type');
  perform pg_temp.chk('unsupported type (svg)', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'other', 'a.svg', 'image/svg+xml', 1000)$q$, pg_temp.id('c1')))->>'code', 'unsupported_type');
  perform pg_temp.chk('too large (10 MB + 1)', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 10485761)$q$, pg_temp.id('c1')))->>'code', 'file_too_large');
  perform pg_temp.chk('exactly 10 MB is allowed', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'big.jpg', 'image/jpeg', 10485760)$q$, pg_temp.id('c1')))->>'ok', 'true');
  perform pg_temp.chk('zero / null size', (pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 0)$q$, pg_temp.id('c1')))->>'code') || (pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', null)$q$, pg_temp.id('c1')))->>'code'), 'invalid_sizeinvalid_size');
  perform pg_temp.chk('category must match the kind (pdf cannot be "before")', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.pdf', 'application/pdf', 1000)$q$, pg_temp.id('c1')))->>'code', 'invalid_category');
  perform pg_temp.chk('an appointment of ANOTHER client', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, %L, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1'), pg_temp.id('ap2')))->>'code', 'appointment_mismatch');
  perform pg_temp.chk('an empty name', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'before', '///', 'image/jpeg', 1000)$q$, pg_temp.id('c1')))->>'code', 'invalid_name');
  perform pg_temp.chk('staff B (no appointment with c1) is refused; staff A (own appointment) is allowed', (pg_temp.as_('staffb', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1')))->>'code') || '/' || (pg_temp.as_('staffa', format($q$select public.files_prepare_upload(%L, %L, 'after', 'sa.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1'), pg_temp.id('ap1')))->>'ok'), 'forbidden/true');
  perform pg_temp.chk('staff A on a colleague''s client (c2) is refused (own scope)', pg_temp.as_('staffa', format($q$select public.files_prepare_upload(%L, null, 'document', 'a.pdf', 'application/pdf', 1000)$q$, pg_temp.id('c2')))->>'code', 'forbidden');
  perform pg_temp.chk('another business, a stranger, anon', (pg_temp.as_('ownerb', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1')))->>'code') || (pg_temp.as_('stranger', format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1')))->>'code') || (pg_temp.as_anon(format($q$select public.files_prepare_upload(%L, null, 'before', 'a.jpg', 'image/jpeg', 1000)$q$, pg_temp.id('c1')))->>'state'), 'forbiddenforbidden42501');
  perform pg_temp.chk('...refused calls stored nothing new (only the 2 allowed above + the earlier ones)', (select count(*)::text from public.files), (v_before::int + 2)::text);
  -- finalize
  perform pg_temp.chk('finalize is NOT callable by authenticated or anon', (select has_function_privilege('authenticated', 'public.files_finalize(uuid,uuid,text,bigint)', 'execute') or has_function_privilege('anon', 'public.files_finalize(uuid,uuid,text,bigint)', 'execute'))::text, 'false');
  perform pg_temp.chk('finalize by the WRONG user: not_found, row stays pending', (pg_temp.svc(format($q$select public.files_finalize(%L, %L, 'image/jpeg', 1000)$q$, pg_temp.id('f_jpg_pending'), pg_temp.id('owner')))->>'code') || '/' || (select status from public.files where id = pg_temp.id('f_jpg_pending')), 'not_found/pending');
  perform pg_temp.chk('finalize with a DIFFERENT detected type => rejected (the object is not what it claimed)', pg_temp.svc(format($q$select public.files_finalize(%L, %L, 'application/pdf', 1000)$q$, pg_temp.id('f_jpg_pending'), pg_temp.id('recep')))->>'status', 'rejected');
  perform pg_temp.chk('...and the row says so', (select status from public.files where id = pg_temp.id('f_jpg_pending')), 'rejected');
  perform pg_temp.chk('a rejected row cannot be finalized again', pg_temp.svc(format($q$select public.files_finalize(%L, %L, 'image/jpeg', 1000)$q$, pg_temp.id('f_jpg_pending'), pg_temp.id('recep')))->>'code', 'not_found');
  v_id := pg_temp.mkfile('recep', 'c1', 'image/jpeg', 'before', null, 'before.jpg'); insert into ids values ('f_before', v_id);
  perform pg_temp.chk('finalize ok: ready, ready_at set, audited', (select concat_ws('|', status, ready_at is not null) from public.files where id = v_id) || '/' || pg_temp.audit_n('file.uploaded'), 'ready|t/1');
  v_id := pg_temp.mkfile('staffa', 'c1', 'image/png', 'after', 'ap1', 'after.png'); insert into ids values ('f_after', v_id);
  perform pg_temp.chk('stored: appointment link + creator', (select concat_ws('|', appointment_id = pg_temp.id('ap1'), created_by = pg_temp.id('staffa')) from public.files where id = v_id), 't|t');
  v_id := pg_temp.mkfile('recep', 'c2', 'application/pdf', 'document', null, 'c2.pdf'); insert into ids values ('f_c2pdf', v_id);
end $$;

-- ===========================================================================
-- 5. Reading: visibility per role, scope, listing, paths never exposed
-- ===========================================================================
do $$
declare r jsonb;
begin
  perform pg_temp.chk('RLS files: owner sees all 3 ready files; receptionist the same', pg_temp.fcount('owner', 'true') || '/' || pg_temp.fcount('recep', 'true'), '3/3');
  perform pg_temp.chk('RLS files: staff A (own scope) sees only c1''s files, not c2''s', pg_temp.fcount('staffa', format('client_id = %L', pg_temp.id('c1'))) || '/' || pg_temp.fcount('staffa', format('client_id = %L', pg_temp.id('c2'))), '2/0');
  perform pg_temp.chk('RLS files: staff B sees nothing of c1', pg_temp.fcount('staffb', format('client_id = %L', pg_temp.id('c1'))), '0');
  perform pg_temp.chk('RLS files: other business, stranger: none', pg_temp.fcount('ownerb', 'true') || pg_temp.fcount('stranger', 'true'), '00');
  perform pg_temp.chk('anon cannot select files', pg_temp.as_anon('select to_jsonb(count(*)) from public.files')->>'state', '42501');
  perform pg_temp.chk('the storage PATH is not readable by any API role (column grant)', pg_temp.try_as('owner', 'select storage_path from public.files'), '42501');
  perform pg_temp.chk('direct writes are refused', pg_temp.try_as('owner', format($q$update public.files set deleted_at = now() where id = %L$q$, pg_temp.id('f_before'))) || '/' || pg_temp.try_as('owner', format($q$insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes) values (%L, %L, 'photo', 'other', 'x', 'x', 'image/jpeg', 1)$q$, pg_temp.id('biza'), pg_temp.id('c1'))), '42501/42501');
  perform pg_temp.chk('files_access: owner may view the three; staff A only c1''s two', (select count(*)::text from jsonb_array_elements(pg_temp.as_('owner', format($q$select jsonb_agg(to_jsonb(x)) from public.files_access(array[%L, %L, %L]::uuid[]) x$q$, pg_temp.id('f_before'), pg_temp.id('f_after'), pg_temp.id('f_c2pdf'))))) || '/' || (select count(*)::text from jsonb_array_elements(pg_temp.as_('staffa', format($q$select jsonb_agg(to_jsonb(x)) from public.files_access(array[%L, %L, %L]::uuid[]) x$q$, pg_temp.id('f_before'), pg_temp.id('f_after'), pg_temp.id('f_c2pdf'))))), '3/2');
  perform pg_temp.chk('files_access: other business gets nothing; a pending/rejected id gets nothing', coalesce((select count(*)::text from jsonb_array_elements(pg_temp.as_('ownerb', format($q$select jsonb_agg(to_jsonb(x)) from public.files_access(array[%L]::uuid[]) x$q$, pg_temp.id('f_before'))))), '0') || '/' || coalesce((select count(*)::text from jsonb_array_elements(pg_temp.as_('owner', format($q$select jsonb_agg(to_jsonb(x)) from public.files_access(array[%L, %L]::uuid[]) x$q$, pg_temp.id('f_pdf'), pg_temp.id('f_jpg_pending'))))), '0'), '0/0');
  perform pg_temp.chk('files_access: anon has no EXECUTE', pg_temp.as_anon(format($q$select to_jsonb(count(*)) from public.files_access(array[%L]::uuid[])$q$, pg_temp.id('f_before')))->>'state', '42501');
  r := pg_temp.as_('owner', format($q$select public.list_client_files(%L, null, 1)$q$, pg_temp.id('c1')));
  perform pg_temp.chk('list_client_files: page of 1, has_more, newest first, NO path in the payload', (jsonb_array_length(r->'rows'))::text || '/' || (r->>'has_more') || '/' || (r->'rows'->0 ? 'storage_path')::text, '1/true/false');
  perform pg_temp.chk('list_client_files: appointment filter', jsonb_array_length(pg_temp.as_('owner', format($q$select public.list_client_files(%L, %L)$q$, pg_temp.id('c1'), pg_temp.id('ap1')))->'rows')::text, '1');
  perform pg_temp.chk('list_client_files: staff A on c2 / other business / stranger refused', (pg_temp.as_('staffa', format($q$select public.list_client_files(%L)$q$, pg_temp.id('c2')))->>'code') || (pg_temp.as_('ownerb', format($q$select public.list_client_files(%L)$q$, pg_temp.id('c1')))->>'code') || (pg_temp.as_('stranger', format($q$select public.list_client_files(%L)$q$, pg_temp.id('c1')))->>'code'), 'forbiddenforbiddenforbidden');
end $$;

-- ===========================================================================
-- 6. Delete (soft, audited) and the per-business cap
-- ===========================================================================
do $$
declare v_n int;
begin
  perform pg_temp.chk('delete: staff A cannot delete a file of a colleague''s client', pg_temp.as_('staffa', format($q$select public.delete_file(%L)$q$, pg_temp.id('f_c2pdf')))->>'code', 'forbidden');
  perform pg_temp.chk('delete: other business refused, anon no EXECUTE', (pg_temp.as_('ownerb', format($q$select public.delete_file(%L)$q$, pg_temp.id('f_before')))->>'code') || (pg_temp.as_anon(format($q$select public.delete_file(%L)$q$, pg_temp.id('f_before')))->>'state'), 'forbidden42501');
  perform pg_temp.chk('delete: staff A deletes a file of THEIR OWN client', pg_temp.as_('staffa', format($q$select public.delete_file(%L, 'wrong photo')$q$, pg_temp.id('f_after')))->>'ok', 'true');
  perform pg_temp.chk('stored: soft delete only (row kept, deleted_by), audited with the reason', (select concat_ws('|', deleted_at is not null, deleted_by = pg_temp.id('staffa'), status) from public.files where id = pg_temp.id('f_after')) || '/' || pg_temp.audit_n('file.deleted') || '/' || (select after->>'reason' from public.audit_logs where action = 'file.deleted'), 't|t|ready/1/wrong photo');
  perform pg_temp.chk('a deleted file is gone from the list and no URL can be minted', pg_temp.fcount('owner', format('id = %L', pg_temp.id('f_after'))) || '/' || coalesce((select count(*)::text from jsonb_array_elements(pg_temp.as_('owner', format($q$select jsonb_agg(to_jsonb(x)) from public.files_access(array[%L]::uuid[]) x$q$, pg_temp.id('f_after'))))), '0'), '0/0');
  perform pg_temp.chk('...and cannot be deleted twice', pg_temp.as_('owner', format($q$select public.delete_file(%L)$q$, pg_temp.id('f_after')))->>'code', 'not_found');
  -- cap: 5000 live files per business
  select count(*) into v_n from public.files where business_id = pg_temp.id('biza') and deleted_at is null and (status = 'ready' or (status = 'pending' and created_at > now() - interval '1 hour'));
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status)
  select pg_temp.id('biza'), pg_temp.id('c1'), 'photo', 'other', 'cap/' || g, 'cap.jpg', 'image/jpeg', 10, 'ready' from generate_series(1, 4999 - v_n) g;
  perform pg_temp.chk('(setup) exactly 4999 live files', (select count(*)::text from public.files where business_id = pg_temp.id('biza') and deleted_at is null and (status = 'ready' or (status = 'pending' and created_at > now() - interval '1 hour'))), '4999');
  perform pg_temp.chk('the 5000th upload is allowed', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'other', 'n.jpg', 'image/jpeg', 10)$q$, pg_temp.id('c1')))->>'ok', 'true');
  perform pg_temp.chk('the 5001st is refused: file_cap_reached', pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'other', 'n.jpg', 'image/jpeg', 10)$q$, pg_temp.id('c1')))->>'code', 'file_cap_reached');
  delete from public.files where storage_path like 'cap/%';
  update public.files set status = 'rejected' where status = 'pending' and business_id = pg_temp.id('biza');
end $$;

-- ===========================================================================
-- 7. Forms: templates and versions
-- ===========================================================================
create or replace function pg_temp.savef(p_user text, p_args text) returns jsonb language sql as $$
  select pg_temp.as_(p_user, 'select public.save_form_template(' || p_args || ')')
$$;
do $$
declare r jsonb; v_args text; v_fields text;
begin
  v_fields := $f$[{"id":"allergy","type":"long_text","label":"Allergies","required":false,"sensitive":true},{"id":"age18","type":"yes_no","label":"I am over 18","required":true},{"id":"skin","type":"dropdown","label":"Skin type","options":["Dry","Oily"],"required":false},{"id":"weight","type":"number","label":"Weight (kg)"}]$f$;
  v_args := format($a$%L, null, 'consent', 'Tattoo consent', %L::jsonb, '[{"type":"heading","text":"Consent"},{"type":"paragraph","text":"I agree to the procedure."},{"type":"bullet","text":"Aftercare was explained"}]'::jsonb, true, array[%L]::uuid[], true$a$, pg_temp.id('biza'), v_fields, pg_temp.id('svc'));
  perform pg_temp.chk('save_form_template: receptionist, staff, other business, stranger refused', (pg_temp.savef('recep', v_args)->>'code') || (pg_temp.savef('staffa', v_args)->>'code') || (pg_temp.savef('ownerb', v_args)->>'code') || (pg_temp.savef('stranger', v_args)->>'code'), 'forbiddenforbiddenforbiddenforbidden');
  perform pg_temp.chk('...anon has no EXECUTE; nothing stored', (pg_temp.as_anon(format($q$select public.save_form_template(%L, null, 'consent', 't', '[]', '[]', true, '{}', true)$q$, pg_temp.id('biza')))->>'state') || '/' || (select count(*)::text from public.form_templates), '42501/0');
  perform pg_temp.chk('invalid field type', pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[{"type":"date","label":"x"}]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code', 'invalid_field_type');
  perform pg_temp.chk('dropdown needs 2+ unique options', (pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[{"type":"dropdown","label":"x","options":["a"]}]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code') || (pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[{"type":"dropdown","label":"x","options":["a","a"]}]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code'), 'invalid_optionsinvalid_options');
  perform pg_temp.chk('duplicate field ids / empty label', (pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[{"id":"a","type":"short_text","label":"x"},{"id":"a","type":"short_text","label":"y"}]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code') || (pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[{"type":"short_text","label":" "}]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code'), 'invalid_field_idinvalid_field_label');
  perform pg_temp.chk('consent body is plain blocks only (html / unknown type refused)', pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[]'::jsonb, '[{"type":"html","text":"<script>x</script>"}]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code', 'invalid_body');
  perform pg_temp.chk('unknown / other business service; bad kind; bad title', (pg_temp.savef('owner', format($a$%L, null, 'consent', 'T', '[]'::jsonb, '[]'::jsonb, true, array[%L]::uuid[], true$a$, pg_temp.id('biza'), pg_temp.id('svcb')))->>'code') || (pg_temp.savef('owner', format($a$%L, null, 'waiver', 'T', '[]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code') || (pg_temp.savef('owner', format($a$%L, null, 'consent', '  ', '[]'::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('biza')))->>'code'), 'unknown_serviceinvalid_kindinvalid_title');
  perform pg_temp.chk('...none of the invalid calls stored a template', (select count(*)::text from public.form_templates), '0');
  r := pg_temp.savef('mgr', v_args);
  perform pg_temp.chk('manager (forms.manage, covers the only branch) creates a template', (r->>'ok') || '/' || (r->>'version'), 'true/1');
  insert into ids values ('t1', (r->>'template_id')::uuid), ('v1', (r->>'version_id')::uuid);
  perform pg_temp.chk('stored version: kind, title, 4 fields, 3 body blocks, requires signature, digest', (select concat_ws('|', kind, title, jsonb_array_length(fields), jsonb_array_length(body), requires_signature, length(digest)) from public.form_template_versions where id = pg_temp.id('v1')), 'consent|Tattoo consent|4|3|t|64');
  perform pg_temp.chk('service attachment stored', (select count(*)::text from public.form_template_services where template_id = pg_temp.id('t1') and service_id = pg_temp.id('svc')), '1');
  r := pg_temp.savef('owner', format($a$null, %L, 'consent', 'Tattoo consent', %L::jsonb, '[{"type":"heading","text":"Consent"},{"type":"paragraph","text":"I agree to the procedure."},{"type":"bullet","text":"Aftercare was explained"}]'::jsonb, true, array[%L]::uuid[], true$a$, pg_temp.id('t1'), v_fields, pg_temp.id('svc')));
  perform pg_temp.chk('saving the SAME content creates NO new version', (r->>'new_version') || '/' || (select count(*)::text from public.form_template_versions where template_id = pg_temp.id('t1')), 'false/1');
  r := pg_temp.savef('owner', format($a$null, %L, 'consent', 'Tattoo consent', %L::jsonb, '[{"type":"paragraph","text":"Changed wording."}]'::jsonb, true, array[%L]::uuid[], true$a$, pg_temp.id('t1'), v_fields, pg_temp.id('svc')));
  perform pg_temp.chk('changed content = a NEW version 2; version 1 is untouched', (r->>'version') || '/' || (select count(*)::text from public.form_template_versions where template_id = pg_temp.id('t1')) || '/' || (select jsonb_array_length(body)::text from public.form_template_versions where id = pg_temp.id('v1')), '2/2/3');
  insert into ids values ('v2', (r->>'version_id')::uuid);
  perform pg_temp.chk('versions are immutable even for postgres', pg_temp.try(format($q$update public.form_template_versions set title = 'x' where id = %L$q$, pg_temp.id('v1'))) || '/' || pg_temp.try(format($q$delete from public.form_template_versions where id = %L$q$, pg_temp.id('v1'))), '23514/23514');
  perform pg_temp.chk('the kind can never change after creation', pg_temp.savef('owner', format($a$null, %L, 'intake', 'Tattoo consent', %L::jsonb, '[]'::jsonb, true, '{}', true$a$, pg_temp.id('t1'), v_fields))->>'ok' || '/' || (select kind from public.form_templates where id = pg_temp.id('t1')), 'true/consent');
  -- put the full body back as version 3 for the signing tests
  r := pg_temp.savef('owner', format($a$null, %L, 'consent', 'Tattoo consent', %L::jsonb, '[{"type":"paragraph","text":"I agree to the procedure."}]'::jsonb, true, array[%L]::uuid[], true$a$, pg_temp.id('t1'), v_fields, pg_temp.id('svc')));
  insert into ids values ('v3', (r->>'version_id')::uuid);
  perform pg_temp.chk('RLS templates: owner / receptionist / staff A see them; other business and a stranger do not', pg_temp.vis('owner', 'select 1 from public.form_templates') || pg_temp.vis('recep', 'select 1 from public.form_templates') || pg_temp.vis('staffa', 'select 1 from public.form_templates') || '/' || pg_temp.vis('ownerb', 'select 1 from public.form_templates') || pg_temp.vis('stranger', 'select 1 from public.form_template_versions'), '111/00');
  perform pg_temp.chk('audit: form.created + form.updated', pg_temp.audit_n('form.created') || '/' || pg_temp.audit_n('form.updated'), '1/4');
end $$;

-- ===========================================================================
-- 8. Signing on the device (dashboard)
-- ===========================================================================
create or replace function pg_temp.rec(p_user text, p_client text, p_appt text, p_answers text, p_name text, p_sig text) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format($q$select public.record_signed_consent(%L, %L, %L, %L::jsonb, %L, %L::jsonb)$q$, pg_temp.id(p_client), case when p_appt is null then null else pg_temp.id(p_appt) end, pg_temp.id('t1'), p_answers, p_name, p_sig))
$$;
do $$
declare r jsonb; v_sig text := '[[[0.1,0.2],[0.5,0.6],[0.9,0.4]],[[0.2,0.8],[0.3,0.9]]]'; v_ok text := '{"age18":true,"allergy":"penicillin","skin":"Dry","weight":72.5}';
begin
  perform pg_temp.chk('forms: appointment_forms shows the attached template as PENDING (service Tattoo)', (pg_temp.as_('recep', format($q$select public.appointment_forms(%L)$q$, pg_temp.id('ap1')))->'rows'->0->>'status') || '/' || (pg_temp.as_('recep', format($q$select public.appointment_forms(%L)$q$, pg_temp.id('ap3')))->'rows')::text, 'pending/[]');
  perform pg_temp.chk('sign: a manager-less case: staff B (colleague) cannot sign for c1; staff A on c2 cannot; other business / stranger / anon refused', (pg_temp.rec('staffb', 'c1', null, v_ok, 'Client One', v_sig)->>'code') || (pg_temp.rec('staffa', 'c2', null, v_ok, 'Client Two', v_sig)->>'code') || (pg_temp.rec('ownerb', 'c1', null, v_ok, 'Client One', v_sig)->>'code') || (pg_temp.rec('stranger', 'c1', null, v_ok, 'Client One', v_sig)->>'code') || (pg_temp.as_anon(format($q$select public.record_signed_consent(%L, null, %L, '{}', 'Client One', null)$q$, pg_temp.id('c1'), pg_temp.id('t1')))->>'state'), 'forbiddenforbiddenforbiddenforbidden42501');
  perform pg_temp.chk('...nothing stored by refusals', (select count(*)::text from public.signed_consents), '0');
  perform pg_temp.chk('missing required answer names the field', (pg_temp.rec('recep', 'c1', null, '{"allergy":"x"}', 'Client One', v_sig)->>'code') || '/' || (pg_temp.rec('recep', 'c1', null, '{"allergy":"x"}', 'Client One', v_sig)->>'field_id'), 'missing_answer/age18');
  perform pg_temp.chk('wrong types / unknown field / dropdown outside the options', (pg_temp.rec('recep', 'c1', null, '{"age18":"yes"}', 'Client One', v_sig)->>'code') || (pg_temp.rec('recep', 'c1', null, '{"age18":true,"nope":1}', 'Client One', v_sig)->>'code') || (pg_temp.rec('recep', 'c1', null, '{"age18":true,"skin":"Green"}', 'Client One', v_sig)->>'code') || (pg_temp.rec('recep', 'c1', null, '{"age18":true,"weight":"heavy"}', 'Client One', v_sig)->>'code'), 'invalid_answerinvalid_answerinvalid_answerinvalid_answer');
  perform pg_temp.chk('signature required / invalid points / too short a name', (pg_temp.rec('recep', 'c1', null, v_ok, 'Client One', null)->>'code') || (pg_temp.rec('recep', 'c1', null, v_ok, 'Client One', '[[[1.5,0.2]]]')->>'code') || (pg_temp.rec('recep', 'c1', null, v_ok, 'Client One', '"scribble"')->>'code') || (pg_temp.rec('recep', 'c1', null, v_ok, 'X', v_sig)->>'code'), 'signature_requiredinvalid_signatureinvalid_signatureinvalid_name');
  perform pg_temp.chk('an appointment of another client', pg_temp.rec('recep', 'c1', 'ap2', v_ok, 'Client One', v_sig)->>'code', 'appointment_mismatch');
  perform pg_temp.chk('...still nothing stored after every failure path', (select count(*)::text from public.signed_consents), '0');
  r := pg_temp.rec('staffa', 'c1', 'ap1', v_ok, 'Client One', v_sig);
  perform pg_temp.chk('staff A (appointments.edit, OWN client) signs on the device', r->>'ok', 'true');
  insert into ids values ('sc1', (r->>'signed_consent_id')::uuid);
  perform pg_temp.chk('stored: LATEST version (v3), answers normalised, name, via, captured_by, appointment, strokes kept, no ip', (select concat_ws('|', template_version_id = pg_temp.id('v3'), answers->>'age18', answers->>'weight', answers->>'skin', signer_name, signed_via, captured_by = pg_temp.id('staffa'), appointment_id = pg_temp.id('ap1'), jsonb_array_length(signature), jsonb_array_length(signature->0), ip_hash is null) from public.signed_consents where id = pg_temp.id('sc1')), 't|true|72.5|Dry|Client One|dashboard|t|t|2|3|t');
  perform pg_temp.chk('audit: form.signed', pg_temp.audit_n('form.signed'), '1');
  perform pg_temp.chk('signed copy is immutable for everyone, postgres included', pg_temp.try(format($q$update public.signed_consents set signer_name = 'Tampered' where id = %L$q$, pg_temp.id('sc1'))) || '/' || pg_temp.try(format($q$delete from public.signed_consents where id = %L$q$, pg_temp.id('sc1'))), '23514/23514');
  perform pg_temp.chk('the table is unreadable and unwritable through the API', pg_temp.try_as('owner', 'select * from public.signed_consents') || '/' || pg_temp.try_as('owner', format($q$delete from public.signed_consents where id = %L$q$, pg_temp.id('sc1'))), '42501/42501');
  perform pg_temp.chk('appointment_forms now shows SIGNED for that client', (pg_temp.as_('recep', format($q$select public.appointment_forms(%L)$q$, pg_temp.id('ap1')))->'rows'->0->>'status'), 'signed');
  -- sensitive answers
  perform pg_temp.chk('get_signed_consent: the RECEPTIONIST (no clients.view_sensitive) gets the sensitive answer REDACTED, the rest visible', (select concat_ws('|', (a->>'value') is null, a->>'redacted') from jsonb_array_elements(pg_temp.as_('recep', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->'answers') a where a->>'field_id' = 'allergy') || '/' || (select a->>'value' from jsonb_array_elements(pg_temp.as_('recep', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->'answers') a where a->>'field_id' = 'skin'), 't|true/Dry');
  perform pg_temp.chk('...the owner and staff A (view_sensitive on their own client) see it', (select a->>'value' from jsonb_array_elements(pg_temp.as_('owner', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->'answers') a where a->>'field_id' = 'allergy') || '/' || (select a->>'value' from jsonb_array_elements(pg_temp.as_('staffa', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->'answers') a where a->>'field_id' = 'allergy'), 'penicillin/penicillin');
  perform pg_temp.chk('...the redacted value appears NOWHERE in the receptionist''s payload', (position('penicillin' in pg_temp.as_('recep', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))::text) = 0)::text, 'true');
  perform pg_temp.chk('get / list: staff B, other business, stranger refused', (pg_temp.as_('staffb', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->>'code') || (pg_temp.as_('ownerb', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->>'code') || (pg_temp.as_('stranger', format($q$select public.list_signed_consents(%L)$q$, pg_temp.id('c1')))->>'code'), 'forbiddenforbiddenforbidden');
  perform pg_temp.chk('list_signed_consents: one row, with title/version/signer, no answers key', jsonb_array_length(pg_temp.as_('recep', format($q$select public.list_signed_consents(%L)$q$, pg_temp.id('c1')))->'rows')::text || '/' || ((pg_temp.as_('recep', format($q$select public.list_signed_consents(%L)$q$, pg_temp.id('c1')))->'rows'->0) ? 'answers')::text, '1/false');
  -- void
  perform pg_temp.chk('void: receptionist / staff refused; reason required', (pg_temp.as_('recep', format($q$select public.void_signed_consent(%L, 'mistake made')$q$, pg_temp.id('sc1')))->>'code') || (pg_temp.as_('mgr', format($q$select public.void_signed_consent(%L, 'no')$q$, pg_temp.id('sc1')))->>'code'), 'forbiddenreason_required');
  perform pg_temp.chk('void: the manager voids it (a NEW row)', pg_temp.as_('mgr', format($q$select public.void_signed_consent(%L, 'Signed on the wrong client')$q$, pg_temp.id('sc1')))->>'ok', 'true');
  perform pg_temp.chk('stored: void row + the signed copy itself UNCHANGED + audit', (select concat_ws('|', reason, voided_by = pg_temp.id('mgr')) from public.signed_consent_voids where signed_consent_id = pg_temp.id('sc1')) || '/' || (select signer_name from public.signed_consents where id = pg_temp.id('sc1')) || '/' || pg_temp.audit_n('form.voided'), 'Signed on the wrong client|t/Client One/1');
  perform pg_temp.chk('void twice refused; void rows are immutable', (pg_temp.as_('mgr', format($q$select public.void_signed_consent(%L, 'again please')$q$, pg_temp.id('sc1')))->>'code') || '/' || pg_temp.try(format($q$delete from public.signed_consent_voids where signed_consent_id = %L$q$, pg_temp.id('sc1'))), 'already_voided/23514');
  perform pg_temp.chk('a voided copy shows as voided in the list, and the form is PENDING again', (pg_temp.as_('owner', format($q$select public.list_signed_consents(%L)$q$, pg_temp.id('c1')))->'rows'->0->>'void_reason') || '/' || (pg_temp.as_('recep', format($q$select public.appointment_forms(%L)$q$, pg_temp.id('ap1')))->'rows'->0->>'status'), 'Signed on the wrong client/pending');
end $$;

-- ===========================================================================
-- 9. The public link: create, read, submit, replay, expiry
-- ===========================================================================
do $$
declare r jsonb; v_tok text; v_tok2 text; v_req uuid; r2 jsonb;
begin
  perform pg_temp.chk('create_form_request: staff B / other business / anon refused', (pg_temp.as_('staffb', format($q$select public.create_form_request(%L, null, %L, true)$q$, pg_temp.id('c1'), pg_temp.id('t1')))->>'code') || (pg_temp.as_('ownerb', format($q$select public.create_form_request(%L, null, %L, true)$q$, pg_temp.id('c1'), pg_temp.id('t1')))->>'code') || (pg_temp.as_anon(format($q$select public.create_form_request(%L, null, %L, true)$q$, pg_temp.id('c1'), pg_temp.id('t1')))->>'state'), 'forbiddenforbidden42501');
  r := pg_temp.as_('recep', format($q$select public.create_form_request(%L, %L, %L, true)$q$, pg_temp.id('c1'), pg_temp.id('ap1'), pg_temp.id('t1')));
  perform pg_temp.chk('create_form_request: ok, 64-hex token returned once, email queued', (r->>'ok') || '/' || ((r->>'token') ~ '^[0-9a-f]{64}$')::text || '/' || (r->>'queued'), 'true/true/true');
  v_tok := r->>'token'; v_req := (r->>'request_id')::uuid; insert into ids values ('req1', v_req);
  perform pg_temp.chk('stored: ONLY the sha256 of the token, ~14 days expiry, unused, appointment link, latest version', (select concat_ws('|', token_hash = encode(extensions.digest(v_tok, 'sha256'), 'hex'), token_hash <> v_tok, expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', used_at is null, revoked_at is null, appointment_id = pg_temp.id('ap1'), template_version_id = pg_temp.id('v3')) from public.form_requests where id = v_req), 't|t|t|t|t|t|t');
  perform pg_temp.chk('outbox: a form_request email for the client with the token SEALED, never in the payload', (select concat_ws('|', event, channel, status, sealed is not null, (payload ? 'token')::text, payload->>'request_id' = v_req::text, client_id = pg_temp.id('c1')) from public.message_outbox where event = 'form_request'), 'form_request|email|pending|t|false|t|t');
  perform pg_temp.chk('the token appears nowhere in the audit log or the outbox payload', (select count(*)::text from public.audit_logs where (before::text || after::text) like '%' || v_tok || '%') || '/' || (select count(*)::text from public.message_outbox where payload::text like '%' || v_tok || '%'), '0/0');
  -- public read
  perform pg_temp.chk('get_form_request: NOT callable by authenticated or anon', (select has_function_privilege('authenticated', 'public.get_form_request(text)', 'execute') or has_function_privilege('anon', 'public.get_form_request(text)', 'execute') or has_function_privilege('authenticated', 'public.submit_form_request(text,jsonb,text,jsonb,text)', 'execute'))::text, 'false');
  r2 := pg_temp.svc(format($q$select public.get_form_request(%L)$q$, v_tok));
  perform pg_temp.chk('get_form_request: title, first name only, fields WITHOUT the sensitive flag', (r2->>'ok') || '/' || (r2->>'title') || '/' || (r2->>'client_first_name') || '/' || ((r2->'fields'->0) ? 'sensitive')::text || '/' || jsonb_array_length(r2->'fields')::text, 'true/Tattoo consent/Client/false/4');
  perform pg_temp.chk('...no phone, email, ids or business id leak into the page payload', (position('one@example.com' in r2::text) = 0 and position(pg_temp.id('c1')::text in r2::text) = 0 and position(pg_temp.id('biza')::text in r2::text) = 0)::text, 'true');
  perform pg_temp.chk('get_form_request: unknown / short / null token => the SAME invalid_token', (pg_temp.svc($q$select public.get_form_request('nope')$q$)->>'code') || (pg_temp.svc($q$select public.get_form_request(null)$q$)->>'code') || (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, repeat('a', 64)))->>'code'), 'invalid_tokeninvalid_tokeninvalid_token');
  -- submit failures leave the link usable
  perform pg_temp.chk('submit: missing answer / bad signature / short name each return a code', (pg_temp.svc(format($q$select public.submit_form_request(%L, '{}', 'Client One', '[[[0.1,0.1]]]', 'iphash')$q$, v_tok))->>'code') || (pg_temp.svc(format($q$select public.submit_form_request(%L, '{"age18":true}', 'Client One', null, 'iphash')$q$, v_tok))->>'code') || (pg_temp.svc(format($q$select public.submit_form_request(%L, '{"age18":true}', 'C', '[[[0.1,0.1]]]', 'iphash')$q$, v_tok))->>'code'), 'missing_answersignature_requiredinvalid_name');
  perform pg_temp.chk('...after failed submits the link is UNUSED and nothing was signed', (select (used_at is null)::text from public.form_requests where id = v_req) || '/' || (select count(*)::text from public.signed_consents where request_id = v_req), 'true/0');
  r2 := pg_temp.svc(format($q$select public.submit_form_request(%L, '{"age18":true,"allergy":"nuts"}', 'Client One', '[[[0.1,0.1],[0.4,0.5]]]', 'iphash')$q$, v_tok));
  perform pg_temp.chk('submit: ok', r2->>'ok', 'true');
  perform pg_temp.chk('stored: via link, ip hash, no staff, request link, appointment, the link is now USED', (select concat_ws('|', signed_via, ip_hash, captured_by is null, request_id = v_req, appointment_id = pg_temp.id('ap1'), template_version_id = pg_temp.id('v3'), answers->>'allergy') from public.signed_consents where request_id = v_req) || '/' || (select (used_at is not null)::text from public.form_requests where id = v_req), 'link|iphash|t|t|t|t|nuts/true');
  perform pg_temp.chk('audit: form.signed via link, with NO actor (the client)', (select concat_ws('|', actor_user_id is null, after->>'via') from public.audit_logs where action = 'form.signed' and after->>'via' = 'link'), 't|link');
  perform pg_temp.chk('REPLAY: the same token again => invalid_token, still ONE signed copy', (pg_temp.svc(format($q$select public.submit_form_request(%L, '{"age18":true}', 'Client One', '[[[0.1,0.1]]]', 'iphash')$q$, v_tok))->>'code') || '/' || (select count(*)::text from public.signed_consents where request_id = v_req), 'invalid_token/1');
  perform pg_temp.chk('...and the used link can no longer be READ', pg_temp.svc(format($q$select public.get_form_request(%L)$q$, v_tok))->>'code', 'invalid_token');
  perform pg_temp.chk('a request row cannot be un-used or deleted, even by postgres', pg_temp.try(format($q$update public.form_requests set used_at = null where id = %L$q$, v_req)) || '/' || pg_temp.try(format($q$delete from public.form_requests where id = %L$q$, v_req)) || '/' || pg_temp.try(format($q$update public.form_requests set token_hash = repeat('b', 64) where id = %L$q$, v_req)), '23514/23514/23514');
  -- expiry, revoke on re-issue, template deletion
  r := pg_temp.as_('recep', format($q$select public.create_form_request(%L, null, %L, false)$q$, pg_temp.id('c1'), pg_temp.id('t1')));
  v_tok2 := r->>'token';
  perform pg_temp.chk('create without sending: nothing queued', (r->>'queued') || '/' || (select count(*)::text from public.message_outbox where event = 'form_request'), 'false/1');
  update public.form_requests set expires_at = now() - interval '1 second' where token_hash = encode(extensions.digest(v_tok2, 'sha256'), 'hex') and false;
  perform set_config('wapee.tmp', '1', true);
  alter table public.form_requests disable trigger form_requests_guard;
  update public.form_requests set expires_at = now() - interval '1 second' where token_hash = encode(extensions.digest(v_tok2, 'sha256'), 'hex');
  alter table public.form_requests enable trigger form_requests_guard;
  perform pg_temp.chk('EXPIRED link: read and submit => invalid_token, nothing signed', (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, v_tok2))->>'code') || (pg_temp.svc(format($q$select public.submit_form_request(%L, '{"age18":true}', 'Client One', '[[[0.1,0.1]]]', 'h')$q$, v_tok2))->>'code') || '/' || (select count(*)::text from public.signed_consents), 'invalid_tokeninvalid_token/2');
  r := pg_temp.as_('recep', format($q$select public.create_form_request(%L, null, %L, false)$q$, pg_temp.id('c1'), pg_temp.id('t1')));
  v_tok := r->>'token';
  r2 := pg_temp.as_('recep', format($q$select public.create_form_request(%L, null, %L, false)$q$, pg_temp.id('c1'), pg_temp.id('t1')));
  perform pg_temp.chk('issuing a new link REVOKES the older open one', (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, v_tok))->>'code') || '/' || (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, r2->>'token'))->>'ok'), 'invalid_token/true');
  perform pg_temp.chk('deleting the template: ok', pg_temp.as_('mgr', format($q$select public.delete_form_template(%L)$q$, pg_temp.id('t1')))->>'ok', 'true');
  perform pg_temp.chk('...its open links are revoked, it is soft-deleted and audited', (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, r2->>'token'))->>'code') || '/' || (select (deleted_at is not null)::text from public.form_templates where id = pg_temp.id('t1')) || '/' || pg_temp.audit_n('form.deleted'), 'invalid_token/true/1');
  perform pg_temp.chk('...signed copies of a deleted template stay readable', pg_temp.as_('owner', format($q$select public.get_signed_consent(%L)$q$, pg_temp.id('sc1')))->>'ok', 'true');
  perform pg_temp.chk('no new signing on a deleted template (dashboard)', pg_temp.rec('recep', 'c1', null, '{"age18":true}', 'Client One', '[[[0.1,0.1]]]')->>'code', 'not_found');
end $$;

-- ===========================================================================
-- 10. Add-on OFF / ON and plan gating
-- ===========================================================================
do $$
declare r jsonb;
begin
  r := pg_temp.savef('owner', format($a$%L, null, 'intake', 'Intake', '[{"id":"q","type":"short_text","label":"Why?"}]'::jsonb, '[]'::jsonb, false, array[%L]::uuid[], true$a$, pg_temp.id('biza'), pg_temp.id('svc')));
  insert into ids values ('t2', (r->>'template_id')::uuid);
  update public.business_subscriptions set status = 'active', plan = 'team', trial_ends_at = null where business_id = pg_temp.id('biza');
  perform pg_temp.chk('plan Team without add-ons: both features OFF', public.business_has_feature(pg_temp.id('biza'), 'files_photos')::text || public.business_has_feature(pg_temp.id('biza'), 'forms_consent')::text, 'falsefalse');
  perform pg_temp.chk('files RPCs refuse: feature_unavailable', (pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'other', 'a.pdf', 'application/pdf', 10)$q$, pg_temp.id('c1')))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.set_photo_consent(%L, false)$q$, pg_temp.id('c1')))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.delete_file(%L)$q$, pg_temp.id('f_before')))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.get_client_files_state(%L)$q$, pg_temp.id('c1')))->>'code'), 'feature_unavailable/feature_unavailable/feature_unavailable/feature_unavailable');
  perform pg_temp.chk('...a ready file can no longer be listed, viewed or seen in the table', pg_temp.fcount('owner', 'true') || '/' || coalesce((select count(*)::text from jsonb_array_elements(pg_temp.as_('owner', format($q$select jsonb_agg(to_jsonb(x)) from public.files_access(array[%L]::uuid[]) x$q$, pg_temp.id('f_before'))))), '0') || '/' || (pg_temp.as_('owner', format($q$select public.list_client_files(%L)$q$, pg_temp.id('c1')))->>'code'), '0/0/forbidden');
  perform pg_temp.chk('forms RPCs refuse: feature_unavailable', (pg_temp.savef('owner', format($a$null, %L, 'intake', 'Off', '[]'::jsonb, '[]'::jsonb, false, '{}', true$a$, pg_temp.id('t2')))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.record_signed_consent(%L, null, %L, '{}', 'Client One', null)$q$, pg_temp.id('c1'), pg_temp.id('t2')))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.create_form_request(%L, null, %L, false)$q$, pg_temp.id('c1'), pg_temp.id('t2')))->>'code') || '/' || (pg_temp.as_('mgr', format($q$select public.void_signed_consent(%L, 'turned off')$q$, pg_temp.id('sc1')))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.list_signed_consents(%L)$q$, pg_temp.id('c1')))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.appointment_forms(%L)$q$, pg_temp.id('ap1')))->>'code'), 'feature_unavailable/feature_unavailable/feature_unavailable/feature_unavailable/feature_unavailable/feature_unavailable');
  perform pg_temp.chk('...templates are hidden by RLS for everyone, even the owner', pg_temp.vis('owner', 'select 1 from public.form_templates'), '0');
  r := pg_temp.as_('recep', format($q$select public.create_form_request(%L, null, %L, false)$q$, pg_temp.id('c1'), pg_temp.id('t2')));
  insert into public.business_addons (business_id, addon_key, enabled) values (pg_temp.id('biza'), 'forms_consent', true);
  r := pg_temp.as_('recep', format($q$select public.create_form_request(%L, null, %L, false)$q$, pg_temp.id('c1'), pg_temp.id('t2')));
  perform pg_temp.chk('forms ON: a link can be created again and read publicly', (r->>'ok') || '/' || (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, r->>'token'))->>'ok'), 'true/true');
  insert into public.business_addons (business_id, addon_key, enabled) values (pg_temp.id('biza'), 'files_photos', true);
  perform pg_temp.chk('files ON again: the earlier file is visible again (nothing was lost while off)', pg_temp.fcount('owner', 'true'), '2');
  alter table public.form_requests disable trigger form_requests_guard;
  update public.business_addons set enabled = false where business_id = pg_temp.id('biza') and addon_key = 'forms_consent';
  alter table public.form_requests enable trigger form_requests_guard;
  perform pg_temp.chk('forms OFF again: an already-issued link stops working publicly', pg_temp.svc(format($q$select public.get_form_request(%L)$q$, r->>'token'))->>'code', 'invalid_token');
  update public.business_addons set enabled = true where business_id = pg_temp.id('biza') and addon_key = 'forms_consent';
  update public.business_subscriptions set status = 'inactive' where business_id = pg_temp.id('biza');
  perform pg_temp.chk('an inactive business: public link refused and uploads refused', (pg_temp.svc(format($q$select public.get_form_request(%L)$q$, r->>'token'))->>'code') || '/' || (pg_temp.as_('recep', format($q$select public.files_prepare_upload(%L, null, 'other', 'a.pdf', 'application/pdf', 10)$q$, pg_temp.id('c1')))->>'code'), 'invalid_token/forbidden');
  update public.business_subscriptions set status = 'active', plan = 'team' where business_id = pg_temp.id('biza');
end $$;

-- ===========================================================================
-- 11. The email: outbox guard + business delete
-- ===========================================================================
do $$
declare v_row uuid; v_biz uuid := pg_temp.id('biza');
begin
  select id into v_row from public.message_outbox where event = 'form_request' order by created_at limit 1;
  perform pg_temp.chk('outbox_guard: the first queued link was already USED => stale (never emailed)', public.outbox_guard(v_row), 'stale');
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business: cascades through files, forms, requests and signed copies', pg_temp.try(format($q$delete from public.businesses where id = %L$q$, v_biz)), 'ok');
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('...nothing left of them', (select count(*)::text from public.files where business_id = v_biz) || (select count(*)::text from public.signed_consents where business_id = v_biz) || (select count(*)::text from public.form_requests where business_id = v_biz) || (select count(*)::text from public.form_template_versions where business_id = v_biz) || (select count(*)::text from public.client_consents where business_id = v_biz), '00000');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
