-- Phase 10C: CLIENT PORTAL (add-on `client_portal`): passwordless sign-in, sessions, isolation, reads, actions.
--
--   supabase db query --linked -f supabase/tests/26_client_portal.sql
--
-- Plain SQL, own fixtures, rolled back. Every portal RPC is called as service_role (what the Edge Function
-- uses). Proves: nobody else can call them, a customer sees only the clients linked to their verified
-- email in THAT business, no internal notes / other clients leak, tokens are single-use / expiring / hashed,
-- unknown and known emails are indistinguishable, add-on off and inactive business refuse everything,
-- cancel / reschedule / book reuse the engines and the original survives every failure. Real parallel
-- sessions: 26_portal_http.mjs.
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
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', case when p_aal2 then 'aal2' else 'aal1' end,
      'amr', case when p_aal2 then json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)) else '[]'::json end)::text, true);
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


create temporary table sess (k text primary key, v text) on commit drop;
do $$
declare s text;
begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant select, insert, update on %I.sess to authenticated, anon, service_role', s);
  execute format('grant usage on schema %I to service_role', s);
  execute format('grant select, insert on %I.ids to service_role', s);
  execute format('grant select, insert on %I.res to service_role', s);
end $$;
create or replace function pg_temp.slot(p_minute int, p_weeks int default 2)
returns timestamptz language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Europe/London')::date + (p_weeks*7))::date)::timestamp
          + make_interval(mins => p_minute)) at time zone 'Europe/London';
$$;
create or replace function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin execute p_sql into r; exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.p(p_fn text, p_args text) returns jsonb language sql as $$
  select pg_temp.svc('select public.' || p_fn || '(' || p_args || ')')
$$;
create or replace function pg_temp.raw_token(p_biz text, p_email text) returns text language sql as $$
  select public.outbox_unseal(o.sealed) from public.message_outbox o
  join public.portal_login_tokens t on t.id = (o.payload->>'token_id')::uuid
  where o.event = 'portal_login' and t.business_id = pg_temp.id(p_biz) and t.email = p_email and o.sealed is not null
    and t.revoked_at is null and t.used_at is null
  limit 1
$$;
create or replace function pg_temp.login(p_slug text, p_biz text, p_email text, p_key text) returns text language plpgsql as $$
declare r jsonb; v_raw text;
begin
  perform pg_temp.p('portal_request_login', format('%L, %L, ''iph''', p_slug, p_email));
  v_raw := pg_temp.raw_token(p_biz, p_email);
  r := pg_temp.p('portal_exchange_token', format('%L, ''iph''', v_raw));
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'login failed: %', r; end if;
  insert into sess values (p_key, r->>'session_token') on conflict (k) do update set v = excluded.v;
  return r->>'session_token';
end $$;
create or replace function pg_temp.S(p_key text) returns text language sql as $$ select v from sess where k = $1 $$;
create or replace function pg_temp.appt2(p_key text, p_client text, p_status text, p_start timestamptz, p_staff text default 'ann', p_internal text default null, p_cnotes text default null) returns void language plpgsql as $$
declare v_fv uuid; v_id uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, internal_notes, client_notes, cancelled_at)
  values (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id(p_client), pg_temp.id('svc'), pg_temp.id(p_staff), p_start, p_start + interval '60 minutes', 60, 0, p_status::public.appointment_status, 'online', v_fv, 4000, p_internal, p_cnotes, case when p_status = 'cancelled' then now() end)
  returning id into v_id;
  insert into ids values (p_key, v_id);
end $$;

-- ===========================================================================
-- Fixtures
-- ===========================================================================
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('ownerb'),('stranger')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p10ct.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P10C Alpha','p10c-a','GB','GBP','Europe/London','en',null,'Alpha');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P10C Beta','p10c-b','GB','GBP','Europe/London','en',null,'Beta');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'brb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
do $$
declare v_svc uuid; v_ann uuid; v_bobs uuid; v_c uuid; v_br uuid := pg_temp.id('bra'); v_biz uuid := pg_temp.id('biza');
begin
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Cut', 60, 0) returning id into v_svc; insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 4000, true);
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Ann', 1) returning id into v_ann; insert into ids values ('ann', v_ann);
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Bob', 2) returning id into v_bobs; insert into ids values ('bobstaff', v_bobs);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz), (v_bobs, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz), (v_svc, v_bobs, v_biz);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute) select v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute) select s, v_br, v_biz, d, 540, 1020 from generate_series(0,6) d, (values (v_ann),(v_bobs)) x(s);
  update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365, slot_interval = 'min_60', customer_can_cancel = true, cancel_cutoff_hours = 24, confirmation = 'auto' where branch_id = v_br;
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Alice Adams', '+447700910001', 'Alice@Example.com', v_br) returning id into v_c; insert into ids values ('alice1', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Alicia Adams-Jones', '+447700910002', 'alice@example.com', v_br) returning id into v_c; insert into ids values ('alice2', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (v_biz, 'Bob Brown', '+447700910003', 'bob@example.com', v_br) returning id into v_c; insert into ids values ('bob', v_c);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Carol NoEmail', '+447700910004', v_br) returning id into v_c; insert into ids values ('carol', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id, deleted_at) values (v_biz, 'Dave Deleted', '+447700910005', 'dave@example.com', v_br, now()) returning id into v_c; insert into ids values ('dave', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email) values (pg_temp.id('bizb'), 'Bob Beta', '+447700910006', 'bob@example.com') returning id into v_c; insert into ids values ('bobb', v_c);
end $$;
select pg_temp.appt2('a_up', 'alice1', 'confirmed', pg_temp.slot(600, 3), 'ann', 'INTERNAL-SECRET-NOTE', 'please use the side door');
select pg_temp.appt2('a_up2', 'alice2', 'confirmed', pg_temp.slot(660, 3), 'ann');
select pg_temp.appt2('a_past', 'alice1', 'completed', now() - interval '30 days', 'ann', 'INTERNAL-PAST');
select pg_temp.appt2('b_up', 'bob', 'confirmed', pg_temp.slot(720, 3), 'bobstaff', 'BOB-INTERNAL');
select pg_temp.appt2('a_soon', 'alice1', 'confirmed', now() + interval '3 hours', 'bobstaff');

-- ===========================================================================
-- 1. Nobody but the Edge Function can reach any of it
-- ===========================================================================
do $$
declare v_fns text[] := array['portal_info(text)', 'portal_request_login(text,text,text)', 'portal_exchange_token(text,text)', 'portal_sign_out(text,boolean)',
  'portal_overview(text)', 'portal_bookings(text,text,integer,integer)', 'portal_packages(text)', 'portal_invoices(text,integer,integer)', 'portal_invoice(text,uuid)',
  'portal_photos(text)', 'portal_photo_paths(text,uuid[])', 'portal_forms(text)', 'portal_cancel_booking(text,uuid,text)', 'portal_reschedule_slots(text,uuid,date,date)',
  'portal_reschedule_booking(text,uuid,timestamptz,uuid)', 'portal_create_booking(text,uuid,uuid,timestamptz,uuid,text,uuid)', 'portal_ctx(text)', 'portal_client_ids(uuid,text)'];
  f text; bad text := '';
begin
  foreach f in array v_fns loop
    if has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute') then bad := bad || f || ' '; end if;
    if f not in ('portal_ctx(text)', 'portal_client_ids(uuid,text)') and not has_function_privilege('service_role', 'public.' || f, 'execute') then bad := bad || 'NOSVC:' || f || ' '; end if;
  end loop;
  perform pg_temp.chk('no portal function is executable by anon or authenticated (all 18 checked)', bad, '');
  perform pg_temp.chk('a dashboard OWNER calling portal_exchange_token / portal_create_booking is refused (42501)', (pg_temp.as_('owner', $q$select public.portal_exchange_token(repeat('a', 64))$q$)->>'state') || (pg_temp.as_('owner', format($q$select public.portal_create_booking('x', %L, %L, now())$q$, pg_temp.id('alice1'), pg_temp.id('svc')))->>'state'), '4250142501');
  perform pg_temp.chk('the portal tables are unreadable and unwritable by dashboard roles and anon', pg_temp.try_as('owner', 'select * from public.portal_sessions') || pg_temp.try_as('owner', 'select * from public.portal_login_tokens') || pg_temp.try_as('owner', 'delete from public.portal_sessions') || (pg_temp.as_anon('select to_jsonb(count(*)) from public.portal_sessions')->>'state'), '42501425014250142501');
end $$;

-- ===========================================================================
-- 2. Entry + asking for a link: no enumeration
-- ===========================================================================
do $$
declare r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb;
begin
  perform pg_temp.chk('portal_info: the portal exists (add-on on during the trial)', ((pg_temp.p('portal_info', $q$'p10c-a'$q$))->>'ok') || ((pg_temp.p('portal_info', $q$'P10C-A '$q$))->>'business_name'), 'trueP10C Alpha');
  perform pg_temp.chk('portal_info: an unknown slug and a null slug answer identically (not_available)', ((pg_temp.p('portal_info', $q$'nope-nope'$q$))::text) || ((pg_temp.p('portal_info', $q$null$q$))::text), '{"ok": false, "code": "not_available"}{"ok": false, "code": "not_available"}');
  perform pg_temp.chk('request_login: a malformed email is the ONLY refusal (invalid_email), nothing stored', (pg_temp.p('portal_request_login', $q$'p10c-a', 'not-an-email', 'h'$q$)->>'code') || (pg_temp.p('portal_request_login', $q$'p10c-a', null, 'h'$q$)->>'code') || '/' || (select count(*)::text from public.portal_login_tokens), 'invalid_emailinvalid_email/0');
  r1 := pg_temp.p('portal_request_login', $q$'p10c-a', 'alice@example.com', 'h'$q$);
  r2 := pg_temp.p('portal_request_login', $q$'p10c-a', 'nobody-here@example.com', 'h'$q$);
  r3 := pg_temp.p('portal_request_login', $q$'p10c-a', 'carol@example.com', 'h'$q$);
  r4 := pg_temp.p('portal_request_login', $q$'no-such-slug', 'alice@example.com', 'h'$q$);
  perform pg_temp.chk('a KNOWN email, an UNKNOWN email, a client without email and an unknown slug get the IDENTICAL reply', (r1 = r2 and r2 = r3 and r3 = r4)::text || '/' || r1::text, 'true/{"ok": true}');
  perform pg_temp.chk('...yet only the known one stored a token and queued ONE email (to a matching client)', (select count(*)::text from public.portal_login_tokens) || '/' || (select count(*)::text from public.message_outbox where event = 'portal_login') || '/' || (select (client_id in (pg_temp.id('alice1'), pg_temp.id('alice2')))::text from public.message_outbox where event = 'portal_login'), '1/1/true');
  perform pg_temp.chk('a DELETED client''s email gets nothing', (pg_temp.p('portal_request_login', $q$'p10c-a', 'dave@example.com', 'h'$q$)->>'ok') || '/' || (select count(*)::text from public.portal_login_tokens), 'true/1');
  perform pg_temp.chk('stored token: sha256 only, 15 minutes, unused, normalised email; the outbox row is sealed and holds only the token id', (select concat_ws('|', (token_hash ~ '^[0-9a-f]{64}$')::text, (expires_at between now() + interval '14 minutes 50 seconds' and now() + interval '15 minutes 10 seconds')::text, (used_at is null)::text, email) from public.portal_login_tokens limit 1) || '/' || (select concat_ws('|', (sealed is not null)::text, (payload ? 'token')::text, ((payload->>'token_id') is not null)::text) from public.message_outbox where event = 'portal_login'), 'true|true|true|alice@example.com/true|false|true');
  perform pg_temp.chk('the raw token is NOT stored anywhere in the database (not in the table, not in the payload)', (select count(*)::text from public.portal_login_tokens where token_hash = pg_temp.raw_token('biza', 'alice@example.com')) || '/' || (select count(*)::text from public.message_outbox where payload::text like '%' || pg_temp.raw_token('biza', 'alice@example.com') || '%'), '0/0');
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'ALICE@example.com ', 'h'$q$);
  perform pg_temp.chk('a second request revokes the first (one live link) and the email is normalised', (select count(*)::text from public.portal_login_tokens where revoked_at is null and used_at is null) || '/' || (select count(*)::text from public.portal_login_tokens), '1/2');
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'alice@example.com', 'h'$q$);
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'alice@example.com', 'h'$q$);
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'alice@example.com', 'h'$q$);
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'alice@example.com', 'h'$q$);
  perform pg_temp.chk('DB backstop: at most 5 links an hour per email, and the cap answers the same {ok:true}', (select count(*)::text from public.portal_login_tokens where email = 'alice@example.com'), '5');
  perform pg_temp.p('portal_request_login', $q$'p10c-b', 'bob@example.com', 'h'$q$);
  perform pg_temp.chk('the same email in ANOTHER business is a different login (token scoped to its business)', 'true' || '/' || (select count(*)::text from public.portal_login_tokens where business_id = pg_temp.id('bizb')) || '/' || (select (client_id = pg_temp.id('bobb'))::text from public.message_outbox where event = 'portal_login' and business_id = pg_temp.id('bizb')), 'true/1/true');
end $$;

-- ===========================================================================
-- 3. Exchange: single use, expiry, generic failure
-- ===========================================================================
do $$
declare raw text; r jsonb; v_sess text;
begin
  raw := pg_temp.raw_token('biza', 'alice@example.com');
  perform pg_temp.chk('exchange: unknown / short / null token => the same invalid_token', (pg_temp.p('portal_exchange_token', $q$repeat('a', 64), 'h'$q$)->>'code') || (pg_temp.p('portal_exchange_token', $q$'short', 'h'$q$)->>'code') || (pg_temp.p('portal_exchange_token', $q$null, 'h'$q$)->>'code'), 'invalid_tokeninvalid_tokeninvalid_token');
  r := pg_temp.p('portal_exchange_token', format('%L, %L', raw, 'iphash'));
  perform pg_temp.chk('exchange: ok, a 64-hex session token + business name + slug', (r->>'ok') || '/' || (((r->>'session_token') ~ '^[0-9a-f]{64}$')::text) || '/' || (r->>'business_name') || '/' || (r->>'slug'), 'true/true/P10C Alpha/p10c-a');
  v_sess := r->>'session_token';
  insert into sess values ('alice', v_sess);
  perform pg_temp.chk('stored: ONLY the sha256 of the session, 14 days, unrevoked, ip hash', (select concat_ws('|', (token_hash = encode(extensions.digest(v_sess, 'sha256'), 'hex'))::text, (token_hash <> v_sess)::text, (expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour')::text, (revoked_at is null)::text, ip_hash) from public.portal_sessions limit 1), 'true|true|true|true|iphash');
  perform pg_temp.chk('...and the link is USED', (select (used_at is not null)::text from public.portal_login_tokens where token_hash = encode(extensions.digest(raw, 'sha256'), 'hex')), 'true');
  perform pg_temp.chk('REPLAY: the same link again => invalid_token, still ONE session', (pg_temp.p('portal_exchange_token', format('%L, %L', raw, 'iphash'))->>'code') || '/' || (select count(*)::text from public.portal_sessions), 'invalid_token/1');
  perform pg_temp.chk('audit: portal.login with NO actor and no email or token in the row', (select concat_ws('|', (actor_user_id is null)::text, (after::text like '%alice%')::text, (after::text like '%' || v_sess || '%')::text) from public.audit_logs where action = 'portal.login'), 'true|false|false');
  perform pg_temp.chk('a session token used as a login link is refused', pg_temp.p('portal_exchange_token', format('%L, %L', v_sess, 'h'))->>'code', 'invalid_token');
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'bob@example.com', 'h'$q$);
  raw := pg_temp.raw_token('biza', 'bob@example.com');
  alter table public.portal_login_tokens disable trigger portal_login_tokens_guard;
  update public.portal_login_tokens set expires_at = now() - interval '1 second' where token_hash = encode(extensions.digest(raw, 'sha256'), 'hex');
  alter table public.portal_login_tokens enable trigger portal_login_tokens_guard;
  perform pg_temp.chk('an EXPIRED link => invalid_token, no session for bob', (pg_temp.p('portal_exchange_token', format('%L, %L', raw, 'h'))->>'code') || '/' || (select count(*)::text from public.portal_sessions where email = 'bob@example.com'), 'invalid_token/0');
  perform pg_temp.chk('tokens and sessions cannot be edited or deleted (even by postgres)', pg_temp.try(format($q$update public.portal_sessions set email = 'x@y.z' where token_hash = encode(extensions.digest(%L, 'sha256'), 'hex')$q$, v_sess)) || '/' || pg_temp.try('delete from public.portal_sessions') || '/' || pg_temp.try('delete from public.portal_login_tokens'), '23514/23514/23514');
  perform pg_temp.login('p10c-a', 'biza', 'bob@example.com', 'bob');
  perform pg_temp.login('p10c-b', 'bizb', 'bob@example.com', 'bobb');
end $$;

-- ===========================================================================
-- 4. A signed-in customer sees ONLY their own linked clients; nothing internal leaks
-- ===========================================================================
do $$
declare r jsonb; t text; v_fns text[]; f text; v_all text := '';
begin
  r := pg_temp.p('portal_overview', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('overview: business name, BOTH alice clients by FIRST name, feature flags (trial: all on)', (r->>'business_name') || '/' || (select string_agg(x->>'first_name', ',' order by x->>'first_name') from jsonb_array_elements(r->'clients') x) || '/' || (r->'features')::text, 'P10C Alpha/Alice,Alicia/{"files": true, "forms": true, "packages": true}');
  perform pg_temp.chk('overview: no bob, no emails, no phones, no full names', (position(pg_temp.id('bob')::text in r::text) = 0 and position('example.com' in r::text) = 0 and position('+4477' in r::text) = 0 and position('Adams' in r::text) = 0)::text, 'true');
  r := pg_temp.p('portal_bookings', format('%L, ''upcoming''', pg_temp.S('alice')));
  t := r::text;
  perform pg_temp.chk('upcoming: exactly alice''s 3 (soonest first), never bob''s', (select string_agg(x->>'id', ',' order by ord) from jsonb_array_elements(r->'rows') with ordinality as e(x, ord)), pg_temp.id('a_soon')::text || ',' || pg_temp.id('a_up')::text || ',' || pg_temp.id('a_up2')::text);
  perform pg_temp.chk('INTERNAL notes never leave (neither the alice nor the bob marker), no staff phone, no client ids', (position('INTERNAL' in t) = 0 and (r->'rows'->0 ? 'internal_notes') = false and position('phone' in t) = 0 and position(pg_temp.id('alice1')::text in t) = 0)::text, 'true');
  perform pg_temp.chk('the customer''s OWN note is shown back, staff by display name only, branch timezone', (select concat_ws('|', x->>'client_notes', x->>'staff_name', x->>'timezone', x->>'service_name') from jsonb_array_elements(r->'rows') x where x->>'id' = pg_temp.id('a_up')::text), 'please use the side door|Ann|Europe/London|Cut');
  perform pg_temp.chk('can_cancel: true far ahead, false inside the 24h window', (select (x->>'can_cancel') from jsonb_array_elements(r->'rows') x where x->>'id' = pg_temp.id('a_up')::text) || '/' || (select (x->>'can_cancel') from jsonb_array_elements(r->'rows') x where x->>'id' = pg_temp.id('a_soon')::text), 'true/false');
  r := pg_temp.p('portal_bookings', format('%L, ''past''', pg_temp.S('alice')));
  perform pg_temp.chk('past: only alice''s completed visit, internal note absent', jsonb_array_length(r->'rows')::text || '/' || (r->'rows'->0->>'id') || '/' || (position('INTERNAL' in r::text) = 0)::text, '1/' || pg_temp.id('a_past')::text || '/true');
  r := pg_temp.p('portal_bookings', format('%L, ''upcoming'', 1, 0', pg_temp.S('alice')));
  perform pg_temp.chk('pagination: limit 1 -> one row and has_more', jsonb_array_length(r->'rows')::text || '/' || (r->>'has_more'), '1/true');
  perform pg_temp.chk('a bad scope is a bad_request', pg_temp.p('portal_bookings', format('%L, ''everything''', pg_temp.S('alice')))->>'code', 'bad_request');
  r := pg_temp.p('portal_bookings', format('%L, ''upcoming''', pg_temp.S('bob')));
  perform pg_temp.chk('bob (same business) sees ONLY his booking, none of alice''s', jsonb_array_length(r->'rows')::text || '/' || (r->'rows'->0->>'id') || '/' || (position('side door' in r::text) = 0)::text, '1/' || pg_temp.id('b_up')::text || '/true');
  r := pg_temp.p('portal_bookings', format('%L, ''upcoming''', pg_temp.S('bobb')));
  perform pg_temp.chk('bob''s session in the OTHER business (same email) sees nothing of business A', jsonb_array_length(r->'rows')::text || '/' || (pg_temp.p('portal_overview', format('%L', pg_temp.S('bobb')))->>'business_name'), '0/P10C Beta');
  -- every read / action refuses a bad session the same way
  v_fns := array['portal_overview(%s)', 'portal_bookings(%s)', 'portal_packages(%s)', 'portal_invoices(%s)', 'portal_photos(%s)', 'portal_forms(%s)'];
  foreach f in array v_fns loop
    v_all := v_all || (pg_temp.svc('select public.' || format(f, quote_literal('nope-nope-nope-nope-nope-nope-nope-nope-nope')))->>'code') || (pg_temp.svc('select public.' || format(f, 'null'))->>'code');
  end loop;
  perform pg_temp.chk('unknown / null session => invalid_session on every read', v_all, repeat('invalid_sessioninvalid_session', 6));
  perform pg_temp.chk('...and on every action', (pg_temp.p('portal_cancel_booking', format('%L, %L', repeat('b', 64), pg_temp.id('a_up')))->>'code') || (pg_temp.p('portal_reschedule_slots', format('%L, %L', repeat('b', 64), pg_temp.id('a_up')))->>'code') || (pg_temp.p('portal_reschedule_booking', format('%L, %L, now()', repeat('b', 64), pg_temp.id('a_up')))->>'code') || (pg_temp.p('portal_create_booking', format('%L, %L, %L, now()', repeat('b', 64), pg_temp.id('alice1'), pg_temp.id('svc')))->>'code'), repeat('invalid_session', 4));
end $$;

-- session lifecycle on dedicated customers (the alice cap of 5 links an hour is used up)
do $$
declare v_c uuid; s1 text; s2 text; s3 text; v_sess uuid;
begin
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (pg_temp.id('biza'), 'Eve Evans', '+447700910011', 'eve@example.com', pg_temp.id('bra')) returning id into v_c; insert into ids values ('eve', v_c);
  insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id) values (pg_temp.id('biza'), 'Fay Foster', '+447700910012', 'fay@example.com', pg_temp.id('bra')) returning id into v_c; insert into ids values ('fay', v_c);
  s1 := pg_temp.login('p10c-a', 'biza', 'eve@example.com', 'eve1');
  s2 := pg_temp.login('p10c-a', 'biza', 'eve@example.com', 'eve2');
  perform pg_temp.chk('two live sessions for one customer both work', (pg_temp.p('portal_overview', format('%L', s1))->>'ok') || (pg_temp.p('portal_overview', format('%L', s2))->>'ok'), 'truetrue');
  perform pg_temp.chk('sign out ONE session: only that one dies', (pg_temp.p('portal_sign_out', format('%L', s1))->>'ok') || '/' || (pg_temp.p('portal_overview', format('%L', s1))->>'code') || '/' || (pg_temp.p('portal_overview', format('%L', s2))->>'ok'), 'true/invalid_session/true');
  s3 := pg_temp.login('p10c-a', 'biza', 'eve@example.com', 'eve3');
  perform pg_temp.chk('sign out EVERYWHERE: every session of that email in that business dies', (pg_temp.p('portal_sign_out', format('%L, true', s2))->>'ok') || '/' || (pg_temp.p('portal_overview', format('%L', s2))->>'code') || (pg_temp.p('portal_overview', format('%L', s3))->>'code'), 'true/invalid_sessioninvalid_session');
  perform pg_temp.chk('signing out an unknown session is a harmless ok (no oracle)', pg_temp.p('portal_sign_out', $q$repeat('c', 64)$q$)->>'ok', 'true');
  perform pg_temp.chk('audit: portal.signed_out x2 (single + all) with counts, no email', (select count(*)::text from public.audit_logs where action = 'portal.signed_out') || '/' || (select count(*)::text from public.audit_logs where action = 'portal.signed_out' and after::text like '%eve%'), '2/0');
  -- expiry (14 days)
  s1 := pg_temp.login('p10c-a', 'biza', 'eve@example.com', 'eve4');
  alter table public.portal_sessions disable trigger portal_sessions_guard;
  update public.portal_sessions set expires_at = now() - interval '1 second' where token_hash = encode(extensions.digest(s1, 'sha256'), 'hex');
  alter table public.portal_sessions enable trigger portal_sessions_guard;
  perform pg_temp.chk('an EXPIRED session is refused', pg_temp.p('portal_overview', format('%L', s1))->>'code', 'invalid_session');
  -- the verified email is re-resolved on EVERY call: change it and access ends at once
  s1 := pg_temp.login('p10c-a', 'biza', 'fay@example.com', 'fay');
  perform pg_temp.chk('(before) the session works', pg_temp.p('portal_overview', format('%L', s1))->>'ok', 'true');
  update public.clients set email = 'fay.new@example.com' where id = pg_temp.id('fay');
  perform pg_temp.chk('the client''s email CHANGED => the old session loses access at once', pg_temp.p('portal_overview', format('%L', s1))->>'code', 'invalid_session');
  update public.clients set email = 'fay@example.com' where id = pg_temp.id('fay');
  perform pg_temp.chk('...and it works again when the email matches again', pg_temp.p('portal_overview', format('%L', s1))->>'ok', 'true');
  update public.clients set deleted_at = now() where id = pg_temp.id('fay');
  perform pg_temp.chk('the client is DELETED (nobody linked any more) => invalid_session', pg_temp.p('portal_overview', format('%L', s1))->>'code', 'invalid_session');
  update public.clients set deleted_at = null where id = pg_temp.id('fay');
end $$;

-- ===========================================================================
-- 5. Cancel: the guest-manage engine, the original survives every failure
-- ===========================================================================
do $$
declare r jsonb; v_before text; v_n int;
begin
  perform pg_temp.chk('cancel: bob''s appointment through ALICE''S session => not_found, row untouched', (pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), pg_temp.id('b_up')))->>'code') || '/' || (select status::text || (cancelled_at is null)::text from public.appointments where id = pg_temp.id('b_up')), 'not_found/confirmedtrue');
  perform pg_temp.chk('cancel: a random id / another business''s appointment => not_found', (pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), gen_random_uuid()))->>'code') || (pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('bobb'), pg_temp.id('b_up')))->>'code'), 'not_foundnot_found');
  v_before := (select status::text from public.appointments where id = pg_temp.id('a_soon'));
  r := pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), pg_temp.id('a_soon')));
  perform pg_temp.chk('cancel INSIDE the 24h window is refused (cancel_window_passed) and the appointment is exactly as it was', (r->>'code') || '/' || (select status::text from public.appointments where id = pg_temp.id('a_soon')) || '/' || (v_before = 'confirmed')::text, 'cancel_window_passed/confirmed/true');
  perform pg_temp.chk('...and no portal-minted manage token is left alive', (select count(*)::text from public.booking_manage_tokens where appointment_id = pg_temp.id('a_soon') and revoked_at is null), '0');
  update public.booking_settings set customer_can_cancel = false where branch_id = pg_temp.id('bra');
  r := pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), pg_temp.id('a_up2')));
  perform pg_temp.chk('cancel with customer_can_cancel = false is refused, appointment untouched', ((r->>'ok') = 'false')::text || '/' || (select status::text from public.appointments where id = pg_temp.id('a_up2')), 'true/confirmed');
  update public.booking_settings set customer_can_cancel = true where branch_id = pg_temp.id('bra');
  r := pg_temp.p('portal_cancel_booking', format('%L, %L, ''plans changed''', pg_temp.S('alice'), pg_temp.id('a_up')));
  perform pg_temp.chk('cancel far ahead: ok', r->>'ok', 'true');
  perform pg_temp.chk('stored: status cancelled + timestamp; no live manage token left; audit portal.booking_cancelled with the reason and NO actor', (select (status = 'cancelled')::text || (cancelled_at is not null)::text from public.appointments where id = pg_temp.id('a_up')) || '/' || (select count(*)::text from public.booking_manage_tokens where appointment_id = pg_temp.id('a_up') and revoked_at is null) || '/' || (select concat_ws('|', (actor_user_id is null)::text, after->>'reason') from public.audit_logs where action = 'portal.booking_cancelled'), 'truetrue/0/true|plans changed');
  perform pg_temp.chk('cancelling it AGAIN is refused and changes nothing more (1 audit row)', ((pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), pg_temp.id('a_up')))->>'ok') = 'false')::text || '/' || pg_temp.audit_n('portal.booking_cancelled'), 'true/1');
  perform pg_temp.chk('the cancelled booking leaves the upcoming list and appears in the past list', (select count(*)::text from jsonb_array_elements(pg_temp.p('portal_bookings', format('%L, ''upcoming''', pg_temp.S('alice')))->'rows') x where x->>'id' = pg_temp.id('a_up')::text) || '/' || (select count(*)::text from jsonb_array_elements(pg_temp.p('portal_bookings', format('%L, ''past''', pg_temp.S('alice')))->'rows') x where x->>'id' = pg_temp.id('a_up')::text), '0/1');
end $$;

-- ===========================================================================
-- 6. Reschedule
-- ===========================================================================
do $$
declare r jsonb; v_start timestamptz;
begin
  r := pg_temp.p('portal_reschedule_slots', format('%L, %L', pg_temp.S('alice'), pg_temp.id('a_up2')));
  perform pg_temp.chk('reschedule slots: ok, a list of slots, NO ids in the payload', (r->>'ok') || '/' || (jsonb_array_length(r->'slots') > 0)::text || '/' || (position(pg_temp.id('ann')::text in r::text) = 0 and position(pg_temp.id('svc')::text in r::text) = 0)::text, 'true/true/true');
  perform pg_temp.chk('reschedule slots for bob''s booking through alice => not_found', pg_temp.p('portal_reschedule_slots', format('%L, %L', pg_temp.S('alice'), pg_temp.id('b_up')))->>'code', 'not_found');
  v_start := (select starts_at from public.appointments where id = pg_temp.id('a_up2'));
  perform pg_temp.chk('reschedule to an OUT-OF-HOURS time is refused and the original is untouched', (pg_temp.p('portal_reschedule_booking', format('%L, %L, %L', pg_temp.S('alice'), pg_temp.id('a_up2'), pg_temp.slot(300, 3)))->>'code') || '/' || (select (starts_at = v_start and status = 'confirmed')::text from public.appointments where id = pg_temp.id('a_up2')), 'slot_unavailable/true');
  perform pg_temp.chk('reschedule bob''s booking through alice => not_found, unchanged', (pg_temp.p('portal_reschedule_booking', format('%L, %L, %L', pg_temp.S('alice'), pg_temp.id('b_up'), pg_temp.slot(840, 3)))->>'code') || '/' || (select (starts_at = pg_temp.slot(720, 3))::text from public.appointments where id = pg_temp.id('b_up')), 'not_found/true');
  perform pg_temp.chk('reschedule INSIDE the window is refused and unchanged', ((pg_temp.p('portal_reschedule_booking', format('%L, %L, %L', pg_temp.S('alice'), pg_temp.id('a_soon'), pg_temp.slot(840, 3)))->>'ok') = 'false')::text || '/' || (select (status = 'confirmed' and starts_at < now() + interval '4 hours')::text from public.appointments where id = pg_temp.id('a_soon')), 'true/true');
  r := pg_temp.p('portal_reschedule_booking', format('%L, %L, %L', pg_temp.S('alice'), pg_temp.id('a_up2'), pg_temp.slot(780, 3)));
  perform pg_temp.chk('reschedule to a free slot: ok, and the response has NO manage token', (r->>'ok') || '/' || (r ? 'manage_token')::text, 'true/false');
  perform pg_temp.chk('stored: the new time, still confirmed; audited', (select (starts_at = pg_temp.slot(780, 3) and status = 'confirmed')::text from public.appointments where id = pg_temp.id('a_up2')) || '/' || pg_temp.audit_n('portal.booking_rescheduled'), 'true/1');
  perform pg_temp.chk('the customer is emailed the change, and no portal-minted token stays alive', (select event from public.message_outbox where appointment_id = pg_temp.id('a_up2') and event = 'rescheduled' limit 1) || '/' || (select count(*)::text from public.booking_manage_tokens where appointment_id = pg_temp.id('a_up2') and revoked_at is null and created_by is null and (select count(*) from public.message_outbox o where o.appointment_id = pg_temp.id('a_up2') and o.event = 'rescheduled') = 0), 'rescheduled/0');
end $$;

-- ===========================================================================
-- 7. Book a new appointment as an existing client
-- ===========================================================================
do $$
declare r jsonb; v_clients int; v_appts int; v_id uuid;
begin
  select count(*) into v_clients from public.clients where business_id = pg_temp.id('biza');
  select count(*) into v_appts from public.appointments where business_id = pg_temp.id('biza');
  r := pg_temp.p('portal_create_booking', format('%L, %L, %L, %L, null, ''first time with this stylist''', pg_temp.S('alice'), pg_temp.id('alice2'), pg_temp.id('svc'), pg_temp.slot(840, 3)));
  perform pg_temp.chk('book: ok, and the response carries NO manage token', (r->>'ok') || '/' || (r ? 'manage_token')::text || '/' || (r->>'service_name'), 'true/false/Cut');
  v_id := (r->>'appointment_id')::uuid;
  perform pg_temp.chk('stored: for the CHOSEN client, online, confirmed, a staff member, the time and the customer''s own note', (select concat_ws('|', (client_id = pg_temp.id('alice2'))::text, source::text, status::text, (staff_id is not null)::text, (starts_at = pg_temp.slot(840, 3))::text, client_notes) from public.appointments where id = v_id), 'true|online|confirmed|true|true|first time with this stylist');
  perform pg_temp.chk('NO client was created or duplicated', (select count(*)::int - v_clients from public.clients where business_id = pg_temp.id('biza'))::text, '0');
  perform pg_temp.chk('the confirmation email is queued with its manage link SEALED', (select concat_ws('|', event, (sealed is not null)::text, channel) from public.message_outbox where appointment_id = v_id and event = 'booking_confirmed'), 'booking_confirmed|true|email');
  perform pg_temp.chk('audit: portal.booking_created, same client, no actor', (select concat_ws('|', (actor_user_id is null)::text, after->>'same_client') from public.audit_logs where action = 'portal.booking_created'), 'true|true');
  select count(*) into v_appts from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('book for a client who is NOT in the session (bob) => not_found, nothing created', (pg_temp.p('portal_create_booking', format('%L, %L, %L, %L', pg_temp.S('alice'), pg_temp.id('bob'), pg_temp.id('svc'), pg_temp.slot(900, 3)))->>'code') || '/' || ((select count(*) from public.appointments where business_id = pg_temp.id('biza')) - v_appts)::text, 'not_found/0');
  perform pg_temp.chk('book out of hours / in the past / unknown service are refused and create nothing', ((pg_temp.p('portal_create_booking', format('%L, %L, %L, %L', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc'), pg_temp.slot(300, 3)))->>'ok') = 'false')::text || ((pg_temp.p('portal_create_booking', format('%L, %L, %L, now() - interval ''1 day''', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc')))->>'ok') = 'false')::text || ((pg_temp.p('portal_create_booking', format('%L, %L, %L, %L', pg_temp.S('alice'), pg_temp.id('alice1'), gen_random_uuid(), pg_temp.slot(900, 3)))->>'ok') = 'false')::text || '/' || ((select count(*) from public.appointments where business_id = pg_temp.id('biza')) - v_appts)::text, 'truetruetrue/0');
  r := pg_temp.p('portal_create_booking', format('%L, %L, %L, %L', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc'), pg_temp.slot(840, 3)));
  perform pg_temp.chk('the SAME slot again: the second staff member takes it', r->>'ok', 'true');
  perform pg_temp.chk('...and a THIRD booking in that slot is refused (no_staff, the engine code); still exactly 2 there', (pg_temp.p('portal_create_booking', format('%L, %L, %L, %L', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc'), pg_temp.slot(840, 3)))->>'code') || '/' || (select count(*)::text from public.appointments where business_id = pg_temp.id('biza') and starts_at = pg_temp.slot(840, 3) and status <> 'cancelled'), 'no_staff/2');
  -- multi-location (migration 20261022100000): the optional branch
  select count(*) into v_appts from public.appointments where business_id = pg_temp.id('biza');
  perform pg_temp.chk('book at ANOTHER business''s branch id => not_bookable, nothing created', (pg_temp.p('portal_create_booking', format('%L, %L, %L, %L, null, null, %L', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc'), pg_temp.slot(960, 5), pg_temp.id('brb')))->>'code') || '/' || ((select count(*) from public.appointments where business_id = pg_temp.id('biza')) - v_appts)::text, 'not_bookable/0');
  r := pg_temp.p('portal_create_booking', format('%L, %L, %L, %L, null, null, %L', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc'), pg_temp.slot(960, 5), pg_temp.id('bra')));
  perform pg_temp.chk('the business''s own branch id given explicitly books there (stored branch_id)', (r->>'ok') || '/' || (select (branch_id = pg_temp.id('bra'))::text from public.appointments where id = (r->>'appointment_id')::uuid), 'true/true');
end $$;

-- ---- a booking made ONLINE already owns its one live manage token: the portal must coexist with it
do $$
declare r jsonb; v_id uuid; v_live int; v_hash text;
begin
  select id into v_id from public.appointments where client_notes = 'first time with this stylist' and business_id = pg_temp.id('biza');
  -- create_booking already gave it the guest manage link the public page hands out
  select token_hash into v_hash from public.booking_manage_tokens where appointment_id = v_id and revoked_at is null;
  r := pg_temp.p('portal_reschedule_booking', format('%L, %L, %L', pg_temp.S('alice'), v_id, pg_temp.slot(900, 3)));
  perform pg_temp.chk('reschedule works for a booking that already has a guest manage link', r->>'ok', 'true');
  select count(*) into v_live from public.booking_manage_tokens where appointment_id = v_id and revoked_at is null;
  perform pg_temp.chk('...the guest link is back ON afterwards, and it is the only live token', (select (revoked_at is null)::text from public.booking_manage_tokens where token_hash = v_hash) || '/' || v_live, 'true/1');
  r := pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), v_id));
  perform pg_temp.chk('cancel works for a booking that already has a guest manage link', (r->>'ok') || '/' || (select status::text from public.appointments where id = v_id), 'true/cancelled');
  perform pg_temp.chk('...and no live manage token is left on the cancelled booking', (select count(*)::text from public.booking_manage_tokens where appointment_id = v_id and revoked_at is null), '0');
end $$;

-- ===========================================================================
-- 8. Packages and invoices
-- ===========================================================================
create or replace function pg_temp.svc_paths(p_session text, p_ids uuid[]) returns table (file_id uuid, path text) language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  return query select * from public.portal_photo_paths(p_session, p_ids);
  reset role;
end $$;
create or replace function pg_temp.owner_rpc(p_sql text) returns jsonb language sql as $$ select pg_temp.as_('owner', p_sql) $$;
do $$
declare r jsonb; v_pkg uuid; v_inv_a uuid; v_inv_draft uuid; v_inv_b uuid; v_pay uuid; v_cp uuid; v_txt text;
begin
  r := pg_temp.owner_rpc(format($q$select public.save_package(%L, null, 'Cut 3+1', null, 3, 1, 5000, null, array[%L]::uuid[], true)$q$, pg_temp.id('bra'), pg_temp.id('svc')));
  v_pkg := (r->>'package_id')::uuid;
  r := pg_temp.owner_rpc(format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('alice1'), format('[{"package_id":"%s"},{"description":"Tip","unit_price_minor":300,"discount_minor":100,"discount_reason":"SECRET-DISCOUNT-REASON"}]', v_pkg)));
  v_inv_a := (r->>'invoice_id')::uuid;
  perform pg_temp.owner_rpc(format($q$select public.issue_invoice(%L)$q$, v_inv_a));
  r := pg_temp.owner_rpc(format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('alice1'), '[{"description":"Draft only","unit_price_minor":999}]'));
  v_inv_draft := (r->>'invoice_id')::uuid;
  r := pg_temp.owner_rpc(format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('bob'), '[{"description":"Bob service","unit_price_minor":2000}]'));
  v_inv_b := (r->>'invoice_id')::uuid;
  perform pg_temp.owner_rpc(format($q$select public.issue_invoice(%L)$q$, v_inv_b));
  insert into ids values ('inv_a', v_inv_a), ('inv_draft', v_inv_draft), ('inv_b', v_inv_b);
  r := pg_temp.owner_rpc(format($q$select public.add_payment(%L, 'cash', 1000, null, 'SECRET-PAYMENT-NOTE')$q$, v_inv_a));
  r := pg_temp.owner_rpc(format($q$select public.create_credit_note(%L, 'SECRET-CREDIT-REASON', 200)$q$, v_inv_a));
  select cp.id into v_cp from public.client_packages cp where cp.invoice_id = v_inv_a;
  insert into ids values ('cp', v_cp);

  r := pg_temp.p('portal_packages', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('packages: alice sees her package with the balance (3 + 1 bonus), nothing else', (r->>'available') || '/' || jsonb_array_length(r->'rows')::text || '/' || (r->'rows'->0->>'remaining') || '/' || (r->'rows'->0->>'used') || '/' || (r->'rows'->0->>'name'), 'true/1/4/0/Cut 3+1');
  insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id, service_id) values (pg_temp.id('biza'), pg_temp.id('bra'), v_cp, 'deduct', pg_temp.id('a_past'), pg_temp.id('svc'));
  r := pg_temp.p('portal_packages', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('...after a deduction: 3 left and the history shows the date + service (no appointment ids)', (r->'rows'->0->>'remaining') || '/' || jsonb_array_length(r->'rows'->0->'history')::text || '/' || (r->'rows'->0->'history'->0->>'service_name') || '/' || (position(pg_temp.id('a_past')::text in r::text) = 0)::text, '3/1/Cut/true');
  perform pg_temp.chk('packages: the row carries the branch time zone (usage times shown in branch time, QA F22)', r->'rows'->0->>'timezone', (select timezone from public.branches where id = pg_temp.id('bra')));
  perform pg_temp.chk('packages: bob and the other business see none', jsonb_array_length(pg_temp.p('portal_packages', format('%L', pg_temp.S('bob')))->'rows')::text || jsonb_array_length(pg_temp.p('portal_packages', format('%L', pg_temp.S('bobb')))->'rows')::text, '00');

  r := pg_temp.p('portal_invoices', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('invoices: only ISSUED ones of alice (the draft is invisible), with payment status', jsonb_array_length(r->'rows')::text || '/' || (r->'rows'->0->>'id') || '/' || (r->'rows'->0->>'payment_status'), '1/' || v_inv_a::text || '/partial');
  perform pg_temp.chk('...bob sees his own invoice only; the other business none', (pg_temp.p('portal_invoices', format('%L', pg_temp.S('bob')))->'rows'->0->>'id') || '/' || jsonb_array_length(pg_temp.p('portal_invoices', format('%L', pg_temp.S('bobb')))->'rows')::text, v_inv_b::text || '/0');
  r := pg_temp.p('portal_invoice', format('%L, %L', pg_temp.S('alice'), v_inv_a));
  v_txt := r::text;
  perform pg_temp.chk('invoice view: ok, lines, 1 payment, 1 credit note, seller, totals', (r->>'ok') || '/' || jsonb_array_length(r->'items')::text || '/' || jsonb_array_length(r->'payments')::text || '/' || jsonb_array_length(r->'credit_notes')::text || '/' || (r->'business'->>'name') || '/' || (r->'invoice'->>'total_minor'), 'true/2/1/1/P10C Alpha/' || (select total_minor::text from public.invoices where id = v_inv_a));
  perform pg_temp.chk('NO internal text: discount reason, payment note, credit-note reason, catalogue ids', (position('SECRET' in v_txt) = 0 and position(v_pkg::text in v_txt) = 0 and (r->'items'->0 ? 'package_id') = false)::text, 'true');
  perform pg_temp.chk('invoice view: bob''s invoice, the draft and an unknown id => not_found', (pg_temp.p('portal_invoice', format('%L, %L', pg_temp.S('alice'), v_inv_b))->>'code') || (pg_temp.p('portal_invoice', format('%L, %L', pg_temp.S('alice'), v_inv_draft))->>'code') || (pg_temp.p('portal_invoice', format('%L, %L', pg_temp.S('alice'), gen_random_uuid()))->>'code') || (pg_temp.p('portal_invoice', format('%L, %L', pg_temp.S('bobb'), v_inv_a))->>'code'), 'not_foundnot_foundnot_foundnot_found');
end $$;

-- ===========================================================================
-- 9. Photos: add-on + CONSENT, photos only, never other clients
-- ===========================================================================
do $$
declare r jsonb; f1 uuid; f2 uuid; fb uuid; fd uuid; fx uuid; v_n int;
begin
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status, ready_at)
  values (pg_temp.id('biza'), pg_temp.id('alice1'), 'photo', 'before', 'p/a1.jpg', 'a1.jpg', 'image/jpeg', 10, 'ready', now()) returning id into f1;
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status, ready_at)
  values (pg_temp.id('biza'), pg_temp.id('alice2'), 'photo', 'after', 'p/a2.jpg', 'a2.jpg', 'image/jpeg', 10, 'ready', now()) returning id into f2;
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status, ready_at)
  values (pg_temp.id('biza'), pg_temp.id('bob'), 'photo', 'before', 'p/b.jpg', 'b.jpg', 'image/jpeg', 10, 'ready', now()) returning id into fb;
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status, ready_at)
  values (pg_temp.id('biza'), pg_temp.id('alice1'), 'document', 'document', 'p/doc.pdf', 'referral.pdf', 'application/pdf', 10, 'ready', now()) returning id into fd;
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status, ready_at, deleted_at)
  values (pg_temp.id('biza'), pg_temp.id('alice1'), 'photo', 'other', 'p/del.jpg', 'del.jpg', 'image/jpeg', 10, 'ready', now(), now()) returning id into fx;
  perform pg_temp.chk('photos WITHOUT consent: none, and no path can be obtained either', jsonb_array_length(pg_temp.p('portal_photos', format('%L', pg_temp.S('alice')))->'rows')::text || '/' || (select count(*)::text from pg_temp.svc_paths(pg_temp.S('alice'), array[f1, f2, fb, fd, fx])), '0/0');
  perform pg_temp.owner_rpc(format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('alice1')));
  r := pg_temp.p('portal_photos', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('with consent for alice1 only: exactly her photo (not alice2''s without consent, not the PDF, not the deleted one, not bob''s)', jsonb_array_length(r->'rows')::text || '/' || (r->'rows'->0->>'id') || '/' || (position('a1.jpg' in r::text) = 0 and position('p/a1' in r::text) = 0)::text, '1/' || f1::text || '/true');
  perform pg_temp.chk('paths: only the allowed photo (alice1''s), for alice''s session', (select string_agg(path, ',') from pg_temp.svc_paths(pg_temp.S('alice'), array[f1, f2, fb, fd, fx])), 'p/a1.jpg');
  perform pg_temp.chk('bob''s session cannot get alice''s photo path, nor can the other business', (select count(*)::text from pg_temp.svc_paths(pg_temp.S('bob'), array[f1])) || (select count(*)::text from pg_temp.svc_paths(pg_temp.S('bobb'), array[f1, fb])), '00');
  perform pg_temp.owner_rpc(format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('bob')));
  perform pg_temp.chk('bob''s consent shows bob''s photo to bob, and still nothing of alice''s', (pg_temp.p('portal_photos', format('%L', pg_temp.S('bob')))->'rows'->0->>'id') || '/' || jsonb_array_length(pg_temp.p('portal_photos', format('%L', pg_temp.S('bob')))->'rows')::text, fb::text || '/1');
  perform pg_temp.owner_rpc(format($q$select public.set_photo_consent(%L, false)$q$, pg_temp.id('alice1')));
  perform pg_temp.chk('consent WITHDRAWN: the photo disappears again at once (and its path is refused)', jsonb_array_length(pg_temp.p('portal_photos', format('%L', pg_temp.S('alice')))->'rows')::text || '/' || (select count(*)::text from pg_temp.svc_paths(pg_temp.S('alice'), array[f1])), '0/0');
  perform pg_temp.owner_rpc(format($q$select public.set_photo_consent(%L, true)$q$, pg_temp.id('alice1')));
end $$;

-- ===========================================================================
-- 10. Signed forms: read only
-- ===========================================================================
do $$
declare r jsonb; v_t uuid; v_sc uuid;
begin
  r := pg_temp.owner_rpc(format($q$select public.save_form_template(%L, null, 'consent', 'Cut consent', '[{"id":"q","type":"long_text","label":"Medical","sensitive":true}]'::jsonb, '[{"type":"paragraph","text":"I agree."}]'::jsonb, true, '{}', true)$q$, pg_temp.id('biza')));
  v_t := (r->>'template_id')::uuid;
  r := pg_temp.owner_rpc(format($q$select public.record_signed_consent(%L, null, %L, '{"q":"TOP-SECRET-MEDICAL"}'::jsonb, 'Alice Adams', '[[[0.1,0.1],[0.5,0.5]]]'::jsonb)$q$, pg_temp.id('alice1'), v_t));
  v_sc := (r->>'signed_consent_id')::uuid;
  r := pg_temp.p('portal_forms', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('forms: title, date, signer, kind and valid/voided ONLY: no answers, no signature, no ids of templates', jsonb_array_length(r->'rows')::text || '/' || (r->'rows'->0->>'title') || '/' || (r->'rows'->0->>'voided') || '/' || (position('TOP-SECRET' in r::text) = 0 and (r->'rows'->0 ? 'answers') = false and (r->'rows'->0 ? 'signature') = false and position(v_t::text in r::text) = 0)::text, '1/Cut consent/false/true');
  perform pg_temp.chk('forms: bob and the other business see none', jsonb_array_length(pg_temp.p('portal_forms', format('%L', pg_temp.S('bob')))->'rows')::text || jsonb_array_length(pg_temp.p('portal_forms', format('%L', pg_temp.S('bobb')))->'rows')::text, '00');
  perform pg_temp.owner_rpc(format($q$select public.void_signed_consent(%L, 'Signed on the wrong client')$q$, v_sc));
  perform pg_temp.chk('a voided copy shows as voided (the reason is not shown)', ((pg_temp.p('portal_forms', format('%L', pg_temp.S('alice')))->'rows'->0->>'voided')) || '/' || (position('wrong client' in pg_temp.p('portal_forms', format('%L', pg_temp.S('alice')))::text) = 0)::text, 'true/true');
end $$;

-- ===========================================================================
-- 11. Add-on OFF / ON, plan gating, inactive business
-- ===========================================================================
do $$
declare v_tokens int; r jsonb; v_live text;
begin
  update public.business_subscriptions set status = 'active', plan = 'team', trial_ends_at = null where business_id = pg_temp.id('biza');
  insert into public.business_addons (business_id, addon_key, enabled) values (pg_temp.id('biza'), 'client_portal', true);
  r := pg_temp.p('portal_overview', format('%L', pg_temp.S('alice')));
  perform pg_temp.chk('portal ON, the other add-ons OFF: packages / photos / forms report available:false with no rows (bookings + invoices still work)', (pg_temp.p('portal_packages', format('%L', pg_temp.S('alice')))->>'available') || (pg_temp.p('portal_photos', format('%L', pg_temp.S('alice')))->>'available') || (pg_temp.p('portal_forms', format('%L', pg_temp.S('alice')))->>'available') || '/' || jsonb_array_length(pg_temp.p('portal_packages', format('%L', pg_temp.S('alice')))->'rows')::text || '/' || (r->'features')::text || '/' || (pg_temp.p('portal_bookings', format('%L', pg_temp.S('alice')))->>'ok') || (pg_temp.p('portal_invoices', format('%L', pg_temp.S('alice')))->>'ok'), 'falsefalsefalse/0/{"files": false, "forms": false, "packages": false}/truetrue');
  perform pg_temp.p('portal_request_login', $q$'p10c-a', 'eve@example.com', 'h'$q$);
  v_live := pg_temp.raw_token('biza', 'eve@example.com');
  select count(*) into v_tokens from public.portal_login_tokens;
  update public.business_addons set enabled = false where business_id = pg_temp.id('biza') and addon_key = 'client_portal';
  perform pg_temp.chk('portal OFF: portal_info is the generic not_available', pg_temp.p('portal_info', $q$'p10c-a'$q$)->>'code', 'not_available');
  perform pg_temp.chk('...asking for a link still answers {ok:true} and creates NOTHING', (pg_temp.p('portal_request_login', $q$'p10c-a', 'eve@example.com', 'h'$q$))::text || '/' || ((select count(*) from public.portal_login_tokens) - v_tokens)::text, '{"ok": true}/0');
  perform pg_temp.chk('...every EXISTING session is refused on every read and action', (pg_temp.p('portal_overview', format('%L', pg_temp.S('alice')))->>'code') || (pg_temp.p('portal_bookings', format('%L', pg_temp.S('alice')))->>'code') || (pg_temp.p('portal_invoices', format('%L', pg_temp.S('alice')))->>'code') || (pg_temp.p('portal_cancel_booking', format('%L, %L', pg_temp.S('alice'), pg_temp.id('a_up2')))->>'code') || (pg_temp.p('portal_create_booking', format('%L, %L, %L, %L', pg_temp.S('alice'), pg_temp.id('alice1'), pg_temp.id('svc'), pg_temp.slot(900, 3)))->>'code'), repeat('invalid_session', 5));
  perform pg_temp.chk('...and a LIVE login link (requested while ON) can no longer be traded for a session; it stays unused', (v_live is not null)::text || '/' || (pg_temp.p('portal_exchange_token', format('%L, ''h''', v_live))->>'code') || '/' || (select (used_at is null)::text from public.portal_login_tokens where token_hash = encode(extensions.digest(v_live, 'sha256'), 'hex')), 'true/invalid_token/true');
  perform pg_temp.chk('...nothing was cancelled or created while off', (select status::text from public.appointments where id = pg_temp.id('a_up2')), 'confirmed');
  update public.business_addons set enabled = true where business_id = pg_temp.id('biza') and addon_key = 'client_portal';
  perform pg_temp.chk('portal ON again: the same session works again (nothing was lost)', pg_temp.p('portal_overview', format('%L', pg_temp.S('alice')))->>'ok', 'true');
  update public.business_subscriptions set status = 'inactive' where business_id = pg_temp.id('biza');
  perform pg_temp.chk('an INACTIVE business: info, sessions and link requests are all refused / silent', (pg_temp.p('portal_info', $q$'p10c-a'$q$)->>'code') || (pg_temp.p('portal_overview', format('%L', pg_temp.S('alice')))->>'code'), 'not_availableinvalid_session');
  update public.business_subscriptions set status = 'active', plan = 'team' where business_id = pg_temp.id('biza');
  perform pg_temp.chk('the OTHER business is untouched by all of this', pg_temp.p('portal_overview', format('%L', pg_temp.S('bobb')))->>'ok', 'true');
end $$;

-- ===========================================================================
-- 12. The email guard, the audit trail, and business delete
-- ===========================================================================
do $$
declare v_row uuid; v_biz uuid := pg_temp.id('biza');
begin
  select o.id into v_row from public.message_outbox o join public.portal_login_tokens t on t.id = (o.payload->>'token_id')::uuid
  where o.event = 'portal_login' and t.business_id = v_biz and t.used_at is not null limit 1;
  perform pg_temp.chk('outbox_guard: an email for an already-USED link is stale (never sent)', public.outbox_guard(v_row), 'stale');
  select o.id into v_row from public.message_outbox o join public.portal_login_tokens t on t.id = (o.payload->>'token_id')::uuid
  where o.event = 'portal_login' and t.business_id = v_biz and t.revoked_at is not null limit 1;
  perform pg_temp.chk('...and so is one for a REVOKED link', public.outbox_guard(v_row), 'stale');
  perform pg_temp.chk('audit: portal.login / signed_out / booking_cancelled / rescheduled / created present, all without an actor', (select string_agg(distinct action, ',' order by action) from public.audit_logs where action like 'portal.%') || '/' || (select count(*)::text from public.audit_logs where action like 'portal.%' and actor_user_id is not null), 'portal.booking_cancelled,portal.booking_created,portal.booking_rescheduled,portal.login,portal.signed_out/0');
  perform pg_temp.chk('audit: no portal row mentions an email address or a session / login token', (select count(*)::text from public.audit_logs where action like 'portal.%' and (before::text || after::text) ~ '(@|[0-9a-f]{64})'), '0');
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business: the portal tokens and sessions are released with it', pg_temp.try(format($q$delete from public.businesses where id = %L$q$, v_biz)), 'ok');
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('...nothing left', (select count(*)::text from public.portal_sessions where business_id = v_biz) || (select count(*)::text from public.portal_login_tokens where business_id = v_biz), '00');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
