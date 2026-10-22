-- Suspended business blocks login for every user whose businesses are ALL suspended.
--   supabase db query --linked -f supabase/tests/35_suspended_login_block.sql
-- Fixtures are created and rolled back. Covers: user_is_disabled, the access-token hook (incl. FAIL-OPEN), the
-- session purge in set_business_status, my_access_state, audit rows.
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
create or replace function pg_temp.as_(p_user text, p_sql text, p_aal2 boolean default false) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user), p_aal2);
  set local role authenticated;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
-- the hook as GoTrue calls it (run as postgres here: the test user cannot SET ROLE supabase_auth_admin)
create or replace function pg_temp.hook(p_user uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  r := public.custom_access_token_hook(jsonb_build_object('user_id', p_user, 'claims', jsonb_build_object('sub', p_user), 'authentication_method', 'password'));
  return r;
end $$;
create or replace function pg_temp.sess(p_user text) returns text language sql as $$
  select (select count(*) from auth.sessions where user_id = pg_temp.id(p_user))::text || '/' ||
         (select count(*) from auth.refresh_tokens where user_id = pg_temp.id(p_user)::text)::text
$$;
create or replace function pg_temp.mk_sess(p_user text) returns void language plpgsql as $$
declare v_s uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at) values (v_s, pg_temp.id(p_user), now(), now());
  insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
  values (md5(random()::text), pg_temp.id(p_user)::text, v_s, false, now(), now());
end $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon, supabase_auth_admin', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon, supabase_auth_admin', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon, supabase_auth_admin', v_schema);
end $$;

do $$
declare r record; v_id uuid; v_biz uuid;
begin
  for r in select * from (values ('owa'),('owb'),('multi'),('solo'),('su'),('newbie')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p35.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set is_super_admin = true where id = pg_temp.id('su');

  perform pg_temp.act_as(pg_temp.id('owa')); set local role authenticated;
  v_biz := public.create_business_with_owner('P35 Alpha','p35-a','GB','GBP','Europe/London','en',null,'Main'); reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('owb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P35 Beta','p35-b','GB','GBP','Europe/London','en',null,'Main'); reset role; insert into ids values ('bizb', v_biz);
  perform set_config('request.jwt.claims', '', true);
  -- solo: member of A only. multi: member of A and B. su: member of A too (a super admin who is also a member).
  insert into public.business_members (business_id, user_id, status, joined_at) values
    (pg_temp.id('biza'), pg_temp.id('solo'), 'active', now()),
    (pg_temp.id('biza'), pg_temp.id('multi'), 'active', now()),
    (pg_temp.id('bizb'), pg_temp.id('multi'), 'active', now()),
    (pg_temp.id('biza'), pg_temp.id('su'), 'active', now());
  -- both businesses need a plan to be set active again later
  update public.business_subscriptions set status = 'active', plan = 'business' where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'));
end $$;

do $$
declare r jsonb; u text;
begin
  -- Baseline: nobody disabled.
  foreach u in array array['owa','owb','multi','solo','su','newbie'] loop
    perform pg_temp.chk('baseline: ' || u || ' not disabled', public.user_is_disabled(pg_temp.id(u))::text, 'false');
  end loop;
  perform pg_temp.chk('baseline hook passes owa', (pg_temp.hook(pg_temp.id('owa')) ? 'error')::text, 'false');
  perform pg_temp.chk('hook returns the event unchanged', pg_temp.hook(pg_temp.id('owa')) -> 'claims' ->> 'sub', pg_temp.id('owa')::text);

  foreach u in array array['owa','owb','multi','solo','su','newbie'] loop perform pg_temp.mk_sess(u); end loop;
  perform pg_temp.chk('fixture sessions exist', pg_temp.sess('owa'), '1/1');

  -- Trial / inactive are NOT suspended: lock screen only, login allowed.
  update public.business_subscriptions set status = 'inactive' where business_id = pg_temp.id('biza');
  perform pg_temp.chk('inactive business: owa still allowed', public.user_is_disabled(pg_temp.id('owa'))::text, 'false');
  update public.business_subscriptions set status = 'trialing', trial_ends_at = now() - interval '1 day' where business_id = pg_temp.id('biza');
  perform pg_temp.chk('trial ended: owa still allowed', public.user_is_disabled(pg_temp.id('owa'))::text, 'false');
  update public.business_subscriptions set status = 'active', plan = 'business' where business_id = pg_temp.id('biza');

  -- Only a super admin may suspend.
  perform pg_temp.chk('owner cannot suspend', pg_temp.as_('owa', format($q$select public.set_business_status(%L, 'suspended')$q$, pg_temp.id('biza')), true)->>'code', 'forbidden');
  perform pg_temp.chk('...nothing changed', pg_temp.sess('owa'), '1/1');
  perform pg_temp.chk('super admin without a fresh password session refused', pg_temp.as_('su', format($q$select public.set_business_status(%L, 'suspended')$q$, pg_temp.id('biza')), false)->>'code', 'reauth_required');
  perform pg_temp.chk('...still not suspended', (select status::text from public.business_subscriptions where business_id = pg_temp.id('biza')), 'active');
  perform pg_temp.chk('...sessions intact', pg_temp.sess('solo'), '1/1');

  -- SUSPEND A.
  r := pg_temp.as_('su', format($q$select public.set_business_status(%L, 'suspended', 'test')$q$, pg_temp.id('biza')), true);
  perform pg_temp.chk('suspend ok', r->>'ok', 'true');
  perform pg_temp.chk('...revoked users: owa + solo (not multi, not su)', r->>'sessions_revoked_users', '2');
  perform pg_temp.chk('owa disabled', public.user_is_disabled(pg_temp.id('owa'))::text, 'true');
  perform pg_temp.chk('solo disabled', public.user_is_disabled(pg_temp.id('solo'))::text, 'true');
  perform pg_temp.chk('multi (B still active) NOT disabled', public.user_is_disabled(pg_temp.id('multi'))::text, 'false');
  perform pg_temp.chk('super admin (member of A) NOT disabled', public.user_is_disabled(pg_temp.id('su'))::text, 'false');
  perform pg_temp.chk('owner of OTHER business not disabled', public.user_is_disabled(pg_temp.id('owb'))::text, 'false');
  perform pg_temp.chk('user with no business not disabled', public.user_is_disabled(pg_temp.id('newbie'))::text, 'false');
  perform pg_temp.chk('owa sessions + refresh tokens gone', pg_temp.sess('owa'), '0/0');
  perform pg_temp.chk('solo sessions gone', pg_temp.sess('solo'), '0/0');
  perform pg_temp.chk('multi session kept', pg_temp.sess('multi'), '1/1');
  perform pg_temp.chk('super admin session kept', pg_temp.sess('su'), '1/1');
  perform pg_temp.chk('other business owner session kept', pg_temp.sess('owb'), '1/1');
  perform pg_temp.chk('newbie session kept', pg_temp.sess('newbie'), '1/1');
  perform pg_temp.chk('business B untouched', (select status::text from public.business_subscriptions where business_id = pg_temp.id('bizb')), 'active');

  -- Hook: sign-in / refresh refused with the exact message.
  r := pg_temp.hook(pg_temp.id('owa'));
  perform pg_temp.chk('hook refuses owa (403)', r->'error'->>'http_code', '403');
  perform pg_temp.chk('hook message exact', r->'error'->>'message', 'This account is disabled. Contact support@wapee.online');
  perform pg_temp.chk('hook refuses solo', (pg_temp.hook(pg_temp.id('solo')) ? 'error')::text, 'true');
  perform pg_temp.chk('hook allows multi', (pg_temp.hook(pg_temp.id('multi')) ? 'error')::text, 'false');
  perform pg_temp.chk('hook allows super admin', (pg_temp.hook(pg_temp.id('su')) ? 'error')::text, 'false');
  perform pg_temp.chk('hook allows owner of B', (pg_temp.hook(pg_temp.id('owb')) ? 'error')::text, 'false');
  perform pg_temp.chk('hook allows user with no business', (pg_temp.hook(pg_temp.id('newbie')) ? 'error')::text, 'false');

  -- Hook FAIL-OPEN: any internal error returns the event, never an error.
  r := public.custom_access_token_hook(jsonb_build_object('user_id', 'not-a-uuid', 'claims', '{}'::jsonb));
  perform pg_temp.chk('fail-open: bad user_id returns the event', (r ? 'error')::text || '/' || (r->>'user_id'), 'false/not-a-uuid');
  r := public.custom_access_token_hook('{}'::jsonb);
  perform pg_temp.chk('fail-open: empty event passes', (r ? 'error')::text, 'false');
  -- a real failure inside user_is_disabled (function body breaks) still fails open
  alter function public.user_is_disabled(uuid) rename to user_is_disabled_orig;
  r := public.custom_access_token_hook(jsonb_build_object('user_id', pg_temp.id('owa'), 'claims', '{}'::jsonb));
  perform pg_temp.chk('fail-open: missing rule function does not block a disabled user (documented trade-off)', (r ? 'error')::text, 'false');
  alter function public.user_is_disabled_orig(uuid) rename to user_is_disabled;
  perform pg_temp.chk('rule function restored', public.user_is_disabled(pg_temp.id('owa'))::text, 'true');

  perform pg_temp.chk('supabase_auth_admin may execute the hook', has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute')::text, 'true');
  perform pg_temp.chk('anon may not', has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute')::text, 'false');
  -- Hook is not callable by app roles.
  perform pg_temp.chk('authenticated cannot call the hook', pg_temp.as_('owa', $q$select public.custom_access_token_hook('{}'::jsonb)$q$)->>'state', '42501');
  perform pg_temp.chk('authenticated cannot call user_is_disabled', pg_temp.as_('owa', format($q$select public.user_is_disabled(%L)$q$, pg_temp.id('owb')))->>'state', '42501');

  -- Client check.
  perform pg_temp.chk('my_access_state: owa disabled', pg_temp.as_('owa', 'select public.my_access_state()')->>'disabled', 'true');
  perform pg_temp.chk('my_access_state: multi fine', pg_temp.as_('multi', 'select public.my_access_state()')->>'disabled', 'false');
  perform pg_temp.chk('my_access_state: super admin fine', pg_temp.as_('su', 'select public.my_access_state()', true)->>'disabled', 'false');
  perform pg_temp.chk('my_access_state: anon refused', (select coalesce(nullif(pg_temp.try('set local role anon; select public.my_access_state()'), 'ok'), 'ok')), '42501');
  reset role;

  -- Audit rows.
  perform pg_temp.chk('audit: set_status row', (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza') and action = 'admin.set_status'), '1');
  perform pg_temp.chk('audit: sessions_revoked row with count', (select (after->>'users') from public.audit_logs where business_id = pg_temp.id('biza') and action = 'admin.sessions_revoked'), '2');

  -- Now SUSPEND B too: multi has no usable business left -> disabled, session purged. Owner of B too.
  r := pg_temp.as_('su', format($q$select public.set_business_status(%L, 'suspended')$q$, pg_temp.id('bizb')), true);
  perform pg_temp.chk('suspend B ok, revoked: owb + multi', r->>'sessions_revoked_users', '2');
  perform pg_temp.chk('multi now disabled (all suspended)', public.user_is_disabled(pg_temp.id('multi'))::text, 'true');
  perform pg_temp.chk('multi session purged', pg_temp.sess('multi'), '0/0');
  perform pg_temp.chk('super admin still fine with every business suspended', public.user_is_disabled(pg_temp.id('su'))::text || '/' || pg_temp.sess('su'), 'false/1/1');
  perform pg_temp.chk('hook refuses multi now', (pg_temp.hook(pg_temp.id('multi')) ? 'error')::text, 'true');

  -- Suspending an already-suspended business again is harmless (no sessions left to revoke).
  r := pg_temp.as_('su', format($q$select public.set_business_status(%L, 'suspended')$q$, pg_temp.id('bizb')), true);
  perform pg_temp.chk('suspend again ok, 0 users revoked (sessions already gone: users still counted)', r->>'ok', 'true');

  -- UN-SUSPEND A: owa, solo and multi can sign in again (multi has A active).
  r := pg_temp.as_('su', format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('biza')), true);
  perform pg_temp.chk('un-suspend A ok', r->>'ok', 'true');
  perform pg_temp.chk('un-suspend revokes nothing', coalesce(r->>'sessions_revoked_users', '0'), '0');
  perform pg_temp.chk('owa allowed again', (pg_temp.hook(pg_temp.id('owa')) ? 'error')::text, 'false');
  perform pg_temp.chk('multi allowed again (A active)', (pg_temp.hook(pg_temp.id('multi')) ? 'error')::text, 'false');
  perform pg_temp.chk('owb (only B, still suspended) still refused', (pg_temp.hook(pg_temp.id('owb')) ? 'error')::text, 'true');
  perform pg_temp.chk('my_access_state owa back to fine', pg_temp.as_('owa', 'select public.my_access_state()')->>'disabled', 'false');

  -- A deleted business does not count; a removed (soft-deleted) membership does not count.
  update public.business_members set deleted_at = now() where business_id = pg_temp.id('biza') and user_id = pg_temp.id('solo');
  perform pg_temp.chk('solo with no live membership: not disabled', public.user_is_disabled(pg_temp.id('solo'))::text, 'false');

  -- Business without a subscription row counts as usable.
  delete from public.business_subscriptions where business_id = pg_temp.id('bizb');
  perform pg_temp.chk('no subscription row = usable', public.user_is_disabled(pg_temp.id('owb'))::text, 'false');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
