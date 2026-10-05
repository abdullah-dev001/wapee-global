-- Phase 7A: website, reviews, widget keys, website-assets bucket.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/16_website_reviews_widget.sql
--
-- Plain SQL, not pgTAP (no Docker; see context/_handoff.md). Builds its own
-- fixtures (real auth.users rows, two businesses, every system role) and rolls
-- everything back. The last query returns the totals; the one before lists
-- failures.
--
-- Covered: RLS per role (owner, manager, receptionist, staff at Own, other
-- business, anon = nothing) on every new table; failure-path survival for
-- every mutating RPC; review-token expiry / replay / invalid / reissue (old
-- token dead); one review per appointment; review only after Completed
-- (reopen kills the request); section content validation; unpublished and
-- inactive businesses not leaking; widget origin check; assets bucket policies;
-- stored-value assertions; audit rows; business-delete cascade.

begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create temporary table tok (k text primary key, v text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.t(text) returns text language sql as $$ select v from tok where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;

-- Run a scalar SQL expression as postgres, text result (errors become 'ERR:<state>').
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare r text;
begin execute p_sql into r; return r;
exception when others then return 'ERR:' || sqlstate; end $$;

-- Run SQL (returning one jsonb) as a signed-in user; errors -> {"error": sqlstate}.
create or replace function pg_temp.call_as(p_user uuid, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql into r;
  reset role;
  return r;
exception when others then
  reset role;
  return jsonb_build_object('error', sqlstate);
end $$;

create or replace function pg_temp.call_anon(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  execute p_sql into r;
  reset role;
  return r;
exception when others then
  reset role;
  return jsonb_build_object('error', sqlstate);
end $$;

create or replace function pg_temp.cnt(p_user uuid, p_table text, p_where text default 'true') returns int language sql as $$
  select (pg_temp.call_as(p_user, format('select jsonb_build_object(''n'', count(*)) from %s where %s', p_table, p_where)) ->> 'n')::int
$$;

create or replace function pg_temp.slot(p_hour int, p_weeks int default 2)
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Europe/London')::date + (p_weeks*7) + 1)::date)::timestamp
          + make_interval(hours => p_hour)) at time zone 'Europe/London';
$$;

-- ---------------------------------------------------------------------------
-- Users, businesses, roles, catalogue
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'), ('manager'), ('recep'), ('staffa'), ('staffb'), ('ownerb')) as x(k)
  loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p7.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

do $$
declare v_biz uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P7 A','p7-a','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biza', v_biz);

  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('ownerb'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P7 B','p7-b','US','USD','America/New_York','en',null,'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
end $$;

insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') limit 1;

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() + interval '1000 days' where id in (pg_temp.id('biza'), pg_temp.id('bizb'));
alter table public.businesses enable trigger businesses_enforce_guard;

update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365, show_prices = true
where branch_id in (pg_temp.id('brancha'), pg_temp.id('branchb'));
update public.branches set address = '1 High Street, London', phone = '+442071234567'
where id = pg_temp.id('brancha');

do $$
declare r record; v_member uuid;
begin
  for r in select * from (values ('manager','manager'), ('recep','receptionist'), ('staffa','staff'), ('staffb','staff')) as x(k, role_key)
  loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.k), 'active', now()) returning id into v_member;
    insert into ids values ('member_' || r.k, v_member);
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member, (select id from public.roles where business_id is null and key = r.role_key), pg_temp.id('brancha'));
  end loop;
end $$;

do $$
declare v_sa uuid; v_sb uuid; v_svc uuid; v_svc2 uuid; v_c1 uuid; v_c2 uuid;
begin
  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biza'), pg_temp.id('member_staffa'), 'Alice Stylist') returning id into v_sa;
  insert into public.staff_profiles (business_id, member_id, display_name)
  values (pg_temp.id('biza'), pg_temp.id('member_staffb'), 'Bernard Barber') returning id into v_sb;
  insert into ids values ('sa', v_sa), ('sb', v_sb);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes, description)
  values (pg_temp.id('biza'), 'Cut', 60, 0, 'A haircut') returning id into v_svc;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (pg_temp.id('biza'), 'Hidden Service', 30, 0) returning id into v_svc2;
  insert into ids values ('svc', v_svc), ('svc2', v_svc2);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, pg_temp.id('brancha'), pg_temp.id('biza'), 4000, true),
         (v_svc2, pg_temp.id('brancha'), pg_temp.id('biza'), 1000, true);
  update public.services set is_active = false where id = v_svc2;

  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v_sa, pg_temp.id('brancha'), pg_temp.id('biza')), (v_sb, pg_temp.id('brancha'), pg_temp.id('biza'));
  insert into public.service_staff (service_id, staff_id, business_id)
  values (v_svc, v_sa, pg_temp.id('biza')), (v_svc, v_sb, pg_temp.id('biza'));
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select pg_temp.id('brancha'), pg_temp.id('biza'), d, 540, 1020 from generate_series(1,5) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select s, pg_temp.id('brancha'), pg_temp.id('biza'), d, 540, 1020
  from generate_series(1,5) d, (values (v_sa), (v_sb)) x(s);

  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biza'), 'Sarah Connor', '+447700900111') returning id into v_c1;
  insert into public.clients (business_id, full_name, phone_e164, email)
  values (pg_temp.id('biza'), 'Omar Khan', '+447700900222', 'omar@example.com') returning id into v_c2;
  insert into ids values ('c1', v_c1), ('c2', v_c2);
end $$;

-- Appointments (all confirmed). ap1/ap3/ap4/ap5 -> Alice, ap2 -> Bernard.
do $$
declare r jsonb; v_i int;
begin
  for v_i in 1..5 loop
    r := pg_temp.call_as(pg_temp.id('owner'), format(
      'select public.create_appointment(%L, %L, %L, p_staff_id => %L, p_client_id => %L)',
      pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(8 + v_i),
      case when v_i = 2 then pg_temp.id('sb') else pg_temp.id('sa') end,
      case when v_i = 2 then pg_temp.id('c2') else pg_temp.id('c1') end));
    insert into ids values ('ap' || v_i, (r ->> 'appointment_id')::uuid);
  end loop;
end $$;
select pg_temp.chk('fixture: 5 appointments exist', (select count(*)::int from ids where k like 'ap_'), 5);

-- ===========================================================================
-- 1. Permission catalogue and role grants
-- ===========================================================================
select pg_temp.chk('catalogue has all 5 permissions',
  (select count(*)::int from public.permissions where key in
    ('reviews.view','reviews.reply','reviews.feature_on_website','website.edit','website.publish')), 5);
select pg_temp.chk('owner holds all 5',
  (select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.business_id is null and r.key = 'owner' and rp.permission in
    ('reviews.view','reviews.reply','reviews.feature_on_website','website.edit','website.publish')), 5);
select pg_temp.chk('manager: reviews.* yes, website.* NO',
  (select string_agg(rp.permission, ',' order by rp.permission) from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.business_id is null and r.key = 'manager' and (rp.permission like 'reviews.%' or rp.permission like 'website.%')),
  'reviews.feature_on_website,reviews.reply,reviews.view');
select pg_temp.chk('receptionist: reviews.view only',
  (select string_agg(rp.permission, ',') from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.business_id is null and r.key = 'receptionist' and (rp.permission like 'reviews.%' or rp.permission like 'website.%')),
  'reviews.view');
select pg_temp.chk('staff: reviews.view at OWN scope only',
  (select string_agg(rp.permission || ':' || rp.scope, ',') from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.business_id is null and r.key = 'staff' and (rp.permission like 'reviews.%' or rp.permission like 'website.%')),
  'reviews.view:own');

-- ===========================================================================
-- 2. Grants: anon has NOTHING; service RPCs are service_role only
-- ===========================================================================
select pg_temp.chk('anon has no privilege on ' || t,
  has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('anon', 'public.' || t, 'insert')
  or has_table_privilege('anon', 'public.' || t, 'update') or has_table_privilege('anon', 'public.' || t, 'delete'), false)
from unnest(array['websites','website_sections','review_requests','reviews','widget_keys']) t;
select pg_temp.chk('authenticated cannot WRITE ' || t,
  has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update')
  or has_table_privilege('authenticated', 'public.' || t, 'delete'), false)
from unnest(array['websites','website_sections','review_requests','reviews','widget_keys']) t;
select pg_temp.chk('review_requests.token_hash is not readable by authenticated',
  has_column_privilege('authenticated', 'public.review_requests', 'token_hash', 'select'), false);
select pg_temp.chk(f || ' is service_role only',
  has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute'), false)
from unnest(array['public.get_website_public(text)','public.get_review_request(text)','public.submit_review(text,integer,text)',
  'public.validate_widget_origin(text,text)','public.get_widget_frame_ancestors(text)','public.create_review_request_internal(uuid)']) f;
select pg_temp.chk(f || ' has service_role', has_function_privilege('service_role', f, 'execute'), true)
from unnest(array['public.get_website_public(text)','public.get_review_request(text)','public.submit_review(text,integer,text)',
  'public.validate_widget_origin(text,text)','public.get_widget_frame_ancestors(text)']) f;
select pg_temp.chk('anon cannot execute owner RPC ' || f, has_function_privilege('anon', f, 'execute'), false)
from unnest(array['public.ensure_website(uuid)','public.save_website_settings(uuid,jsonb)','public.save_website_section(uuid,text,boolean,jsonb)',
  'public.reorder_website_sections(uuid,text[])','public.set_website_published(uuid,boolean)','public.reply_to_review(uuid,text)',
  'public.set_review_featured(uuid,boolean)','public.reissue_review_request(uuid)','public.ensure_widget_key(uuid)',
  'public.save_widget_domains(uuid,text[])','public.set_widget_active(uuid,boolean)','public.rotate_widget_key(uuid)',
  'public.mark_completed(uuid)']) f;

-- ===========================================================================
-- 3. Reviews: request creation inside mark_completed
-- ===========================================================================
-- Failure paths FIRST (nothing may be created or changed): ap5 stays confirmed.
select pg_temp.chk('mark_completed by another business: forbidden',
  pg_temp.call_as(pg_temp.id('ownerb'), format('select public.mark_completed(%L)', pg_temp.id('ap5'))) ->> 'code', 'forbidden');
select pg_temp.chk('mark_completed by staffb on Alice''s appointment: forbidden',
  pg_temp.call_as(pg_temp.id('staffb'), format('select public.mark_completed(%L)', pg_temp.id('ap5'))) ->> 'code', 'forbidden');
select pg_temp.chk('after refusals ap5 is still confirmed',
  (select status::text from public.appointments where id = pg_temp.id('ap5')), 'confirmed');
select pg_temp.chk('after refusals NO review request exists for ap5',
  (select count(*)::int from public.review_requests where appointment_id = pg_temp.id('ap5')), 0);

do $$
declare r jsonb; v_i int;
begin
  for v_i in 1..4 loop
    r := pg_temp.call_as(pg_temp.id('owner'), format('select public.mark_completed(%L)', pg_temp.id('ap' || v_i)));
    perform pg_temp.chk('mark_completed ap' || v_i || ' ok', r ->> 'ok', 'true');
    perform pg_temp.chk('ap' || v_i || ' returns a raw 64-hex review token', length(r -> 'review_request' ->> 'token'), 64);
    insert into tok values ('t' || v_i, r -> 'review_request' ->> 'token');
  end loop;
end $$;

select pg_temp.chk('exactly one request per completed appointment',
  (select count(*)::int from public.review_requests where appointment_id in (pg_temp.id('ap1'),pg_temp.id('ap2'),pg_temp.id('ap3'),pg_temp.id('ap4'))), 4);
select pg_temp.chk('STORED hash = sha256(raw token)',
  (select token_hash from public.review_requests where appointment_id = pg_temp.id('ap1')),
  encode(extensions.digest(pg_temp.t('t1'), 'sha256'), 'hex'));
select pg_temp.chk('the raw token is stored nowhere in review_requests',
  (select count(*)::int from public.review_requests r where r::text like '%' || pg_temp.t('t1') || '%'), 0);
select pg_temp.chk('request expires in ~30 days',
  (select expires_at between now() + interval '29 days' and now() + interval '31 days' from public.review_requests where appointment_id = pg_temp.id('ap1')), true);
select pg_temp.chk('request is unused and unsent',
  (select used_at is null and sent_at is null from public.review_requests where appointment_id = pg_temp.id('ap1')), true);
select pg_temp.chk('request carries business, branch and client',
  (select business_id = pg_temp.id('biza') and branch_id = pg_temp.id('brancha') and client_id = pg_temp.id('c1')
   from public.review_requests where appointment_id = pg_temp.id('ap1')), true);

-- A second complete is refused and changes nothing.
select pg_temp.chk('completing ap1 again is invalid_transition',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.mark_completed(%L)', pg_temp.id('ap1'))) ->> 'code', 'invalid_transition');
select pg_temp.chk('...and the request hash is unchanged',
  (select token_hash from public.review_requests where appointment_id = pg_temp.id('ap1')),
  encode(extensions.digest(pg_temp.t('t1'), 'sha256'), 'hex'));

-- Direct duplicate: one request per appointment, for all time.
select pg_temp.chk('a second request for the same appointment violates the unique key',
  pg_temp.q(format($q$insert into public.review_requests (business_id, branch_id, appointment_id, token_hash, expires_at)
    values (%L, %L, %L, repeat('a', 64), now() + interval '1 day')$q$, pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('ap1'))),
  'ERR:23505');

-- ===========================================================================
-- 4. get_review_request: every failure identical; no staff
-- ===========================================================================
select pg_temp.chk('get_review_request: valid token ok', public.get_review_request(pg_temp.t('t1')) ->> 'ok', 'true');
select pg_temp.chk('...business name', public.get_review_request(pg_temp.t('t1')) ->> 'business_name', 'P7 A');
select pg_temp.chk('...service name', public.get_review_request(pg_temp.t('t1')) ->> 'service_name', 'Cut');
select pg_temp.chk('...NO staff name / id leaks (never ask to name staff)',
  (public.get_review_request(pg_temp.t('t1'))::text ilike '%alice%' or public.get_review_request(pg_temp.t('t1'))::text ilike '%staff%'), false);
select pg_temp.chk('...no client name/phone/ids',
  (public.get_review_request(pg_temp.t('t1'))::text like '%Connor%' or public.get_review_request(pg_temp.t('t1'))::text like '%900111%'
   or public.get_review_request(pg_temp.t('t1'))::text like '%' || pg_temp.id('biza')::text || '%'), false);

-- ===========================================================================
-- 5. Token failures: expired, unknown, short, null; reopen kills the request
-- ===========================================================================
select pg_temp.chk('unknown token', public.get_review_request(repeat('f', 64)), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('short token', public.get_review_request('abc'), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('null token', public.get_review_request(null), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('submit with unknown token', public.submit_review(repeat('e', 64), 5, 'x'), jsonb_build_object('ok', false, 'code', 'invalid_token'));

-- expired (ap3)
update public.review_requests set expires_at = now() - interval '1 minute' where appointment_id = pg_temp.id('ap3');
select pg_temp.chk('expired token on read is the SAME generic failure',
  public.get_review_request(pg_temp.t('t3')), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('expired token on submit is the SAME generic failure',
  public.submit_review(pg_temp.t('t3'), 5, 'late'), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('...and no review row was created',
  (select count(*)::int from public.reviews where appointment_id = pg_temp.id('ap3')), 0);

-- review only after Completed: reopen ap4 -> its request stops working.
select pg_temp.chk('reopen ap4 (owner)', pg_temp.call_as(pg_temp.id('owner'), format('select public.reopen_appointment(%L)', pg_temp.id('ap4'))) ->> 'ok', 'true');
select pg_temp.chk('reopened appointment: token is the SAME generic failure on read',
  public.get_review_request(pg_temp.t('t4')), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('reopened appointment: submit refused, generic',
  public.submit_review(pg_temp.t('t4'), 5, 'x'), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('reopened: no review row', (select count(*)::int from public.reviews where appointment_id = pg_temp.id('ap4')), 0);
select pg_temp.chk('reissue on a non-completed (reopened) appointment: not_completed',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.reissue_review_request(%L)', pg_temp.id('ap4'))) ->> 'code', 'not_completed');
-- complete again: the request already exists -> NO second request, NO new token.
do $$
declare r jsonb;
begin
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.mark_completed(%L)', pg_temp.id('ap4')));
  perform pg_temp.chk('complete again ok', r ->> 'ok', 'true');
  perform pg_temp.chk('complete again returns NO new review_request (one per appointment)', r ? 'review_request', false);
end $$;
select pg_temp.chk('still exactly one request for ap4', (select count(*)::int from public.review_requests where appointment_id = pg_temp.id('ap4')), 1);
select pg_temp.chk('the old ap4 token works again once completed (same request)',
  public.get_review_request(pg_temp.t('t4')) ->> 'ok', 'true');

-- ===========================================================================
-- 6. Reissue: old token DEAD, new token live; permissions; failure survival
-- ===========================================================================
-- not allowed
select pg_temp.chk('reissue by another business: forbidden',
  pg_temp.call_as(pg_temp.id('ownerb'), format('select public.reissue_review_request(%L)', pg_temp.id('ap3'))) ->> 'code', 'forbidden');
select pg_temp.chk('reissue by staffb on Alice''s appointment: forbidden',
  pg_temp.call_as(pg_temp.id('staffb'), format('select public.reissue_review_request(%L)', pg_temp.id('ap3'))) ->> 'code', 'forbidden');
select pg_temp.chk('reissue on a never-completed appointment: not_completed',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.reissue_review_request(%L)', pg_temp.id('ap5'))) ->> 'code', 'not_completed');
select pg_temp.chk('refused reissues left ap3''s hash untouched',
  (select token_hash from public.review_requests where appointment_id = pg_temp.id('ap3')),
  encode(extensions.digest(pg_temp.t('t3'), 'sha256'), 'hex'));

do $$
declare r jsonb;
begin
  r := pg_temp.call_as(pg_temp.id('recep'), format('select public.reissue_review_request(%L)', pg_temp.id('ap3')));
  perform pg_temp.chk('reissue by receptionist (appointments.edit, branch) ok', r ->> 'ok', 'true');
  insert into tok values ('t3b', r -> 'review_request' ->> 'token');
end $$;
select pg_temp.chk('NEW token differs from the old one', pg_temp.t('t3b') <> pg_temp.t('t3'), true);
select pg_temp.chk('OLD token fails after reissue (read)', public.get_review_request(pg_temp.t('t3')), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('OLD token fails after reissue (submit)', public.submit_review(pg_temp.t('t3'), 5, 'x'), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('NEW token works', public.get_review_request(pg_temp.t('t3b')) ->> 'ok', 'true');
select pg_temp.chk('reissue refreshed the expiry',
  (select expires_at > now() + interval '29 days' from public.review_requests where appointment_id = pg_temp.id('ap3')), true);
select pg_temp.chk('STORED hash = sha256(new token)',
  (select token_hash from public.review_requests where appointment_id = pg_temp.id('ap3')),
  encode(extensions.digest(pg_temp.t('t3b'), 'sha256'), 'hex'));
select pg_temp.chk('still ONE request row for ap3', (select count(*)::int from public.review_requests where appointment_id = pg_temp.id('ap3')), 1);
select pg_temp.chk('audit row: review_request.reissued',
  (select count(*)::int from public.audit_logs where action = 'review_request.reissued' and business_id = pg_temp.id('biza')), 1);

-- ===========================================================================
-- 7. submit_review: validation (no mutation on failure), compliance, stored values
-- ===========================================================================
update public.branches set google_review_url = 'https://g.page/r/p7-a/review' where id = pg_temp.id('brancha');
select pg_temp.chk('google url must be https (http refused)',
  pg_temp.q(format($q$update public.branches set google_review_url = 'http://g.page/x' where id = %L$q$, pg_temp.id('brancha'))), 'ERR:23514');
select pg_temp.chk('google url cannot be javascript:',
  pg_temp.q(format($q$update public.branches set google_review_url = 'javascript:alert(1)' where id = %L$q$, pg_temp.id('brancha'))), 'ERR:23514');

-- validation failures leave the request UNUSED and create no review (ap1)
select pg_temp.chk('rating 0', public.submit_review(pg_temp.t('t1'), 0, 'x') ->> 'code', 'invalid_rating');
select pg_temp.chk('rating 6', public.submit_review(pg_temp.t('t1'), 6, 'x') ->> 'code', 'invalid_rating');
select pg_temp.chk('rating null', public.submit_review(pg_temp.t('t1'), null, 'x') ->> 'code', 'invalid_rating');
select pg_temp.chk('comment > 2000 chars', public.submit_review(pg_temp.t('t1'), 5, repeat('x', 2001)) ->> 'code', 'invalid_comment');
select pg_temp.chk('failed submits left NO review', (select count(*)::int from public.reviews where appointment_id = pg_temp.id('ap1')), 0);
select pg_temp.chk('failed submits left the request UNUSED',
  (select used_at is null from public.review_requests where appointment_id = pg_temp.id('ap1')), true);
select pg_temp.chk('failed submits returned no google url at all',
  public.submit_review(pg_temp.t('t1'), 9, 'x') ? 'google_review_url', false);

-- valid: ap1 five stars (Alice), ap2 ONE star (Bernard), ap3 three, ap4 four.
do $$
declare r jsonb;
begin
  r := public.submit_review(pg_temp.t('t1'), 5, '  Great cut!  ');
  perform pg_temp.chk('ap1 5-star submit ok', r ->> 'ok', 'true');
  perform pg_temp.chk('5-star gets the Google link', r ->> 'google_review_url', 'https://g.page/r/p7-a/review');
  r := public.submit_review(pg_temp.t('t2'), 1, 'Not happy');
  perform pg_temp.chk('ap2 1-star submit ok', r ->> 'ok', 'true');
  perform pg_temp.chk('1-STAR gets the IDENTICAL Google link (no star filtering)', r ->> 'google_review_url', 'https://g.page/r/p7-a/review');
  r := public.submit_review(pg_temp.t('t3b'), 3, null);
  perform pg_temp.chk('3-star gets the same link', r ->> 'google_review_url', 'https://g.page/r/p7-a/review');
  r := public.submit_review(pg_temp.t('t4'), 4, '   ');
  perform pg_temp.chk('4-star ok', r ->> 'ok', 'true');
end $$;

select pg_temp.chk('STORED rating', (select rating::int from public.reviews where appointment_id = pg_temp.id('ap1')), 5);
select pg_temp.chk('STORED comment is trimmed', (select comment from public.reviews where appointment_id = pg_temp.id('ap1')), 'Great cut!');
select pg_temp.chk('STORED first name only', (select reviewer_first_name from public.reviews where appointment_id = pg_temp.id('ap1')), 'Sarah');
select pg_temp.chk('STORED staff_id is the appointment''s staff (internal)',
  (select staff_id from public.reviews where appointment_id = pg_temp.id('ap1')), pg_temp.id('sa'));
select pg_temp.chk('STORED status published, not featured, no reply',
  (select status = 'published' and not featured_on_website and owner_reply is null from public.reviews where appointment_id = pg_temp.id('ap1')), true);
select pg_temp.chk('STORED business/branch/client',
  (select business_id = pg_temp.id('biza') and branch_id = pg_temp.id('brancha') and client_id = pg_temp.id('c1')
   from public.reviews where appointment_id = pg_temp.id('ap1')), true);
select pg_temp.chk('whitespace-only comment stored as NULL', (select comment from public.reviews where appointment_id = pg_temp.id('ap4')), null::text);
select pg_temp.chk('request marked used', (select used_at is not null from public.review_requests where appointment_id = pg_temp.id('ap1')), true);
select pg_temp.chk('Omar''s review stores first name Omar', (select reviewer_first_name from public.reviews where appointment_id = pg_temp.id('ap2')), 'Omar');

-- replay / one review per appointment
select pg_temp.chk('REPLAY of a used token: generic failure, no google url',
  public.submit_review(pg_temp.t('t1'), 5, 'again'), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('used token on read: generic failure',
  public.get_review_request(pg_temp.t('t1')), jsonb_build_object('ok', false, 'code', 'invalid_token'));
select pg_temp.chk('still ONE review for ap1', (select count(*)::int from public.reviews where appointment_id = pg_temp.id('ap1')), 1);
select pg_temp.chk('a second review row for the same appointment violates the unique key',
  pg_temp.q(format($q$insert into public.reviews (business_id, branch_id, appointment_id, review_request_id, rating, reviewer_first_name)
    values (%L, %L, %L, %L, 5, 'X')$q$, pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('ap1'),
    (select id from public.review_requests where appointment_id = pg_temp.id('ap2')))), 'ERR:23505');
select pg_temp.chk('reissue after the review exists: already_reviewed',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.reissue_review_request(%L)', pg_temp.id('ap1'))) ->> 'code', 'already_reviewed');
select pg_temp.chk('...hash unchanged',
  (select token_hash from public.review_requests where appointment_id = pg_temp.id('ap1')),
  encode(extensions.digest(pg_temp.t('t1'), 'sha256'), 'hex'));

-- immutability of the customer's words
select pg_temp.chk('rating cannot be edited (even by postgres)',
  pg_temp.q(format($q$update public.reviews set rating = 5 where appointment_id = %L$q$, pg_temp.id('ap2'))), 'ERR:23514');
select pg_temp.chk('comment cannot be edited',
  pg_temp.q(format($q$update public.reviews set comment = 'edited' where appointment_id = %L$q$, pg_temp.id('ap2'))), 'ERR:23514');
select pg_temp.chk('a review cannot be deleted while the business exists',
  pg_temp.q(format($q$delete from public.reviews where appointment_id = %L$q$, pg_temp.id('ap2'))), 'ERR:23514');
select pg_temp.chk('a featured review must be published (constraint)',
  pg_temp.q(format($q$update public.reviews set status = 'removed', featured_on_website = true where appointment_id = %L$q$, pg_temp.id('ap2'))), 'ERR:23514');

-- ===========================================================================
-- 8. Reviews RLS per role + list_reviews
-- ===========================================================================
select pg_temp.chk('owner sees all 4 reviews', pg_temp.cnt(pg_temp.id('owner'), 'public.reviews'), 4);
select pg_temp.chk('manager sees all 4 (branch scope)', pg_temp.cnt(pg_temp.id('manager'), 'public.reviews'), 4);
select pg_temp.chk('receptionist sees all 4 (reviews.view at branch)', pg_temp.cnt(pg_temp.id('recep'), 'public.reviews'), 4);
select pg_temp.chk('staff Alice sees ONLY her 3 (own appointments)', pg_temp.cnt(pg_temp.id('staffa'), 'public.reviews'), 3);
select pg_temp.chk('staff Bernard sees ONLY his 1', pg_temp.cnt(pg_temp.id('staffb'), 'public.reviews'), 1);
select pg_temp.chk('Bernard cannot see Alice''s review',
  pg_temp.cnt(pg_temp.id('staffb'), 'public.reviews', format('appointment_id = %L', pg_temp.id('ap1'))), 0);
select pg_temp.chk('OTHER business sees 0 reviews', pg_temp.cnt(pg_temp.id('ownerb'), 'public.reviews'), 0);
select pg_temp.chk('anon: reviews unreadable', pg_temp.call_anon('select jsonb_build_object(''n'', count(*)) from public.reviews') ->> 'error', '42501');
select pg_temp.chk('owner sees 4 review requests', pg_temp.cnt(pg_temp.id('owner'), 'public.review_requests'), 4);
select pg_temp.chk('staff sees 0 review requests (branch scope only)', pg_temp.cnt(pg_temp.id('staffa'), 'public.review_requests'), 0);
select pg_temp.chk('OTHER business sees 0 review requests', pg_temp.cnt(pg_temp.id('ownerb'), 'public.review_requests'), 0);
select pg_temp.chk('token_hash column is refused to the owner',
  pg_temp.call_as(pg_temp.id('owner'), 'select jsonb_build_object(''h'', count(token_hash)) from public.review_requests') ->> 'error', '42501');
select pg_temp.chk('owner cannot write reviews directly',
  pg_temp.call_as(pg_temp.id('owner'), format('with u as (update public.reviews set owner_reply = ''hack'' returning 1) select jsonb_build_object(''n'', count(*)) from u')) ->> 'error', '42501');

select pg_temp.chk('list_reviews as owner: 4 items',
  jsonb_array_length(pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L)', pg_temp.id('biza'))) -> 'items'), 4);
select pg_temp.chk('list_reviews as staff Alice: 3 items (RLS narrows)',
  jsonb_array_length(pg_temp.call_as(pg_temp.id('staffa'), format('select public.list_reviews(%L)', pg_temp.id('biza'))) -> 'items'), 3);
select pg_temp.chk('list_reviews as other business: 0 items',
  jsonb_array_length(pg_temp.call_as(pg_temp.id('ownerb'), format('select public.list_reviews(%L)', pg_temp.id('biza'))) -> 'items'), 0);
select pg_temp.chk('list_reviews: anon cannot call', pg_temp.call_anon(format('select public.list_reviews(%L)', pg_temp.id('biza'))) ->> 'error', '42501');
select pg_temp.chk('list_reviews: rating filter',
  jsonb_array_length(pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_rating => 1)', pg_temp.id('biza'))) -> 'items'), 1);
select pg_temp.chk('list_reviews item exposes first name only, no staff/client id',
  (pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_rating => 1)', pg_temp.id('biza')))::text like '%staff%'
   or pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_rating => 1)', pg_temp.id('biza')))::text like '%client%'), false);

-- keyset pagination
do $$
declare p1 jsonb; p2 jsonb; p3 jsonb;
begin
  p1 := pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_limit => 3)', pg_temp.id('biza')));
  perform pg_temp.chk('page 1: 3 items', jsonb_array_length(p1 -> 'items'), 3);
  perform pg_temp.chk('page 1: has next cursor', p1 -> 'next_cursor' is not null and jsonb_typeof(p1 -> 'next_cursor') = 'object', true);
  p2 := pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_limit => 3, p_cursor_created_at => %L, p_cursor_id => %L)',
    pg_temp.id('biza'), p1 -> 'next_cursor' ->> 'created_at', p1 -> 'next_cursor' ->> 'id'));
  perform pg_temp.chk('page 2: the remaining 1', jsonb_array_length(p2 -> 'items'), 1);
  perform pg_temp.chk('page 2: no next cursor', jsonb_typeof(p2 -> 'next_cursor'), 'null');
  perform pg_temp.chk('pages do not overlap',
    (select count(*)::int from jsonb_array_elements(p1 -> 'items') a join jsonb_array_elements(p2 -> 'items') b on a ->> 'id' = b ->> 'id'), 0);
  p3 := pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_limit => 100000)', pg_temp.id('biza')));
  perform pg_temp.chk('limit is clamped (max 100) and still works', jsonb_array_length(p3 -> 'items'), 4);
end $$;

-- ===========================================================================
-- 9. reply_to_review / set_review_featured
-- ===========================================================================
do $$
declare v_r1 uuid := (select id from public.reviews where appointment_id = pg_temp.id('ap1'));
begin
  insert into ids values ('rv1', v_r1), ('rv2', (select id from public.reviews where appointment_id = pg_temp.id('ap2')));
end $$;

select pg_temp.chk('reply: receptionist forbidden (no reviews.reply)',
  pg_temp.call_as(pg_temp.id('recep'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), 'hi')) ->> 'code', 'forbidden');
select pg_temp.chk('reply: staff forbidden',
  pg_temp.call_as(pg_temp.id('staffa'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), 'hi')) ->> 'code', 'forbidden');
select pg_temp.chk('reply: other business -> not found/forbidden, never ok',
  pg_temp.call_as(pg_temp.id('ownerb'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), 'hi')) ->> 'ok', 'false');
select pg_temp.chk('reply: anon cannot call',
  pg_temp.call_anon(format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), 'hi')) ->> 'error', '42501');
select pg_temp.chk('reply: blank -> invalid_reply',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), '   ')) ->> 'code', 'invalid_reply');
select pg_temp.chk('reply: 1001 chars -> invalid_reply',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), repeat('x', 1001))) ->> 'code', 'invalid_reply');
select pg_temp.chk('after every refusal the review has NO reply',
  (select owner_reply is null and replied_at is null and replied_by is null from public.reviews where id = pg_temp.id('rv1')), true);

select pg_temp.chk('reply: owner ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv1'), '  Thank you!  ')) ->> 'ok', 'true');
select pg_temp.chk('STORED reply trimmed', (select owner_reply from public.reviews where id = pg_temp.id('rv1')), 'Thank you!');
select pg_temp.chk('STORED replied_by = owner', (select replied_by from public.reviews where id = pg_temp.id('rv1')), pg_temp.id('owner'));
select pg_temp.chk('STORED replied_at set', (select replied_at is not null from public.reviews where id = pg_temp.id('rv1')), true);
select pg_temp.chk('reply: manager ok (reviews.reply at branch)',
  pg_temp.call_as(pg_temp.id('manager'), format('select public.reply_to_review(%L, %L)', pg_temp.id('rv2'), 'We are sorry.')) ->> 'ok', 'true');
select pg_temp.chk('audit row: review.replied x2', (select count(*)::int from public.audit_logs where action = 'review.replied' and business_id = pg_temp.id('biza')), 2);
select pg_temp.chk('list filter has_reply=true -> 2',
  jsonb_array_length(pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_has_reply => true)', pg_temp.id('biza'))) -> 'items'), 2);
select pg_temp.chk('the customer''s words are untouched by replying',
  (select rating::int || comment from public.reviews where id = pg_temp.id('rv1')), '5Great cut!');

-- feature
select pg_temp.chk('feature: receptionist forbidden', pg_temp.call_as(pg_temp.id('recep'), format('select public.set_review_featured(%L, true)', pg_temp.id('rv1'))) ->> 'code', 'forbidden');
select pg_temp.chk('feature: staff forbidden', pg_temp.call_as(pg_temp.id('staffa'), format('select public.set_review_featured(%L, true)', pg_temp.id('rv1'))) ->> 'code', 'forbidden');
select pg_temp.chk('feature: other business never ok', pg_temp.call_as(pg_temp.id('ownerb'), format('select public.set_review_featured(%L, true)', pg_temp.id('rv1'))) ->> 'ok', 'false');
select pg_temp.chk('feature: anon cannot call', pg_temp.call_anon(format('select public.set_review_featured(%L, true)', pg_temp.id('rv1'))) ->> 'error', '42501');
select pg_temp.chk('feature: null -> bad_request', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, null)', pg_temp.id('rv1'))) ->> 'code', 'bad_request');
select pg_temp.chk('refused feature calls changed nothing', (select featured_on_website from public.reviews where id = pg_temp.id('rv1')), false);
select pg_temp.chk('feature: owner ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, true)', pg_temp.id('rv1'))) ->> 'ok', 'true');
select pg_temp.chk('STORED featured + featured_at', (select featured_on_website and featured_at is not null from public.reviews where id = pg_temp.id('rv1')), true);
select pg_temp.chk('feature again: idempotent changed=false', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, true)', pg_temp.id('rv1'))) ->> 'changed', 'false');
select pg_temp.chk('manager can feature (reviews.feature_on_website)', pg_temp.call_as(pg_temp.id('manager'), format('select public.set_review_featured(%L, true)', pg_temp.id('rv2'))) ->> 'ok', 'true');
select pg_temp.chk('unfeature ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, false)', pg_temp.id('rv2'))) ->> 'ok', 'true');
select pg_temp.chk('STORED unfeatured clears featured_at', (select not featured_on_website and featured_at is null from public.reviews where id = pg_temp.id('rv2')), true);
select pg_temp.chk('audit rows: featured x2, unfeatured x1 (idempotent call wrote none)',
  (select count(*) filter (where action = 'review.featured')::text || '/' || count(*) filter (where action = 'review.unfeatured')::text
   from public.audit_logs where business_id = pg_temp.id('biza')), '2/1');
select pg_temp.chk('list filter featured=true -> 1',
  jsonb_array_length(pg_temp.call_as(pg_temp.id('owner'), format('select public.list_reviews(%L, p_featured => true)', pg_temp.id('biza'))) -> 'items'), 1);

-- max 12 featured: add 9 more reviews end-to-end, feature up to the cap
do $$
declare r jsonb; v_i int; v_appt uuid; v_rv uuid; v_ok int := 0; v_last jsonb;
begin
  for v_i in 1..10 loop
    r := pg_temp.call_as(pg_temp.id('owner'), format(
      'select public.create_appointment(%L, %L, %L, p_staff_id => %L, p_client_id => %L)',
      pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(9, 2 + v_i), pg_temp.id('sa'), pg_temp.id('c1')));
    v_appt := (r ->> 'appointment_id')::uuid;
    r := pg_temp.call_as(pg_temp.id('owner'), format('select public.mark_completed(%L)', v_appt));
    perform public.submit_review(r -> 'review_request' ->> 'token', 5, 'bulk ' || v_i);
    select id into v_rv from public.reviews where appointment_id = v_appt;
    v_last := pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, true)', v_rv));
    if v_last ->> 'ok' = 'true' then v_ok := v_ok + 1; end if;
  end loop;
  -- rv1 was already featured, so 11 more fit under the cap of 12; the 11th..10th call: 1 + 10 = 11 featured, all ok
  perform pg_temp.chk('10 more features all fit (11 total <= 12)', v_ok, 10);
  -- one more review to push past 12
  r := pg_temp.call_as(pg_temp.id('owner'), format(
    'select public.create_appointment(%L, %L, %L, p_staff_id => %L, p_client_id => %L)',
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(10, 20), pg_temp.id('sa'), pg_temp.id('c1')));
  v_appt := (r ->> 'appointment_id')::uuid;
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.mark_completed(%L)', v_appt));
  perform public.submit_review(r -> 'review_request' ->> 'token', 4, 'twelfth');
  select id into v_rv from public.reviews where appointment_id = v_appt;
  perform pg_temp.chk('12th feature ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, true)', v_rv)) ->> 'ok', 'true');
  r := pg_temp.call_as(pg_temp.id('owner'), format(
    'select public.create_appointment(%L, %L, %L, p_staff_id => %L, p_client_id => %L)',
    pg_temp.id('brancha'), pg_temp.id('svc'), pg_temp.slot(11, 20), pg_temp.id('sa'), pg_temp.id('c1')));
  v_appt := (r ->> 'appointment_id')::uuid;
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.mark_completed(%L)', v_appt));
  perform public.submit_review(r -> 'review_request' ->> 'token', 4, 'thirteenth');
  select id into v_rv from public.reviews where appointment_id = v_appt;
  perform pg_temp.chk('13th feature refused: too_many_featured',
    pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, true)', v_rv)) ->> 'code', 'too_many_featured');
  perform pg_temp.chk('...and the 13th is NOT featured', (select featured_on_website from public.reviews where id = v_rv), false);
end $$;

-- removed review (super-admin takedown path): not replyable/featurable, never public
do $$
declare v_rv uuid := (select id from public.reviews where appointment_id = pg_temp.id('ap3'));
begin
  update public.reviews set status = 'removed' where id = v_rv;
  perform pg_temp.chk('removed review: reply -> not_found',
    pg_temp.call_as(pg_temp.id('owner'), format('select public.reply_to_review(%L, %L)', v_rv, 'x')) ->> 'code', 'not_found');
  perform pg_temp.chk('removed review: feature -> not_found',
    pg_temp.call_as(pg_temp.id('owner'), format('select public.set_review_featured(%L, true)', v_rv)) ->> 'code', 'not_found');
  perform pg_temp.chk('removed review: its token returns no google link, generic failure',
    public.submit_review(pg_temp.t('t3b'), 5, 'x'), jsonb_build_object('ok', false, 'code', 'invalid_token'));
end $$;

-- ===========================================================================
-- 10. Website: ensure / RLS / settings / sections / publish
-- ===========================================================================
select pg_temp.chk('ensure_website: manager forbidden (no website.edit)', pg_temp.call_as(pg_temp.id('manager'), format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('ensure_website: receptionist forbidden', pg_temp.call_as(pg_temp.id('recep'), format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('ensure_website: staff forbidden', pg_temp.call_as(pg_temp.id('staffa'), format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('ensure_website: other business forbidden', pg_temp.call_as(pg_temp.id('ownerb'), format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('ensure_website: anon cannot call', pg_temp.call_anon(format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'error', '42501');
select pg_temp.chk('refusals created nothing', (select count(*)::int from public.websites where business_id = pg_temp.id('biza')), 0);

select pg_temp.chk('owner ensure_website: created', pg_temp.call_as(pg_temp.id('owner'), format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'created', 'true');
select pg_temp.chk('...again: idempotent (created=false)', pg_temp.call_as(pg_temp.id('owner'), format('select public.ensure_website(%L)', pg_temp.id('biza'))) ->> 'created', 'false');
select pg_temp.chk('exactly ONE website', (select count(*)::int from public.websites where business_id = pg_temp.id('biza')), 1);
select pg_temp.chk('exactly SEVEN sections, one of each',
  (select count(distinct section_type)::int || '/' || count(*)::int from public.website_sections where business_id = pg_temp.id('biza')), '7/7');
select pg_temp.chk('default order hero..contact',
  (select string_agg(section_type, ',' order by sort_order) from public.website_sections where business_id = pg_temp.id('biza')),
  'hero,about,services,gallery,testimonials,faqs,contact');
select pg_temp.chk('website defaults to the primary branch, unpublished',
  (select branch_id = pg_temp.id('brancha') and not is_published from public.websites where business_id = pg_temp.id('biza')), true);
select pg_temp.chk('ensure on a business with no website, by ownerb for B: creates B''s own',
  pg_temp.call_as(pg_temp.id('ownerb'), format('select public.ensure_website(%L)', pg_temp.id('bizb'))) ->> 'created', 'true');

-- RLS on the tables
select pg_temp.chk('owner reads websites', pg_temp.cnt(pg_temp.id('owner'), 'public.websites'), 1);
select pg_temp.chk('manager sees NO website rows', pg_temp.cnt(pg_temp.id('manager'), 'public.websites'), 0);
select pg_temp.chk('receptionist sees NO website rows', pg_temp.cnt(pg_temp.id('recep'), 'public.websites'), 0);
select pg_temp.chk('staff sees NO website rows', pg_temp.cnt(pg_temp.id('staffa'), 'public.websites'), 0);
select pg_temp.chk('other business sees only ITS website (B), never A''s',
  pg_temp.cnt(pg_temp.id('ownerb'), 'public.websites', format('business_id = %L', pg_temp.id('biza'))), 0);
select pg_temp.chk('owner reads 7 sections', pg_temp.cnt(pg_temp.id('owner'), 'public.website_sections', format('business_id = %L', pg_temp.id('biza'))), 7);
select pg_temp.chk('manager sees NO sections', pg_temp.cnt(pg_temp.id('manager'), 'public.website_sections'), 0);
select pg_temp.chk('other business sees none of A''s sections', pg_temp.cnt(pg_temp.id('ownerb'), 'public.website_sections', format('business_id = %L', pg_temp.id('biza'))), 0);
select pg_temp.chk('anon reads nothing', pg_temp.call_anon('select jsonb_build_object(''n'', count(*)) from public.websites') ->> 'error', '42501');
select pg_temp.chk('owner cannot write sections directly',
  pg_temp.call_as(pg_temp.id('owner'), 'with u as (update public.website_sections set is_visible = false returning 1) select jsonb_build_object(''n'', count(*)) from u') ->> 'error', '42501');

-- settings: atomic validation
create temporary table snap (k text primary key, v text) on commit drop;
insert into snap select 'site', (select row(w.brand_color, w.radius_key, w.font_key, w.logo_path, w.hero_image_path, w.seo_title, w.seo_description, w.template_key, w.branch_id)::text
  from public.websites w where w.business_id = pg_temp.id('biza'));
create or replace function pg_temp.site() returns text language sql as $$
  select row(w.brand_color, w.radius_key, w.font_key, w.logo_path, w.hero_image_path, w.seo_title, w.seo_description, w.template_key, w.branch_id)::text
  from public.websites w where w.business_id = pg_temp.id('biza') $$;

select pg_temp.chk('settings: manager forbidden', pg_temp.call_as(pg_temp.id('manager'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"brand_color":"#112233"}')) ->> 'code', 'forbidden');
select pg_temp.chk('settings: other business forbidden', pg_temp.call_as(pg_temp.id('ownerb'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"brand_color":"#112233"}')) ->> 'code', 'forbidden');
select pg_temp.chk('settings: bad colour', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"brand_color":"red"}')) ->> 'field', 'brand_color');
select pg_temp.chk('settings: bad radius', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"radius_key":"huge"}')) ->> 'field', 'radius_key');
select pg_temp.chk('settings: unknown key', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"is_published":true}')) ->> 'code', 'invalid_settings');
select pg_temp.chk('settings: branch of ANOTHER business refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, jsonb_build_object(''branch_id'', %L))', pg_temp.id('biza'), pg_temp.id('branchb'))) ->> 'field', 'branch_id');
select pg_temp.chk('settings: logo under ANOTHER business prefix refused',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, jsonb_build_object(''logo_path'', %L))', pg_temp.id('biza'),
    pg_temp.id('bizb')::text || '/' || gen_random_uuid()::text || '.png')) ->> 'field', 'logo_path');
select pg_temp.chk('settings: seo_title > 70', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, jsonb_build_object(''seo_title'', %L))', pg_temp.id('biza'), repeat('x', 71))) ->> 'field', 'seo_title');
select pg_temp.chk('settings: one valid + one invalid key changes NOTHING',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"brand_color":"#112233","radius_key":"bad"}')) ->> 'ok', 'false');
select pg_temp.chk('...site row byte-identical after every failed save', pg_temp.site(), (select v from snap where k = 'site'));

do $$
declare r jsonb;
begin
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, jsonb_build_object(''brand_color'',''#1A2B3C'',''radius_key'',''lg'',''font_key'',''dm_sans'',''template_key'',''barber'',''seo_title'',''  P7 Salon  '',''logo_path'',%L))',
    pg_temp.id('biza'), pg_temp.id('biza')::text || '/' || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' || '.png'));
  perform pg_temp.chk('settings: valid save ok', r ->> 'ok', 'true');
end $$;
select pg_temp.chk('STORED theme values',
  (select brand_color || radius_key || font_key || template_key || seo_title from public.websites where business_id = pg_temp.id('biza')), '#1A2B3Clgdm_sansbarberP7 Salon');
select pg_temp.chk('STORED logo path', (select logo_path from public.websites where business_id = pg_temp.id('biza')), pg_temp.id('biza')::text || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
select pg_temp.chk('settings: JSON null clear call ok',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.save_website_settings(%L, %L::jsonb)', pg_temp.id('biza'), '{"brand_color":null}')) ->> 'ok', 'true');
select pg_temp.chk('settings: JSON null cleared the stored colour',
  (select brand_color from public.websites where business_id = pg_temp.id('biza')), null::text);

-- sections: validation failures leave content untouched
create or replace function pg_temp.sec(p_type text) returns text language sql as $$
  select content::text || is_visible::text from public.website_sections where business_id = pg_temp.id('biza') and section_type = p_type $$;
create temporary table secsnap (k text primary key, v text) on commit drop;
insert into secsnap select t, pg_temp.sec(t) from unnest(array['hero','about','gallery','faqs','contact','services','testimonials']) t;

create or replace function pg_temp.save_sec(p_user uuid, p_type text, p_content text, p_visible text default null) returns jsonb language sql as $$
  select pg_temp.call_as(p_user, format('select public.save_website_section(%L, %L, %s, %L::jsonb)', pg_temp.id('biza'), p_type, coalesce(p_visible, 'null'), p_content)) $$;

select pg_temp.chk('section: manager forbidden', pg_temp.save_sec(pg_temp.id('manager'), 'hero', '{"headline":"x"}') ->> 'code', 'forbidden');
select pg_temp.chk('section: other business forbidden', pg_temp.save_sec(pg_temp.id('ownerb'), 'hero', '{"headline":"x"}') ->> 'code', 'forbidden');
select pg_temp.chk('section: unknown type', pg_temp.save_sec(pg_temp.id('owner'), 'blog', '{}') ->> 'code', 'unknown_section');
select pg_temp.chk('hero: unknown key', pg_temp.save_sec(pg_temp.id('owner'), 'hero', '{"evil":"x"}') ->> 'detail', 'unknown_key:evil');
select pg_temp.chk('hero: headline too long', pg_temp.save_sec(pg_temp.id('owner'), 'hero', format('{"headline":"%s"}', repeat('x', 121))) ->> 'detail', 'too_long:headline');
select pg_temp.chk('hero: wrong type', pg_temp.save_sec(pg_temp.id('owner'), 'hero', '{"headline":5}') ->> 'detail', 'bad_type:headline');
select pg_temp.chk('hero: not an object', pg_temp.save_sec(pg_temp.id('owner'), 'hero', '[1,2]') ->> 'detail', 'content_not_object');
select pg_temp.chk('about: body too long', pg_temp.save_sec(pg_temp.id('owner'), 'about', format('{"body":"%s"}', repeat('x', 4001))) ->> 'detail', 'too_long:body');
select pg_temp.chk('hero: content with a key from another type', pg_temp.save_sec(pg_temp.id('owner'), 'hero', '{"body":"x"}') ->> 'detail', 'unknown_key:body');
select pg_temp.chk('contact: javascript: map url refused', pg_temp.save_sec(pg_temp.id('owner'), 'contact', '{"map_url":"javascript:alert(1)"}') ->> 'detail', 'bad_url:map_url');
select pg_temp.chk('contact: http map url refused', pg_temp.save_sec(pg_temp.id('owner'), 'contact', '{"map_url":"http://maps.example.com/x"}') ->> 'detail', 'bad_url:map_url');
select pg_temp.chk('contact: bad whatsapp', pg_temp.save_sec(pg_temp.id('owner'), 'contact', '{"whatsapp":"07700 900123"}') ->> 'detail', 'bad_value:whatsapp');
select pg_temp.chk('contact: unknown social network', pg_temp.save_sec(pg_temp.id('owner'), 'contact', '{"social":{"myspace":"https://x.com/a"}}') ->> 'detail', 'unknown_key:social.myspace');
select pg_temp.chk('contact: javascript: social url', pg_temp.save_sec(pg_temp.id('owner'), 'contact', '{"social":{"instagram":"javascript:alert(1)"}}') ->> 'detail', 'bad_url:instagram');
select pg_temp.chk('faqs: 21 items refused', pg_temp.save_sec(pg_temp.id('owner'), 'faqs',
  (select jsonb_build_object('items', jsonb_agg(jsonb_build_object('q', 'Q' || g, 'a', 'A')))::text from generate_series(1, 21) g)) ->> 'detail', 'too_many:items');
select pg_temp.chk('faqs: empty answer refused', pg_temp.save_sec(pg_temp.id('owner'), 'faqs', '{"items":[{"q":"Q","a":" "}]}') ->> 'detail', 'bad_value:item.a');
select pg_temp.chk('faqs: extra key in item refused', pg_temp.save_sec(pg_temp.id('owner'), 'faqs', '{"items":[{"q":"Q","a":"A","html":"<b>"}]}') ->> 'detail', 'unknown_key:item.html');
select pg_temp.chk('gallery: malformed path refused', pg_temp.save_sec(pg_temp.id('owner'), 'gallery', '{"images":[{"path":"../../etc/passwd"}]}') ->> 'detail', 'bad_path:image');
select pg_temp.chk('gallery: svg refused', pg_temp.save_sec(pg_temp.id('owner'), 'gallery',
  format('{"images":[{"path":"%s/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg"}]}', pg_temp.id('biza'))) ->> 'detail', 'bad_path:image');
select pg_temp.chk('gallery: path under ANOTHER business refused', pg_temp.save_sec(pg_temp.id('owner'), 'gallery',
  format('{"images":[{"path":"%s/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png"}]}', pg_temp.id('bizb'))) ->> 'detail', 'foreign_path:image');
select pg_temp.chk('gallery: 13 images refused', pg_temp.save_sec(pg_temp.id('owner'), 'gallery',
  (select jsonb_build_object('images', jsonb_agg(jsonb_build_object('path', pg_temp.id('biza')::text || '/' || gen_random_uuid()::text || '.jpg')))::text from generate_series(1, 13))) ->> 'detail', 'too_many:images');
select pg_temp.chk('content over 20 KB refused', pg_temp.save_sec(pg_temp.id('owner'), 'faqs',
  (select jsonb_build_object('items', jsonb_agg(jsonb_build_object('q', 'Q', 'a', repeat('a', 1400))))::text from generate_series(1, 20))) ->> 'detail', 'content_too_large');
select pg_temp.chk('EVERY failed section save left that section byte-identical',
  (select count(*)::int from secsnap s where s.v <> pg_temp.sec(s.k)), 0);

-- the trigger is a backstop even for a privileged direct write
select pg_temp.chk('trigger backstop: invalid content refused for a direct write',
  pg_temp.q(format($q$update public.website_sections set content = '{"headline": 5}' where business_id = %L and section_type = 'hero'$q$, pg_temp.id('biza'))), 'ERR:23514');
select pg_temp.chk('trigger backstop: foreign gallery path refused for a direct write',
  pg_temp.q(format($q$update public.website_sections set content = jsonb_build_object('images', jsonb_build_array(jsonb_build_object('path', %L)))
    where business_id = %L and section_type = 'gallery'$q$, pg_temp.id('bizb')::text || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', pg_temp.id('biza'))), 'ERR:23514');
select pg_temp.chk('a 3rd hero section cannot exist (7 FIXED sections)',
  pg_temp.q(format($q$insert into public.website_sections (business_id, website_id, section_type, sort_order) values (%L, %L, 'hero', 99)$q$,
    pg_temp.id('biza'), (select id from public.websites where business_id = pg_temp.id('biza')))), 'ERR:23505');
select pg_temp.chk('an unknown section type cannot exist',
  pg_temp.q(format($q$insert into public.website_sections (business_id, website_id, section_type, sort_order) values (%L, %L, 'blog', 99)$q$,
    pg_temp.id('biza'), (select id from public.websites where business_id = pg_temp.id('biza')))), 'ERR:23514');

-- valid saves, stored values
select pg_temp.chk('hero save ok', pg_temp.save_sec(pg_temp.id('owner'), 'hero', '{"headline":"Welcome","subheadline":"Hair & more","cta_label":"Book now"}') ->> 'ok', 'true');
select pg_temp.chk('STORED hero content', (select content::text from public.website_sections where business_id = pg_temp.id('biza') and section_type = 'hero'),
  '{"headline": "Welcome", "cta_label": "Book now", "subheadline": "Hair & more"}');
select pg_temp.chk('about save ok', pg_temp.save_sec(pg_temp.id('owner'), 'about', '{"title":"About us","body":"We have cut hair since 1999 and love it."}') ->> 'ok', 'true');
select pg_temp.chk('faqs save ok', pg_temp.save_sec(pg_temp.id('owner'), 'faqs', '{"items":[{"q":"Parking?","a":"Yes, free."}]}') ->> 'ok', 'true');
select pg_temp.chk('contact save ok', pg_temp.save_sec(pg_temp.id('owner'), 'contact',
  '{"whatsapp":"+447700900123","map_url":"https://maps.example.com/p7","social":{"instagram":"https://instagram.com/p7a","facebook":"https://facebook.com/p7a"}}') ->> 'ok', 'true');
select pg_temp.chk('gallery save ok (own prefix)', pg_temp.save_sec(pg_temp.id('owner'), 'gallery',
  format('{"images":[{"path":"%s/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg","alt":"Front"}]}', pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('visibility toggle only (content null) keeps content',
  pg_temp.save_sec(pg_temp.id('owner'), 'about', null, 'true') ->> 'ok', 'true');
select pg_temp.chk('...content survived a visibility-only save',
  (select content ->> 'title' from public.website_sections where business_id = pg_temp.id('biza') and section_type = 'about'), 'About us');

-- reorder
select pg_temp.chk('reorder: manager forbidden', pg_temp.call_as(pg_temp.id('manager'), format('select public.reorder_website_sections(%L, array[''contact'',''hero'',''about'',''services'',''gallery'',''testimonials'',''faqs''])', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('reorder: 6 items refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.reorder_website_sections(%L, array[''hero'',''about'',''services'',''gallery'',''testimonials'',''faqs''])', pg_temp.id('biza'))) ->> 'code', 'invalid_order');
select pg_temp.chk('reorder: duplicate refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.reorder_website_sections(%L, array[''hero'',''hero'',''services'',''gallery'',''testimonials'',''faqs'',''contact''])', pg_temp.id('biza'))) ->> 'code', 'invalid_order');
select pg_temp.chk('reorder: unknown type refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.reorder_website_sections(%L, array[''hero'',''about'',''services'',''gallery'',''testimonials'',''faqs'',''blog''])', pg_temp.id('biza'))) ->> 'code', 'invalid_order');
select pg_temp.chk('...order unchanged after refusals',
  (select string_agg(section_type, ',' order by sort_order) from public.website_sections where business_id = pg_temp.id('biza')), 'hero,about,services,gallery,testimonials,faqs,contact');
select pg_temp.chk('reorder: valid', pg_temp.call_as(pg_temp.id('owner'), format('select public.reorder_website_sections(%L, array[''hero'',''services'',''about'',''testimonials'',''gallery'',''contact'',''faqs''])', pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('STORED new order',
  (select string_agg(section_type, ',' order by sort_order) from public.website_sections where business_id = pg_temp.id('biza')), 'hero,services,about,testimonials,gallery,contact,faqs');

-- ===========================================================================
-- 11. Publish + public read (leaks)
-- ===========================================================================
select pg_temp.chk('public read: UNPUBLISHED -> NULL', public.get_website_public('p7-a'), null::jsonb);
select pg_temp.chk('public read: unknown slug -> NULL', public.get_website_public('nope-nope'), null::jsonb);
select pg_temp.chk('unknown slug and unpublished are indistinguishable', public.get_website_public('p7-a') is null and public.get_website_public('nope-nope') is null, true);

select pg_temp.chk('publish: manager forbidden (no website.publish)', pg_temp.call_as(pg_temp.id('manager'), format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('publish: receptionist forbidden', pg_temp.call_as(pg_temp.id('recep'), format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('publish: staff forbidden', pg_temp.call_as(pg_temp.id('staffa'), format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('publish: other business forbidden', pg_temp.call_as(pg_temp.id('ownerb'), format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('publish: anon cannot call', pg_temp.call_anon(format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'error', '42501');
select pg_temp.chk('refused publishes left it unpublished + no audit',
  (select not is_published from public.websites where business_id = pg_temp.id('biza'))::text || (select count(*)::text from public.audit_logs where action like 'website.%publish%' and business_id = pg_temp.id('biza')), 'true0');
select pg_temp.chk('publish: owner ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'changed', 'true');
select pg_temp.chk('STORED published + published_at', (select is_published and published_at is not null from public.websites where business_id = pg_temp.id('biza')), true);
select pg_temp.chk('publish again: idempotent, no extra audit',
  (pg_temp.call_as(pg_temp.id('owner'), format('select public.set_website_published(%L, true)', pg_temp.id('biza'))) ->> 'changed') || (select count(*)::text from public.audit_logs where action = 'website.published' and business_id = pg_temp.id('biza')), 'false1');

do $$
declare w jsonb := public.get_website_public('p7-a'); t text;
begin
  t := w::text;
  perform pg_temp.chk('published: public read returns data', w is not null, true);
  perform pg_temp.chk('business name', w -> 'business' ->> 'name', 'P7 A');
  perform pg_temp.chk('branch address from the BRANCH', w -> 'branch' ->> 'address', '1 High Street, London');
  perform pg_temp.chk('branch phone from the BRANCH', w -> 'branch' ->> 'phone', '+442071234567');
  perform pg_temp.chk('hours from branch_hours (5 weekdays)', jsonb_array_length(w -> 'hours'), 5);
  perform pg_temp.chk('theme: radius', w -> 'website' ->> 'radius_key', 'lg');
  perform pg_temp.chk('seo title override (trimmed)', w -> 'seo' ->> 'title', 'P7 Salon');
  perform pg_temp.chk('seo description defaults from About body', w -> 'seo' ->> 'description', 'We have cut hair since 1999 and love it.');
  perform pg_temp.chk('sections follow the saved order, empty ones dropped (no blog/none); visible only',
    (select string_agg(s ->> 'type', ',') from jsonb_array_elements(w -> 'sections') s), 'hero,services,about,testimonials,gallery,contact,faqs');
  perform pg_temp.chk('services section lists ONLY the live active service',
    (select string_agg(x ->> 'name', ',') from jsonb_array_elements((select s -> 'services' from jsonb_array_elements(w -> 'sections') s where s ->> 'type' = 'services')) x), 'Cut');
  perform pg_temp.chk('price shown when show_prices = true',
    (select (x ->> 'price_minor')::int from jsonb_array_elements((select s -> 'services' from jsonb_array_elements(w -> 'sections') s where s ->> 'type' = 'services')) x), 4000);
  perform pg_temp.chk('testimonials = the 12 featured reviews only',
    jsonb_array_length((select s -> 'reviews' from jsonb_array_elements(w -> 'sections') s where s ->> 'type' = 'testimonials')), 12);
  perform pg_temp.chk('booking block present', w -> 'booking' ? 'bookable', true);
  -- LEAKS
  -- Asset URLs are <business uuid>/<file>, so the business id necessarily appears
  -- INSIDE asset paths (decided: path scoped by business_id). Strip those first.
  perform pg_temp.chk('NO business/branch/client/review/appointment id anywhere (outside asset paths)',
    (replace(t, pg_temp.id('biza')::text || '/', '') like '%' || pg_temp.id('biza')::text || '%') or (t like '%' || pg_temp.id('brancha')::text || '%') or (t like '%' || pg_temp.id('c1')::text || '%')
    or (t like '%' || pg_temp.id('rv1')::text || '%') or (t like '%' || pg_temp.id('ap1')::text || '%') or (t like '%' || pg_temp.id('svc')::text || '%'), false);
  perform pg_temp.chk('NO client full name / phone / email', (t like '%Connor%') or (t like '%Khan%') or (t like '%900111%') or (t like '%omar@%'), false);
  perform pg_temp.chk('NO staff name (never exposed with reviews)', (t ilike '%Alice%') or (t ilike '%Bernard%'), false);
  perform pg_temp.chk('NO google link on the website payload', t like '%g.page%', false);
  perform pg_temp.chk('first name only on a testimonial',
    (select r ->> 'first_name' from jsonb_array_elements((select s -> 'reviews' from jsonb_array_elements(w -> 'sections') s where s ->> 'type' = 'testimonials')) r
      where r ->> 'comment' = 'Great cut!'), 'Sarah');
  perform pg_temp.chk('the owner reply is public with the featured review',
    (select r ->> 'owner_reply' from jsonb_array_elements((select s -> 'reviews' from jsonb_array_elements(w -> 'sections') s where s ->> 'type' = 'testimonials')) r
      where r ->> 'comment' = 'Great cut!'), 'Thank you!');
  perform pg_temp.chk('the REMOVED review is not on the website', t like '%Not happy%', false);
  perform pg_temp.chk('the unfeatured 1-star is not on the website', t like '%Not happy%', false);
  -- JSON-LD
  perform pg_temp.chk('json-ld type', w -> 'json_ld' ->> '@type', 'LocalBusiness');
  perform pg_temp.chk('json-ld name', w -> 'json_ld' ->> 'name', 'P7 A');
  perform pg_temp.chk('json-ld street', w -> 'json_ld' -> 'address' ->> 'streetAddress', '1 High Street, London');
  perform pg_temp.chk('json-ld country', w -> 'json_ld' -> 'address' ->> 'addressCountry', 'GB');
  perform pg_temp.chk('json-ld phone', w -> 'json_ld' ->> 'telephone', '+442071234567');
  perform pg_temp.chk('json-ld opening hours: Monday 09:00-17:00 first',
    (w -> 'json_ld' -> 'openingHoursSpecification' -> 0 ->> 'dayOfWeek') || (w -> 'json_ld' -> 'openingHoursSpecification' -> 0 ->> 'opens')
    || (w -> 'json_ld' -> 'openingHoursSpecification' -> 0 ->> 'closes'), 'Monday09:0017:00');
  perform pg_temp.chk('json-ld sameAs from the contact socials', jsonb_array_length(w -> 'json_ld' -> 'sameAs'), 2);
end $$;

-- live data: price, show_prices, services
update public.service_branches set price_minor = 4500 where service_id = pg_temp.id('svc');
select pg_temp.chk('LIVE price change shows immediately',
  (select (x ->> 'price_minor')::int from jsonb_array_elements((select s -> 'services' from jsonb_array_elements(public.get_website_public('p7-a') -> 'sections') s where s ->> 'type' = 'services')) x), 4500);
update public.booking_settings set show_prices = false where branch_id = pg_temp.id('brancha');
select pg_temp.chk('show_prices = false: NO price field at all',
  (select count(*)::int from jsonb_array_elements((select s -> 'services' from jsonb_array_elements(public.get_website_public('p7-a') -> 'sections') s where s ->> 'type' = 'services')) x where x ? 'price_minor'), 0);
update public.booking_settings set show_prices = true where branch_id = pg_temp.id('brancha');
update public.services set is_active = false where id = pg_temp.id('svc');
select pg_temp.chk('no live services -> services section dropped',
  (select count(*)::int from jsonb_array_elements(public.get_website_public('p7-a') -> 'sections') s where s ->> 'type' = 'services'), 0);
update public.services set is_active = true where id = pg_temp.id('svc');

-- hidden section
select pg_temp.chk('hide a section', pg_temp.save_sec(pg_temp.id('owner'), 'faqs', null, 'false') ->> 'ok', 'true');
select pg_temp.chk('hidden section not public',
  (select count(*)::int from jsonb_array_elements(public.get_website_public('p7-a') -> 'sections') s where s ->> 'type' = 'faqs'), 0);

-- inactive / deleted business leaks nothing
alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() - interval '1 day' where id = pg_temp.id('biza');
select pg_temp.chk('INACTIVE business (trial lapsed): public read NULL (same as unknown)', public.get_website_public('p7-a'), null::jsonb);
update public.businesses set trial_ends_at = now() + interval '1000 days' where id = pg_temp.id('biza');
update public.businesses set deleted_at = now() where id = pg_temp.id('biza');
select pg_temp.chk('SOFT-DELETED business: public read NULL', public.get_website_public('p7-a'), null::jsonb);
update public.businesses set deleted_at = null where id = pg_temp.id('biza');
alter table public.businesses enable trigger businesses_enforce_guard;
select pg_temp.chk('restored business serves again', public.get_website_public('p7-a') is not null, true);

select pg_temp.chk('unpublish: owner ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_website_published(%L, false)', pg_temp.id('biza'))) ->> 'changed', 'true');
select pg_temp.chk('unpublished again: public read NULL', public.get_website_public('p7-a'), null::jsonb);
select pg_temp.chk('audit rows published=1 unpublished=1',
  (select count(*) filter (where action = 'website.published')::text || count(*) filter (where action = 'website.unpublished')::text
   from public.audit_logs where business_id = pg_temp.id('biza')), '11');

-- ===========================================================================
-- 12. Widget keys
-- ===========================================================================
select pg_temp.chk('widget key: manager forbidden', pg_temp.call_as(pg_temp.id('manager'), format('select public.ensure_widget_key(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('widget key: receptionist forbidden', pg_temp.call_as(pg_temp.id('recep'), format('select public.ensure_widget_key(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('widget key: staff forbidden', pg_temp.call_as(pg_temp.id('staffa'), format('select public.ensure_widget_key(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('widget key: other business forbidden', pg_temp.call_as(pg_temp.id('ownerb'), format('select public.ensure_widget_key(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('widget key: anon cannot call', pg_temp.call_anon(format('select public.ensure_widget_key(%L)', pg_temp.id('biza'))) ->> 'error', '42501');
select pg_temp.chk('refusals created no key', (select count(*)::int from public.widget_keys where business_id = pg_temp.id('biza')), 0);

do $$
declare r jsonb;
begin
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.ensure_widget_key(%L)', pg_temp.id('biza')));
  perform pg_temp.chk('owner creates key', r ->> 'created', 'true');
  perform pg_temp.chk('key format wk_ + 32 hex', r ->> 'public_key' ~ '^wk_[0-9a-f]{32}$', true);
  insert into tok values ('wk', r ->> 'public_key');
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.ensure_widget_key(%L)', pg_temp.id('biza')));
  perform pg_temp.chk('ensure again: same key, created=false', (r ->> 'created') || (r ->> 'public_key'), 'false' || pg_temp.t('wk'));
end $$;
select pg_temp.chk('one live key per business', (select count(*)::int from public.widget_keys where business_id = pg_temp.id('biza')), 1);
select pg_temp.chk('new key has no allowed domains and is active',
  (select allowed_domains = '{}' and is_active from public.widget_keys where business_id = pg_temp.id('biza')), true);

-- before any domain is listed nothing validates
select pg_temp.chk('no domains yet: any origin refused', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));

-- domains: validation + normalisation + permissions
select pg_temp.chk('domains: manager forbidden', pg_temp.call_as(pg_temp.id('manager'), format('select public.save_widget_domains(%L, array[''a.com''])', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('domains: other business forbidden', pg_temp.call_as(pg_temp.id('ownerb'), format('select public.save_widget_domains(%L, array[''a.com''])', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('domains: scheme refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, array[''https://a.com''])', pg_temp.id('biza'))) ->> 'code', 'invalid_domains');
select pg_temp.chk('domains: wildcard refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, array[''*.a.com''])', pg_temp.id('biza'))) ->> 'code', 'invalid_domains');
select pg_temp.chk('domains: path refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, array[''a.com/x''])', pg_temp.id('biza'))) ->> 'code', 'invalid_domains');
select pg_temp.chk('domains: bare word refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, array[''intranet''])', pg_temp.id('biza'))) ->> 'code', 'invalid_domains');
select pg_temp.chk('domains: more than 10 refused', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, (select array_agg(''d'' || g || ''.com'') from generate_series(1,11) g))', pg_temp.id('biza'))) ->> 'code', 'invalid_domains');
select pg_temp.chk('domains: one bad entry among good ones refuses ALL', pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, array[''good.com'', ''bad domain''])', pg_temp.id('biza'))) ->> 'code', 'invalid_domains');
select pg_temp.chk('...stored domains untouched by failures', (select allowed_domains = '{}' from public.widget_keys where business_id = pg_temp.id('biza')), true);
select pg_temp.chk('domains: valid save normalises case/space and dedupes',
  pg_temp.call_as(pg_temp.id('owner'), format('select public.save_widget_domains(%L, array['' Example.COM '', ''example.com'', ''shop.example.org'', ''localhost''])', pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('STORED domains', (select array_to_string(allowed_domains, ',') from public.widget_keys where business_id = pg_temp.id('biza')), 'example.com,localhost,shop.example.org');
select pg_temp.chk('audit row widget.domains_changed', (select count(*)::int from public.audit_logs where action = 'widget.domains_changed' and business_id = pg_temp.id('biza')), 1);

-- origin check
select pg_temp.chk('origin ok: https://example.com', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com') ->> 'slug', 'p7-a');
select pg_temp.chk('origin ok: case and trailing slash', public.validate_widget_origin(pg_temp.t('wk'), 'HTTPS://Example.COM/') ->> 'ok', 'true');
select pg_temp.chk('origin ok: listed host with a port', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com:8443') ->> 'ok', 'true');
select pg_temp.chk('origin ok: listed second domain', public.validate_widget_origin(pg_temp.t('wk'), 'https://shop.example.org') ->> 'ok', 'true');
select pg_temp.chk('origin ok: http://localhost (dev)', public.validate_widget_origin(pg_temp.t('wk'), 'http://localhost:8081') ->> 'ok', 'true');
select pg_temp.chk('origin refused: unlisted site', public.validate_widget_origin(pg_temp.t('wk'), 'https://evil.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: unlisted SUBDOMAIN of a listed domain', public.validate_widget_origin(pg_temp.t('wk'), 'https://www.example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: suffix trick example.com.evil.com', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com.evil.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: userinfo trick example.com@evil.com', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com@evil.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: plain http for a non-localhost host', public.validate_widget_origin(pg_temp.t('wk'), 'http://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: javascript:', public.validate_widget_origin(pg_temp.t('wk'), 'javascript:alert(1)'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: "null" (sandboxed iframe)', public.validate_widget_origin(pg_temp.t('wk'), 'null'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: empty', public.validate_widget_origin(pg_temp.t('wk'), ''), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: NULL', public.validate_widget_origin(pg_temp.t('wk'), null), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('origin refused: with a path', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com/page'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('key refused: unknown', public.validate_widget_origin('wk_' || repeat('0', 32), 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('key refused: malformed', public.validate_widget_origin('nope', 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('key refused: NULL', public.validate_widget_origin(null, 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('a refusal never reveals the slug', public.validate_widget_origin(pg_temp.t('wk'), 'https://evil.com')::text like '%p7%', false);

-- frame ancestors
select pg_temp.chk('frame ancestors: listed origins as CSP sources',
  array_to_string(public.get_widget_frame_ancestors('p7-a'), ' '), 'https://example.com http://localhost:* https://shop.example.org');
select pg_temp.chk('frame ancestors: unknown slug -> none', public.get_widget_frame_ancestors('nope-nope'), '{}'::text[]);
select pg_temp.chk('frame ancestors: another business -> none', public.get_widget_frame_ancestors('p7-b'), '{}'::text[]);

-- inactive key, rotation, inactive business
select pg_temp.chk('deactivate: manager forbidden', pg_temp.call_as(pg_temp.id('manager'), format('select public.set_widget_active(%L, false)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('...key still active', (select is_active from public.widget_keys where business_id = pg_temp.id('biza')), true);
select pg_temp.chk('deactivate: owner ok', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_widget_active(%L, false)', pg_temp.id('biza'))) ->> 'changed', 'true');
select pg_temp.chk('INACTIVE key: origin refused', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('INACTIVE key: no frame ancestors', public.get_widget_frame_ancestors('p7-a'), '{}'::text[]);
select pg_temp.chk('reactivate', pg_temp.call_as(pg_temp.id('owner'), format('select public.set_widget_active(%L, true)', pg_temp.id('biza'))) ->> 'changed', 'true');

select pg_temp.chk('rotate: staff forbidden', pg_temp.call_as(pg_temp.id('staffa'), format('select public.rotate_widget_key(%L)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
do $$
declare r jsonb;
begin
  r := pg_temp.call_as(pg_temp.id('owner'), format('select public.rotate_widget_key(%L)', pg_temp.id('biza')));
  perform pg_temp.chk('rotate ok, new key differs', r ->> 'public_key' <> pg_temp.t('wk'), true);
  insert into tok values ('wk2', r ->> 'public_key');
end $$;
select pg_temp.chk('OLD key dead after rotation', public.validate_widget_origin(pg_temp.t('wk'), 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('NEW key works', public.validate_widget_origin(pg_temp.t('wk2'), 'https://example.com') ->> 'ok', 'true');
select pg_temp.chk('domains survive rotation', (select array_length(allowed_domains, 1) from public.widget_keys where business_id = pg_temp.id('biza')), 3);

alter table public.businesses disable trigger businesses_enforce_guard;
update public.businesses set trial_ends_at = now() - interval '1 day' where id = pg_temp.id('biza');
select pg_temp.chk('INACTIVE business: origin refused', public.validate_widget_origin(pg_temp.t('wk2'), 'https://example.com'), jsonb_build_object('ok', false, 'code', 'not_found'));
select pg_temp.chk('INACTIVE business: no frame ancestors', public.get_widget_frame_ancestors('p7-a'), '{}'::text[]);
update public.businesses set trial_ends_at = now() + interval '1000 days' where id = pg_temp.id('biza');
alter table public.businesses enable trigger businesses_enforce_guard;

-- widget RLS
select pg_temp.chk('owner reads own widget key', pg_temp.cnt(pg_temp.id('owner'), 'public.widget_keys'), 1);
select pg_temp.chk('manager sees NO widget keys', pg_temp.cnt(pg_temp.id('manager'), 'public.widget_keys'), 0);
select pg_temp.chk('receptionist sees NO widget keys', pg_temp.cnt(pg_temp.id('recep'), 'public.widget_keys'), 0);
select pg_temp.chk('staff sees NO widget keys', pg_temp.cnt(pg_temp.id('staffa'), 'public.widget_keys'), 0);
select pg_temp.chk('OTHER business sees NO widget keys', pg_temp.cnt(pg_temp.id('ownerb'), 'public.widget_keys'), 0);
select pg_temp.chk('anon reads no widget keys', pg_temp.call_anon('select jsonb_build_object(''n'', count(*)) from public.widget_keys') ->> 'error', '42501');
select pg_temp.chk('audit rows: key_created, key_rotated, deactivated, activated',
  (select string_agg(action, ',' order by action) from public.audit_logs where business_id = pg_temp.id('biza') and action like 'widget.%' and action <> 'widget.domains_changed'),
  'widget.activated,widget.deactivated,widget.key_created,widget.key_rotated');

-- ===========================================================================
-- 13. website-assets bucket
-- ===========================================================================
select pg_temp.chk('bucket is public, 5 MB, jpeg/png/webp only',
  (select public::text || file_size_limit::text || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'website-assets'),
  'true5242880image/jpeg,image/png,image/webp');

create or replace function pg_temp.upload(p_user uuid, p_name text) returns text language plpgsql as $$
begin
  if p_user is null then
    perform set_config('request.jwt.claims', '{}', true); set local role anon;
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true); set local role authenticated;
  end if;
  insert into storage.objects (bucket_id, name) values ('website-assets', p_name);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return 'ERR:' || sqlstate;
end $$;

select pg_temp.chk('owner can upload under ITS business prefix', pg_temp.upload(pg_temp.id('owner'), pg_temp.id('biza')::text || '/cccccccc-cccc-cccc-cccc-cccccccccccc.png'), 'ok');
select pg_temp.chk('other business CANNOT write under A''s prefix', pg_temp.upload(pg_temp.id('ownerb'), pg_temp.id('biza')::text || '/dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('manager (no website.edit) cannot write', pg_temp.upload(pg_temp.id('manager'), pg_temp.id('biza')::text || '/dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('receptionist cannot write', pg_temp.upload(pg_temp.id('recep'), pg_temp.id('biza')::text || '/dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('staff cannot write', pg_temp.upload(pg_temp.id('staffa'), pg_temp.id('biza')::text || '/dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('anon cannot write', pg_temp.upload(null, pg_temp.id('biza')::text || '/dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('svg refused', pg_temp.upload(pg_temp.id('owner'), pg_temp.id('biza')::text || '/dddddddd-dddd-dddd-dddd-dddddddddddd.svg'), 'ERR:42501');
select pg_temp.chk('non-uuid filename refused', pg_temp.upload(pg_temp.id('owner'), pg_temp.id('biza')::text || '/logo.png'), 'ERR:42501');
select pg_temp.chk('nested path refused', pg_temp.upload(pg_temp.id('owner'), pg_temp.id('biza')::text || '/x/dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('path with no business prefix refused', pg_temp.upload(pg_temp.id('owner'), 'dddddddd-dddd-dddd-dddd-dddddddddddd.png'), 'ERR:42501');
select pg_temp.chk('other business CAN upload under ITS OWN prefix', pg_temp.upload(pg_temp.id('ownerb'), pg_temp.id('bizb')::text || '/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.webp'), 'ok');

select pg_temp.chk('only the two legitimate objects exist (for these two businesses)',
  (select count(*)::int from storage.objects where bucket_id = 'website-assets'
     and (name like pg_temp.id('biza')::text || '/%' or name like pg_temp.id('bizb')::text || '/%')), 2);
-- listing
select pg_temp.chk('anon CANNOT list the bucket (0 rows or denied)',
  coalesce(pg_temp.call_anon('select jsonb_build_object(''n'', count(*)) from storage.objects where bucket_id = ''website-assets''') ->> 'n', 'denied') in ('0', 'denied'), true);
-- Storage blocks raw DELETE unless this flag is set (it is what the Storage API sets).
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.chk('other business cannot list A''s objects', pg_temp.cnt(pg_temp.id('ownerb'), 'storage.objects', format('bucket_id = ''website-assets'' and name like %L', pg_temp.id('biza')::text || '/%')), 0);
select pg_temp.chk('manager cannot list objects', pg_temp.cnt(pg_temp.id('manager'), 'storage.objects', 'bucket_id = ''website-assets'''), 0);
select pg_temp.chk('owner lists ITS object only', pg_temp.cnt(pg_temp.id('owner'), 'storage.objects', 'bucket_id = ''website-assets'''), 1);
-- delete
select pg_temp.chk('other business delete of A''s object affects nothing',
  (pg_temp.call_as(pg_temp.id('ownerb'), format('with d as (delete from storage.objects where bucket_id = ''website-assets'' and name like %L returning 1) select jsonb_build_object(''n'', count(*)) from d', pg_temp.id('biza')::text || '/%')) ->> 'n'), '0');
select pg_temp.chk('...A''s object still exists', (select count(*)::int from storage.objects where bucket_id = 'website-assets' and name like pg_temp.id('biza')::text || '/%'), 1);
select pg_temp.chk('anon delete deletes nothing (denied or 0 rows)',
  (select coalesce(r ->> 'n', 'denied') in ('0', 'denied')
   from (select pg_temp.call_anon('with d as (delete from storage.objects where bucket_id = ''website-assets'' returning 1) select jsonb_build_object(''n'', count(*)) from d') as r) x), true);
select pg_temp.chk('...A''s object still exists after the anon attempt', (select count(*)::int from storage.objects where bucket_id = 'website-assets' and name like pg_temp.id('biza')::text || '/%'), 1);
select pg_temp.chk('owner can delete its own object',
  (pg_temp.call_as(pg_temp.id('owner'), format('with d as (delete from storage.objects where bucket_id = ''website-assets'' and name like %L returning 1) select jsonb_build_object(''n'', count(*)) from d', pg_temp.id('biza')::text || '/%')) ->> 'n'), '1');
-- per-business cap of 60
insert into storage.objects (bucket_id, name)
select 'website-assets', pg_temp.id('biza')::text || '/' || gen_random_uuid()::text || '.jpg' from generate_series(1, 60);
select pg_temp.chk('61st object for a business refused (cap 60)', pg_temp.upload(pg_temp.id('owner'), pg_temp.id('biza')::text || '/ffffffff-ffff-ffff-ffff-ffffffffffff.png'), 'ERR:42501');
select pg_temp.chk('...another business is unaffected by A''s cap', pg_temp.upload(pg_temp.id('ownerb'), pg_temp.id('bizb')::text || '/99999999-9999-9999-9999-999999999999.png'), 'ok');

-- ===========================================================================
-- 14. Cascade: deleting the business releases every new row
-- ===========================================================================
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
do $$
begin
  delete from public.businesses where id = pg_temp.id('biza');
exception when others then
  perform pg_temp.chk('business delete cascade works with websites/reviews/requests/widget keys: ' || sqlerrm, false, true);
end $$;
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
select pg_temp.chk('cascade removed websites', (select count(*)::int from public.websites where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed sections', (select count(*)::int from public.website_sections where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed reviews', (select count(*)::int from public.reviews where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed review requests', (select count(*)::int from public.review_requests where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('cascade removed widget keys', (select count(*)::int from public.widget_keys where business_id = pg_temp.id('biza')), 0);

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
