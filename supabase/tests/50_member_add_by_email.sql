-- Add staff by email (migrations 20261026100000 + 20261026110000):
-- add_member_by_email, claim_pending_memberships, the member_added outbox email, and the
-- retired invite-token functions.
--
--   supabase db query --linked -f supabase/tests/50_member_add_by_email.sql
--
-- Plain SQL, own fixtures, ROLLS BACK. Every failure path asserts the STORED rows are exactly
-- as they were, not only the returned code (CLAUDE.md section 5). RPC calls and the reads that
-- check them are separate statements (a scalar subquery in the same expression as a volatile
-- call does not see its writes).
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create temporary table snap (k text primary key, v text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end; $$;
-- Run a jsonb-returning statement as a signed-in user.
create or replace function pg_temp.as_(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
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
-- A statement as the table owner, with no signed-in user (so guards treat it as the system).
create or replace function pg_temp.sys(p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute p_sql;
end $$;
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;
create or replace function pg_temp.rid(p_key text) returns uuid language sql as $$
  select id from public.roles where business_id is null and key = p_key
$$;
-- The full stored state of a business's memberships (+ their roles), for "unchanged" checks.
create or replace function pg_temp.members_state(p_biz text) returns text language sql as $$
  select coalesce(string_agg(
    m.id || '|' || m.status || '|' || coalesce(m.user_id::text, '-') || '|' || coalesce(m.invited_email::text, '-')
    || '|' || coalesce(m.invite_expires_at::text, '-') || '|' || coalesce(m.deleted_at::text, '-')
    || '|' || coalesce((select string_agg(a.role_id || '@' || coalesce(a.branch_id::text, '*'), ',' order by a.role_id)
                        from public.member_role_assignments a where a.member_id = m.id), ''),
    ';' order by m.id), '')
  from public.business_members m where m.business_id = pg_temp.id(p_biz)
$$;
create or replace function pg_temp.pending(p_biz text, p_email text) returns uuid language sql as $$
  select id from public.business_members
  where business_id = pg_temp.id(p_biz) and lower(invited_email::text) = lower(p_email)
    and status = 'invited' and deleted_at is null
$$;
create or replace function pg_temp.add(p_user text, p_biz text, p_email text, p_role text,
                                       p_branch text default null, p_staff text default null) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format(
    'select public.add_member_by_email(%L, %L, %L, %L, %L)',
    pg_temp.id(p_biz), p_email, pg_temp.rid(p_role),
    pg_temp.id(p_branch), pg_temp.id(p_staff)))
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

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- Users. 'unv' never confirmed its email; 'goog' signed up with Google.
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values
      ('owner', 'mae.owner@example.com', true, 'email'),
      ('mgr', 'mae.mgr@example.com', true, 'email'),
      ('recep', 'mae.recep@example.com', true, 'email'),
      ('staff', 'mae.staff@example.com', true, 'email'),
      ('ownerb', 'mae.ownerb@example.com', true, 'email'),
      ('ownerg', 'mae.ownerg@example.com', true, 'email'),
      ('exist', 'mae.exist@example.com', true, 'email'),
      ('stranger', 'mae.stranger@example.com', true, 'email')
    ) as x(k, email, confirmed, provider) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', r.email,
            extensions.crypt('pw', extensions.gen_salt('bf')), case when r.confirmed then now() end, now(), now(),
            jsonb_build_object('provider', r.provider, 'providers', jsonb_build_array(r.provider)), '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

do $$
declare v_biz uuid; v_m uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('MAE Alpha','mae-alpha-check','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('biza', v_biz);
  insert into ids select 'bra', id from public.branches where business_id = v_biz;

  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('MAE Beta','mae-beta-check','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
  insert into ids select 'brb', id from public.branches where business_id = v_biz;

  perform pg_temp.act_as(pg_temp.id('exist')); set local role authenticated;
  v_biz := public.create_business_with_owner('MAE Exist','mae-exist-check','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizx', v_biz);

  perform pg_temp.act_as(pg_temp.id('ownerg')); set local role authenticated;
  v_biz := public.create_business_with_owner('MAE Gone','mae-gone-check','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizgone', v_biz);
end $$;

-- Manager, Receptionist, Staff in Alpha (written as the system, not judged by the guard).
do $$
declare r record; v_m uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  for r in select * from (values ('mgr','manager'),('recep','receptionist'),('staff','staff')) as x(u, role) loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.u), 'active', now()) returning id into v_m;
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_m, pg_temp.rid(r.role), null);
  end loop;
end $$;

-- Staff profiles: one unlinked in Alpha, one in Beta, one in Alpha already linked to the Staff login.
do $$
declare v_sp uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Free Profile') returning id into v_sp;
  insert into ids values ('sp_free', v_sp);
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('bizb'), 'Beta Profile') returning id into v_sp;
  insert into ids values ('sp_beta', v_sp);
  insert into public.staff_profiles (business_id, display_name, member_id)
  values (pg_temp.id('biza'), 'Linked Profile',
          (select id from public.business_members where business_id = pg_temp.id('biza') and user_id = pg_temp.id('staff')))
  returning id into v_sp;
  insert into ids values ('sp_linked', v_sp);
end $$;

-- ---------------------------------------------------------------------------
-- 1. The happy path, as the Owner
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := pg_temp.add('owner', 'biza', '  New.Person@Example.com ', 'staff', null, 'sp_free');
  perform pg_temp.chk('owner add: ok', r->>'ok', 'true');
  insert into ids values ('m_new', (r->>'member_id')::uuid);
end $$;
select pg_temp.chk('add: email stored lowercased + trimmed',
  (select invited_email::text from public.business_members where id = pg_temp.id('m_new')), 'new.person@example.com');
select pg_temp.chk('add: status invited, no user, NO token hash',
  (select status || '|' || coalesce(user_id::text, '-') || '|' || coalesce(invite_token_hash, '-')
   from public.business_members where id = pg_temp.id('m_new')), 'invited|-|-');
select pg_temp.chk('add: expires in ~30 days',
  (select (invite_expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute')::text
   from public.business_members where id = pg_temp.id('m_new')), 'true');
select pg_temp.chk('add: invited_by = the adder',
  (select invited_by::text from public.business_members where id = pg_temp.id('m_new')), pg_temp.id('owner')::text);
select pg_temp.chk('add: exactly one role assignment, Staff at all branches',
  (select string_agg(role_id || '@' || coalesce(branch_id::text, '*'), ',') from public.member_role_assignments
   where member_id = pg_temp.id('m_new')), pg_temp.rid('staff') || '@*');
select pg_temp.chk('add: staff profile linked to the pending member',
  (select member_id::text from public.staff_profiles where id = pg_temp.id('sp_free')), pg_temp.id('m_new')::text);
select pg_temp.chk('add: one member_added email queued, no token, no address in payload',
  (select count(*)::text || '|' || bool_and(sealed is null)::text || '|' || bool_and(not (payload ? 'email'))::text
          || '|' || max(payload->>'role')
   from public.message_outbox where event = 'member_added' and payload->>'member_id' = pg_temp.id('m_new')::text),
  '1|true|true|Staff');
select pg_temp.chk('add: audit member.added_by_email',
  (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza')
     and action = 'member.added_by_email' and entity_id = pg_temp.id('m_new')::text), '1');
select pg_temp.chk('add: audit staff.linked via add_by_email',
  (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza')
     and action = 'staff.linked' and after->>'via' = 'add_by_email'), '1');

-- The outbox resolves the address at send time, and only while the add is pending.
select pg_temp.chk('outbox_recipient: the pending email',
  (select public.outbox_recipient(id)->>'address' from public.message_outbox
   where event = 'member_added' and payload->>'member_id' = pg_temp.id('m_new')::text), 'new.person@example.com');
select pg_temp.chk('outbox_guard: sendable while pending',
  coalesce((select public.outbox_guard(id) from public.message_outbox
   where event = 'member_added' and payload->>'member_id' = pg_temp.id('m_new')::text), 'ok'), 'ok');

-- ---------------------------------------------------------------------------
-- 2. Refusals: each returns a code and leaves the stored rows exactly as they were
-- ---------------------------------------------------------------------------
insert into snap values ('a0', pg_temp.members_state('biza'));
insert into snap values ('sp0', (select string_agg(id || ':' || coalesce(member_id::text, '-'), ',' order by id)
                                 from public.staff_profiles where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'))));
insert into snap values ('ob0', (select count(*)::text from public.message_outbox where event = 'member_added'));

do $$
declare r jsonb;
begin
  r := pg_temp.add('recep', 'biza', 'x1@example.com', 'staff');
  perform pg_temp.chk('receptionist (no users.invite): forbidden', r->>'code', 'forbidden');
  r := pg_temp.add('staff', 'biza', 'x2@example.com', 'staff');
  perform pg_temp.chk('staff: forbidden', r->>'code', 'forbidden');
  r := pg_temp.add('ownerb', 'biza', 'x3@example.com', 'staff');
  perform pg_temp.chk('owner of ANOTHER business: forbidden', r->>'code', 'forbidden');
  r := pg_temp.add('mgr', 'biza', 'x4@example.com', 'owner');
  perform pg_temp.chk('manager adding an OWNER: cannot_grant', r->>'code', 'cannot_grant');
  r := pg_temp.add('owner', 'biza', 'not-an-email', 'staff');
  perform pg_temp.chk('bad email: invalid_email', r->>'code', 'invalid_email');
  r := pg_temp.as_('owner', format('select public.add_member_by_email(%L, %L, %L)',
                                   pg_temp.id('biza'), 'x5@example.com', gen_random_uuid()));
  perform pg_temp.chk('unknown role: unknown_role', r->>'code', 'unknown_role');
  r := pg_temp.add('owner', 'biza', 'x6@example.com', 'staff', 'brb');
  perform pg_temp.chk('branch of another business: unknown_branch', r->>'code', 'unknown_branch');
  r := pg_temp.add('owner', 'biza', 'MAE.Mgr@example.com', 'staff');
  perform pg_temp.chk('already an active member (any case): already_member', r->>'code', 'already_member');
  r := pg_temp.add('owner', 'biza', 'x7@example.com', 'staff', null, 'sp_beta');
  perform pg_temp.chk('staff profile of another business: unknown_staff', r->>'code', 'unknown_staff');
  r := pg_temp.add('owner', 'biza', 'x8@example.com', 'staff', null, 'sp_linked');
  perform pg_temp.chk('staff profile that already has a login: staff_has_login', r->>'code', 'staff_has_login');
end $$;
select pg_temp.chk('refusals: Alpha memberships + roles unchanged', pg_temp.members_state('biza'), (select v from snap where k = 'a0'));
select pg_temp.chk('refusals: staff links unchanged',
  (select string_agg(id || ':' || coalesce(member_id::text, '-'), ',' order by id)
   from public.staff_profiles where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'))), (select v from snap where k = 'sp0'));
select pg_temp.chk('refusals: no email queued', (select count(*)::text from public.message_outbox where event = 'member_added'),
  (select v from snap where k = 'ob0'));
-- A refused attempt still counts against the limit (the counter row was not rolled back).
select pg_temp.chk('refusals after the permission check still counted (manager attempt recorded)',
  (select (count(*) >= 1)::text from public.public_request_attempts where endpoint = 'member_add'
     and key_hash = pg_temp.id('mgr')::text), 'true');

select pg_temp.chk('anon cannot add',
  (pg_temp.as_anon(format('select public.add_member_by_email(%L, %L, %L)', pg_temp.id('biza'), 'a@example.com', pg_temp.rid('staff'))))->>'state', '42501');
select pg_temp.chk('anon cannot claim',
  (pg_temp.as_anon('select public.claim_pending_memberships()'))->>'state', '42501');

-- ---------------------------------------------------------------------------
-- 3. Re-adding a pending email replaces its role and renews it; a manager cannot touch a
--    pending Owner add.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.sys(format('update public.business_members set invite_expires_at = now() + interval ''1 day'' where id = %L', pg_temp.id('m_new')));
  r := pg_temp.add('owner', 'biza', 'new.person@example.com', 'manager', null, 'sp_free');
  perform pg_temp.chk('re-add: ok, same row', r->>'member_id', pg_temp.id('m_new')::text);
end $$;
select pg_temp.chk('re-add: role replaced (one assignment, Manager)',
  (select string_agg(role_id::text, ',') from public.member_role_assignments where member_id = pg_temp.id('m_new')),
  pg_temp.rid('manager')::text);
select pg_temp.chk('re-add: expiry renewed to ~30 days',
  (select (invite_expires_at > now() + interval '29 days')::text from public.business_members where id = pg_temp.id('m_new')), 'true');
select pg_temp.chk('re-add: a second email queued',
  (select count(*)::text from public.message_outbox where event = 'member_added' and payload->>'member_id' = pg_temp.id('m_new')::text), '2');

do $$
declare r jsonb;
begin
  r := pg_temp.add('owner', 'biza', 'boss@example.com', 'owner');
  perform pg_temp.chk('owner adds a pending Owner: ok', r->>'ok', 'true');
  insert into ids values ('m_boss', (r->>'member_id')::uuid);
end $$;
insert into snap values ('a1', pg_temp.members_state('biza'));
do $$
declare r jsonb;
begin
  r := pg_temp.add('mgr', 'biza', 'boss@example.com', 'staff');
  perform pg_temp.chk('manager re-adding a pending OWNER: cannot_modify_higher_role', r->>'code', 'cannot_modify_higher_role');
end $$;
select pg_temp.chk('...and the pending Owner add is unchanged', pg_temp.members_state('biza'), (select v from snap where k = 'a1'));

-- Manager adding a role they hold (Staff) works.
do $$
declare r jsonb;
begin
  r := pg_temp.add('mgr', 'biza', 'mgr.add@example.com', 'staff');
  perform pg_temp.chk('manager adds Staff: ok', r->>'ok', 'true');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rate limit: a full window answers rate_limited, writes nothing, and the block is recorded.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.public_request_attempts (endpoint, key_hash, outcome)
  select 'member_add', pg_temp.id('bizb')::text, 'allowed' from generate_series(1, 30);
end $$;
insert into snap values ('b0', pg_temp.members_state('bizb'));
insert into snap values ('rl0', (select count(*)::text from public.public_request_attempts
                                 where endpoint = 'member_add' and key_hash = pg_temp.id('bizb')::text));
do $$
declare r jsonb;
begin
  r := pg_temp.add('ownerb', 'bizb', 'limited@example.com', 'staff');
  perform pg_temp.chk('rate limit: rate_limited', r->>'code', 'rate_limited');
  perform pg_temp.chk('rate limit: retry_after given', ((r->>'retry_after_seconds')::int > 0)::text, 'true');
end $$;
select pg_temp.chk('rate limit: Beta memberships unchanged', pg_temp.members_state('bizb'), (select v from snap where k = 'b0'));
select pg_temp.chk('rate limit: the blocked attempt was recorded (not rolled back)',
  (select count(*)::text from public.public_request_attempts where endpoint = 'member_add' and key_hash = pg_temp.id('bizb')::text),
  ((select v from snap where k = 'rl0')::int + 1)::text);
do $$ begin
  perform set_config('request.jwt.claims', '', true);
  delete from public.public_request_attempts where endpoint = 'member_add' and key_hash = pg_temp.id('bizb')::text;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Claim
-- ---------------------------------------------------------------------------
-- More pending adds: Beta adds the same new person (two businesses), Gone business adds them too,
-- an expired add, a cancelled add, a mixed-case add for 'goog', and an add for 'unv'.
do $$
declare r jsonb;
begin
  r := pg_temp.add('ownerb', 'bizb', 'new.person@example.com', 'receptionist');
  perform pg_temp.chk('beta adds the same email: ok', r->>'ok', 'true');
  insert into ids values ('m_new_b', (r->>'member_id')::uuid);
  r := pg_temp.add('ownerg', 'bizgone', 'new.person@example.com', 'staff');
  insert into ids values ('m_gone', (r->>'member_id')::uuid);
  r := pg_temp.add('owner', 'biza', 'expired@example.com', 'staff');
  insert into ids values ('m_exp', (r->>'member_id')::uuid);
  r := pg_temp.add('owner', 'biza', 'cancelled@example.com', 'staff');
  insert into ids values ('m_can', (r->>'member_id')::uuid);
  r := pg_temp.add('owner', 'biza', 'Goog.User@Example.com', 'staff');
  insert into ids values ('m_goog', (r->>'member_id')::uuid);
  r := pg_temp.add('owner', 'biza', 'unverified@example.com', 'staff');
  insert into ids values ('m_unv', (r->>'member_id')::uuid);
  r := pg_temp.add('owner', 'biza', 'mae.exist@example.com', 'staff');
  insert into ids values ('m_exist', (r->>'member_id')::uuid);
  r := pg_temp.as_('owner', format('select public.revoke_invite(%L)', pg_temp.id('m_can')));
  perform pg_temp.chk('cancel a pending add: ok', r->>'ok', 'true');
end $$;
select pg_temp.sys(format('update public.business_members set invite_expires_at = now() - interval ''1 minute'' where id = %L', pg_temp.id('m_exp')));
select pg_temp.sys(format('update public.businesses set deleted_at = now() where id = %L', pg_temp.id('bizgone')));

-- The people signing in later.
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values
      ('newp', 'new.person@example.com', true, 'email'),
      ('expd', 'expired@example.com', true, 'email'),
      ('canc', 'cancelled@example.com', true, 'email'),
      ('goog', 'goog.user@example.com', true, 'google'),
      ('unv', 'unverified@example.com', false, 'email')
    ) as x(k, email, confirmed, provider) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', r.email,
            extensions.crypt('pw', extensions.gen_salt('bf')), case when r.confirmed then now() end, now(), now(),
            jsonb_build_object('provider', r.provider, 'providers', jsonb_build_array(r.provider)), '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;

insert into snap values ('a2', pg_temp.members_state('biza'));
insert into snap values ('b2', pg_temp.members_state('bizb'));

-- 5a. Unverified email: joins nothing, everything unchanged.
select pg_temp.chk('claim, UNVERIFIED email: joins nothing',
  (pg_temp.as_('unv', 'select public.claim_pending_memberships()'))::text, '{"ok": true, "joined": []}');
select pg_temp.chk('claim, unverified: Alpha unchanged', pg_temp.members_state('biza'), (select v from snap where k = 'a2'));

-- 5b. A verified stranger: joins nothing (only their own email counts).
select pg_temp.chk('claim, verified stranger: joins nothing',
  (pg_temp.as_('stranger', 'select public.claim_pending_memberships()'))::text, '{"ok": true, "joined": []}');
select pg_temp.chk('claim, stranger: Alpha unchanged', pg_temp.members_state('biza'), (select v from snap where k = 'a2'));
select pg_temp.chk('claim, stranger: Beta unchanged', pg_temp.members_state('bizb'), (select v from snap where k = 'b2'));

-- 5c. Expired and cancelled adds: nothing joins.
select pg_temp.chk('claim, expired add: joins nothing',
  (pg_temp.as_('expd', 'select public.claim_pending_memberships()'))::text, '{"ok": true, "joined": []}');
select pg_temp.chk('claim, cancelled add: joins nothing',
  (pg_temp.as_('canc', 'select public.claim_pending_memberships()'))::text, '{"ok": true, "joined": []}');
select pg_temp.chk('claim, expired/cancelled: Alpha unchanged', pg_temp.members_state('biza'), (select v from snap where k = 'a2'));

-- 5d. The verified new person: joins Alpha AND Beta, not the deleted business.
do $$
declare r jsonb;
begin
  r := pg_temp.as_('newp', 'select public.claim_pending_memberships()');
  perform pg_temp.chk('claim, verified: ok', r->>'ok', 'true');
  perform pg_temp.chk('claim, verified: joined two businesses', jsonb_array_length(r->'joined')::text, '2');
  perform pg_temp.chk('claim: joined Alpha', (r->'joined' ? pg_temp.id('biza')::text)::text, 'true');
  perform pg_temp.chk('claim: joined Beta', (r->'joined' ? pg_temp.id('bizb')::text)::text, 'true');
  perform pg_temp.chk('claim: NOT the deleted business', (r->'joined' ? pg_temp.id('bizgone')::text)::text, 'false');
end $$;
select pg_temp.chk('claim: Alpha row active, user set, joined_at set, expiry cleared',
  (select status || '|' || (user_id = pg_temp.id('newp'))::text || '|' || (joined_at is not null)::text || '|' || coalesce(invite_expires_at::text, '-')
   from public.business_members where id = pg_temp.id('m_new')), 'active|true|true|-');
select pg_temp.chk('claim: the role the adder chose survives',
  (select string_agg(role_id::text, ',') from public.member_role_assignments where member_id = pg_temp.id('m_new')),
  pg_temp.rid('manager')::text);
select pg_temp.chk('claim: the staff profile link survives',
  (select member_id::text from public.staff_profiles where id = pg_temp.id('sp_free')), pg_temp.id('m_new')::text);
select pg_temp.chk('claim: the deleted business''s add stays pending',
  (select status::text from public.business_members where id = pg_temp.id('m_gone')), 'invited');
select pg_temp.chk('claim: default_business_id set (was empty)',
  (select (default_business_id in (pg_temp.id('biza'), pg_temp.id('bizb')))::text from public.profiles where id = pg_temp.id('newp')), 'true');
select pg_temp.chk('claim: audit member.joined_by_email per business, provider email',
  (select count(*)::text || '|' || min(after->>'provider') from public.audit_logs
   where action = 'member.joined_by_email' and after->>'user_id' = pg_temp.id('newp')::text), '2|email');
select pg_temp.chk('claim: the queued email is now stale (not sent after joining)',
  (select string_agg(distinct public.outbox_guard(id), ',') from public.message_outbox
   where event = 'member_added' and payload->>'member_id' = pg_temp.id('m_new')::text), 'stale');
select pg_temp.chk('claim: no recipient any more',
  (select string_agg(distinct coalesce(public.outbox_recipient(id)->>'address', '-'), ',') from public.message_outbox
   where event = 'member_added' and payload->>'member_id' = pg_temp.id('m_new')::text), '-');

-- 5e. Idempotent.
select pg_temp.chk('claim again: joins nothing',
  (pg_temp.as_('newp', 'select public.claim_pending_memberships()'))::text, '{"ok": true, "joined": []}');

-- 5f. Google sign-up, mixed-case add: joins, provider recorded.
select pg_temp.chk('claim, Google user (mixed-case add): joins Alpha',
  (pg_temp.as_('goog', 'select public.claim_pending_memberships()'))->'joined'->>0, pg_temp.id('biza')::text);
select pg_temp.chk('claim, Google: audit provider google',
  (select after->>'provider' from public.audit_logs where action = 'member.joined_by_email'
     and after->>'user_id' = pg_temp.id('goog')::text), 'google');

-- 5g. An existing account in another business: joins, but its default business is NOT changed.
select pg_temp.chk('claim, existing account: joins Alpha',
  (pg_temp.as_('exist', 'select public.claim_pending_memberships()'))->'joined'->>0, pg_temp.id('biza')::text);
select pg_temp.chk('claim, existing account: default_business_id unchanged',
  (select default_business_id::text from public.profiles where id = pg_temp.id('exist')), pg_temp.id('bizx')::text);

-- 5h. Unverified becomes verified later: now it joins.
select pg_temp.sys(format('update auth.users set email_confirmed_at = now() where id = %L', pg_temp.id('unv')));
select pg_temp.chk('claim, after confirming the email: joins',
  (pg_temp.as_('unv', 'select public.claim_pending_memberships()'))->'joined'->>0, pg_temp.id('biza')::text);

-- ---------------------------------------------------------------------------
-- 6. The retired invite-token functions (20261026110000)
-- ---------------------------------------------------------------------------
select pg_temp.chk('retired: no live invite token hashes anywhere',
  (select count(*)::text from public.business_members where invite_token_hash is not null), '0');
select pg_temp.chk('retired: authenticated cannot call invite_member',
  (pg_temp.as_('owner', format('select to_jsonb(r) from public.invite_member(%L, %L, %L) r', pg_temp.id('biza'), 'z@example.com', pg_temp.rid('staff'))))->>'state', '42501');
select pg_temp.chk('retired: authenticated cannot call accept_invite',
  (pg_temp.as_('stranger', 'select to_jsonb(public.accept_invite(''abcdefghijklmnopqrstuvwxyz''))'))->>'state', '42501');
select pg_temp.chk('retired: anon cannot call invite_preview',
  (pg_temp.as_anon('select to_jsonb(r) from public.invite_preview(''abcdefghijklmnopqrstuvwxyz'') r'))->>'state', '42501');

-- ---------------------------------------------------------------------------
-- 7. Deleting a business with pending adds + queued emails still works (cascade).
-- ---------------------------------------------------------------------------
select pg_temp.chk('delete from businesses with pending adds: ok',
  (select pg_temp.q(format($q$
     with d as (delete from public.businesses where id = %L returning 1) select count(*)::text from d$q$, pg_temp.id('bizgone')))), '1');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(n || ' ' || name || ': ' || detail, E'\n' order by n) filter (where not pass), '') as failures
from res;

rollback;
