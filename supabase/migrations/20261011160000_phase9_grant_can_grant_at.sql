-- Phase 9A fix: the RLS policies that call can_grant_at() (branches INSERT,
-- report_schedules SELECT) run with the CALLER's privileges, so the function must
-- be executable by `authenticated` ("permission denied for function can_grant_at").
-- Like has_permission() it only ever answers about the caller's own access.
grant execute on function public.can_grant_at(uuid, uuid, text, public.permission_scope) to authenticated;
