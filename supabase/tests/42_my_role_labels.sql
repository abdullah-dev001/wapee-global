-- QA audit (my_role_labels security check): my_role_labels(business_id) reports the caller's OWN role
-- assignments for one business (dashboard header display, not a permission check). Covers: owner, a
-- same-business receptionist (different role, different permission_count), another business's member
-- querying a business they do not belong to (empty, no leak), a member with no role assignment at all,
-- and anon (must be refused outright now that migration 20261024100000 revoked anon's stray EXECUTE
-- grant -- before that fix anon got a silent empty result, not a refusal). Also asserts no unintended
-- function in public is anon-executable (closes the same migration's other half).
--   supabase db query --linked -f supabase/tests/42_my_role_labels.sql
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
-- Same as chk, but compares got/want as JSONB values (key order-independent) rather than literal text.
create or replace function pg_temp.chk_json(p_name text, p_got text, p_want text) returns void language plpgsql as $$
declare v_pass boolean;
begin
  begin
    v_pass := (p_got::jsonb is not distinct from p_want::jsonb);
  exception when others then
    v_pass := false;
  end;
  insert into res (name, pass, detail)
  values (p_name, v_pass, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end; $$;
-- Runs p_sql as the given signed-in user (RLS applies); returns 'ok' or the SQLSTATE of whatever it raised.
create or replace function pg_temp.as_(p_user text, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;
-- Runs p_sql as anon (no JWT at all) and returns 'ok' or the SQLSTATE of whatever it raised.
create or replace function pg_temp.as_anon(p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;
-- Collects a result set as JSON text, as the given signed-in user. Compare with chk_json (JSONB-aware),
-- not chk, since jsonb's own key ordering need not match a hand-written literal.
create or replace function pg_temp.rows_as(p_user text, p_sql text) returns text language plpgsql as $$
declare v_out jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || p_sql || ') t' into v_out;
  reset role;
  return v_out::text;
exception when others then
  reset role;
  return 'ERROR:' || sqlstate;
end $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixture: business A ("biza") with an Owner ("owna") and a Receptionist ("recpa"), a second independent
-- business ("bizb") with its own Owner ("ownb") used for the cross-tenant check, and a member of biza with
-- NO role assignment at all ("norole").
-- ---------------------------------------------------------------------------
do $$
declare
  v_owna uuid := gen_random_uuid(); v_recpa uuid := gen_random_uuid(); v_norole uuid := gen_random_uuid();
  v_ownb uuid := gen_random_uuid();
  v_biza uuid; v_bizb uuid;
  v_mem_owna uuid; v_mem_recpa uuid; v_mem_norole uuid; v_mem_ownb uuid;
  v_role_owner uuid; v_role_receptionist uuid;
  v_owner_perm_count bigint; v_recp_perm_count bigint;
begin
  select id into v_role_owner from public.roles where key = 'owner' and business_id is null;
  select id into v_role_receptionist from public.roles where key = 'receptionist' and business_id is null;
  select count(*) into v_owner_perm_count from public.role_permissions where role_id = v_role_owner;
  select count(*) into v_recp_perm_count from public.role_permissions where role_id = v_role_receptionist;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p42.' || x.k || '@example.com',
         extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  from (values (v_owna,'owna'), (v_recpa,'recpa'), (v_norole,'norole'), (v_ownb,'ownb')) as x(id, k);

  insert into ids values ('owna', v_owna), ('recpa', v_recpa), ('norole', v_norole), ('ownb', v_ownb),
    ('owner_perm_count', null), ('recp_perm_count', null);
  update ids set v = null where k in ('owner_perm_count', 'recp_perm_count'); -- placeholders; real counts kept in res detail instead

  insert into public.businesses (name, slug, status, trial_ends_at) values ('QA42 Biz A', 'qa42-biz-a-' || left(replace(gen_random_uuid()::text, '-', ''), 8), 'trialing', now() + interval '14 days') returning id into v_biza;
  insert into public.businesses (name, slug, status, trial_ends_at) values ('QA42 Biz B', 'qa42-biz-b-' || left(replace(gen_random_uuid()::text, '-', ''), 8), 'trialing', now() + interval '14 days') returning id into v_bizb;
  insert into ids values ('biza', v_biza), ('bizb', v_bizb);

  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_biza, 'Main', true, 'US', 'USD', 'America/New_York', 'A42');
  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_bizb, 'Main', true, 'US', 'USD', 'America/New_York', 'B42');

  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biza, v_owna, 'active', now()) returning id into v_mem_owna;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biza, v_recpa, 'active', now()) returning id into v_mem_recpa;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biza, v_norole, 'active', now()) returning id into v_mem_norole;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_bizb, v_ownb, 'active', now()) returning id into v_mem_ownb;
  insert into ids values ('mem_owna', v_mem_owna), ('mem_recpa', v_mem_recpa), ('mem_norole', v_mem_norole), ('mem_ownb', v_mem_ownb);

  insert into public.member_role_assignments (member_id, role_id) values (v_mem_owna, v_role_owner);
  insert into public.member_role_assignments (member_id, role_id) values (v_mem_recpa, v_role_receptionist);
  insert into public.member_role_assignments (member_id, role_id) values (v_mem_ownb, v_role_owner);
  -- norole gets NO row in member_role_assignments at all.

  insert into ids values ('role_owner', v_role_owner), ('role_receptionist', v_role_receptionist);
  insert into res (name, pass, detail) values ('fixture: owner role has N permissions', true, v_owner_perm_count::text);
  insert into res (name, pass, detail) values ('fixture: receptionist role has N permissions', true, v_recp_perm_count::text);
end $$;

-- ===========================================================================
-- 1. Owner sees only their own Owner role for their own business, with the real permission_count.
-- ===========================================================================
do $$
declare v_expected text;
begin
  select format('[{"role_name": "Owner", "branch_id": null, "permission_count": %s}]',
    (select count(*) from public.role_permissions where role_id = pg_temp.id('role_owner')))
  into v_expected;
  perform pg_temp.chk_json('owner: my_role_labels(biza) returns exactly their own Owner row',
    pg_temp.rows_as('owna', format('select * from public.my_role_labels(%L)', pg_temp.id('biza'))),
    v_expected);
end $$;

-- ===========================================================================
-- 2. A same-business Receptionist sees only their own Receptionist role (different role, different
--    permission_count) -- never the Owner's row, even though they share a business.
-- ===========================================================================
do $$
declare v_expected text;
begin
  select format('[{"role_name": "Receptionist", "branch_id": null, "permission_count": %s}]',
    (select count(*) from public.role_permissions where role_id = pg_temp.id('role_receptionist')))
  into v_expected;
  perform pg_temp.chk_json('same-business receptionist: sees only their own Receptionist row',
    pg_temp.rows_as('recpa', format('select * from public.my_role_labels(%L)', pg_temp.id('biza'))),
    v_expected);
end $$;

-- ===========================================================================
-- 3. Another business's member querying biza's business_id gets nothing -- no cross-tenant leak of the
--    Owner's or Receptionist's role labels. Sanity check: the same caller querying THEIR OWN business
--    still gets their own row (confirms the empty result above is isolation, not a broken function).
-- ===========================================================================
do $$
begin
  perform pg_temp.chk_json('cross-tenant: bizb''s owner querying biza gets an empty result (no leak)',
    pg_temp.rows_as('ownb', format('select * from public.my_role_labels(%L)', pg_temp.id('biza'))),
    '[]');
  perform pg_temp.chk_json('...but the same caller querying their OWN business still gets their own row',
    pg_temp.rows_as('ownb', format('select * from public.my_role_labels(%L)', pg_temp.id('bizb'))),
    format('[{"role_name": "Owner", "branch_id": null, "permission_count": %s}]',
      (select count(*) from public.role_permissions where role_id = pg_temp.id('role_owner'))));
end $$;

-- ===========================================================================
-- 4. An active member with NO role assignment at all gets an empty result, not an error.
-- ===========================================================================
do $$
begin
  perform pg_temp.chk_json('member with no role assignment: empty result, not an error',
    pg_temp.rows_as('norole', format('select * from public.my_role_labels(%L)', pg_temp.id('biza'))),
    '[]');
end $$;

-- ===========================================================================
-- 5. anon must be REFUSED outright (permission denied), not given a silent empty 200. This is the exact
--    gap migration 20261024100000 closed: before it, anon had a stray EXECUTE grant from the schema's
--    default ACL and got [] back instead of an error.
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('anon: my_role_labels is refused with permission denied (42501), not a silent empty result',
    pg_temp.as_anon(format('select * from public.my_role_labels(%L)', pg_temp.id('biza'))),
    '42501');
end $$;

-- ===========================================================================
-- 6. No OTHER unintended function in public is anon-executable. get_public_pricing is the only function
--    explicitly, intentionally granted to anon (public pricing page); invite_preview was retired in
--    20261026110000 -- everything else must come back empty.
-- ===========================================================================
do $$
declare v_unexpected text;
begin
  select coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', '), '')
  into v_unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname not in ('get_public_pricing');
  perform pg_temp.chk('no unintended function in public is anon-executable (only get_public_pricing may be)',
    v_unexpected, '');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
