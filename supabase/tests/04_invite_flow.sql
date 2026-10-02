-- Invite flow: invite_member(), accept_invite(), invite_preview().
--
-- Run with `supabase test db` (needs Docker).
--
-- **This file has never been executed.** Docker is not installed on this machine
-- and creating `auth.users` fixtures on the live dev database was not permitted,
-- so the invite flow was verified end to end through the real REST API instead
-- (21 checks: invite, accept, reuse, expiry, wrong account, anonymous,
-- escalation guard, cross-business, rate limit). See context/members.md.
-- Treat the assertions below as unverified until Docker runs them.
--
-- Contract note: `accept_invite()` RETURNS NULL for every failure rather than
-- raising, so that the rate-limit counter is not rolled back. Only "not signed
-- in" and the throttle raise.

begin;
select plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures: two businesses, an owner each, plus a manager and a receptionist.
-- ---------------------------------------------------------------------------
create temporary table t (k text primary key, v uuid) on commit drop;

-- Business A with its founding owner.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'inv.owner.a@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
returning id;
insert into t values ('owner_a', (select id from auth.users where email = 'inv.owner.a@example.com'));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'inv.owner.b@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into t values ('owner_b', (select id from auth.users where email = 'inv.owner.b@example.com'));

-- The person being invited: an existing account, not yet a member anywhere.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'inv.joiner@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into t values ('joiner', (select id from auth.users where email = 'inv.joiner@example.com'));

-- Somebody else, to test the wrong-account case.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'inv.stranger@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into t values ('stranger', (select id from auth.users where email = 'inv.stranger@example.com'));

-- Create both businesses as their owners, through the real signup RPC.
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='owner_a'), 'role','authenticated')::text, true);
set local role authenticated;
insert into t values ('biz_a', public.create_business_with_owner(
  'Invite Test A', 'invite-test-a', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main'));
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='owner_b'), 'role','authenticated')::text, true);
set local role authenticated;
insert into t values ('biz_b', public.create_business_with_owner(
  'Invite Test B', 'invite-test-b', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main'));
reset role;

insert into t values ('branch_a', (select id from public.branches where business_id = (select v from t where k='biz_a') limit 1));
insert into t values ('role_staff', (select id from public.roles where business_id is null and key='staff'));
insert into t values ('role_owner', (select id from public.roles where business_id is null and key='owner'));
insert into t values ('role_manager', (select id from public.roles where business_id is null and key='manager'));

-- A receptionist in business A, who holds neither users.invite nor roles.manage.
insert into public.business_members (business_id, user_id, status, joined_at)
values ((select v from t where k='biz_a'), (select v from t where k='stranger'), 'active', now());
insert into t values ('member_recep', (select id from public.business_members
  where business_id = (select v from t where k='biz_a') and user_id = (select v from t where k='stranger')));
insert into public.member_role_assignments (member_id, role_id, branch_id)
values ((select v from t where k='member_recep'),
        (select id from public.roles where business_id is null and key='receptionist'),
        (select v from t where k='branch_a'));

-- ---------------------------------------------------------------------------
-- 1. Happy path: owner invites, invitee accepts once.
-- ---------------------------------------------------------------------------
create temporary table tok (k text primary key, token text) on commit drop;

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='owner_a'), 'role','authenticated')::text, true);
set local role authenticated;

insert into tok
select 'good', out_token from public.invite_member(
  (select v from t where k='biz_a'), 'inv.joiner@example.com',
  (select v from t where k='role_staff'), (select v from t where k='branch_a'));

select isnt((select token from tok where k='good'), null, 'invite_member returns a raw token');

select is(
  (select count(*)::int from public.business_members
   where business_id = (select v from t where k='biz_a')
     and invited_email = 'inv.joiner@example.com' and status = 'invited'),
  1, 'the invite row is created as invited');

select is(
  (select count(*)::int from public.business_members
   where invited_email = 'inv.joiner@example.com' and invite_token_hash = (select token from tok where k='good')),
  0, 'the RAW token is never stored');

select ok(
  (select invite_expires_at > now() + interval '6 days'
     and invite_expires_at < now() + interval '8 days'
   from public.business_members where invited_email = 'inv.joiner@example.com'),
  'the invite expires in about 7 days');

-- The role is assigned at invite time, so the escalation guard can check it.
select is(
  (select count(*)::int from public.member_role_assignments a
   join public.business_members m on m.id = a.member_id
   where m.invited_email = 'inv.joiner@example.com'),
  1, 'the role is assigned at invite time');

reset role;

-- The preview names the business without any sign-in.
set local role anon;
select is(
  (select business_name from public.invite_preview((select token from tok where k='good'))),
  'Invite Test A', 'invite_preview names the business for anon');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Wrong email: a signed-in stranger cannot use someone else's token.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='stranger'), 'role','authenticated')::text, true);
set local role authenticated;
select is(
  public.accept_invite((select token from tok where k='good')), null,
  'a different signed-in account cannot accept the invite');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Not signed in: the link alone must never attach a membership.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  format('select public.accept_invite(%L)', (select token from tok where k='good')),
  '42501', null,
  'an anonymous caller cannot accept an invite');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The real invitee accepts, and the token is then single-use.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='joiner'), 'role','authenticated')::text, true);
set local role authenticated;

select is(
  public.accept_invite((select token from tok where k='good')),
  (select v from t where k='biz_a'),
  'the invited account accepts and gets the business id');

select is(
  (select status::text from public.business_members
   where business_id = (select v from t where k='biz_a') and user_id = (select v from t where k='joiner')),
  'active', 'the member is now active');

select is(
  (select invite_token_hash from public.business_members
   where business_id = (select v from t where k='biz_a') and user_id = (select v from t where k='joiner')),
  null, 'the token hash is cleared on accept');

-- Reused invite.
select is(
  public.accept_invite((select token from tok where k='good')), null,
  'a used invite cannot be accepted again');

-- The accepted member really holds the Staff permissions, and nothing more.
select ok(public.has_permission((select v from t where k='biz_a'), (select v from t where k='branch_a'), 'appointments.view'),
  'the new member holds a Staff permission');
select ok(not public.has_permission((select v from t where k='biz_a'), (select v from t where k='branch_a'), 'invoices.view'),
  'the new member does not hold permissions Staff lacks');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Expired invite.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='owner_a'), 'role','authenticated')::text, true);
set local role authenticated;
insert into tok
select 'expired', out_token from public.invite_member(
  (select v from t where k='biz_a'), 'inv.expired@example.com',
  (select v from t where k='role_staff'), (select v from t where k='branch_a'));
reset role;

-- Backdate it past its expiry.
update public.business_members
set invite_expires_at = now() - interval '1 minute'
where invited_email = 'inv.expired@example.com';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'inv.expired@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='inv.expired@example.com'), 'role','authenticated')::text, true);
set local role authenticated;
select is(
  public.accept_invite((select token from tok where k='expired')), null,
  'an expired invite is refused');
reset role;

-- An expired token also reveals nothing through the preview.
set local role anon;
select is(
  (select count(*)::int from public.invite_preview((select token from tok where k='expired'))),
  0, 'invite_preview returns nothing for an expired token');
reset role;

-- ---------------------------------------------------------------------------
-- 6. The escalation guard still applies: a Manager cannot invite an Owner.
-- ---------------------------------------------------------------------------
-- Make the stranger a Manager, who holds users.invite but not settings.billing
-- or roles.manage, so inviting an Owner must fail.
delete from public.member_role_assignments where member_id = (select v from t where k='member_recep');
insert into public.member_role_assignments (member_id, role_id, branch_id)
values ((select v from t where k='member_recep'), (select v from t where k='role_manager'),
        (select v from t where k='branch_a'));

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='stranger'), 'role','authenticated')::text, true);
set local role authenticated;
select throws_ok(
  format('select * from public.invite_member(%L, %L, %L, %L)',
    (select v from t where k='biz_a'), 'inv.escalate@example.com',
    (select v from t where k='role_owner'), (select v from t where k='branch_a')),
  '42501', null,
  'a manager cannot invite someone as Owner (escalation guard holds)');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Other-business access: owner B cannot invite into business A.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='owner_b'), 'role','authenticated')::text, true);
set local role authenticated;
select throws_ok(
  format('select * from public.invite_member(%L, %L, %L, null)',
    (select v from t where k='biz_a'), 'inv.cross@example.com',
    (select v from t where k='role_staff')),
  '42501', 'You do not have permission to invite people',
  'an owner of another business cannot invite into this one');
reset role;

-- A receptionist (no users.invite) is refused too.
delete from public.member_role_assignments where member_id = (select v from t where k='member_recep');
insert into public.member_role_assignments (member_id, role_id, branch_id)
values ((select v from t where k='member_recep'),
        (select id from public.roles where business_id is null and key='receptionist'),
        (select v from t where k='branch_a'));

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='stranger'), 'role','authenticated')::text, true);
set local role authenticated;
select throws_ok(
  format('select * from public.invite_member(%L, %L, %L, null)',
    (select v from t where k='biz_a'), 'inv.recep@example.com',
    (select v from t where k='role_staff')),
  '42501', 'You do not have permission to invite people',
  'a receptionist cannot invite (no users.invite)');
reset role;

-- ---------------------------------------------------------------------------
-- 8. Rate limit: the 11th attempt on one token hash is throttled.
-- ---------------------------------------------------------------------------
-- The counter must survive a failed attempt, which is why failures return null
-- rather than raising (migration 20261002163000).
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='joiner'), 'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  for i in 1..10 loop
    perform public.accept_invite('ratelimitprobe0000000000000000000000');
  end loop;
end $$;
select throws_ok(
  $$select public.accept_invite('ratelimitprobe0000000000000000000000')$$,
  '54000', 'Too many attempts. Try again later.',
  'the 11th attempt on one token is throttled');
reset role;

select * from finish();
rollback;
