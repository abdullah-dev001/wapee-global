-- RLS tests: tenant isolation and role scopes (CLAUDE.md §11).
--
-- Run with:  supabase test db        (needs the CLI linked to the project)
-- or paste into the SQL editor; everything runs inside a rolled-back transaction.
--
-- Covers the four cases from the task: owner, a user from another business,
-- staff (limited role), and an anonymous visitor.

begin;
select plan(24);

create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Fixtures: two businesses that must never see each other.
-- auth.uid() reads request.jwt.claims, so a test "signs in" by setting it.
-- ---------------------------------------------------------------------------

-- Business A: owner_a + staff_a.  Business B: owner_b.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@test.wapee', '{"full_name":"Owner A"}'),
  ('22222222-2222-2222-2222-222222222222', 'staff-a@test.wapee', '{"full_name":"Staff A"}'),
  ('33333333-3333-3333-3333-333333333333', 'owner-b@test.wapee', '{"full_name":"Owner B"}');

-- The handle_new_user trigger created the profiles rows.
select is(
  (select count(*)::int from public.profiles where email like '%@test.wapee'),
  3,
  'handle_new_user creates a profile for every new auth user'
);

-- Locale lives on the BRANCH (decision 23); the business keeps default_* only
-- to pre-fill a new branch.
insert into public.businesses (id, name, slug, default_country_code, default_currency,
                               default_timezone, trial_ends_at, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Salon A', 'salon-a', 'GB', 'GBP', 'Europe/London',
   now() + interval '14 days', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Clinic B', 'clinic-b', 'PK', 'PKR', 'Asia/Karachi',
   now() + interval '14 days', '33333333-3333-3333-3333-333333333333');

insert into public.branches (id, business_id, name, is_primary,
                             country_code, currency, timezone, invoice_prefix)
values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Main', true,
   'GB', 'GBP', 'Europe/London', 'SAL'),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Main', true,
   'PK', 'PKR', 'Asia/Karachi', 'CLI');

insert into public.business_members (id, business_id, user_id, status, joined_at)
values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'active', now()),
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'active', now()),
  ('bbbbbbbb-2222-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'active', now());

insert into public.member_role_assignments (member_id, role_id, branch_id)
select 'aaaaaaaa-2222-0000-0000-000000000001', id, null
from public.roles where key = 'owner' and business_id is null;

insert into public.member_role_assignments (member_id, role_id, branch_id)
select 'aaaaaaaa-2222-0000-0000-000000000002', id, 'aaaaaaaa-1111-0000-0000-000000000001'
from public.roles where key = 'staff' and business_id is null;

insert into public.member_role_assignments (member_id, role_id, branch_id)
select 'bbbbbbbb-2222-0000-0000-000000000003', id, null
from public.roles where key = 'owner' and business_id is null;

-- ---------------------------------------------------------------------------
-- Helper functions behave correctly before RLS is even involved
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select ok(
  public.is_member('aaaaaaaa-0000-0000-0000-000000000001'),
  'owner A is a member of business A'
);
select ok(
  not public.is_member('bbbbbbbb-0000-0000-0000-000000000002'),
  'owner A is NOT a member of business B'
);
select ok(
  public.business_is_active('aaaaaaaa-0000-0000-0000-000000000001'),
  'a trialing business inside its trial window is active'
);
select ok(
  public.has_permission('aaaaaaaa-0000-0000-0000-000000000001', null, 'settings.billing'),
  'owner holds settings.billing'
);
select ok(
  not public.has_permission('bbbbbbbb-0000-0000-0000-000000000002', null, 'settings.billing'),
  'owner A holds nothing in business B'
);
select ok(not public.is_super_admin(), 'a normal user is not a super admin');

-- ---------------------------------------------------------------------------
-- Owner A
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.businesses),
  1,
  'owner A sees exactly one business'
);
select is(
  (select slug::text from public.businesses),
  'salon-a',
  'owner A sees only their own business'
);
select is(
  (select count(*)::int from public.branches),
  1,
  'owner A sees only their own branch'
);
select is(
  (select count(*)::int from public.business_members),
  2,
  'owner A sees both members of business A'
);
select is(
  (select count(*)::int from public.profiles),
  1,
  'owner A sees only their own profile'
);

-- Writing to another business must be impossible.
select throws_ok(
  $$ update public.businesses set name = 'Hacked' where slug = 'clinic-b' $$,
  null,
  null,
  'owner A cannot rename business B'
);
select is(
  (select count(*)::int from public.businesses where name = 'Hacked'),
  0,
  'business B was not renamed'
);

-- A tenant cannot extend its own trial or change its own plan.
select throws_ok(
  $$ update public.businesses
     set trial_ends_at = now() + interval '100 years'
     where slug = 'salon-a' $$,
  '42501',
  null,
  'owner cannot extend their own trial'
);
select throws_ok(
  $$ update public.businesses set status = 'active', plan = 'business'
     where slug = 'salon-a' $$,
  '42501',
  null,
  'owner cannot activate their own plan'
);

-- Privilege escalation through the profile flag.
select throws_ok(
  $$ update public.profiles set is_super_admin = true
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'a user cannot make themselves super admin'
);

-- ---------------------------------------------------------------------------
-- Staff A: same business, limited role
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select ok(
  public.is_member('aaaaaaaa-0000-0000-0000-000000000001'),
  'staff A is a member of business A'
);
select ok(
  public.has_permission('aaaaaaaa-0000-0000-0000-000000000001',
                        'aaaaaaaa-1111-0000-0000-000000000001', 'appointments.view'),
  'staff can view appointments in their own branch'
);
select ok(
  not public.has_permission('aaaaaaaa-0000-0000-0000-000000000001', null, 'invoices.create'),
  'staff cannot create invoices'
);
select ok(
  not public.has_permission('aaaaaaaa-0000-0000-0000-000000000001', null, 'settings.billing'),
  'staff cannot reach billing'
);
select ok(
  not public.has_permission('aaaaaaaa-0000-0000-0000-000000000001', null, 'roles.manage'),
  'staff cannot manage roles'
);

-- ---------------------------------------------------------------------------
-- Owner B: the other tenant
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.businesses),
  1,
  'owner B sees exactly one business'
);
select is(
  (select slug::text from public.businesses),
  'clinic-b',
  'owner B sees only business B'
);
select is(
  (select count(*)::int from public.business_members),
  1,
  'owner B sees only their own roster'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.businesses),
  0,
  'an anonymous visitor sees no businesses'
);

select * from finish();
rollback;
