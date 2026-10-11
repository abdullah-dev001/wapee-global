-- Removes the throwaway screenshot fixture (slug p12shot-glow, users p12shot.*@example.com).
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where slug = 'p12shot-glow';
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where email like 'p12shot.%@example.com';
select jsonb_build_object('left', (select count(*) from public.businesses where slug like 'p12shot-%'), 'users', (select count(*) from auth.users where email like 'p12shot.%')) as out;
