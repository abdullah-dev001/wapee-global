-- Phase 11B: list_invoices with the payment filter took 4 s at 20,000 invoices (it computed invoice_money() for every
-- invoice before it could filter). The payment state is now stored in a side table, kept in step by triggers on the
-- three places that can change it (the invoice itself, a payment / reversal row, a credit note), so the filter is an
-- index look-up. A side table (not a column on `invoices`) because issued invoices are immutable. invoice_money()
-- stays the single definition of the state; the list shows the full figures for the page rows only.

create table public.invoice_payment_state (
  invoice_id uuid primary key references public.invoices (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  payment_status text check (payment_status in ('pending', 'partial', 'paid', 'credited'))
);
create index invoice_payment_state_business_idx on public.invoice_payment_state (business_id, payment_status);
alter table public.invoice_payment_state enable row level security;
revoke all on public.invoice_payment_state from public, anon, authenticated;
comment on table public.invoice_payment_state is
  'Denormalised invoice_money(id)->payment_status (null for drafts). Maintained by triggers; read only by list_invoices (DEFINER). No policy, no grants.';

create or replace function public.refresh_invoice_payment_state(p_invoice_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.invoice_payment_state (invoice_id, business_id, payment_status)
  select i.id, i.business_id, (public.invoice_money(i.id) ->> 'payment_status')
  from public.invoices i where i.id = p_invoice_id
  on conflict (invoice_id) do update set payment_status = excluded.payment_status
$$;
revoke all on function public.refresh_invoice_payment_state(uuid) from public, anon, authenticated;

create or replace function public.trg_refresh_invoice_payment_state()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'invoices' then
    perform public.refresh_invoice_payment_state(new.id);
  else
    perform public.refresh_invoice_payment_state(new.invoice_id);
  end if;
  return null;
end;
$$;
revoke all on function public.trg_refresh_invoice_payment_state() from public, anon, authenticated;

create trigger invoices_payment_state after insert or update on public.invoices
  for each row execute function public.trg_refresh_invoice_payment_state();
create trigger invoice_payments_payment_state after insert on public.invoice_payments
  for each row execute function public.trg_refresh_invoice_payment_state();
create trigger credit_notes_payment_state after insert on public.credit_notes
  for each row execute function public.trg_refresh_invoice_payment_state();

-- backfill (the migration runs once; new rows are covered by the triggers)
insert into public.invoice_payment_state (invoice_id, business_id, payment_status)
select i.id, i.business_id, (public.invoice_money(i.id) ->> 'payment_status') from public.invoices i
on conflict (invoice_id) do nothing;

create or replace function public.list_invoices(p_business_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_status invoice_status DEFAULT NULL::invoice_status, p_payment_status text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           st.payment_status as ps
    from public.invoices i
    join vis on vis.id = i.branch_id
    left join public.clients c on c.id = i.client_id
    left join public.invoice_payment_state st on st.invoice_id = i.id
    where i.business_id = p_business_id and i.deleted_at is null
      and (p_status is null or i.status = p_status)
      and (p_client_id is null or i.client_id = p_client_id)
      and (v_search is null or i.number ilike v_search or i.bill_to_name ilike v_search
           or c.full_name ilike v_search)
  ),
  filtered as (
    select * from base b
    where (p_payment_status is null or b.ps = p_payment_status)
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
  from (select pg.*, public.invoice_money(pg.id) as m from page pg) p;

  return jsonb_build_object('ok', true, 'rows', v_rows,
    'next_cursor', case when v_more then v_next else null end);
end;
$function$
;
