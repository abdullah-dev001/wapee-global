-- 9B fix: "all branches" must mean EVERY LIVE branch of the business, not "the role
-- is assigned to branch NULL or at All scope". 20261012090000 used the latter, so a
-- Manager invited to the ONLY branch of a single-branch business (the normal case:
-- the invite form assigns the current branch) lost services / custom fields /
-- shared staff, which is wrong: they cover every branch there is. A second branch
-- makes them stop covering "all" (correct). Found by suite 07.
create or replace function public.covers_every_branch(p_business_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and exists (select 1 from public.branches b where b.business_id = p_business_id and b.deleted_at is null)
     and not exists (
       select 1 from public.branches b
       where b.business_id = p_business_id and b.deleted_at is null
         and not public.has_permission_at_branch_scope(p_business_id, b.id, p_permission))
$$;
revoke all on function public.covers_every_branch(uuid, text) from public, anon;
grant execute on function public.covers_every_branch(uuid, text) to authenticated;

create or replace function public.perm_all_branches(p_business_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.covers_every_branch(p_business_id, p_permission)
$$;

create or replace function public.staff_in_scope(p_business_id uuid, p_staff_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and (public.covers_every_branch(p_business_id, p_permission)
          or not exists (select 1 from public.staff_branches sb where sb.staff_id = p_staff_id)
          or not exists (select 1 from public.staff_branches sb
                         where sb.staff_id = p_staff_id and not public.can(p_business_id, sb.branch_id, p_permission)))
$$;

create or replace function public.client_in_scope(p_business_id uuid, p_client_id uuid, p_first_branch uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and (
       public.covers_every_branch(p_business_id, p_permission)
       or exists (select 1 from public.appointments a
                  where a.client_id = p_client_id and a.deleted_at is null
                    and public.has_permission_at_branch_scope(p_business_id, a.branch_id, p_permission))
       or (p_first_branch is not null and public.has_permission_at_branch_scope(p_business_id, p_first_branch, p_permission))
       or (p_first_branch is null
           and public.has_permission_at_branch_scope(p_business_id, null, p_permission)
           and not exists (select 1 from public.appointments a where a.client_id = p_client_id and a.deleted_at is null))
     )
$$;
