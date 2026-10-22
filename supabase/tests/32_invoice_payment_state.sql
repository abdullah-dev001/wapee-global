-- Phase 11B: invoice_payment_state (denormalised payment state behind the list_invoices payment filter) always equals
-- invoice_money(), after every kind of change, and list_invoices filters on it correctly.
--   supabase db query --linked -f supabase/tests/32_invoice_payment_state.sql
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
do $$
declare s text;
begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to service_role', s);
  execute format('grant select, insert on %I.ids to service_role', s);
  execute format('grant select, insert on %I.res to service_role', s);
end $$;
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('ownerb')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11i.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11I Alpha','p11i-a','GB','GBP','Europe/London','en',null,'Main'); reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11I Beta','p11i-b','GB','GBP','Europe/London','en',null,'Beta'); reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;

create or replace function pg_temp.st(p_inv uuid) returns text language sql as $$
  select case when exists (select 1 from public.invoice_payment_state where invoice_id = p_inv) then coalesce((select payment_status from public.invoice_payment_state where invoice_id = p_inv), '<null>') else '<no row>' end
$$;
create or replace function pg_temp.money_st(p_inv uuid) returns text language sql as $$
  select coalesce(public.invoice_money(p_inv) ->> 'payment_status', '<null>')
$$;
create or replace function pg_temp.listed(p_user text, p_status text) returns text language sql as $$
  select coalesce((select string_agg(x ->> 'id', ',' order by x ->> 'id') from jsonb_array_elements(pg_temp.as_(p_user, format($q$select public.list_invoices(%L, null, null, %L)$q$, pg_temp.id('biza'), p_status)) -> 'rows') x), '')
$$;

do $$
declare v_inv uuid; v_inv2 uuid; v_pay uuid; r jsonb; bad int;
begin
  v_inv := pg_temp.draft('owner', null, '[{"description":"x","unit_price_minor":10000}]');
  perform pg_temp.chk('draft: a row with a NULL status (a draft has no payment state), same as invoice_money', pg_temp.st(v_inv) || '/' || pg_temp.money_st(v_inv), '<null>/<null>');
  perform pg_temp.issue('owner', v_inv);
  perform pg_temp.chk('issued: pending', pg_temp.st(v_inv) || '/' || pg_temp.money_st(v_inv), 'pending/pending');
  perform pg_temp.as_('owner', format($q$select public.add_payment(%L, 'cash', 4000)$q$, v_inv));
  perform pg_temp.chk('part payment: partial', pg_temp.st(v_inv) || '/' || pg_temp.money_st(v_inv), 'partial/partial');
  perform pg_temp.chk('a refused overpayment leaves the state alone', (pg_temp.as_('owner', format($q$select public.add_payment(%L, 'cash', 999999)$q$, v_inv))->>'code') || '/' || pg_temp.st(v_inv), 'overpayment/partial');
  perform pg_temp.as_('owner', format($q$select public.add_payment(%L, 'card', 6000)$q$, v_inv));
  perform pg_temp.chk('fully paid: paid', pg_temp.st(v_inv) || '/' || pg_temp.money_st(v_inv), 'paid/paid');
  select id into v_pay from public.invoice_payments where invoice_id = v_inv and kind = 'payment' order by amount_minor desc limit 1;
  r := pg_temp.as_('owner', format($q$select public.reverse_payment(%L, 'entered by mistake')$q$, v_pay));
  perform pg_temp.chk('a reversal moves it back: partial (state follows invoice_money)', (r->>'ok') || '/' || pg_temp.st(v_inv) || '/' || pg_temp.money_st(v_inv), 'true/partial/partial');
  v_inv2 := pg_temp.draft('owner', null, '[{"description":"y","unit_price_minor":5000}]');
  perform pg_temp.issue('owner', v_inv2);
  perform pg_temp.chk('the list filter returns exactly the matching invoices: partial = first, pending = second, paid / credited = none',
    (pg_temp.listed('owner', 'partial') = v_inv::text)::text || (pg_temp.listed('owner', 'pending') = v_inv2::text)::text || (pg_temp.listed('owner', 'paid') = '')::text || (pg_temp.listed('owner', 'credited') = '')::text, 'truetruetruetrue');
  r := pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'goodwill', 2000)$q$, v_inv2));
  perform pg_temp.chk('a partial credit note on an unpaid invoice leaves it pending (net due drops)', (r->>'ok') || '/' || pg_temp.st(v_inv2) || '/' || pg_temp.money_st(v_inv2), 'true/pending/pending');
  r := pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'void the rest')$q$, v_inv2));
  perform pg_temp.chk('crediting everything: credited', (r->>'ok') || '/' || pg_temp.st(v_inv2) || '/' || pg_temp.money_st(v_inv2), 'true/credited/credited');
  perform pg_temp.chk('...and the filter follows: credited = second, pending = none', (pg_temp.listed('owner', 'credited') = v_inv2::text)::text || (pg_temp.listed('owner', 'pending') = '')::text, 'truetrue');
  perform pg_temp.chk('an invalid filter value is refused, not matched to nothing', pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, 'bogus')$q$, pg_temp.id('biza')))->>'code', 'invalid_filter');
  perform pg_temp.chk('another business cannot list this one (forbidden) and its own list is empty', (pg_temp.as_('ownerb', format($q$select public.list_invoices(%L)$q$, pg_temp.id('biza')))->>'code') || (jsonb_array_length(pg_temp.as_('ownerb', format($q$select public.list_invoices(%L)$q$, pg_temp.id('bizb')))->'rows'))::text, 'forbidden0');
  perform pg_temp.chk('the full figures of a listed row still come from invoice_money', (pg_temp.as_('owner', format($q$select public.list_invoices(%L, null, null, 'partial')$q$, pg_temp.id('biza')))->'rows'->0->>'balance_minor') || '/' || (public.invoice_money(v_inv) ->> 'balance_minor'), '6000/6000');
  select count(*) into bad from public.invoices i left join public.invoice_payment_state s on s.invoice_id = i.id
   where i.business_id in (pg_temp.id('biza'), pg_temp.id('bizb')) and s.payment_status is distinct from (public.invoice_money(i.id) ->> 'payment_status');
  perform pg_temp.chk('no drift: every invoice of the suite has state == invoice_money', bad::text, '0');
  perform pg_temp.chk('the table is closed to API roles', pg_temp.try_as('owner', 'select * from public.invoice_payment_state') || pg_temp.try_as('owner', 'delete from public.invoice_payment_state'), '4250142501');
end $$;

do $$
declare v_biz uuid := pg_temp.id('biza');
begin
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business: the state rows go with it (no guard trips)', pg_temp.try(format($q$delete from public.businesses where id = %L$q$, v_biz)), 'ok');
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('...nothing left', (select count(*)::text from public.invoice_payment_state where business_id = v_biz), '0');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
