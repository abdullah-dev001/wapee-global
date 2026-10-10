-- Public pricing (landing page) + the new admin price fields.
--   supabase db query --linked -f supabase/tests/36_public_pricing.sql
-- Fixtures are created and rolled back. Covers: get_public_pricing as anon (shape, public fields only, active rows
-- only), set_plan_prices / set_addon_prices new params (stored values, every refusal leaves the row unchanged,
-- audit), reserved landing slugs.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.as_(p_user text, p_sql text, p_aal2 boolean default false) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated',
                      'aal', case when p_aal2 then 'aal2' else 'aal1' end)::text, true);
  set local role authenticated;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;
create or replace function pg_temp.anon(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate); end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;
-- A row as one comparable text value (everything a refusal must leave untouched).
create or replace function pg_temp.plan_row(p_key text) returns text language sql as $$
  select concat_ws('|', name, price_monthly_minor, price_annual_minor, currency, active, priced_per_branch, updated_by)
    from public.plans where key::text = p_key $$;
create or replace function pg_temp.addon_row(p_key text) returns text language sql as $$
  select concat_ws('|', name, price_monthly_minor, price_annual_minor, currency, active, available_plans::text, updated_by)
    from public.addons where key = p_key $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
end $$;

do $$
declare r record; v_id uuid; v_biz uuid;
begin
  for r in select * from (values ('owner'),('su')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p36.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set is_super_admin = true where id = pg_temp.id('su');
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P36 Salon','p36-salon','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into ids values ('biz', v_biz);
end $$;

do $$
declare r jsonb; v_before text; v_audits int;
begin
  -- ---------------------------------------------------------------- public read
  r := pg_temp.anon('select public.get_public_pricing()');
  perform pg_temp.chk('anon can call get_public_pricing', (r ? 'raised')::text, 'false');
  perform pg_temp.chk('3 plans', jsonb_array_length(r->'plans')::text, '3');
  perform pg_temp.chk('plans in sort order', (select string_agg(p->>'key', ',') from jsonb_array_elements(r->'plans') p), 'solo,team,business');
  perform pg_temp.chk('6 add-ons', jsonb_array_length(r->'addons')::text, '6');
  perform pg_temp.chk('plan fields are the public whitelist only',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(r->'plans'->0) k),
    'currency,features,key,max_branches,name,price_annual_minor,price_monthly_minor,priced_per_branch,staff_cap');
  perform pg_temp.chk('add-on fields are the public whitelist only',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(r->'addons'->0) k),
    'available_plans,currency,key,name,price_annual_minor,price_monthly_minor');
  -- launch values (stored, read back through the public function)
  perform pg_temp.chk('solo 15 / 150', (r->'plans'->0->>'price_monthly_minor') || '/' || (r->'plans'->0->>'price_annual_minor'), '1500/15000');
  perform pg_temp.chk('team 39 / 390, cap 5', (r->'plans'->1->>'price_monthly_minor') || '/' || (r->'plans'->1->>'price_annual_minor') || '/' || (r->'plans'->1->>'staff_cap'), '3900/39000/5');
  perform pg_temp.chk('business 79 per branch, unlimited', (r->'plans'->2->>'price_monthly_minor') || '/' || (r->'plans'->2->>'priced_per_branch') || '/' || coalesce(r->'plans'->2->>'staff_cap', 'null'), '7900/true/null');
  perform pg_temp.chk('features are the gating flags (business custom_roles)', r->'plans'->2->'features'->>'custom_roles', 'true');
  perform pg_temp.chk('add-on prices', (select string_agg((a->>'key') || '=' || (a->>'price_monthly_minor') || '/' || (a->>'price_annual_minor'), ',') from jsonb_array_elements(r->'addons') a),
    'packages=900/9000,inventory=900/9000,files_photos=900/9000,forms_consent=1200/12000,client_portal=1200/12000,custom_roles=1000/10000');
  perform pg_temp.chk('custom roles: team only', (select (a->'available_plans')::text from jsonb_array_elements(r->'addons') a where a->>'key' = 'custom_roles'), '["team"]');
  perform pg_temp.chk('other add-ons: every plan', (select (a->'available_plans')::text from jsonb_array_elements(r->'addons') a where a->>'key' = 'packages'), 'null');
  perform pg_temp.chk('authenticated can call too', (pg_temp.as_('owner', 'select public.get_public_pricing()') ? 'plans')::text, 'true');
  perform pg_temp.chk('anon still cannot read plans table', pg_temp.anon('select to_jsonb(count(*)) from public.plans')->>'state', '42501');

  -- inactive rows are hidden
  update public.plans set active = false where key = 'solo';
  update public.addons set active = false where key = 'inventory';
  r := pg_temp.anon('select public.get_public_pricing()');
  perform pg_temp.chk('inactive plan hidden', (select string_agg(p->>'key', ',') from jsonb_array_elements(r->'plans') p), 'team,business');
  perform pg_temp.chk('inactive add-on hidden', jsonb_array_length(r->'addons')::text, '5');
  update public.plans set active = true where key = 'solo';
  update public.addons set active = true where key = 'inventory';

  -- ---------------------------------------------------------------- set_plan_prices
  v_before := pg_temp.plan_row('team');
  perform pg_temp.chk('anon cannot set plan prices', pg_temp.anon($q$select public.set_plan_prices('team', 1, 1, 'USD')$q$)->>'state', '42501');
  perform pg_temp.chk('owner refused', pg_temp.as_('owner', $q$select public.set_plan_prices('team', 1, 1, 'USD', null, null, true)$q$, true)->>'code', 'forbidden');
  perform pg_temp.chk('super admin aal1 refused', pg_temp.as_('su', $q$select public.set_plan_prices('team', 1, 1, 'USD', null, null, true)$q$, false)->>'code', 'mfa_required');
  perform pg_temp.chk('negative price refused', pg_temp.as_('su', $q$select public.set_plan_prices('team', -1, 1, 'USD', null, null, true)$q$, true)->>'code', 'invalid_input');
  perform pg_temp.chk('unknown plan', pg_temp.as_('su', $q$select public.set_plan_prices('gold', 1, 1, 'USD')$q$, true)->>'code', 'not_found');
  perform pg_temp.chk('...team row unchanged after every refusal', pg_temp.plan_row('team'), v_before);

  r := pg_temp.as_('su', $q$select public.set_plan_prices('team', 4000, 40000, 'USD', null, null, true)$q$, true);
  perform pg_temp.chk('set per-branch ok', r->>'ok', 'true');
  perform pg_temp.chk('stored per-branch + prices', (select concat_ws('|', price_monthly_minor, price_annual_minor, priced_per_branch, updated_by = pg_temp.id('su')) from public.plans where key = 'team'), '4000|40000|t|t');
  r := pg_temp.as_('su', $q$select public.set_plan_prices('team', 3900, 39000, 'USD')$q$, true);
  perform pg_temp.chk('old positional call still works', r->>'ok', 'true');
  perform pg_temp.chk('...per-branch kept when not passed', (select priced_per_branch::text from public.plans where key = 'team'), 'true');
  perform pg_temp.chk('audit row records per-branch before/after',
    (select (before->>'priced_per_branch') || '>' || (after->>'priced_per_branch') from public.audit_logs
      where action = 'admin.set_plan_prices' and entity_id = 'team' and actor_user_id = pg_temp.id('su') order by created_at, id limit 1), 'false>true');

  -- ---------------------------------------------------------------- set_addon_prices
  v_before := pg_temp.addon_row('packages');
  perform pg_temp.chk('owner refused (addon)', pg_temp.as_('owner', $q$select public.set_addon_prices('packages', 1, 'USD', null, null, 10, array['team'])$q$, true)->>'code', 'forbidden');
  perform pg_temp.chk('unknown plan key refused', pg_temp.as_('su', $q$select public.set_addon_prices('packages', 900, 'USD', null, null, 9000, array['gold'])$q$, true)->>'code', 'invalid_input');
  perform pg_temp.chk('null plan key refused', pg_temp.as_('su', $q$select public.set_addon_prices('packages', 900, 'USD', null, null, 9000, array['team', null])$q$, true)->>'code', 'invalid_input');
  perform pg_temp.chk('negative annual refused', pg_temp.as_('su', $q$select public.set_addon_prices('packages', 900, 'USD', null, null, -1)$q$, true)->>'code', 'invalid_input');
  perform pg_temp.chk('...packages row unchanged after every refusal', pg_temp.addon_row('packages'), v_before);

  r := pg_temp.as_('su', $q$select public.set_addon_prices('packages', 1000, 'USD', null, null, 9500, array['business', 'team', 'team'])$q$, true);
  perform pg_temp.chk('set annual + plans ok', r->>'ok', 'true');
  perform pg_temp.chk('stored annual + plans (deduped, enum order)', (select concat_ws('|', price_monthly_minor, price_annual_minor, available_plans::text) from public.addons where key = 'packages'), '1000|9500|{team,business}');
  r := pg_temp.as_('su', $q$select public.set_addon_prices('packages', 900, 'USD')$q$, true);
  perform pg_temp.chk('old positional call keeps annual + plans', (select concat_ws('|', price_monthly_minor, price_annual_minor, available_plans::text) from public.addons where key = 'packages'), '900|9500|{team,business}');
  r := pg_temp.as_('su', $q$select public.set_addon_prices('packages', 900, 'USD', null, null, 9000, array[]::text[])$q$, true);
  perform pg_temp.chk('empty array = every plan (null)', (select coalesce(available_plans::text, 'null') from public.addons where key = 'packages'), 'null');
  select count(*) into v_audits from public.audit_logs where action = 'admin.set_addon_prices' and entity_id = 'packages' and actor_user_id = pg_temp.id('su');
  perform pg_temp.chk('three audited addon writes (refusals not audited)', v_audits::text, '3');

  -- ---------------------------------------------------------------- reserved slugs
  perform pg_temp.chk('pricing reserved', (select count(*)::text from public.reserved_slugs where slug in ('pricing', 'features', 'refund')), '3');
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  perform pg_temp.chk('a business cannot take /refund',
    (select case when exists (select 1 from public.businesses where slug = 'refund') then 'taken' else 'free' end), 'free');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A business cannot be renamed to a landing path (the slug trigger reads reserved_slugs).
do $$
declare v_state text := 'ok';
begin
  begin
    update public.businesses set slug = 'refund' where id = pg_temp.id('biz');
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.chk('slug trigger refuses refund', (v_state <> 'ok')::text, 'true');
  perform pg_temp.chk('...slug unchanged', (select slug::text from public.businesses where id = pg_temp.id('biz')), 'p36-salon');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
