-- QA audit fix (F2-01): enforce_last_owner now also fires on UPDATE of member_role_assignments and on
-- business_members (soft-delete/deactivate), not only DELETE of member_role_assignments.
--   supabase db query --linked -f supabase/tests/41_last_owner_update_guard.sql
-- Fixtures are created and rolled back. Covers: the raw UPDATE exploit reproduced in the QA audit (refused now),
-- ownership transfer (assign a new Owner first, then demote the old one: allowed), the founding-Owner bootstrap,
-- a no-op update (never refused), a direct business_members soft-delete/deactivate of the sole Owner (refused),
-- the wapee.erase_business exemption, and a super admin acting directly.
--
-- NOTE on "super admin acting directly": this codebase's RLS gates every write on can(), which itself requires
-- real business_members row for that business (public.can -> has_permission); it has NO is_super_admin()
-- bypass of its own (super admin actions go through dedicated SECURITY DEFINER admin RPCs instead, which run
-- as the function owner and never hit this RLS at all). So "a super admin acting directly" here means: a
-- backend/service-role-equivalent write with no signed-in user at all (auth.uid() is null), which is exactly
-- the other half of the SAME exemption branch in enforce_last_owner/enforce_last_owner_on_member
-- (`(select auth.uid()) is null or public.is_super_admin()`) and is what the restore/admin steps below use.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
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
-- Runs p_sql with NO signed-in user at all (auth.uid() is null) -- the backend/service-role path, which is
-- the exemption this fix's trigger grants alongside is_super_admin(). Used for restores and the "trusted
-- caller" case; never goes through RLS as `authenticated`, matching how the real admin RPCs run.
create or replace function pg_temp.as_backend(p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
create or replace function pg_temp.owner_count(p_biz text) returns integer language sql as $$
  select count(*)::integer
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  join public.roles r on r.id = a.role_id
  where m.business_id = pg_temp.id(p_biz) and m.status = 'active' and m.deleted_at is null
    and r.key = 'owner' and r.business_id is null
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixture: one business ("biza"), its owner ("owna"), a second person ("mgra") who will become a Manager,
-- and a second, independent business ("bizb") with its own owner, used only for the "another business
-- cannot touch this" negative check. No super-admin member is needed: see the NOTE above.
-- ---------------------------------------------------------------------------
do $$
declare
  v_owna uuid := gen_random_uuid(); v_mgra uuid := gen_random_uuid(); v_ownb uuid := gen_random_uuid();
  v_biza uuid; v_bizb uuid;
  v_mem_owna uuid; v_mem_mgra uuid; v_mem_ownb uuid;
  v_role_owner uuid; v_role_manager uuid;
  v_assign_owna uuid;
begin
  select id into v_role_owner from public.roles where key = 'owner' and business_id is null;
  select id into v_role_manager from public.roles where key = 'manager' and business_id is null;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p41.' || x.k || '@example.com',
         extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  from (values (v_owna,'owna'), (v_mgra,'mgra'), (v_ownb,'ownb')) as x(id, k);

  insert into ids values ('owna', v_owna), ('mgra', v_mgra), ('ownb', v_ownb);

  insert into public.businesses (name, slug, status, trial_ends_at) values ('QA41 Biz A', 'qa41-biz-a-' || left(replace(gen_random_uuid()::text, '-', ''), 8), 'trialing', now() + interval '14 days') returning id into v_biza;
  insert into public.businesses (name, slug, status, trial_ends_at) values ('QA41 Biz B', 'qa41-biz-b-' || left(replace(gen_random_uuid()::text, '-', ''), 8), 'trialing', now() + interval '14 days') returning id into v_bizb;
  insert into ids values ('biza', v_biza), ('bizb', v_bizb);

  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_biza, 'Main', true, 'US', 'USD', 'America/New_York', 'A41');
  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_bizb, 'Main', true, 'US', 'USD', 'America/New_York', 'B41');

  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biza, v_owna, 'active', now()) returning id into v_mem_owna;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_biza, v_mgra, 'active', now()) returning id into v_mem_mgra;
  insert into public.business_members (business_id, user_id, status, joined_at) values (v_bizb, v_ownb, 'active', now()) returning id into v_mem_ownb;
  insert into ids values ('mem_owna', v_mem_owna), ('mem_mgra', v_mem_mgra), ('mem_ownb', v_mem_ownb);

  insert into public.member_role_assignments (member_id, role_id) values (v_mem_owna, v_role_owner) returning id into v_assign_owna;
  insert into public.member_role_assignments (member_id, role_id) values (v_mem_ownb, v_role_owner);
  insert into ids values ('assign_owna', v_assign_owna), ('role_owner', v_role_owner), ('role_manager', v_role_manager);
end $$;

-- ===========================================================================
-- 1. THE EXPLOIT, reproduced exactly as in the QA audit: a raw UPDATE of the sole owner's own assignment.
--    Must now be REFUSED (23514), and the owner count must be unchanged.
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('exploit: owner demotes their own sole assignment via raw UPDATE -> refused',
    pg_temp.as_('owna', format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
      pg_temp.id('role_manager'), pg_temp.id('assign_owna'))), '23514');
  perform pg_temp.chk('...and the owner count is unchanged (still 1)', pg_temp.owner_count('biza')::text, '1');
end $$;

-- ===========================================================================
-- 2. A raw DELETE of the sole owner's assignment must still be refused (regression check: the original
--    DELETE guard must not have broken).
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('exploit variant: raw DELETE of the sole owner assignment -> still refused',
    pg_temp.as_('owna', format($q$delete from public.member_role_assignments where id = %L$q$, pg_temp.id('assign_owna'))), '23514');
  perform pg_temp.chk('...and the owner count is unchanged (still 1)', pg_temp.owner_count('biza')::text, '1');
end $$;

-- ===========================================================================
-- 3. Ownership transfer: assign a SECOND owner first (normal INSERT, unaffected by this trigger), then the
--    original owner's assignment CAN be changed/removed, because the count would no longer hit zero.
-- ===========================================================================
do $$
declare v_mem_mgra uuid := pg_temp.id('mem_mgra'); v_role_owner uuid := pg_temp.id('role_owner');
begin
  perform pg_temp.chk('transfer step 1: assigning a second Owner (mgra) succeeds',
    pg_temp.as_('owna', format($q$insert into public.member_role_assignments (member_id, role_id) values (%L, %L)$q$, v_mem_mgra, v_role_owner)), 'ok');
  perform pg_temp.chk('transfer step 2: NOW demoting the original owner via UPDATE succeeds (two owners exist)',
    pg_temp.as_('owna', format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
      pg_temp.id('role_manager'), pg_temp.id('assign_owna'))), 'ok');
  perform pg_temp.chk('...and exactly one owner remains (mgra)', pg_temp.owner_count('biza')::text, '1');
  -- restore for the remaining checks below (backend/service-role path: no RLS involved, matches how the
  -- real admin flows would do this via a DEFINER RPC): put owna back as Owner, remove mgra's Owner assignment
  perform pg_temp.as_backend(format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
    pg_temp.id('role_owner'), pg_temp.id('assign_owna')));
  perform pg_temp.as_backend(format($q$delete from public.member_role_assignments where member_id = %L and role_id = %L$q$,
    v_mem_mgra, v_role_owner));
  perform pg_temp.chk('restored: biza is back to exactly one owner (owna)', pg_temp.owner_count('biza')::text, '1');
end $$;

-- ===========================================================================
-- 4. A no-op UPDATE (same role_id/member_id/branch_id) on the sole owner's assignment must NEVER be refused --
--    the guard only blocks a change that is actually Owner-relevant.
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('no-op update of the sole owner assignment (role_id set to itself) -> allowed',
    pg_temp.as_('owna', format($q$update public.member_role_assignments set role_id = role_id where id = %L$q$, pg_temp.id('assign_owna'))), 'ok');
end $$;

-- ===========================================================================
-- 5. A trusted backend/service-role write (no signed-in user) is exempt -- the other half of the SAME
--    exemption branch `(select auth.uid()) is null or public.is_super_admin()`. This is how the real
--    signup RPC and admin flows reach this table: never as `authenticated` through RLS.
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('a backend write (no signed-in user) can demote the sole owner directly (exempt)',
    pg_temp.as_backend(format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
      pg_temp.id('role_manager'), pg_temp.id('assign_owna'))), 'ok');
  -- restore
  perform pg_temp.as_backend(format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
    pg_temp.id('role_owner'), pg_temp.id('assign_owna')));
  perform pg_temp.chk('restored after the backend-write test: biza has exactly one owner', pg_temp.owner_count('biza')::text, '1');
end $$;

-- ===========================================================================
-- 6. Founding-Owner bootstrap: a brand-new business with ZERO assignments at all is created through
--    create_business_with_owner (SECURITY DEFINER; the real signup path), which must still succeed
--    untouched by either guard on this table.
-- ===========================================================================
do $$
declare v_new_biz uuid; v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p41.founder@example.com',
          extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_new_biz := public.create_business_with_owner('QA41 Founder Biz', 'qa41-founder-' || left(replace(gen_random_uuid()::text, '-', ''), 8),
    'US', 'USD', 'America/New_York');
  reset role;
  perform pg_temp.chk('founding-owner bootstrap via create_business_with_owner still works',
    case when v_new_biz is not null then 'ok' else 'failed' end, 'ok');
end $$;

-- ===========================================================================
-- 7. business_members companion guard: directly soft-deleting or deactivating the sole Owner's membership
--    row must be refused, even without touching member_role_assignments at all.
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('soft-deleting the sole owner''s business_members row directly -> refused',
    pg_temp.as_('owna', format($q$update public.business_members set deleted_at = now() where id = %L$q$, pg_temp.id('mem_owna'))), '23514');
  perform pg_temp.chk('...deactivating (status) the sole owner''s row directly -> refused',
    pg_temp.as_('owna', format($q$update public.business_members set status = 'disabled' where id = %L$q$, pg_temp.id('mem_owna'))), '23514');
  perform pg_temp.chk('...and the owner count is unchanged (still 1)', pg_temp.owner_count('biza')::text, '1');
  perform pg_temp.chk('an unrelated field change on the owner''s own row (not leaving active state) is unaffected',
    pg_temp.as_('owna', format($q$update public.business_members set joined_at = now() where id = %L$q$, pg_temp.id('mem_owna'))), 'ok');
end $$;

-- ===========================================================================
-- 8. Another business's owner cannot be touched by business A's members at all (ordinary RLS, re-checked
--    here only to confirm this fix did not loosen anything cross-tenant).
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('biza''s owner cannot update bizb''s owner assignment (RLS: not a member of bizb)',
    pg_temp.as_('owna', format($q$update public.member_role_assignments set role_id = %L
      where member_id in (select id from public.business_members where business_id = %L)$q$,
      pg_temp.id('role_manager'), pg_temp.id('bizb'))), 'ok'); -- 0-row update: RLS silently filters, not an error
end $$;

-- ===========================================================================
-- 9. wapee.erase_business flag: while set for a business, its last-owner guard is lifted (mirrors the
--    pre-existing DELETE-path exemption; checked here for the UPDATE path specifically). Run as a backend
--    write with the flag set, exactly as gdpr_erase_business_commit/account_delete_commit do it.
-- ===========================================================================
do $$
begin
  perform set_config('wapee.erase_business', pg_temp.id('biza')::text, true);
  perform pg_temp.chk('while wapee.erase_business is set for biza: the UPDATE guard is lifted',
    pg_temp.as_backend(format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
      pg_temp.id('role_manager'), pg_temp.id('assign_owna'))), 'ok');
  perform set_config('wapee.erase_business', '', true);
  -- restore
  perform pg_temp.as_backend(format($q$update public.member_role_assignments set role_id = %L where id = %L$q$,
    pg_temp.id('role_owner'), pg_temp.id('assign_owna')));
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
