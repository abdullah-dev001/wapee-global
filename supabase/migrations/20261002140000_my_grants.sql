-- The caller's own permission grants for one business, in one round trip.
--
-- Why this exists: `has_permission()` answers one question per call, which the
-- UI cannot afford — a sidebar asks nine questions before it can paint. Product
-- doc §9 says permission sets are cached per session, so the app reads the whole
-- set once and evaluates `can()` locally.
--
-- This is NOT a security boundary. RLS and the RPC checks remain the boundary
-- (CLAUDE.md §7); this only tells the UI what to show. It is safe to expose
-- because it reports exclusively on the caller's own access.

create or replace function public.my_grants(p_business_id uuid)
returns table (
  permission text,
  scope public.permission_scope,
  -- null = the role is assigned to every branch.
  branch_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    rp.permission,
    rp.scope,
    a.branch_id
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  join public.role_permissions rp on rp.role_id = a.role_id
  where m.business_id = p_business_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.deleted_at is null;
$$;

comment on function public.my_grants is
  'The caller''s own (permission, scope, branch_id) grants for one business. For UI gating only; RLS stays the boundary.';

revoke all on function public.my_grants(uuid) from public;
grant execute on function public.my_grants(uuid) to authenticated;
