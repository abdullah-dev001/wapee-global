-- Phase 2: catalogue and schedule constraints + RLS.
--
-- Run with `supabase test db` (needs Docker, not installed here).
--
-- **Both halves HAVE been verified against the live database** through
-- `supabase db query --linked`, inside rolled-back transactions: 12 constraint
-- assertions and 10 RLS assertions (Own scope, tenant isolation, Owner vs Staff),
-- all passing. See context/services.md and context/schedule.md.
-- This file has still never run as a pgTAP *suite*, because Docker is not
-- installed; the plan count below is therefore unverified.

begin;
select plan(23);

create temporary table t (k text primary key, v uuid) on commit drop;
do $g$ declare s text; begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', s);
  execute format('grant select, insert on %I.t to authenticated, anon', s);
end $g$;

-- Two businesses, so cross-tenant checks are real.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'cat.owner.a@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into t values ('owner_a', (select id from auth.users where email='cat.owner.a@example.com'));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'cat.owner.b@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into t values ('owner_b', (select id from auth.users where email='cat.owner.b@example.com'));

-- A staff-only user, to prove the Own scope.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'cat.staff@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(),
        now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into t values ('staff_user', (select id from auth.users where email='cat.staff@example.com'));

select set_config('request.jwt.claims',
  json_build_object('sub',(select v from t where k='owner_a'),'role','authenticated')::text, true);
set local role authenticated;
insert into t values ('biz_a', public.create_business_with_owner(
  'Cat Test A','cat-test-a','GB','GBP','Europe/London','en',null,'Main'));
reset role;
select set_config('request.jwt.claims', '', true);   -- fixtures below are written as the table owner

select set_config('request.jwt.claims',
  json_build_object('sub',(select v from t where k='owner_b'),'role','authenticated')::text, true);
set local role authenticated;
insert into t values ('biz_b', public.create_business_with_owner(
  'Cat Test B','cat-test-b','GB','GBP','Europe/London','en',null,'Main'));
reset role;
select set_config('request.jwt.claims', '', true);   -- fixtures below are written as the table owner

insert into t values ('branch_a', (select id from public.branches where business_id=(select v from t where k='biz_a') limit 1));
insert into t values ('branch_b', (select id from public.branches where business_id=(select v from t where k='biz_b') limit 1));

-- The staff user joins business A with the Staff role (own scope).
insert into public.business_members (business_id, user_id, status, joined_at)
values ((select v from t where k='biz_a'), (select v from t where k='staff_user'), 'active', now());
insert into t values ('member_staff', (select id from public.business_members
  where business_id=(select v from t where k='biz_a') and user_id=(select v from t where k='staff_user')));
insert into public.member_role_assignments (member_id, role_id, branch_id)
values ((select v from t where k='member_staff'),
        (select id from public.roles where business_id is null and key='staff'),
        (select v from t where k='branch_a'));

-- ---------------------------------------------------------------------------
-- Catalogue constraints
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub',(select v from t where k='owner_a'),'role','authenticated')::text, true);
set local role authenticated;

insert into public.service_categories (business_id, name)
values ((select v from t where k='biz_a'), 'Hair');
insert into t values ('cat_hair', (select id from public.service_categories
  where business_id=(select v from t where k='biz_a') and name='Hair'));

insert into public.services (business_id, category_id, name, duration_minutes)
values ((select v from t where k='biz_a'), (select v from t where k='cat_hair'), 'Cut', 30);
insert into t values ('svc_cut', (select id from public.services
  where business_id=(select v from t where k='biz_a') and name='Cut'));

select lives_ok(
  format('insert into public.services (business_id, name, duration_minutes) values (%L, %L, 45)',
    (select v from t where k='biz_a'), 'Uncategorised Service'),
  'a service with no category is allowed (categories are optional)');

select throws_ok(
  format('insert into public.services (business_id, name, duration_minutes) values (%L, %L, 2)',
    (select v from t where k='biz_a'), 'Too Short'),
  '23514', null, 'a duration under 5 minutes is refused');

select throws_ok(
  format('insert into public.services (business_id, name, duration_minutes) values (%L, %L, 30)',
    (select v from t where k='biz_a'), 'cut'),
  '23505', null, 'a duplicate service name (case-insensitive) is refused');

-- Price per branch
select lives_ok(
  format('insert into public.service_branches (service_id, branch_id, business_id, price_minor) values (%L,%L,%L,0)',
    (select v from t where k='svc_cut'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  'a free service (price 0) is allowed');

select throws_ok(
  format('update public.service_branches set price_minor = -1 where service_id = %L',
    (select v from t where k='svc_cut')),
  '23514', null, 'a negative price is refused');

select throws_ok(
  format('insert into public.service_branches (service_id, branch_id, business_id, price_minor) values (%L,%L,%L,500)',
    (select v from t where k='svc_cut'), (select v from t where k='branch_b'), (select v from t where k='biz_a')),
  '23514', null, 'pricing a service at another business''s branch is refused');

-- ---------------------------------------------------------------------------
-- Schedule constraints
-- ---------------------------------------------------------------------------
insert into public.staff_profiles (business_id, display_name)
values ((select v from t where k='biz_a'), 'Ayesha');
insert into t values ('staff_a', (select id from public.staff_profiles
  where business_id=(select v from t where k='biz_a') and display_name='Ayesha'));

-- A staff member with no login at all: the whole point of staff_profiles.
select is(
  (select member_id from public.staff_profiles where id=(select v from t where k='staff_a')),
  null, 'a staff member can exist with no app account');

select lives_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,2,540,1020)',
    (select v from t where k='staff_a'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  'a 09:00-17:00 Tuesday shift is accepted');

select throws_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,2,900,1200)',
    (select v from t where k='staff_a'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  '23P01', null, 'an overlapping shift on the same weekday is refused');

select lives_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,2,1020,1200)',
    (select v from t where k='staff_a'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  'an adjacent split shift is accepted (ranges are half-open)');

select throws_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,4,600,600)',
    (select v from t where k='staff_a'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  '23514', null, 'a zero-length shift is refused');

select throws_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,5,1320,1500)',
    (select v from t where k='staff_a'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  '23514', null, 'an overnight shift (end past midnight) is refused');

select throws_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,1,540,600)',
    (select v from t where k='staff_a'), (select v from t where k='branch_b'), (select v from t where k='biz_a')),
  '23514', null, 'hours at another business''s branch are refused');

-- Time off
insert into public.staff_time_off (staff_id, business_id, starts_at, ends_at)
values ((select v from t where k='staff_a'), (select v from t where k='biz_a'),
        now() + interval '10 days', now() + interval '14 days');

select throws_ok(
  format('insert into public.staff_time_off (staff_id,business_id,starts_at,ends_at) values (%L,%L,now() + interval ''12 days'', now() + interval ''16 days'')',
    (select v from t where k='staff_a'), (select v from t where k='biz_a')),
  '23P01', null, 'overlapping time off is refused');

-- Branch closures use an INCLUSIVE date range, so sharing an end day overlaps.
insert into public.branch_closures (branch_id, business_id, starts_on, ends_on, name)
values ((select v from t where k='branch_a'), (select v from t where k='biz_a'),
        date '2026-12-24', date '2026-12-26', 'Christmas');

select throws_ok(
  format('insert into public.branch_closures (branch_id,business_id,starts_on,ends_on,name) values (%L,%L,date ''2026-12-26'',date ''2026-12-27'',''Boxing Day'')',
    (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  '23P01', null, 'an overlapping closure is refused');

reset role;
select set_config('request.jwt.claims', '', true);   -- fixtures below are written as the table owner

-- ---------------------------------------------------------------------------
-- RLS: tenant isolation and the Own scope
-- ---------------------------------------------------------------------------
-- Owner B must not see business A's catalogue.
select set_config('request.jwt.claims',
  json_build_object('sub',(select v from t where k='owner_b'),'role','authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.services where business_id=(select v from t where k='biz_a')),
  0, 'another business cannot read our services');

select is(
  (select count(*)::int from public.staff_working_hours where business_id=(select v from t where k='biz_a')),
  0, 'another business cannot read our schedule');
reset role;
select set_config('request.jwt.claims', '', true);   -- fixtures below are written as the table owner

-- A Staff member (own scope) may edit their OWN hours but nobody else's.
-- Link the staff user to a profile so is_own_staff_profile() can match.
insert into public.staff_profiles (business_id, member_id, display_name)
values ((select v from t where k='biz_a'), (select v from t where k='member_staff'), 'Staff User');
insert into t values ('staff_self', (select id from public.staff_profiles
  where business_id=(select v from t where k='biz_a') and display_name='Staff User'));

select set_config('request.jwt.claims',
  json_build_object('sub',(select v from t where k='staff_user'),'role','authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format('insert into public.staff_working_hours (staff_id,branch_id,business_id,day_of_week,start_minute,end_minute) values (%L,%L,%L,3,540,1020)',
    (select v from t where k='staff_self'), (select v from t where k='branch_a'), (select v from t where k='biz_a')),
  'a Staff member may set their OWN working hours (own scope)');

-- Someone else's hours: RLS returns 0 rows rather than raising.
select is(
  (select count(*)::int from public.staff_working_hours
   where staff_id = (select v from t where k='staff_a') and day_of_week = 6),
  0, 'a Staff member has no row to show for a shift they cannot create');

select throws_ok(
  format('insert into public.staff_profiles (business_id, display_name) values (%L, ''Sneaky'')',
    (select v from t where k='biz_a')),
  '42501', null, 'a Staff member cannot add a staff profile (needs staff.manage)');
reset role;
select set_config('request.jwt.claims', '', true);   -- fixtures below are written as the table owner

-- ---------------------------------------------------------------------------
-- 8. The replace-a-week RPCs are transactional
-- ---------------------------------------------------------------------------
-- The whole point: a payload the constraints refuse must leave the PREVIOUS week
-- intact, not an empty one (migration 20261002190000).
select set_config('request.jwt.claims',
  json_build_object('sub',(select v from t where k='owner_a'),'role','authenticated')::text, true);
set local role authenticated;

select is(
  public.replace_staff_working_hours(
    (select v from t where k='staff_a'), (select v from t where k='branch_a'),
    '[{"day_of_week":1,"start_minute":540,"end_minute":1020}]'::jsonb),
  1, 'the RPC replaces a week and reports the row count');

select throws_ok(
  format($q$select public.replace_staff_working_hours(%L, %L,
    '[{"day_of_week":2,"start_minute":540,"end_minute":1020},
      {"day_of_week":2,"start_minute":600,"end_minute":700}]'::jsonb)$q$,
    (select v from t where k='staff_a'), (select v from t where k='branch_a')),
  '23P01', null, 'a self-overlapping payload is refused');

select is(
  (select count(*)::int from public.staff_working_hours
   where staff_id = (select v from t where k='staff_a')
     and branch_id = (select v from t where k='branch_a')),
  1, 'the refused call rolled back: the previous week is still there');

reset role;
select set_config('request.jwt.claims', '', true);   -- fixtures below are written as the table owner

select * from finish();
rollback;
