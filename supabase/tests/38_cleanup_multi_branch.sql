-- Removes the 38_seed fixture by slug / email prefix.
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where slug in ('mbshot-multi', 'mbshot-solo');
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where email like 'mbshot.%@example.com';
select jsonb_build_object('shot_businesses', (select count(*) from public.businesses where slug like 'mbshot-%'),
  'shot_users', (select count(*) from auth.users where email like 'mbshot.%'),
  'businesses_total', (select count(*) from public.businesses), 'users_total', (select count(*) from auth.users)) as out;
