-- Phase 9A (4/5): advanced reports (feature `advanced_reports`, permission
-- `reports.view_advanced`; branch comparison needs feature `branch_comparison`).
--
-- ONE public RPC, get_advanced_report(business, section, period, ...), returns
-- {period, current, previous}: the chosen period AND the previous equal period.
--   weekly  : Monday..Sunday (ISO) of the week containing the anchor date
--             previous = the week before
--   monthly : the calendar month containing the anchor; previous = the month before
--   custom  : p_from..p_to inclusive (<= 366 days); previous = the same number of
--             days immediately before p_from
-- All dates are LOCAL dates; each branch turns them into UTC instants with its
-- OWN timezone (local midnight to local midnight, DST-exact), so a New_York
-- March month is 743 hours and a Karachi month never moves.
-- Money is always per CURRENCY, never summed across currencies. Archived
-- branches are included: their history still happened.
--
-- Sections: revenue | staff | services | clients | appointments | branches
--   revenue      daily trend, by payment method, discounts given (needs reports.view_revenue)
--   staff        appointments, revenue (view_revenue), commission (commission.view_all + feature)
--   services     most booked (count) and highest earning (per currency)
--   clients      new vs returning, retention of the previous period's clients
--   appointments completed / cancelled / no-show rates (basis points)
--   branches     branch comparison (Business plan)
-- Percentages are integer basis points (10000 = 100%); null when the base is 0.

-- ---------------------------------------------------------------------------
-- Period resolution
-- ---------------------------------------------------------------------------
create or replace function public.report_period(
  p_period text, p_anchor date, p_from date, p_to date
) returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_anchor date := coalesce(p_anchor, (now() at time zone 'UTC')::date);
  v_from date;
  v_to date;
  v_n integer;
begin
  if v_anchor < date '2020-01-01' or v_anchor > (now() at time zone 'UTC')::date + 366 then
    return jsonb_build_object('ok', false, 'code', 'invalid_date');
  end if;
  if p_period = 'weekly' then
    v_from := v_anchor - (extract(isodow from v_anchor)::int - 1);
    v_to := v_from + 6;
    return jsonb_build_object('ok', true, 'period', 'weekly', 'from', v_from, 'to', v_to,
                              'prev_from', v_from - 7, 'prev_to', v_from - 1);
  elsif p_period = 'monthly' then
    v_from := date_trunc('month', v_anchor)::date;
    v_to := (v_from + interval '1 month' - interval '1 day')::date;
    return jsonb_build_object('ok', true, 'period', 'monthly', 'from', v_from, 'to', v_to,
                              'prev_from', (v_from - interval '1 month')::date, 'prev_to', v_from - 1);
  elsif p_period = 'custom' then
    if p_from is null or p_to is null or p_from > p_to or p_from < date '2020-01-01' then
      return jsonb_build_object('ok', false, 'code', 'invalid_range');
    end if;
    v_n := p_to - p_from + 1;
    if v_n > 366 then
      return jsonb_build_object('ok', false, 'code', 'range_too_large');
    end if;
    return jsonb_build_object('ok', true, 'period', 'custom', 'from', p_from, 'to', p_to,
                              'prev_from', p_from - v_n, 'prev_to', p_from - 1);
  end if;
  return jsonb_build_object('ok', false, 'code', 'invalid_period');
end $$;
revoke all on function public.report_period(text, date, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Branches a report may cover, with each branch's own local-date window.
-- p_service = true is the INTERNAL no-caller mode (scheduled summaries): every
-- branch, every figure. Never reachable from the API.
-- ---------------------------------------------------------------------------
create or replace function public.adv_visible_branches(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_service boolean default false
) returns table (branch_id uuid, name text, currency text, tz text, archived boolean,
                 ws timestamptz, we timestamptz, can_rev boolean, can_comm boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.currency, b.timezone, b.deleted_at is not null,
         p_from::timestamp at time zone b.timezone, (p_to + 1)::timestamp at time zone b.timezone,
         p_service or public.invoice_access(b.business_id, b.id, 'reports.view_revenue'),
         p_service or public.invoice_access(b.business_id, b.id, 'commission.view_all')
  from public.branches b
  where b.business_id = p_business_id and (p_branch_id is null or b.id = p_branch_id)
    and (p_service or public.invoice_access(b.business_id, b.id, 'reports.view_advanced'))
$$;
revoke all on function public.adv_visible_branches(uuid, uuid, date, date, boolean) from public, anon, authenticated;

create or replace function public.bp_of(p_part bigint, p_whole bigint)
returns integer language sql immutable set search_path = '' as $$
  select case when p_whole is null or p_whole <= 0 then null
              else floor((p_part::numeric * 10000 * 2 + p_whole) / (2 * p_whole::numeric))::int end
$$;
revoke all on function public.bp_of(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- revenue
-- ---------------------------------------------------------------------------
create or replace function public.adv_revenue(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_service boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  with v as (select * from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service) x where x.can_rev),
  inv as (
    select v.currency, (i.issued_at at time zone v.tz)::date d, i.id, i.total_minor, i.net_minor, i.tax_minor
    from v join public.invoices i on i.branch_id = v.branch_id and i.status = 'issued' and i.deleted_at is null
         and i.issued_at >= v.ws and i.issued_at < v.we),
  cn as (
    select v.currency, (c.issued_at at time zone v.tz)::date d, c.total_minor, c.net_minor, c.tax_minor
    from v join public.credit_notes c on c.branch_id = v.branch_id and c.issued_at >= v.ws and c.issued_at < v.we),
  pay as (
    select v.currency, (p.paid_at at time zone v.tz)::date d, p.method::text method,
           case when p.kind = 'payment' then p.amount_minor else -p.amount_minor end amt
    from v join public.invoice_payments p on p.branch_id = v.branch_id and p.paid_at >= v.ws and p.paid_at < v.we),
  disc as (
    select i.currency, it.discount_minor
    from inv i join public.invoice_items it on it.invoice_id = i.id and it.discount_minor > 0)
  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', c.currency,
      'invoice_count', (select count(*) from inv where inv.currency = c.currency),
      'invoiced_minor', (select coalesce(sum(total_minor), 0) from inv where inv.currency = c.currency),
      'credited_minor', (select coalesce(sum(total_minor), 0) from cn where cn.currency = c.currency),
      'tax_minor', (select coalesce(sum(tax_minor), 0) from inv where inv.currency = c.currency)
                 - (select coalesce(sum(tax_minor), 0) from cn where cn.currency = c.currency),
      'net_revenue_minor', (select coalesce(sum(net_minor), 0) from inv where inv.currency = c.currency)
                         - (select coalesce(sum(net_minor), 0) from cn where cn.currency = c.currency),
      'collected_minor', (select coalesce(sum(amt), 0) from pay where pay.currency = c.currency),
      'discounts_minor', (select coalesce(sum(discount_minor), 0) from disc where disc.currency = c.currency),
      'discounted_lines', (select count(*) from disc where disc.currency = c.currency),
      'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', m.method, 'amount_minor', m.amt)
                                              order by m.method), '[]'::jsonb)
                    from (select method, sum(amt)::bigint amt from pay where pay.currency = c.currency group by method) m),
      'daily', (select jsonb_agg(jsonb_build_object(
                  'date', p_from + g.n,
                  'net_revenue_minor',
                    (select coalesce(sum(net_minor), 0) from inv where inv.currency = c.currency and inv.d = p_from + g.n)
                    - (select coalesce(sum(net_minor), 0) from cn where cn.currency = c.currency and cn.d = p_from + g.n),
                  'collected_minor', (select coalesce(sum(amt), 0) from pay where pay.currency = c.currency and pay.d = p_from + g.n))
                  order by g.n)
                from generate_series(0, p_to - p_from) g(n)))
    order by c.currency), '[]'::jsonb)
  into v_out
  from (select distinct currency from v) c;
  return jsonb_build_object('currencies', v_out);
end $$;
revoke all on function public.adv_revenue(uuid, uuid, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- appointments (rates)
-- ---------------------------------------------------------------------------
create or replace function public.adv_appointments(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_service boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select count(*)::bigint total,
         count(*) filter (where a.status = 'pending')::bigint pending,
         count(*) filter (where a.status = 'confirmed')::bigint confirmed,
         count(*) filter (where a.status = 'completed')::bigint completed,
         count(*) filter (where a.status = 'cancelled')::bigint cancelled,
         count(*) filter (where a.status = 'no_show')::bigint no_show
  into r
  from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service) v
  join public.appointments a on a.branch_id = v.branch_id and a.deleted_at is null
       and a.starts_at >= v.ws and a.starts_at < v.we;
  return jsonb_build_object('total', r.total, 'pending', r.pending, 'confirmed', r.confirmed,
    'completed', r.completed, 'cancelled', r.cancelled, 'no_show', r.no_show,
    'completed_bp', public.bp_of(r.completed, r.total), 'cancelled_bp', public.bp_of(r.cancelled, r.total),
    'no_show_bp', public.bp_of(r.no_show, r.total));
end $$;
revoke all on function public.adv_appointments(uuid, uuid, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- staff: appointments + revenue + commission
-- ---------------------------------------------------------------------------
create or replace function public.adv_staff(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_service boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb;
  v_comm boolean := public.business_has_feature(p_business_id, 'commission');
begin
  with v as (select * from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service) x),
  ap as (
    select a.staff_id,
           count(*)::bigint total,
           count(*) filter (where a.status = 'completed')::bigint completed,
           count(*) filter (where a.status = 'cancelled')::bigint cancelled,
           count(*) filter (where a.status = 'no_show')::bigint no_show
    from v join public.appointments a on a.branch_id = v.branch_id and a.deleted_at is null and a.staff_id is not null
         and a.starts_at >= v.ws and a.starts_at < v.we
    group by a.staff_id),
  rev as (
    select a.staff_id, v.currency, sum(i.net_minor)::bigint net
    from v join public.invoices i on i.branch_id = v.branch_id and i.status = 'issued' and i.deleted_at is null
         and i.issued_at >= v.ws and i.issued_at < v.we
         join public.appointments a on a.id = i.appointment_id and a.staff_id is not null
    where v.can_rev group by a.staff_id, v.currency),
  crd as (
    select a.staff_id, v.currency, sum(c.net_minor)::bigint net
    from v join public.credit_notes c on c.branch_id = v.branch_id and c.issued_at >= v.ws and c.issued_at < v.we
         join public.invoices i on i.id = c.invoice_id
         join public.appointments a on a.id = i.appointment_id and a.staff_id is not null
    where v.can_rev group by a.staff_id, v.currency),
  com as (
    select e.staff_id, e.currency,
           (coalesce(sum(e.amount_minor) filter (where e.kind = 'earn'), 0)
            - coalesce(sum(e.amount_minor) filter (where e.kind = 'reversal'), 0))::bigint net
    from v join public.commission_entries e on e.branch_id = v.branch_id and e.created_at >= v.ws and e.created_at < v.we
    where v.can_comm and v_comm group by e.staff_id, e.currency),
  money as (
    select staff_id, currency, sum(net) net_rev, sum(comm) comm_net from (
      select staff_id, currency, net, null::bigint comm from rev
      union all select staff_id, currency, -net, null from crd
      union all select staff_id, currency, null, net from com) u
    group by staff_id, currency),
  ids as (select staff_id from ap union select staff_id from money)
  select coalesce(jsonb_agg(jsonb_build_object(
      'staff_id', ids.staff_id, 'staff_name', sp.display_name,
      'appointments', jsonb_build_object('total', coalesce(ap.total, 0), 'completed', coalesce(ap.completed, 0),
                        'cancelled', coalesce(ap.cancelled, 0), 'no_show', coalesce(ap.no_show, 0)),
      'money', (select coalesce(jsonb_agg(jsonb_build_object('currency', m.currency, 'net_revenue_minor', m.net_rev,
                         'commission_net_minor', m.comm_net) order by m.currency), '[]'::jsonb)
                from money m where m.staff_id = ids.staff_id))
    order by sp.display_name, ids.staff_id), '[]'::jsonb)
  into v_out
  from ids join public.staff_profiles sp on sp.id = ids.staff_id left join ap on ap.staff_id = ids.staff_id;
  return jsonb_build_object('staff', v_out);
end $$;
revoke all on function public.adv_staff(uuid, uuid, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- services: most booked (cancelled excluded) / highest earning (per currency)
-- ---------------------------------------------------------------------------
create or replace function public.adv_services(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_service boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_booked jsonb; v_earn jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('service_id', t.service_id, 'name', t.name, 'booked', t.n)
                            order by t.n desc, t.name, t.service_id), '[]'::jsonb) into v_booked
  from (select a.service_id, s.name, count(*)::bigint n
        from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service) v
        join public.appointments a on a.branch_id = v.branch_id and a.deleted_at is null and a.status <> 'cancelled'
             and a.starts_at >= v.ws and a.starts_at < v.we
        join public.services s on s.id = a.service_id
        group by a.service_id, s.name order by n desc, s.name limit 20) t;

  select coalesce(jsonb_agg(jsonb_build_object('service_id', t.service_id, 'name', t.name, 'currency', t.currency,
                       'net_minor', t.net, 'quantity', t.qty) order by t.currency, t.net desc, t.name, t.service_id), '[]'::jsonb)
  into v_earn
  from (select x.*, row_number() over (partition by x.currency order by x.net desc, x.name) rn
        from (select it.service_id, s.name, v.currency, sum(it.line_net_minor)::bigint net, sum(it.quantity)::bigint qty
              from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service) v
              join public.invoices i on i.branch_id = v.branch_id and i.status = 'issued' and i.deleted_at is null
                   and i.issued_at >= v.ws and i.issued_at < v.we
              join public.invoice_items it on it.invoice_id = i.id and it.service_id is not null
              join public.services s on s.id = it.service_id
              where v.can_rev
              group by it.service_id, s.name, v.currency) x) t
  where t.rn <= 20;
  return jsonb_build_object('most_booked', v_booked, 'highest_earning', v_earn);
end $$;
revoke all on function public.adv_services(uuid, uuid, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- clients: new vs returning, retention
--   active    = distinct clients with a COMPLETED appointment in the window
--   new       = active clients whose first-ever completed appointment (any branch
--               of the business) is inside the window
--   returning = active - new
--   retention = share of the PREVIOUS window's active clients active again now
-- ---------------------------------------------------------------------------
create or replace function public.adv_clients(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date,
  p_prev_from date default null, p_prev_to date default null, p_service boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  with vc as (select * from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service)),
  cur as (
    select distinct a.client_id
    from vc join public.appointments a on a.branch_id = vc.branch_id and a.deleted_at is null
         and a.status = 'completed' and a.starts_at >= vc.ws and a.starts_at < vc.we),
  vp as (select * from public.adv_visible_branches(p_business_id, p_branch_id, p_prev_from, p_prev_to, p_service)
         where p_prev_from is not null and p_prev_to is not null),
  prev as (
    select distinct a.client_id
    from vp join public.appointments a on a.branch_id = vp.branch_id and a.deleted_at is null
         and a.status = 'completed' and a.starts_at >= vp.ws and a.starts_at < vp.we)
  select (select count(*) from cur)::bigint active,
         (select count(*) from cur c where not exists (
            select 1 from public.appointments a where a.business_id = p_business_id and a.client_id = c.client_id
              and a.deleted_at is null and a.status = 'completed'
              and a.starts_at < (select min(ws) from vc)))::bigint new_n,
         case when p_prev_from is not null then (select count(*) from prev) end::bigint prev_active,
         case when p_prev_from is not null then (select count(*) from prev join cur using (client_id)) end::bigint retained
  into r;
  return jsonb_build_object('active', r.active, 'new', r.new_n, 'returning', r.active - r.new_n,
    'prev_active', r.prev_active, 'retained', r.retained, 'retention_bp', public.bp_of(r.retained, r.prev_active));
end $$;
revoke all on function public.adv_clients(uuid, uuid, date, date, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- branch comparison (Business plan): per-branch rows, each in ITS currency.
-- ---------------------------------------------------------------------------
create or replace function public.adv_branches(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date, p_service boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'branch_id', m.branch_id, 'name', m.branch_name, 'currency', m.currency, 'archived', m.archived,
      'invoice_count', m.invoice_count, 'net_revenue_minor', m.net_revenue_minor, 'collected_minor', m.collected_minor,
      'appointments', case when m.can_basic then jsonb_build_object('total', m.appt_total, 'completed', m.appt_completed,
                        'cancelled', m.appt_cancelled, 'no_show', m.appt_no_show,
                        'completed_bp', public.bp_of(m.appt_completed, m.appt_total),
                        'cancelled_bp', public.bp_of(m.appt_cancelled, m.appt_total),
                        'no_show_bp', public.bp_of(m.appt_no_show, m.appt_total)) end)
      order by m.archived, m.branch_name, m.branch_id), '[]'::jsonb)
  into v_out
  from public.branch_metrics(p_business_id, p_from, p_to, p_branch_id) m
  where exists (select 1 from public.adv_visible_branches(p_business_id, p_branch_id, p_from, p_to, p_service) v
                where v.branch_id = m.branch_id);
  return jsonb_build_object('branches', v_out);
end $$;
revoke all on function public.adv_branches(uuid, uuid, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The public RPC
-- ---------------------------------------------------------------------------
create or replace function public.get_advanced_report(
  p_business_id uuid,
  p_section text,
  p_period text,
  p_anchor date default null,
  p_from date default null,
  p_to date default null,
  p_branch_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_gate jsonb;
  v_p jsonb;
  v_from date; v_to date; v_pf date; v_pt date;
  v_cur jsonb; v_prev jsonb;
begin
  if (select auth.uid()) is null or not public.is_member(p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(p_business_id, 'advanced_reports');
  if v_gate is not null then return v_gate; end if;
  if p_section is null or p_section not in ('revenue', 'staff', 'services', 'clients', 'appointments', 'branches') then
    return jsonb_build_object('ok', false, 'code', 'invalid_section');
  end if;
  if p_section = 'branches' then
    v_gate := public.feature_gate_error(p_business_id, 'branch_comparison');
    if v_gate is not null then return v_gate; end if;
  end if;
  v_p := public.report_period(p_period, p_anchor, p_from, p_to);
  if not (v_p ->> 'ok')::boolean then return v_p; end if;
  v_from := (v_p ->> 'from')::date; v_to := (v_p ->> 'to')::date;
  v_pf := (v_p ->> 'prev_from')::date; v_pt := (v_p ->> 'prev_to')::date;
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.business_id = p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'invalid_branch');
  end if;
  if not exists (select 1 from public.adv_visible_branches(p_business_id, p_branch_id, v_from, v_to, false)) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_section in ('revenue') and not exists (
       select 1 from public.adv_visible_branches(p_business_id, p_branch_id, v_from, v_to, false) x where x.can_rev) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_section = 'revenue' then
    v_cur := public.adv_revenue(p_business_id, p_branch_id, v_from, v_to);
    v_prev := public.adv_revenue(p_business_id, p_branch_id, v_pf, v_pt);
  elsif p_section = 'staff' then
    v_cur := public.adv_staff(p_business_id, p_branch_id, v_from, v_to);
    v_prev := public.adv_staff(p_business_id, p_branch_id, v_pf, v_pt);
  elsif p_section = 'services' then
    v_cur := public.adv_services(p_business_id, p_branch_id, v_from, v_to);
    v_prev := public.adv_services(p_business_id, p_branch_id, v_pf, v_pt);
  elsif p_section = 'clients' then
    v_cur := public.adv_clients(p_business_id, p_branch_id, v_from, v_to, v_pf, v_pt);
    v_prev := public.adv_clients(p_business_id, p_branch_id, v_pf, v_pt);
  elsif p_section = 'appointments' then
    v_cur := public.adv_appointments(p_business_id, p_branch_id, v_from, v_to);
    v_prev := public.adv_appointments(p_business_id, p_branch_id, v_pf, v_pt);
  else
    v_cur := public.adv_branches(p_business_id, p_branch_id, v_from, v_to);
    v_prev := public.adv_branches(p_business_id, p_branch_id, v_pf, v_pt);
  end if;

  return jsonb_build_object('ok', true, 'section', p_section,
    'period', jsonb_build_object('type', v_p ->> 'period', 'from', v_from, 'to', v_to, 'prev_from', v_pf, 'prev_to', v_pt),
    'current', v_cur, 'previous', v_prev);
end $$;

revoke all on function public.get_advanced_report(uuid, text, text, date, date, date, uuid) from public, anon;
grant execute on function public.get_advanced_report(uuid, text, text, date, date, date, uuid) to authenticated;
