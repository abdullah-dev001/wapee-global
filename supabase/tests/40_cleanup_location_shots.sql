-- Removes the throwaway screenshot fixture for the Business location screen.
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where slug = 'p12loc-solo';
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where email like 'p12loc.%@example.com';
select jsonb_build_object('left', (select count(*) from public.businesses where slug like 'p12loc-%')) as out;
