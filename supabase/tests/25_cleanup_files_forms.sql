-- Removes the 25_seed fixture by slug / email prefix (the ids were recorded when it was created).
-- Storage objects are removed first by the HTTP test (they are not covered by the business cascade).
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where slug in ('p10bshot-ink', 'p10bshot-plain');
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where email like 'p10bshot.%@example.com';
select jsonb_build_object('biz', (select count(*) from public.businesses where slug like 'p10bshot-%'), 'users', (select count(*) from auth.users where email like 'p10bshot.%'),
  'businesses_total', (select count(*) from public.businesses), 'users_total', (select count(*) from auth.users)) as out;
