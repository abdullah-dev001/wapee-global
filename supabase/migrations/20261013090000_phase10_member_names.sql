-- Phase 10 prelude: teammates' names for the Team list. `profiles` RLS lets a user
-- read only their OWN row (unchanged, deliberately), so the Members screen showed
-- "Unknown" for everyone else. This function returns ONLY user id, name and email of
-- the ACTIVE members of the caller's own business. A caller who is not an active member
-- of that business gets no rows (not an error: nothing to enumerate). Another
-- business's users can never appear because the join is pinned to p_business_id.
create or replace function public.list_business_member_names(p_business_id uuid)
returns table (user_id uuid, full_name text, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.email
  from public.business_members m
  join public.profiles p on p.id = m.user_id
  where m.business_id = p_business_id
    and m.status = 'active' and m.deleted_at is null
    and public.is_member(p_business_id)
$$;
revoke all on function public.list_business_member_names(uuid) from public, anon;
grant execute on function public.list_business_member_names(uuid) to authenticated;
