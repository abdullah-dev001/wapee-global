-- Phase 5A: list_invoices, get_invoice_print_data, get_basic_report.
--
-- Reads are SECURITY DEFINER with an EXPLICIT permission + scope check (not
-- RLS) because they aggregate and join across tables with different grants.
-- Each returns {ok:false,code:'forbidden'} when the caller has no access to
-- any branch asked about.

-- ---------------------------------------------------------------------------
-- list_invoices — keyset pagination on (issued_at or created_at) desc, id desc
-- ---------------------------------------------------------------------------
create or replace function public.list_invoices(
  p_business_id uuid,
  p_branch_id uuid default null,
  p_status public.invoice_status default null,
  p_payment_status text default null,
  p_client_id uuid default null,
  p_from_date date default null,
  p_to_date date default null,
  p_search text default null,
  p_limit integer default 20,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_search text;
  v_rows jsonb;
  v_more boolean;
  v_next jsonb;
begin
  if p_payment_status is not null and p_payment_status not in ('pending', 'partial', 'paid', 'credited') then
    return jsonb_build_object('ok', false, 'code', 'invalid_filter');
  end if;
  if not exists (
    select 1 from public.branches b
    where b.business_id = p_business_id and b.deleted_at is null
      and (p_branch_id is null or b.id = p_branch_id)
      and public.invoice_access(b.business_id, b.id, 'invoices.view')
  ) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_search is not null and char_length(btrim(p_search)) >= 2 then
    v_search := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with vis as (
    select b.id, b.timezone from public.branches b
    where b.business_id = p_business_id and b.deleted_at is null
      and (p_branch_id is null or b.id = p_branch_id)
      and public.invoice_access(b.business_id, b.id, 'invoices.view')
  ),
  base as (
    select i.id, i.branch_id, i.status, i.number, i.currency, i.total_minor, i.tax_minor,
           i.client_id, coalesce(i.bill_to_name, c.full_name) as client_name,
           i.appointment_id, i.issued_at, i.created_at,
           coalesce(i.issued_at, i.created_at) as sort_ts,
           vis.timezone as tz,
           public.invoice_money(i.id) as m
    from public.invoices i
    join vis on vis.id = i.branch_id
    left join public.clients c on c.id = i.client_id
    where i.business_id = p_business_id and i.deleted_at is null
      and (p_status is null or i.status = p_status)
      and (p_client_id is null or i.client_id = p_client_id)
      and (v_search is null or i.number ilike v_search or i.bill_to_name ilike v_search
           or c.full_name ilike v_search)
  ),
  filtered as (
    select * from base b
    where (p_payment_status is null or b.m->>'payment_status' = p_payment_status)
      and (p_from_date is null or (b.sort_ts at time zone b.tz)::date >= p_from_date)
      and (p_to_date is null or (b.sort_ts at time zone b.tz)::date <= p_to_date)
      and (p_cursor_at is null or b.sort_ts < p_cursor_at
           or (b.sort_ts = p_cursor_at and b.id < p_cursor_id))
  ),
  page as (
    select f.*, row_number() over (order by f.sort_ts desc, f.id desc) as rn
    from filtered f
    order by f.sort_ts desc, f.id desc
    limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'branch_id', p.branch_id, 'status', p.status, 'number', p.number,
      'currency', p.currency, 'total_minor', p.total_minor, 'tax_minor', p.tax_minor,
      'client_id', p.client_id, 'client_name', p.client_name, 'appointment_id', p.appointment_id,
      'issued_at', p.issued_at, 'created_at', p.created_at,
      'paid_minor', p.m->'paid_minor', 'credited_minor', p.m->'credited_minor',
      'balance_minor', p.m->'balance_minor', 'refund_due_minor', p.m->'refund_due_minor',
      'payment_status', p.m->'payment_status') order by p.rn) filter (where p.rn <= v_limit), '[]'::jsonb),
    coalesce(bool_or(p.rn > v_limit), false),
    (array_agg(jsonb_build_object('at', p.sort_ts, 'id', p.id)) filter (where p.rn = v_limit))[1]
  into v_rows, v_more, v_next
  from page p;

  return jsonb_build_object('ok', true, 'rows', v_rows,
    'next_cursor', case when v_more then v_next else null end);
end;
$$;

comment on function public.list_invoices is
  'Server-side paginated/filtered/searched invoice list. DEFINER; invoices.view at branch scope on every branch returned.';

-- ---------------------------------------------------------------------------
-- get_invoice_print_data — everything the print/PDF screen needs in one call
-- ---------------------------------------------------------------------------
create or replace function public.get_invoice_print_data(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
  v_branch record;
  v_business record;
  v_client jsonb := null;
  v_contact boolean;
begin
  select * into v_inv from public.invoices i where i.id = p_invoice_id and i.deleted_at is null;
  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.view') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select b.name, b.address, b.phone, b.country_code, b.timezone, b.currency
  into v_branch from public.branches b where b.id = v_inv.branch_id;
  select bz.name into v_business from public.businesses bz where bz.id = v_inv.business_id;

  if v_inv.client_id is not null then
    v_contact := public.can(v_inv.business_id, v_inv.branch_id, 'clients.view_contact');
    select jsonb_build_object('id', c.id, 'name', c.full_name,
             'phone', case when v_contact then c.phone_e164 end,
             'email', case when v_contact then c.email::text end)
    into v_client from public.clients c where c.id = v_inv.client_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invoice', jsonb_build_object(
      'id', v_inv.id, 'status', v_inv.status, 'number', v_inv.number, 'currency', v_inv.currency,
      'issued_at', v_inv.issued_at, 'created_at', v_inv.created_at, 'notes', v_inv.notes,
      'bill_to_name', v_inv.bill_to_name, 'appointment_id', v_inv.appointment_id,
      'tax_rate_bp', v_inv.tax_rate_bp, 'tax_number', v_inv.tax_number,
      'subtotal_minor', v_inv.subtotal_minor, 'discount_minor', v_inv.discount_minor,
      'net_minor', v_inv.net_minor, 'tax_minor', v_inv.tax_minor, 'total_minor', v_inv.total_minor)
      || public.invoice_money(v_inv.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', it.id, 'service_id', it.service_id, 'description', it.description,
        'quantity', it.quantity, 'unit_price_minor', it.unit_price_minor,
        'discount_minor', it.discount_minor, 'discount_reason', it.discount_reason,
        'line_net_minor', it.line_net_minor) order by it.sort_order)
      from public.invoice_items it where it.invoice_id = v_inv.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'method', p.method, 'amount_minor', p.amount_minor,
        'paid_at', p.paid_at, 'reverses_payment_id', p.reverses_payment_id,
        'reason', p.reason, 'note', p.note) order by p.paid_at, p.created_at)
      from public.invoice_payments p where p.invoice_id = v_inv.id), '[]'::jsonb),
    'credit_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cn.id, 'number', cn.number, 'issued_at', cn.issued_at, 'reason', cn.reason,
        'net_minor', cn.net_minor, 'tax_minor', cn.tax_minor, 'total_minor', cn.total_minor,
        'tax_rate_bp', cn.tax_rate_bp) order by cn.number_seq)
      from public.credit_notes cn where cn.invoice_id = v_inv.id), '[]'::jsonb),
    'branch', jsonb_build_object('name', v_branch.name, 'address', v_branch.address,
      'phone', v_branch.phone, 'country_code', v_branch.country_code,
      'timezone', v_branch.timezone, 'currency', v_branch.currency),
    'business', jsonb_build_object('name', v_business.name),
    'client', v_client);
end;
$$;

comment on function public.get_invoice_print_data is
  'Invoice + items + payments + credit notes + branch/business/tax + client in one call. Client phone/email only with clients.view_contact. DEFINER, invoices.view at branch scope.';

-- ---------------------------------------------------------------------------
-- Reports: windows are computed PER BRANCH in the branch timezone, converting
-- a LOCAL timestamp to UTC, so DST (23/25-hour days, 30-day-and-an-hour
-- months) is handled by Postgres, not by adding hours.
-- ---------------------------------------------------------------------------
create or replace function public.report_windows(
  p_business_id uuid, p_branch_id uuid, p_as_of timestamptz
)
returns table (
  branch_id uuid, branch_name text, tz text, currency text,
  can_basic boolean, can_rev boolean, period text, w_start timestamptz, w_end timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.name, v.timezone, v.currency, v.cb, v.cr, p.period,
         (case p.period
            when 'today' then ((p_as_of at time zone v.timezone)::date)::timestamp
            else date_trunc('month', p_as_of at time zone v.timezone) end) at time zone v.timezone,
         (case p.period
            when 'today' then ((p_as_of at time zone v.timezone)::date)::timestamp + interval '1 day'
            else date_trunc('month', p_as_of at time zone v.timezone) + interval '1 month' end) at time zone v.timezone
  from (
    select b.id, b.name, b.timezone, b.currency,
           public.invoice_access(b.business_id, b.id, 'reports.view_basic') as cb,
           public.invoice_access(b.business_id, b.id, 'reports.view_revenue') as cr
    from public.branches b
    where b.business_id = p_business_id and b.deleted_at is null
      and (p_branch_id is null or b.id = p_branch_id)
  ) v
  cross join (values ('today'), ('month')) as p(period)
  where v.cb or v.cr;
$$;
revoke all on function public.report_windows(uuid, uuid, timestamptz) from anon, authenticated, public;

-- get_basic_report: today + this month. Revenue is per CURRENCY (never summed
-- across currencies). Counts need reports.view_basic, revenue needs
-- reports.view_revenue, each checked per branch; a branch the caller lacks a
-- permission for simply contributes nothing to that part.
--   revenue (issued invoices only):
--     invoiced_minor = totals of invoices issued in the window
--     credited_minor = credit notes issued in the window
--     net_revenue_minor = (invoiced net - credited net), i.e. EXCLUDING tax
--     tax_minor = invoiced tax - credited tax
--     collected_minor = payments received - reversals, by paid_at in the window
--   p_as_of is a test seam (defaults to now()); it changes nothing about access.
create or replace function public.get_basic_report(
  p_business_id uuid,
  p_branch_id uuid default null,
  p_as_of timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of, now());
  v_any boolean;
  v_has_rev boolean;
  v_has_basic boolean;
  v_branches jsonb;
  v_rev jsonb;
  v_appt jsonb;
  v_top jsonb;
begin
  select count(*) > 0, coalesce(bool_or(w.can_rev), false), coalesce(bool_or(w.can_basic), false)
  into v_any, v_has_rev, v_has_basic
  from public.report_windows(p_business_id, p_branch_id, v_as_of) w;
  if not v_any then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'branch_id', t.branch_id, 'name', t.branch_name, 'timezone', t.tz, 'currency', t.currency,
      'today_start', t.w_start, 'today_end', t.w_end,
      'month_start', m.w_start, 'month_end', m.w_end) order by t.branch_name, t.branch_id), '[]'::jsonb)
  into v_branches
  from public.report_windows(p_business_id, p_branch_id, v_as_of) t
  join public.report_windows(p_business_id, p_branch_id, v_as_of) m
    on m.branch_id = t.branch_id and m.period = 'month'
  where t.period = 'today';

  if v_has_rev then
    select coalesce(jsonb_object_agg(g.period, g.arr), '{}'::jsonb) into v_rev
    from (
      select u.period, jsonb_agg(jsonb_build_object(
          'currency', u.currency,
          'invoice_count', u.inv_cnt,
          'invoiced_minor', u.invoiced,
          'credited_minor', u.cred,
          'tax_minor', u.inv_tax - u.cred_tax,
          'net_revenue_minor', u.inv_net - u.cred_net,
          'collected_minor', u.coll) order by u.currency) as arr
      from (
        select x.period, x.currency, sum(x.inv_cnt)::int as inv_cnt, sum(x.invoiced)::bigint as invoiced,
               sum(x.inv_tax)::bigint as inv_tax, sum(x.inv_net)::bigint as inv_net,
               sum(x.cred)::bigint as cred, sum(x.cred_tax)::bigint as cred_tax,
               sum(x.cred_net)::bigint as cred_net, sum(x.coll)::bigint as coll
        from (
          select w.period, i.currency, 1 as inv_cnt, i.total_minor as invoiced, i.tax_minor as inv_tax,
                 i.net_minor as inv_net, 0::bigint as cred, 0::bigint as cred_tax, 0::bigint as cred_net,
                 0::bigint as coll
          from public.report_windows(p_business_id, p_branch_id, v_as_of) w
          join public.invoices i on i.branch_id = w.branch_id and i.status = 'issued'
            and i.deleted_at is null and i.issued_at >= w.w_start and i.issued_at < w.w_end
          where w.can_rev
          union all
          select w.period, c.currency, 0, 0::bigint, 0::bigint, 0::bigint,
                 c.total_minor, c.tax_minor, c.net_minor, 0::bigint
          from public.report_windows(p_business_id, p_branch_id, v_as_of) w
          join public.credit_notes c on c.branch_id = w.branch_id
            and c.issued_at >= w.w_start and c.issued_at < w.w_end
          where w.can_rev
          union all
          select w.period, p.currency, 0, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
                 case when p.kind = 'payment' then p.amount_minor else -p.amount_minor end
          from public.report_windows(p_business_id, p_branch_id, v_as_of) w
          join public.invoice_payments p on p.branch_id = w.branch_id
            and p.paid_at >= w.w_start and p.paid_at < w.w_end
          where w.can_rev
        ) x
        group by x.period, x.currency
      ) u
      group by u.period
    ) g;
  end if;

  if v_has_basic then
    select coalesce(jsonb_object_agg(s.period, s.obj), '{}'::jsonb) into v_appt
    from (
      select c.period,
             jsonb_build_object('total', sum(c.n)::int) || jsonb_object_agg(c.status, c.n) as obj
      from (
        select w.period, a.status::text as status, count(*)::int as n
        from public.report_windows(p_business_id, p_branch_id, v_as_of) w
        join public.appointments a on a.branch_id = w.branch_id and a.deleted_at is null
          and a.starts_at >= w.w_start and a.starts_at < w.w_end
        where w.can_basic
        group by w.period, a.status
      ) c
      group by c.period
    ) s;

    with wins as (select * from public.report_windows(p_business_id, p_branch_id, v_as_of)),
    cnt as (
      select w.period, a.service_id, count(*)::int as n
      from wins w
      join public.appointments a on a.branch_id = w.branch_id and a.deleted_at is null
        and a.status = 'completed' and a.starts_at >= w.w_start and a.starts_at < w.w_end
      where w.can_basic
      group by w.period, a.service_id
    ),
    ranked as (
      select c.period, c.service_id, c.n, s.name,
             row_number() over (partition by c.period order by c.n desc, s.name, c.service_id) as rn
      from cnt c join public.services s on s.id = c.service_id
    ),
    rev as (
      select w.period, it.service_id, i.currency, sum(it.line_net_minor)::bigint as net
      from wins w
      join public.invoices i on i.branch_id = w.branch_id and i.status = 'issued'
        and i.deleted_at is null and i.issued_at >= w.w_start and i.issued_at < w.w_end
      join public.invoice_items it on it.invoice_id = i.id and it.service_id is not null
      where w.can_rev
      group by w.period, it.service_id, i.currency
    )
    select coalesce(jsonb_object_agg(x.period, x.arr), '{}'::jsonb) into v_top
    from (
      select r.period, jsonb_agg(jsonb_build_object(
          'service_id', r.service_id, 'name', r.name, 'completed_appointments', r.n,
          'revenue', case when v_has_rev then coalesce((
              select jsonb_agg(jsonb_build_object('currency', rv.currency, 'net_minor', rv.net)
                               order by rv.currency)
              from rev rv where rv.period = r.period and rv.service_id = r.service_id), '[]'::jsonb)
            end) order by r.rn) as arr
      from ranked r where r.rn <= 5
      group by r.period
    ) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'as_of', v_as_of,
    'branches', v_branches,
    'revenue', case when v_has_rev then jsonb_build_object(
        'today', coalesce(v_rev->'today', '[]'::jsonb), 'month', coalesce(v_rev->'month', '[]'::jsonb)) end,
    'appointments', case when v_has_basic then jsonb_build_object(
        'today', coalesce(v_appt->'today', jsonb_build_object('total', 0)),
        'month', coalesce(v_appt->'month', jsonb_build_object('total', 0))) end,
    'top_services', case when v_has_basic then jsonb_build_object(
        'today', coalesce(v_top->'today', '[]'::jsonb), 'month', coalesce(v_top->'month', '[]'::jsonb)) end);
end;
$$;

comment on function public.get_basic_report is
  'Today + this month per branch timezone: revenue per currency (reports.view_revenue), appointment counts by status and top services (reports.view_basic). DEFINER, explicit per-branch checks. Only issued invoices count.';

revoke all on function public.list_invoices(uuid, uuid, public.invoice_status, text, uuid, date, date, text, integer, timestamptz, uuid) from anon, public;
revoke all on function public.get_invoice_print_data(uuid) from anon, public;
revoke all on function public.get_basic_report(uuid, uuid, timestamptz) from anon, public;
grant execute on function public.list_invoices(uuid, uuid, public.invoice_status, text, uuid, date, date, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_invoice_print_data(uuid) to authenticated;
grant execute on function public.get_basic_report(uuid, uuid, timestamptz) to authenticated;
