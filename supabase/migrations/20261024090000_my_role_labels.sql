-- The caller's own role name(s) per branch, for one business.
--
-- Why this exists: the dashboard header needs to show "Manager" (or a custom
-- role's name) next to the signed-in user, but `my_grants()` only returns raw
-- permissions, not role names, and the full members list (`useMembers`) is
-- scoped for the Members admin screen and too heavy to reuse here.
--
-- Not a security boundary (same note as `my_grants`): it reports exclusively
-- on the caller's own role assignments, so it is safe to expose to any member.

create or replace function public.my_role_labels(p_business_id uuid)
returns table (
  role_name text,
  -- null = the role is assigned to every branch.
  branch_id uuid,
  -- Permission count for this role, so the UI can pick the "highest" role
  -- when no branch is selected, without hard-coding system role names.
  permission_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.name,
    a.branch_id,
    (select count(*) from public.role_permissions rp where rp.role_id = r.id)
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  join public.roles r on r.id = a.role_id
  where m.business_id = p_business_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.deleted_at is null;
$$;

comment on function public.my_role_labels is
  'The caller''s own (role_name, branch_id, permission_count) role assignments for one business. UI display only; not a permission check.';

revoke all on function public.my_role_labels(uuid) from public;
grant execute on function public.my_role_labels(uuid) to authenticated;
