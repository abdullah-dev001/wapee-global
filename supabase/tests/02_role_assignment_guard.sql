-- Escalation guard tests.
--
-- `enforce_role_assignment_guard` normally refuses to let anyone grant a
-- permission they do not themselves hold. Signup needs one narrow exemption:
-- the FIRST role assignment in a brand-new business (the founding Owner),
-- because at that moment the signing-up user holds nothing.
--
-- These tests pin that exemption down so it cannot widen by accident.
--
-- Run with:  supabase test db       (needs the CLI linked)
-- or paste into the SQL editor; everything rolls back.

begin;
select plan(8);

create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Fixtures
--   founder      - signs up and creates their own business (case a)
--   outsider     - has an account but belongs to no business (case b)
--   roleless     - a member of business A with NO role at all (case c)
--   receptionist - a member of business A with the Receptionist role (case d)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'founder@test.local'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'outsider@test.local'),
  ('cccc0000-0000-0000-0000-00000000000c', 'roleless@test.local'),
  ('dddd0000-0000-0000-0000-00000000000d', 'receptionist@test.local');

-- ---------------------------------------------------------------------------
-- (a) A new signup gets the founding Owner assignment in its own new business
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ select public.create_business_with_owner(
       'Founder Salon', 'founder-salon', 'GB', 'GBP', 'Europe/London', 'en', null, null) $$,
  '(a) signup creates a business and its founding Owner'
);

select is(
  (select count(*)::int
   from public.member_role_assignments a
   join public.business_members m on m.id = a.member_id
   join public.businesses b on b.id = m.business_id
   join public.roles r on r.id = a.role_id
   where b.slug = 'founder-salon' and r.key = 'owner'),
  1,
  '(a) exactly one Owner assignment exists'
);

-- The exemption is spent: the founder cannot now add a SECOND owner-level
-- assignment through the exemption, because the business is no longer empty.
-- (They can still do it legitimately, because they hold every permission.)
select is(
  (select count(*)::int
   from public.member_role_assignments a
   join public.business_members m on m.id = a.member_id
   join public.businesses b on b.id = m.business_id
   where b.slug = 'founder-salon'),
  1,
  '(a) the business has exactly one role assignment after signup'
);

-- ---------------------------------------------------------------------------
-- (b) An outsider cannot assign themselves any role in someone else's business
-- ---------------------------------------------------------------------------

reset role;
-- An outsider can only attack a row that exists, so give them a membership
-- they did not earn. RLS would normally block creating it; we insert it as the
-- table owner to test the guard itself, which is the last line of defence.
insert into public.business_members (id, business_id, user_id, status, joined_at)
select 'eeee0000-0000-0000-0000-00000000000e', b.id,
       'bbbb0000-0000-0000-0000-00000000000b', 'active', now()
from public.businesses b where b.slug = 'founder-salon';

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-00000000000b","role":"authenticated"}';

select throws_ok(
  $$ insert into public.member_role_assignments (member_id, role_id, branch_id)
     select 'eeee0000-0000-0000-0000-00000000000e', id, null
     from public.roles where key = 'owner' and business_id is null $$,
  '42501',
  null,
  '(b) an outsider cannot grant themselves Owner in an existing business'
);

select throws_ok(
  $$ insert into public.member_role_assignments (member_id, role_id, branch_id)
     select 'eeee0000-0000-0000-0000-00000000000e', id, null
     from public.roles where key = 'manager' and business_id is null $$,
  '42501',
  null,
  '(b) an outsider cannot grant themselves Manager either'
);

-- ---------------------------------------------------------------------------
-- (c) A member with no role cannot grant themselves Owner
-- ---------------------------------------------------------------------------

reset role;
insert into public.business_members (id, business_id, user_id, status, joined_at)
select 'ffff0000-0000-0000-0000-00000000000f', b.id,
       'cccc0000-0000-0000-0000-00000000000c', 'active', now()
from public.businesses b where b.slug = 'founder-salon';

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccc0000-0000-0000-0000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$ insert into public.member_role_assignments (member_id, role_id, branch_id)
     select 'ffff0000-0000-0000-0000-00000000000f', id, null
     from public.roles where key = 'owner' and business_id is null $$,
  '42501',
  null,
  '(c) a roleless member cannot grant themselves Owner'
);

-- ---------------------------------------------------------------------------
-- (d) A receptionist cannot promote themselves to Manager or Owner
-- ---------------------------------------------------------------------------

reset role;
-- The fixture below is written as the table owner: clear the previous test's JWT,
-- or the escalation guard (which trusts only "no signed-in user") judges the insert.
select set_config('request.jwt.claims', '', true);
insert into public.business_members (id, business_id, user_id, status, joined_at)
select '11110000-0000-0000-0000-000000000011', b.id,
       'dddd0000-0000-0000-0000-00000000000d', 'active', now()
from public.businesses b where b.slug = 'founder-salon';

insert into public.member_role_assignments (member_id, role_id, branch_id)
select '11110000-0000-0000-0000-000000000011', id, null
from public.roles where key = 'receptionist' and business_id is null;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd0000-0000-0000-0000-00000000000d","role":"authenticated"}';

select throws_ok(
  $$ insert into public.member_role_assignments (member_id, role_id, branch_id)
     select '11110000-0000-0000-0000-000000000011', id, null
     from public.roles where key = 'manager' and business_id is null $$,
  '42501',
  null,
  '(d) a receptionist cannot promote themselves to Manager'
);

select throws_ok(
  $$ insert into public.member_role_assignments (member_id, role_id, branch_id)
     select '11110000-0000-0000-0000-000000000011', id, null
     from public.roles where key = 'owner' and business_id is null $$,
  '42501',
  null,
  '(d) a receptionist cannot promote themselves to Owner'
);

select * from finish();
rollback;
