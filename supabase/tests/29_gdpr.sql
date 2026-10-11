-- Phase 11A: GDPR. Per-client export, per-client erase, business erase, portal request seam.
--
--   supabase db query --linked -f supabase/tests/29_gdpr.sql
--
-- Plain SQL, own fixtures, rolled back. Proves: export is permission-checked and audited; erase blanks every
-- personal field of the client EVERYWHERE (a text scan of every table, not a list of the ones we remembered)
-- while amounts, dates and numbers stay byte-identical; a control client is untouched; erase is idempotent;
-- every failure path (forbidden, future appointment, draft invoice, an exception half way through) leaves the
-- original data exactly as it was; the immutable guards still refuse outside an erase; a business erase works
-- against enforce_last_owner and storage; the portal request seam is rate limited and audited.
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

-- Hash of EVERY tenant row of a business (all public tables that have a business_id column).
create or replace function pg_temp.world(p_biz uuid) returns text language plpgsql as $$
declare t record; h text := ''; v text;
begin
  for t in select c.table_name from information_schema.columns c join information_schema.tables x using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'business_id' and x.table_type = 'BASE TABLE' order by 1 loop
    execute format('select coalesce(md5(string_agg(r::text, '''' order by r::text)), '''') from public.%I r where r.business_id = %L', t.table_name, p_biz) into v;
    h := h || v;
  end loop;
  return md5(h);
end $$;
-- Rows (whole database) whose text contains a marker, case-insensitive. Lists the tables that still hold it.
create or replace function pg_temp.scan(p_marker text) returns text language plpgsql as $$
declare t record; n bigint; out text := '';
begin
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1 loop
    execute format('select count(*) from public.%I r where r::text ilike %L', t.table_name, '%' || p_marker || '%') into n;
    if n > 0 then out := out || t.table_name || ':' || n || ' '; end if;
  end loop;
  return btrim(out);
end $$;
-- the financial rows of a client as one comparable text (personal fields removed)
create or replace function pg_temp.money(p_client uuid) returns text language sql as $$
  select md5(coalesce((select string_agg((to_jsonb(i) - 'bill_to_name' - 'notes' - 'updated_at')::text, '' order by i.id) from public.invoices i where i.client_id = p_client), '')
     || coalesce((select string_agg(to_jsonb(it)::text, '' order by it.id) from public.invoice_items it join public.invoices i on i.id = it.invoice_id where i.client_id = p_client), '')
     || coalesce((select string_agg(to_jsonb(p)::text, '' order by p.id) from public.invoice_payments p join public.invoices i on i.id = p.invoice_id where i.client_id = p_client), '')
     || coalesce((select string_agg(to_jsonb(n)::text, '' order by n.id) from public.credit_notes n join public.invoices i on i.id = n.invoice_id where i.client_id = p_client), '')
     || coalesce((select string_agg((to_jsonb(a) - 'client_notes' - 'internal_notes' - 'cancellation_reason' - 'updated_at')::text, '' order by a.id) from public.appointments a where a.client_id = p_client), ''))
$$;

-- ===========================================================================
-- Fixtures
-- ===========================================================================
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr'),('recep'),('staff'),('ownerb'),('ownerc'),('mgrc')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11g.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11G Alpha','p11g-a','GB','GBP','Europe/London','en',null,'Alpha');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11G Beta','p11g-b','GB','GBP','Europe/London','en',null,'Beta');
  reset role; insert into ids values ('bizb', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerc')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11G Gamma','p11g-c','GB','GBP','Europe/London','en',null,'Gamma');
  reset role; insert into ids values ('bizc', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'brc', id from public.branches where business_id = pg_temp.id('bizc') and is_primary;
select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgr', 'manager', 'bra');
select pg_temp.add_member('biza', 'recep', 'receptionist', 'bra');
select pg_temp.add_member('biza', 'staff', 'staff', 'bra');
select pg_temp.act_as(pg_temp.id('ownerc'));
select pg_temp.add_member('bizc', 'mgrc', 'manager', 'brc');
select set_config('request.jwt.claims', '', true);

do $$
declare v_biz uuid := pg_temp.id('biza'); v_br uuid := pg_temp.id('bra'); v_svc uuid; v_ann uuid; v_fv uuid; v_cf uuid;
  v_tpl uuid; v_ver uuid; v_c uuid; v_a1 uuid; v_a2 uuid; v_rr uuid; v_inv uuid; v_pay jsonb; off interval; k text; nm text; em text; ph text;
begin
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Cut', 60, 0) returning id into v_svc; insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 4000, true);
  insert into public.staff_profiles (business_id, display_name, sort_order, member_id) values (v_biz, 'Ann', 1, pg_temp.member('biza', 'staff')) returning id into v_ann; insert into ids values ('ann', v_ann);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
  insert into public.custom_fields (business_id, label, field_type, is_sensitive) values (v_biz, 'Allergies', 'long_text', true) returning id into v_cf;
  insert into public.form_templates (business_id, kind, title) values (v_biz, 'consent', 'Consent') returning id into v_tpl;
  insert into public.form_template_versions (template_id, business_id, version, kind, title, digest) values (v_tpl, v_biz, 1, 'consent', 'Consent', repeat('a', 64)) returning id into v_ver;

  -- two identical-shape clients: ERIN is erased, FRANK is the control
  foreach k in array array['erin', 'frank'] loop
    off := case k when 'erin' then interval '0' else interval '3 hours' end;
    nm := initcap(k) || ' PRIVTAG_' || k; em := 'privtag_' || k || '@example.com'; ph := case k when 'erin' then '+447700920001' else '+447700920002' end;
    insert into public.clients (business_id, full_name, phone_e164, email, notes, first_branch_id) values (v_biz, nm, ph, em, 'PRIVTAG_' || k || ' client note', v_br) returning id into v_c;
    insert into ids values (k, v_c);
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, client_notes, internal_notes)
      values (v_biz, v_br, v_c, v_svc, v_ann, now() - interval '30 days' + off, now() - interval '30 days' + off + interval '1 hour', 60, 0, 'completed', 'dashboard', v_fv, 4000, 'PRIVTAG_' || k || ' client notes', 'PRIVTAG_' || k || ' internal') returning id into v_a1;
    insert into ids values (k || '_a1', v_a1);
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, cancelled_at, cancellation_reason)
      values (v_biz, v_br, v_c, v_svc, v_ann, now() - interval '20 days' + off, now() - interval '20 days' + off + interval '1 hour', 60, 0, 'cancelled', 'online', v_fv, 4000, now() - interval '21 days', 'PRIVTAG_' || k || ' reason') returning id into v_a2;
    insert into ids values (k || '_a2', v_a2);
    insert into public.appointment_field_values (business_id, appointment_id, custom_field_id, form_version_id, value, is_sensitive) values (v_biz, v_a1, v_cf, v_fv, 'PRIVTAG_' || k || ' allergy', true);
    insert into public.booking_manage_tokens (business_id, appointment_id, token_hash, expires_at) values (v_biz, v_a1, encode(extensions.digest(k || 'mt', 'sha256'), 'hex'), now() + interval '5 days');
    -- invoice: draft (as the user) -> notes -> issued -> payment -> partial credit note
    perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
    v_inv := pg_temp.draft('owner', k, '[{"description":"Cut","unit_price_minor":4000}]');
    reset role;
    update public.invoices set notes = 'PRIVTAG_' || k || ' invoice note' where id = v_inv;
    insert into ids values (k || '_inv', v_inv);
    perform pg_temp.issue('owner', v_inv);
    perform pg_temp.as_('owner', format($q$select public.add_payment(%L, 'cash', 1000)$q$, v_inv));
    perform pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'goodwill', 500)$q$, v_inv));
    insert into public.signed_consents (business_id, branch_id, client_id, template_id, template_version_id, answers, signer_name, signature, signed_via, ip_hash)
      values (v_biz, v_br, v_c, v_tpl, v_ver, jsonb_build_object('a', 'PRIVTAG_' || k || ' answer'), nm, '[[[1,2],[3,4]]]'::jsonb, 'link', 'iph_' || k);
    insert into public.review_requests (business_id, branch_id, appointment_id, client_id, token_hash, expires_at) values (v_biz, v_br, v_a1, v_c, encode(extensions.digest(k || 'rr', 'sha256'), 'hex'), now() + interval '1 day') returning id into v_rr;
    insert into public.reviews (business_id, branch_id, appointment_id, review_request_id, client_id, rating, comment, reviewer_first_name, owner_reply, featured_on_website)
      values (v_biz, v_br, v_a1, v_rr, v_c, 5, 'PRIVTAG_' || k || ' lovely', initcap(k), 'PRIVTAG_' || k || ' thanks', true);
    insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status)
      values (v_biz, v_c, 'photo', 'before', v_biz || '/' || v_c || '/' || k || '.jpg', 'PRIVTAG_' || k || '.jpg', 'image/jpeg', 1000, 'ready');
    insert into public.messages (business_id, branch_id, appointment_id, channel, event, recipient_hash, recipient_masked, status, error)
      values (v_biz, v_br, v_a1, 'email', 'booking_confirmed', encode(extensions.digest(em, 'sha256'), 'hex'), 'PRIVTAG_' || k || '-masked', 'failed', 'bounce for PRIVTAG_' || k);
    insert into public.message_outbox (business_id, branch_id, appointment_id, client_id, channel, event, idempotency_key, status, payload)
      values (v_biz, v_br, v_a1, v_c, 'email', 'reminder', 'k-' || k, 'sent', '{}'::jsonb);
    insert into public.portal_login_tokens (business_id, email, token_hash, expires_at) values (v_biz, em, encode(extensions.digest(k || 'lt', 'sha256'), 'hex'), now() + interval '1 hour');
    insert into public.portal_sessions (business_id, email, token_hash, expires_at) values (v_biz, em, encode(extensions.digest(k || 'ps', 'sha256'), 'hex'), now() + interval '1 day');
    insert into public.data_requests (business_id, kind, requester_email) values (v_biz, 'erase', em);
    insert into public.client_consents (client_id, business_id, photo_consent) values (v_c, v_biz, true);
  end loop;
end $$;
-- Beta: a client of its own (other-business isolation)
insert into public.clients (business_id, full_name, phone_e164, email) values (pg_temp.id('bizb'), 'Bob Beta PRIVTAG_bob', '+447700920009', 'privtag_bob@example.com');
-- Gamma: data for the business erase
do $$
declare v_biz uuid := pg_temp.id('bizc'); v_c uuid;
begin
  insert into public.clients (business_id, full_name, phone_e164, email) values (v_biz, 'Gina Gamma', '+447700920020', 'gina@example.com') returning id into v_c;
  insert into public.files (business_id, client_id, kind, category, storage_path, original_name, mime_type, size_bytes, status)
    values (v_biz, v_c, 'photo', 'before', v_biz || '/' || v_c || '/g.jpg', 'g.jpg', 'image/jpeg', 1000, 'ready');
end $$;

-- ===========================================================================
-- 0. Catalogue: clients.erase exists, Owner only; counts
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('permission catalogue: 47 (46 + clients.erase)', (select count(*)::text from public.permissions), '47');
  perform pg_temp.chk('clients.erase: Owner (all scope) only. Manager / Receptionist / Staff do not hold it',
    (select string_agg(r.key || ':' || rp.scope, ',' order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id where rp.permission = 'clients.erase'), 'owner:all');
  perform pg_temp.chk('system role sizes: owner 47, manager 39, receptionist 20, staff 12',
    (select string_agg(r.key || '=' || (select count(*) from public.role_permissions x where x.role_id = r.id), ',' order by r.key) from public.roles r where r.business_id is null and r.is_system),
    'manager=39,owner=47,receptionist=20,staff=12');
  perform pg_temp.chk('the new tables are closed to API roles (no policy-less access, no grants)',
    pg_temp.try_as('owner', 'select * from public.storage_cleanup_queue') || pg_temp.try_as('owner', 'select * from public.erasure_log') || pg_temp.try_as('owner', 'insert into public.data_requests (business_id, kind) values (null, ''erase'')'), '425014250142501');
  perform pg_temp.chk('data_requests: readable by clients.export holders in THAT business only',
    pg_temp.vis('owner', 'select 1 from public.data_requests') || pg_temp.vis('mgr', 'select 1 from public.data_requests') || pg_temp.vis('recep', 'select 1 from public.data_requests') || pg_temp.vis('staff', 'select 1 from public.data_requests') || pg_temp.vis('ownerb', 'select 1 from public.data_requests'), '22000');
end $$;

-- ===========================================================================
-- 1. EXPORT
-- ===========================================================================
do $$
declare r jsonb; v_erin uuid := pg_temp.id('erin'); u text;
begin
  r := pg_temp.as_('owner', format('select public.gdpr_export_client(%L)', v_erin));
  perform pg_temp.chk('owner exports: ok, email and phone included, 2 appointments, 1 answer, 1 invoice with items / payment / credit note',
    concat_ws('|', r->>'ok', r->'client'->>'email', r->'client'->>'phone', jsonb_array_length(r->'appointments'), jsonb_array_length(r->'appointment_answers'),
      jsonb_array_length(r->'invoices'), jsonb_array_length(r->'invoices'->0->'items'), jsonb_array_length(r->'invoices'->0->'payments'), jsonb_array_length(r->'invoices'->0->'credit_notes')),
    'true|privtag_erin@example.com|+447700920001|2|1|1|1|1|1');
  perform pg_temp.chk('...files metadata (name, no storage path), signed form (answers + signature strokes), review, message, portal rows, requests',
    concat_ws('|', jsonb_array_length(r->'files'), r->'files'->0->>'name', (r::text like '%storage_path%')::text, jsonb_array_length(r->'signed_forms'), r->'signed_forms'->0->'answers'->>'a',
      jsonb_array_length(r->'signed_forms'->0->'signature_strokes'), jsonb_array_length(r->'reviews'), r->'reviews'->0->>'comment', jsonb_array_length(r->'messages'),
      jsonb_array_length(r->'portal'->'sessions'), jsonb_array_length(r->'portal'->'sign_in_links'), jsonb_array_length(r->'portal'->'requests'), (r->'photo_consent'->>'photo_consent')),
    '1|PRIVTAG_erin.jpg|false|1|PRIVTAG_erin answer|1|1|PRIVTAG_erin lovely|1|1|1|1|true');
  perform pg_temp.chk('...sensitive answer included for a caller who may see it', r->'appointment_answers'->0->>'value', 'PRIVTAG_erin allergy');
  perform pg_temp.chk('...no other client leaks into the export', (r::text ilike '%privtag_frank%')::text || (r::text ilike '%privtag_bob%')::text, 'falsefalse');
  perform pg_temp.chk('manager (clients.export) can export', pg_temp.as_('mgr', format('select public.gdpr_export_client(%L)', v_erin))->>'ok', 'true');
  foreach u in array array['recep', 'staff', 'ownerb'] loop
    perform pg_temp.chk(u || ': refused (not_found, no enumeration), nothing exported', pg_temp.as_(u, format('select public.gdpr_export_client(%L)', v_erin))::text, '{"ok": false, "code": "not_found"}');
  end loop;
  perform pg_temp.chk('unknown id answers the same as a forbidden one', pg_temp.as_('owner', format('select public.gdpr_export_client(%L)', gen_random_uuid()))::text, '{"ok": false, "code": "not_found"}');
  perform pg_temp.chk('anon cannot execute it', pg_temp.as_anon(format('select public.gdpr_export_client(%L)', v_erin))->>'state', '42501');
  perform pg_temp.chk('audited: 2 successful exports, 0 refusals logged as exports; the audit rows hold no personal data',
    (select count(*)::text from public.audit_logs where action = 'client.exported' and entity_id = v_erin::text) || '/' || (select count(*)::text from public.audit_logs where action = 'client.exported' and (before::text || after::text) ilike '%privtag%'), '2/0');
end $$;

-- ===========================================================================
-- 2. ERASE: every failure path leaves the original data untouched
-- ===========================================================================
do $$
declare w0 text := pg_temp.world(pg_temp.id('biza')); u text; r jsonb; v_erin uuid := pg_temp.id('erin'); v_appt uuid; v_inv uuid; v_fv uuid;
begin
  foreach u in array array['mgr', 'recep', 'staff', 'ownerb'] loop
    r := pg_temp.as_(u, format('select public.gdpr_erase_client(%L)', v_erin));
    perform pg_temp.chk(u || ': erase refused (not_found), world unchanged', (r->>'code') || '/' || (pg_temp.world(pg_temp.id('biza')) = w0)::text, 'not_found/true');
  end loop;
  perform pg_temp.chk('anon cannot execute erase / the storage-done RPC; authenticated cannot call gdpr_storage_done',
    (pg_temp.as_anon(format('select public.gdpr_erase_client(%L)', v_erin))->>'state') || (pg_temp.as_('owner', 'select public.gdpr_storage_done(array[]::uuid[])')->>'state'), '4250142501');
  perform pg_temp.chk('unknown id: not_found', pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', gen_random_uuid()))->>'code', 'not_found');

  -- a future live appointment blocks it
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, client_notes)
  values (pg_temp.id('biza'), pg_temp.id('bra'), v_erin, pg_temp.id('svc'), pg_temp.id('ann'), now() + interval '3 days', now() + interval '3 days 1 hour', 60, 0, 'confirmed', 'dashboard', v_fv, 4000, 'PRIVTAG_erin future')
  returning id into v_appt;
  w0 := pg_temp.world(pg_temp.id('biza'));
  r := pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', v_erin));
  perform pg_temp.chk('future live appointment: refused BEFORE any write, world byte-identical', (r->>'code') || '/' || (pg_temp.world(pg_temp.id('biza')) = w0)::text || '/' || (select (erased_at is null)::text from public.clients where id = v_erin), 'has_future_appointment/true/true');
  update public.appointments set status = 'cancelled', cancelled_at = now() where id = v_appt;
  update public.appointments set client_notes = null where id = v_appt;

  -- an unpaid DRAFT invoice blocks it
  v_inv := pg_temp.draft('owner', 'erin', '[{"description":"Later","unit_price_minor":1000}]');
  w0 := pg_temp.world(pg_temp.id('biza'));
  r := pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', v_erin));
  perform pg_temp.chk('draft invoice: refused BEFORE any write, world byte-identical', (r->>'code') || '/' || (pg_temp.world(pg_temp.id('biza')) = w0)::text, 'has_draft_invoice/true');
  perform pg_temp.as_('owner', format('select public.discard_invoice_draft(%L)', v_inv));
end $$;

-- an exception HALF WAY through rolls everything back (a trigger that fails on the messages update)
create function public.zz_gdpr_fail() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
create trigger zz_gdpr_fail before update on public.messages for each row execute function public.zz_gdpr_fail();
do $$
declare w0 text := pg_temp.world(pg_temp.id('biza')); r jsonb; v_erin uuid := pg_temp.id('erin');
begin
  r := pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', v_erin));
  perform pg_temp.chk('an exception half way (after appointments / invoices / consents were already blanked): everything rolled back',
    coalesce(r->>'raised', '-') || '/' || (pg_temp.world(pg_temp.id('biza')) = w0)::text || '/' || (select (client_notes is not null)::text from public.appointments where id = pg_temp.id('erin_a1')) || '/' || public.gdpr_erasing()::text,
    'true/true/true/false');
end $$;
drop trigger zz_gdpr_fail on public.messages;
drop function public.zz_gdpr_fail();

-- ===========================================================================
-- 3. ERASE: the real thing
-- ===========================================================================
create temporary table before_state (k text primary key, v text) on commit drop;
do $$
declare s text;
begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant select, insert on %I.before_state to authenticated, anon, service_role', s);
end $$;
insert into before_state values
  ('money_erin', pg_temp.money(pg_temp.id('erin'))),
  ('frank_scan', pg_temp.scan('privtag_frank')),
  ('frank_money', pg_temp.money(pg_temp.id('frank'))),
  ('beta_world', pg_temp.world(pg_temp.id('bizb'))),
  ('erin_scan_before', pg_temp.scan('privtag_erin')),
  ('phone_scan_before', pg_temp.scan('447700920001'));
do $$
declare r jsonb; r2 jsonb; v_erin uuid := pg_temp.id('erin'); w1 text; q int; n_audit int;
begin
  perform pg_temp.chk('before: the marker is spread over many tables (so the scan below means something)', (array_length(string_to_array(trim((select v from before_state where k = 'erin_scan_before')), ' '), 1) >= 10)::text, 'true');
  r := pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', v_erin));
  perform pg_temp.chk('owner erases: ok, first time, 1 storage object queued', (r->>'ok') || '/' || (r->>'already_erased') || '/' || jsonb_array_length(r->'storage_pending'), 'true/false/1');
  perform pg_temp.chk('NO personal text remains anywhere: a text scan of EVERY table finds no trace of the name / email marker or the phone number',
    pg_temp.scan('privtag_erin') || '|' || pg_temp.scan('447700920001') || '|' || pg_temp.scan('erin@example'), '||');
  perform pg_temp.chk('the clients row: anonymised, archived, marked erased',
    (select concat_ws('|', full_name, phone_e164, coalesce(email::text, 'null'), coalesce(notes, 'null'), (deleted_at is not null)::text, (erased_at is not null)::text) from public.clients where id = v_erin),
    'Erased client|+10000000000|null|null|true|true');
  perform pg_temp.chk('invoice snapshot: bill_to_name and notes blanked, number / totals / dates untouched',
    (select concat_ws('|', bill_to_name, coalesce(notes, 'null'), status, number is not null, total_minor, currency) from public.invoices where client_id = v_erin and status = 'issued'), 'Erased client|null|issued|t|4000|GBP');
  perform pg_temp.chk('EVERY financial row is byte-identical (invoices minus the two fields, items, payments, credit notes, appointments minus notes)', (pg_temp.money(v_erin) = (select v from before_state where k = 'money_erin'))::text, 'true');
  perform pg_temp.chk('appointment notes, cancellation reason, answers: blanked; the appointments themselves remain',
    (select concat_ws('|', count(*), count(client_notes), count(internal_notes), count(cancellation_reason)) from public.appointments where client_id = v_erin) || '/' ||
    (select count(value)::text || count(*)::text from public.appointment_field_values where appointment_id in (pg_temp.id('erin_a1'), pg_temp.id('erin_a2'))), '3|0|0|0/01');
  perform pg_temp.chk('signed form: answers {}, signer Erased, signature null, ip null; WHEN / WHICH version / WHICH client remain',
    (select concat_ws('|', answers::text, signer_name, coalesce(signature::text, 'null'), coalesce(ip_hash, 'null'), (signed_at is not null)::text, signed_via, (template_version_id is not null)::text) from public.signed_consents where client_id = v_erin), '{}|Erased|null|null|true|link|true');
  perform pg_temp.chk('review: comment, reply, first name removed, un-featured; rating stays',
    (select concat_ws('|', coalesce(comment, 'null'), coalesce(owner_reply, 'null'), reviewer_first_name, featured_on_website::text, rating::text) from public.reviews where client_id = v_erin), 'null|null|Erased|false|5');
  perform pg_temp.chk('messages: masked recipient, hash and error removed (row kept); outbox rows of the client deleted',
    (select concat_ws('|', count(*), count(recipient_masked), count(recipient_hash), count(error)) from public.messages where appointment_id = pg_temp.id('erin_a1')) || '/' || (select count(*)::text from public.message_outbox where client_id = v_erin), '1|0|0|0/0');
  perform pg_temp.chk('portal: sessions and sign-in links of that email deleted; the request is closed and its email forgotten',
    (select count(*)::text from public.portal_sessions where email = 'privtag_erin@example.com') || (select count(*)::text from public.portal_login_tokens where email = 'privtag_erin@example.com') || '/' ||
    (select concat_ws('|', status, coalesce(requester_email, 'null')) from public.data_requests where business_id = pg_temp.id('biza') and requester_email is null and resolved_by = pg_temp.id('owner')), '00/done|null');
  perform pg_temp.chk('guest manage links of the client are revoked, form / review links closed',
    (select count(*)::text from public.booking_manage_tokens where appointment_id in (pg_temp.id('erin_a1'), pg_temp.id('erin_a2')) and revoked_at is null) || (select count(*)::text from public.review_requests where client_id = v_erin and deleted_at is null), '00');
  perform pg_temp.chk('files: row kept as metadata only (name blanked, archived); object path queued for removal',
    (select concat_ws('|', original_name, (deleted_at is not null)::text) from public.files where client_id = v_erin) || '/' || (select count(*)::text from public.storage_cleanup_queue where client_id = v_erin and done_at is null and bucket = 'client-files'), 'erased|true/1');
  perform pg_temp.chk('the CONTROL client Frank is untouched: same text trail, same financial rows',
    ((pg_temp.scan('privtag_frank') = (select v from before_state where k = 'frank_scan'))::text) || ((pg_temp.money(pg_temp.id('frank')) = (select v from before_state where k = 'frank_money'))::text), 'truetrue');
  perform pg_temp.chk('another business is untouched', (pg_temp.world(pg_temp.id('bizb')) = (select v from before_state where k = 'beta_world'))::text, 'true');
  perform pg_temp.chk('audit: one client.erased row, ids and counts only (no name / email / phone), actor = the owner',
    (select count(*)::text from public.audit_logs where action = 'client.erased' and entity_id = v_erin::text and actor_user_id = pg_temp.id('owner')) || '/' || (select (after ? 'invoices')::text from public.audit_logs where action = 'client.erased' and entity_id = v_erin::text), '1/true');
  perform pg_temp.chk('the erase flag is off again after the call', public.gdpr_erasing()::text, 'false');

  -- idempotent
  w1 := pg_temp.world(pg_temp.id('biza'));
  r2 := pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', v_erin));
  perform pg_temp.chk('second erase: ok, already_erased, nothing else changes, still ONE audit row, queue entry still pending',
    (r2->>'ok') || '/' || (r2->>'already_erased') || '/' || (pg_temp.world(pg_temp.id('biza')) = w1)::text || '/' || (select count(*)::text from public.audit_logs where action = 'client.erased' and entity_id = v_erin::text) || '/' || jsonb_array_length(r2->'storage_pending'),
    'true/true/true/1/1');
  -- the Edge Function marks removed objects done
  perform pg_temp.chk('gdpr_storage_done (service role): marks the queued object done; a third call lists nothing pending',
    (pg_temp.svc(format($q$select to_jsonb(public.gdpr_storage_done(array[%L]::uuid[]))$q$, (r2->'storage_pending'->0->>'id')))::text) || '/' ||
    jsonb_array_length(pg_temp.as_('owner', format('select public.gdpr_erase_client(%L)', v_erin))->'storage_pending')::text, '1/0');
  -- the freed phone can be used by a new client
  perform pg_temp.chk('the erased phone number is free again (a new client may use it)', pg_temp.try_as('owner', format($q$insert into public.clients (business_id, full_name, phone_e164) values (%L, 'New Person', '+447700920001')$q$, pg_temp.id('biza'))), 'ok');
  -- export after erase
  perform pg_temp.chk('export of an erased client: shows erased_at, no personal text',
    (pg_temp.as_('owner', format('select public.gdpr_export_client(%L)', v_erin))->'client'->>'erased_at' is not null)::text || (pg_temp.as_('owner', format('select public.gdpr_export_client(%L)', v_erin))::text ilike '%privtag_erin%')::text, 'truefalse');
end $$;

-- ===========================================================================
-- 4. The immutable tables are still immutable OUTSIDE an erase
-- ===========================================================================
do $$
declare v_frank uuid := pg_temp.id('frank');
begin
  perform pg_temp.chk('issued invoice: amounts and even bill_to_name / notes are locked for postgres outside an erase',
    pg_temp.try(format($q$update public.invoices set total_minor = 1, subtotal_minor = 1, net_minor = 1 where client_id = %L$q$, v_frank)) || pg_temp.try(format($q$update public.invoices set bill_to_name = 'X' where client_id = %L$q$, v_frank)) || pg_temp.try(format($q$update public.invoices set notes = 'X' where client_id = %L$q$, v_frank)), '235142351423514');
  perform pg_temp.chk('signed form and review text are locked outside an erase',
    pg_temp.try(format($q$update public.signed_consents set signer_name = 'X' where client_id = %L$q$, v_frank)) || pg_temp.try(format($q$update public.reviews set comment = 'X' where client_id = %L$q$, v_frank)), '2351423514');
  perform pg_temp.chk('an API user cannot flip the erase flag to unlock them (pg_catalog.set_config is not an RPC; the flag only lives inside the erase function)',
    (pg_temp.as_('owner', $q$select to_jsonb(set_config('wapee.gdpr_erase', 'on', true))$q$) is not null)::text || pg_temp.try_as('owner', format($q$update public.invoices set bill_to_name = 'HACK' where client_id = %L$q$, v_frank)), 'true42501');
  perform set_config('wapee.gdpr_erase', 'off', true);
  perform pg_temp.chk('portal sessions / tokens cannot be deleted outside an erase', pg_temp.try(format($q$delete from public.portal_sessions where email = 'privtag_frank@example.com'$q$)) || pg_temp.try($q$delete from public.portal_login_tokens where email = 'privtag_frank@example.com'$q$), '2351423514');
  perform pg_temp.chk('the guards still pass an ordinary draft edit', pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, null, %L, '[{"description":"z","unit_price_minor":100}]'::jsonb)$q$, pg_temp.id('bra'), v_frank))->>'ok', 'true');
end $$;

-- ===========================================================================
-- 5. Portal request seam
-- ===========================================================================
do $$
declare r jsonb; v_s text; i int; v_id uuid; r1 text; r2 text; r3 text; r4 text;
begin
  perform pg_temp.chk('anon / authenticated cannot execute portal_create_data_request', has_function_privilege('anon', 'public.portal_create_data_request(text,text)', 'execute')::text || has_function_privilege('authenticated', 'public.portal_create_data_request(text,text)', 'execute')::text || has_function_privilege('service_role', 'public.portal_create_data_request(text,text)', 'execute')::text, 'falsefalsetrue');
  perform pg_temp.chk('no session / a bad session: invalid_session, nothing new stored', (pg_temp.p('portal_create_data_request', $q$'nope', 'export'$q$)->>'code') || (pg_temp.p('portal_create_data_request', $q$null, 'export'$q$)->>'code') || '/' || (select count(*)::text from public.data_requests where status = 'open' and kind = 'export'), 'invalid_sessioninvalid_session/0');
  v_s := pg_temp.login('p11g-a', 'biza', 'privtag_frank@example.com', 'frank');
  perform pg_temp.chk('an unknown kind is refused', pg_temp.p('portal_create_data_request', format('%L, %L', v_s, 'delete_everything'))->>'code', 'bad_request');
  r := pg_temp.p('portal_create_data_request', format('%L, %L', v_s, 'export'));
  perform pg_temp.chk('export request: ok, new', (r->>'ok') || '/' || (r->>'duplicate'), 'true/false');
  r1 := (pg_temp.p('portal_create_data_request', format('%L, %L', v_s, 'export'))->>'duplicate');
  perform pg_temp.chk('the same request again is accepted as a duplicate (no second row)', r1 || '/' || (select count(*)::text from public.data_requests where requester_email = 'privtag_frank@example.com' and kind = 'export' and status = 'open'), 'true/1');
  perform pg_temp.chk('an erase request while one is already open: accepted as a duplicate', pg_temp.p('portal_create_data_request', format('%L, %L', v_s, 'erase'))->>'duplicate', 'true');
  perform pg_temp.chk('audit: one portal.data_request row per NEW request, no actor, no email or token inside',
    (select count(*)::text from public.audit_logs where action = 'portal.data_request' and actor_user_id is null) || '/' || (select count(*)::text from public.audit_logs where action = 'portal.data_request' and (before::text || after::text) ~ '(@|[0-9a-f]{64})'), '1/0');
  r1 := jsonb_array_length(pg_temp.as_('owner', format($q$select public.list_data_requests(%L)$q$, pg_temp.id('biza')))->'rows')::text;
  r2 := (pg_temp.as_('mgr', format($q$select public.list_data_requests(%L)$q$, pg_temp.id('biza')))->'rows'->0->'clients'->0->>'id' = pg_temp.id('frank')::text)::text;
  perform pg_temp.chk('list_data_requests: owner and manager see the 2 open requests with the matching client; receptionist, staff, other business refused',
    r1 || r2 || (pg_temp.as_('recep', format($q$select public.list_data_requests(%L)$q$, pg_temp.id('biza')))->>'code') || (pg_temp.as_('staff', format($q$select public.list_data_requests(%L)$q$, pg_temp.id('biza')))->>'code') || (pg_temp.as_('ownerb', format($q$select public.list_data_requests(%L)$q$, pg_temp.id('biza')))->>'code'),
    '2trueforbiddenforbiddenforbidden');
  select id into v_id from public.data_requests where kind = 'export' and status = 'open' and requester_email = 'privtag_frank@example.com';
  r1 := pg_temp.as_('mgr', format($q$select public.resolve_data_request(%L, 'done')$q$, v_id))->>'ok';
  select id into v_id from public.data_requests where kind = 'erase' and status = 'open' and requester_email = 'privtag_frank@example.com';
  r2 := pg_temp.as_('mgr', format($q$select public.resolve_data_request(%L, 'done')$q$, v_id))->>'code';
  r3 := pg_temp.as_('owner', format($q$select public.resolve_data_request(%L, 'declined')$q$, v_id))->>'ok';
  r4 := pg_temp.as_('owner', format($q$select public.resolve_data_request(%L, 'done')$q$, v_id))->>'code';
  perform pg_temp.chk('resolve: a manager can close an EXPORT request but not an ERASE one (needs clients.erase); the owner can; closing twice is refused',
    r1 || r2 || r3 || r4, 'truenot_foundtruealready_resolved');
  perform pg_temp.chk('...a resolved request forgets the customer''s email', (select count(*)::text from public.data_requests where requester_email = 'privtag_frank@example.com'), '0');
  perform pg_temp.chk('resolutions are audited without personal data', (select count(*)::text from public.audit_logs where action like 'data_request.%' and (before::text || after::text) ~ '@') || (select count(*)::text from public.audit_logs where action like 'data_request.%'), '02');
  -- DB backstop: 5 requests per customer per day, even when staff resolve each one
  for i in 1..4 loop
    perform pg_temp.p('portal_create_data_request', format('%L, %L', v_s, 'export'));
    select id into v_id from public.data_requests where status = 'open' and kind = 'export' and business_id = pg_temp.id('biza') and email_hash is not null;
    perform pg_temp.as_('owner', format($q$select public.resolve_data_request(%L, 'done')$q$, v_id));
  end loop;
  perform pg_temp.chk('DB backstop: after 5 requests in a day (all resolved by staff) the 6th returns rate_limited (returns, never raises); nothing stored',
    (pg_temp.p('portal_create_data_request', format('%L, %L', v_s, 'export'))->>'code') || '/' || (select count(*)::text from public.data_requests where email_hash is not null), 'rate_limited/5');
end $$;

-- ===========================================================================
-- 6. BUSINESS erase: Owner only, name typed, storage first, enforce_last_owner
-- ===========================================================================
do $$
declare w0 text := pg_temp.world(pg_temp.id('bizc')); v_c uuid := pg_temp.id('bizc'); r jsonb; v_path text;
begin
  perform pg_temp.chk('check: the Manager of the business and a stranger are refused; the Owner with a WRONG name gets name_mismatch',
    (pg_temp.as_('mgrc', format($q$select public.gdpr_business_erase_check(%L, 'P11G Gamma')$q$, v_c))->>'code') || (pg_temp.as_('ownerb', format($q$select public.gdpr_business_erase_check(%L, 'P11G Gamma')$q$, v_c))->>'code') ||
    (pg_temp.as_('ownerc', format($q$select public.gdpr_business_erase_check(%L, 'p11g gamma')$q$, v_c))->>'code') || (pg_temp.as_('ownerc', format($q$select public.gdpr_business_erase_check(%L, null)$q$, v_c))->>'code') || (pg_temp.as_('ownerc', format($q$select public.gdpr_business_erase_check(%L, '  P11G Gamma ')$q$, v_c))->>'ok'),
    'forbiddenforbiddenname_mismatchname_mismatchtrue');
  perform pg_temp.chk('commit refused for manager / stranger / wrong name / anon: the business and every row are untouched, no log row',
    (pg_temp.as_('mgrc', format($q$select public.gdpr_erase_business_commit(%L, 'P11G Gamma')$q$, v_c))->>'code') || (pg_temp.as_('ownerb', format($q$select public.gdpr_erase_business_commit(%L, 'P11G Gamma')$q$, v_c))->>'code') ||
    (pg_temp.as_('ownerc', format($q$select public.gdpr_erase_business_commit(%L, 'Wrong')$q$, v_c))->>'code') || (pg_temp.as_anon(format($q$select public.gdpr_erase_business_commit(%L, 'P11G Gamma')$q$, v_c))->>'state') || '/' ||
    (pg_temp.world(v_c) = w0)::text || '/' || (select count(*)::text from public.erasure_log), 'forbiddenforbiddenname_mismatch42501/true/0');
  -- an object still in storage blocks the commit (the Edge Function empties storage FIRST)
  v_path := v_c::text || '/x/leftover.jpg';
  insert into storage.objects (bucket_id, name, owner) values ('client-files', v_path, null);
  r := pg_temp.as_('ownerc', format($q$select public.gdpr_erase_business_commit(%L, 'P11G Gamma')$q$, v_c));
  perform pg_temp.chk('storage not clean: refused, nothing touched', (r->>'code') || '/' || (pg_temp.world(v_c) = w0)::text || '/' || (select count(*)::text from public.erasure_log), 'storage_not_clean/true/0');
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'client-files' and name = v_path;
  r := pg_temp.as_('ownerc', format($q$select public.gdpr_erase_business_commit(%L, 'P11G Gamma')$q$, v_c));
  perform pg_temp.chk('storage clean: the business is erased THROUGH enforce_last_owner (no trigger disabled), with its Owner, members, clients, files rows', (r->>'ok') || '/' || (select count(*)::text from public.businesses where id = v_c) || (select count(*)::text from public.business_members where business_id = v_c) || (select count(*)::text from public.clients where business_id = v_c) || (select count(*)::text from public.files where business_id = v_c) || (select count(*)::text from public.branches where business_id = v_c), 'true/00000');
  perform pg_temp.chk('one erasure_log row: ids and counts, no names / emails / phones; its audit trail went with the business',
    (select concat_ws('|', count(*), max(counts ->> 'clients'), max(counts ->> 'members')) from public.erasure_log where business_id = v_c) || '/' || (select (counts::text ~* '(gamma|gina|@|\+44)')::text from public.erasure_log where business_id = v_c) || '/' || (select count(*)::text from public.audit_logs where business_id = v_c), '1|1|2/false/0');
  perform pg_temp.chk('the exemption does not outlive the call: flag cleared, and the last Owner of ANOTHER business is still protected',
    coalesce(current_setting('wapee.erase_business', true), '') || '/' || pg_temp.try(format($q$delete from public.member_role_assignments where member_id = %L$q$, pg_temp.member('biza', 'owner'))), '/23514');
  perform pg_temp.chk('the other businesses are untouched', (select count(*)::text from public.businesses where id in (pg_temp.id('biza'), pg_temp.id('bizb'))), '2');
end $$;

-- ===========================================================================
-- 7. Plain business delete still works with every guard change (enforce_last_owner disabled as before)
-- ===========================================================================
do $$
declare v_biz uuid := pg_temp.id('biza');
begin
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business (the old way): invoices, signed forms, reviews, portal rows are released with it', pg_temp.try(format($q$delete from public.businesses where id = %L$q$, v_biz)), 'ok');
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('...nothing left', (select count(*)::text from public.invoices where business_id = v_biz) || (select count(*)::text from public.signed_consents where business_id = v_biz) || (select count(*)::text from public.reviews where business_id = v_biz) || (select count(*)::text from public.portal_sessions where business_id = v_biz) || (select count(*)::text from public.data_requests where business_id = v_biz), '00000');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
