-- 9B fix: the "client with no visits and no branch is visible to every
-- clients.view holder" clause must only apply to BRANCH-scope holders; Own-scope
-- staff (a stylist) see just the clients they serve (found by the A-vs-B suite).
create or replace function public.client_in_scope(p_business_id uuid, p_client_id uuid, p_first_branch uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and (
       public.can_grant_at(p_business_id, null, p_permission, 'branch')
       or exists (select 1 from public.appointments a
                  where a.client_id = p_client_id and a.deleted_at is null
                    and public.has_permission_at_branch_scope(p_business_id, a.branch_id, p_permission))
       or (p_first_branch is not null and public.has_permission_at_branch_scope(p_business_id, p_first_branch, p_permission))
       or (p_first_branch is null
           and public.has_permission_at_branch_scope(p_business_id, null, p_permission)
           and not exists (select 1 from public.appointments a where a.client_id = p_client_id and a.deleted_at is null))
     )
$$;
