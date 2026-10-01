-- Fixes from the security advisor run after part 4.
-- 1. business_members had policies but RLS was never switched on: the roster was
--    readable by anyone. This is the important one.
-- 2. Trigger functions are not API endpoints; revoke EXECUTE from anon/authenticated.
-- 3. Helper functions are for policies and the UI permission check; anon loses EXECUTE.

alter table public.business_members enable row level security;

revoke all on function public.handle_new_user() from anon, authenticated, public;
revoke all on function public.enforce_business_slug() from anon, authenticated, public;
revoke all on function public.enforce_business_guard() from anon, authenticated, public;
revoke all on function public.enforce_profile_guard() from anon, authenticated, public;
revoke all on function public.enforce_role_assignment_guard() from anon, authenticated, public;
revoke all on function public.enforce_last_owner() from anon, authenticated, public;
revoke all on function public.set_updated_at() from anon, authenticated, public;

revoke all on function public.is_member(uuid) from anon, public;
revoke all on function public.business_is_active(uuid) from anon, public;
revoke all on function public.member_branch_ids(uuid) from anon, public;
revoke all on function public.has_permission(uuid, uuid, text) from anon, public;
revoke all on function public.can(uuid, uuid, text) from anon, public;
revoke all on function public.is_super_admin() from anon, public;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.business_is_active(uuid) to authenticated;
grant execute on function public.member_branch_ids(uuid) to authenticated;
grant execute on function public.has_permission(uuid, uuid, text) to authenticated;
grant execute on function public.can(uuid, uuid, text) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
