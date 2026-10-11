-- Phase 5B cleanup: `p_as_of` was a test-only parameter on a public RPC.
-- The clock-injectable version becomes an INTERNAL function (no API grant);
-- the public get_basic_report always reports "now". Rename is non-destructive
-- (same body, same permission checks); the DST report tests call
-- report_basic_at directly.
alter function public.get_basic_report(uuid, uuid, timestamptz) rename to report_basic_at;
revoke all on function public.report_basic_at(uuid, uuid, timestamptz) from anon, authenticated, public;
comment on function public.report_basic_at is
  'INTERNAL: get_basic_report with an injectable clock (used by the DST tests). Not granted to API roles.';

create or replace function public.get_basic_report(
  p_business_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.report_basic_at(p_business_id, p_branch_id, now());
$$;

comment on function public.get_basic_report is
  'Today + this month per branch timezone (revenue per currency, appointment counts, top services). DEFINER; permissions are checked per branch inside report_basic_at.';

revoke all on function public.get_basic_report(uuid, uuid) from anon, public;
grant execute on function public.get_basic_report(uuid, uuid) to authenticated;
