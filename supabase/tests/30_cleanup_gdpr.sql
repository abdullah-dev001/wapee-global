-- Removes the 30_seed fixture by slug / email prefix. Storage objects are removed by the HTTP test through the
-- Storage API (a SQL delete cannot remove bytes).
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where slug in ('p11shot-gdpr', 'p11shot-other');
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from public.erasure_log where business_id not in (select id from public.businesses) and counts ? 'clients' and erased_at > now() - interval '1 day' and requested_by in (select id from auth.users where email like 'p11shot.%@example.com');
delete from auth.users where email like 'p11shot.%@example.com';
select jsonb_build_object('shot_businesses', (select count(*) from public.businesses where slug like 'p11shot-%'), 'shot_users', (select count(*) from auth.users where email like 'p11shot.%'),
  'businesses_total', (select count(*) from public.businesses), 'users_total', (select count(*) from auth.users)) as out;
