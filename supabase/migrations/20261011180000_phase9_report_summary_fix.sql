-- Phase 9A fix: report_summary_data produced every currency three times and put
-- the CURRENT period's figures in the "previous" columns (a LATERAL join over
-- jsonb_array_elements aliased `e` resolved wrongly). Plain CTEs joined on the
-- currency instead. (20261011130000 is applied and is not edited.)

create or replace function public.report_summary_data(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_pf date, p_pt date
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cur jsonb := public.adv_revenue(p_business_id, p_branch_id, p_from, p_to, true) -> 'currencies';
  v_prev jsonb := public.adv_revenue(p_business_id, p_branch_id, p_pf, p_pt, true) -> 'currencies';
  v_rev jsonb;
  v_ac jsonb := public.adv_appointments(p_business_id, p_branch_id, p_from, p_to, true);
  v_ap jsonb := public.adv_appointments(p_business_id, p_branch_id, p_pf, p_pt, true);
begin
  with c as (select e ->> 'currency' as cur, e as j from jsonb_array_elements(v_cur) e),
       p as (select e ->> 'currency' as cur, e as j from jsonb_array_elements(v_prev) e),
       k as (select cur from c union select cur from p)
  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', k.cur,
      'net_revenue_minor', coalesce((c.j ->> 'net_revenue_minor')::bigint, 0),
      'collected_minor', coalesce((c.j ->> 'collected_minor')::bigint, 0),
      'invoice_count', coalesce((c.j ->> 'invoice_count')::int, 0),
      'discounts_minor', coalesce((c.j ->> 'discounts_minor')::bigint, 0),
      'prev_net_revenue_minor', coalesce((p.j ->> 'net_revenue_minor')::bigint, 0),
      'prev_collected_minor', coalesce((p.j ->> 'collected_minor')::bigint, 0)) order by k.cur), '[]'::jsonb)
  into v_rev
  from k left join c on c.cur = k.cur left join p on p.cur = k.cur;
  return jsonb_build_object(
    'revenue', v_rev,
    'appointments', jsonb_build_object('total', v_ac -> 'total', 'completed', v_ac -> 'completed',
      'cancelled', v_ac -> 'cancelled', 'no_show', v_ac -> 'no_show', 'completed_bp', v_ac -> 'completed_bp',
      'cancelled_bp', v_ac -> 'cancelled_bp', 'no_show_bp', v_ac -> 'no_show_bp',
      'prev_total', v_ap -> 'total', 'prev_completed', v_ap -> 'completed'));
end $$;
revoke all on function public.report_summary_data(uuid, uuid, date, date, date, date) from public, anon, authenticated;
