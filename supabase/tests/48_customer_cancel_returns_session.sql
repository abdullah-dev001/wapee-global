-- F23 (founder decision 2026-10-18): a CUSTOMER cancel before the visit gives
-- the deducted package session back, as a reversal row (never a delete).
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/48_customer_cancel_returns_session.sql
--
-- Plain SQL, as the Owner via request.jwt.claims. ROLLS BACK. Asserts STORED
-- rows, not only return codes (CLAUDE.md section 5).
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
create or replace function pg_temp.at(p_day int, p_minute int) returns timestamptz language sql stable as $$
  select (((date_trunc('week', (now() at time zone 'Europe/London')::date + 7))::date + p_day)::timestamp
          + make_interval(mins => p_minute)) at time zone 'Europe/London';
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

do $$
declare v_owner uuid := gen_random_uuid(); v_biz uuid; v_br uuid; v_svc uuid; v_ann uuid; v_other_svc uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'f23.owner@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  insert into ids values ('owner', v_owner);

  perform pg_temp.act_as(v_owner);
  set local role authenticated;
  v_biz := public.create_business_with_owner('F23 Lab','f23-lab-check','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biz', v_biz);
  select id into v_br from public.branches where business_id = v_biz;
  insert into ids values ('br', v_br);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (v_biz, 'Consult', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, v_br, v_biz, 4500, true);
  -- A service nobody performs (for the no_staff path).
  insert into public.services (business_id, name, duration_minutes) values (v_biz, 'Nobody', 60) returning id into v_other_svc;
  insert into ids values ('svc_nobody', v_other_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_other_svc, v_br, v_biz, 1000, true);

  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Ann', 1) returning id into v_ann;
  insert into ids values ('ann', v_ann);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_ann, v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365, slot_interval = 'min_60'
  where branch_id = v_br;

  -- An existing client with NO email (to prove a refused booking does not fill it).
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id, source)
  values (v_biz, 'Existing Person', '+447700900400', v_br, 'dashboard');
end $$;

create or replace function pg_temp.as_owner(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  execute p_sql into r;
  reset role;
  return r;
end $$;
-- Net sessions used, counted straight from the ledger (no member-gated helper).
create or replace function pg_temp.used(p_cp uuid) returns int language sql as $$
  select (count(*) filter (where kind = 'deduct') - count(*) filter (where kind = 'reversal'))::int
  from public.session_usages where client_package_id = p_cp
$$;

-- A 5-session package, sold to "Pack Client" on an issued invoice.
do $$
declare r jsonb; v_inv uuid; v_client uuid;
begin
  r := pg_temp.as_owner(format($q$select public.save_package(%L, null, 'Five pack', null, 5, 0, 20000, null, array[%L]::uuid[], true)$q$,
                               pg_temp.id('br'), pg_temp.id('svc')));
  perform pg_temp.chk('setup: package saved', r->>'ok', 'true');
  insert into ids values ('pkg', (r->>'package_id')::uuid);

  insert into public.clients (business_id, full_name, phone_e164, first_branch_id, source)
  values (pg_temp.id('biz'), 'Pack Client', '+447700900600', pg_temp.id('br'), 'dashboard') returning id into v_client;
  insert into ids values ('client', v_client);

  r := pg_temp.as_owner(format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$,
                               pg_temp.id('br'), v_client, format('[{"package_id": "%s"}]', pg_temp.id('pkg'))));
  v_inv := (r->>'invoice_id')::uuid;
  r := pg_temp.as_owner(format($q$select public.issue_invoice(%L)$q$, v_inv));
  perform pg_temp.chk('setup: package invoice issued', r->>'ok', 'true');
  insert into ids select 'cp', id from public.client_packages where invoice_id = v_inv;
end $$;

-- Customer bookings (public create_booking returns the raw manage token once).
create temporary table toks (k text primary key, t text) on commit drop;
do $$
declare r jsonb; i int;
begin
  for i in 1..4 loop
    r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(i, 600), pg_temp.id('ann'),
                               'Pack Client', '07700 900600');
    if not coalesce((r->>'ok')::boolean, false) then raise exception 'setup booking % failed: %', i, r; end if;
    insert into ids values ('ap' || i, (r->>'appointment_id')::uuid);
    insert into toks values ('ap' || i, r->>'manage_token');
  end loop;
end $$;

-- Sessions used for ap1, ap2, ap3 (not ap4) by the owner.
do $$
declare r jsonb; i int;
begin
  for i in 1..3 loop
    r := pg_temp.as_owner(format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap' || i), pg_temp.id('cp')));
    perform pg_temp.chk('setup: session deducted for ap' || i, r->>'ok', 'true');
  end loop;
end $$;
select pg_temp.chk('setup: 3 of 5 used', pg_temp.used(pg_temp.id('cp')), 3);

-- ap2: the owner already reversed it by hand.
do $$
declare r jsonb;
begin
  r := pg_temp.as_owner(format($q$select public.reverse_session((select id from public.session_usages where appointment_id = %L and kind = 'deduct'), 'Staff fixed it')$q$, pg_temp.id('ap2')));
  perform pg_temp.chk('setup: ap2 reversed by staff', r->>'ok', 'true');
end $$;

create temporary table deduct_before on commit drop as
  select id, kind::text, reason, created_by, created_at from public.session_usages where kind = 'deduct' and client_package_id = pg_temp.id('cp');
grant select on deduct_before to authenticated;

-- 1. Customer cancels ap1 with the manage link -> session returned.
do $$
declare r jsonb;
begin
  r := public.cancel_booking((select t from toks where k = 'ap1'), 'Cannot come');
  perform pg_temp.chk('guest cancel: ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('guest cancel: one reversal row for ap1',
  (select count(*)::int from public.session_usages where appointment_id = pg_temp.id('ap1') and kind = 'reversal'), 1);
select pg_temp.chk('guest cancel: it reverses ap1''s deduction, with a reason and no staff creator',
  (select concat_ws('|', (r.reverses_usage_id = d.id)::text, r.reason, (r.created_by is null)::text)
   from public.session_usages r join public.session_usages d on d.id = r.reverses_usage_id
   where r.appointment_id = pg_temp.id('ap1') and r.kind = 'reversal'),
  'true|Customer cancelled before the visit|true');
select pg_temp.chk('guest cancel: balance back to 1 used (ap3 only)', pg_temp.used(pg_temp.id('cp')), 1);
select pg_temp.chk('guest cancel: every deduction row is exactly as it was (never edited or deleted)',
  (select count(*)::int from public.session_usages d join deduct_before b using (id)
   where d.kind::text = b.kind and d.reason is not distinct from b.reason and d.created_by is not distinct from b.created_by and d.created_at = b.created_at),
  (select count(*)::int from deduct_before));
select pg_temp.chk('guest cancel: audited',
  (select count(*)::int from public.audit_logs where action = 'package.session_reversed'
   and entity_id = pg_temp.id('cp')::text and after->>'by' = 'customer_cancel'), 1);

-- 2. A second cancel of ap1 is refused and adds nothing.
do $$
declare r jsonb;
begin
  r := public.cancel_booking((select t from toks where k = 'ap1'), null);
  perform pg_temp.chk('second cancel: refused (token revoked)', r->>'ok', 'false');
end $$;
select pg_temp.chk('second cancel: still one reversal for ap1',
  (select count(*)::int from public.session_usages where appointment_id = pg_temp.id('ap1') and kind = 'reversal'), 1);

-- 3. ap2 was already reversed by staff: the guest cancel adds no second reversal.
do $$
declare r jsonb;
begin
  r := public.cancel_booking((select t from toks where k = 'ap2'), null);
  perform pg_temp.chk('already reversed: cancel ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('already reversed: still exactly one reversal for ap2',
  (select count(*)::int from public.session_usages where appointment_id = pg_temp.id('ap2') and kind = 'reversal'), 1);

-- 4. ap4 had no session used: cancel writes no ledger row.
do $$
declare r jsonb;
begin
  r := public.cancel_booking((select t from toks where k = 'ap4'), null);
  perform pg_temp.chk('no session: cancel ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('no session: no ledger row for ap4',
  (select count(*)::int from public.session_usages where appointment_id = pg_temp.id('ap4')), 0);

-- 5. STAFF cancel from the dashboard is unchanged: no automatic reversal.
do $$
declare r jsonb;
begin
  r := pg_temp.as_owner(format($q$select public.cancel_appointment(%L, 'Staff cancelled')$q$, pg_temp.id('ap3')));
  perform pg_temp.chk('staff cancel: ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('staff cancel: session NOT returned automatically',
  (select count(*)::int from public.session_usages where appointment_id = pg_temp.id('ap3') and kind = 'reversal'), 0);
select pg_temp.chk('final balance: 1 used (ap3)', pg_temp.used(pg_temp.id('cp')), 1);

-- 6. The helper never acts once the visit has started.
do $$
declare v_fv uuid; v_past uuid; v_n int;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biz') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at,
                                   duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('br'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
          now() - interval '2 hours', now() - interval '1 hour', 60, 'confirmed', v_fv, true)
  returning id into v_past;
  insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id, service_id)
  values (pg_temp.id('biz'), pg_temp.id('br'), pg_temp.id('cp'), 'deduct', v_past, pg_temp.id('svc'));
  v_n := public.reverse_package_sessions_for_customer_cancel(v_past);
  perform pg_temp.chk('after the start: helper returns nothing', v_n, 0);
  perform pg_temp.chk('after the start: no reversal written',
    (select count(*)::int from public.session_usages where appointment_id = v_past and kind = 'reversal'), 0);
end $$;

-- 7. Grants.
select pg_temp.chk('anon cannot call the helper',
  has_function_privilege('anon', 'public.reverse_package_sessions_for_customer_cancel(uuid)', 'execute'), false);
select pg_temp.chk('authenticated cannot call the helper',
  has_function_privilege('authenticated', 'public.reverse_package_sessions_for_customer_cancel(uuid)', 'execute'), false);

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total
from res;

select n, name, detail from res where not pass order by n;

rollback;
