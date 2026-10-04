-- Phase 4 part A: dashboard read RPCs.
--
-- SECURITY INVOKER, unlike the write RPCs. These are pure reads behind RLS,
-- exactly what RLS's Own/Branch/All scoping on `appointments.view` already
-- does correctly (verified by supabase/tests/07) — there is no reason to
-- bypass it, and bypassing it would mean re-deriving the scope rule here
-- instead of trusting the one the policies already enforce.
--
-- SERVER-SIDE EVERYTHING (CLAUDE.md §6): pagination, filters, sort and search
-- all happen here, never "fetch everything and filter in JS".

-- ---------------------------------------------------------------------------
-- list_appointments: keyset-paginated list with filters
-- ---------------------------------------------------------------------------
-- Keyset (starts_at, id), not OFFSET: CLAUDE.md §6 calls for keyset/cursor
-- pagination on a fast-growing list like appointments. Returns one page plus
-- the cursor for the next one; sort is fixed (starts_at desc, id desc) —
-- the one order a calendar-adjacent list actually wants, and fixing it
-- keeps the cursor shape simple (no per-sort cursor encoding).
create or replace function public.list_appointments(
  p_business_id uuid,
  p_branch_id uuid default null,
  p_staff_id uuid default null,
  p_status public.appointment_status default null,
  p_service_id uuid default null,
  p_from_date date default null,
  p_to_date date default null,
  -- Matched against the client's name or phone, server-side (CLAUDE.md §6:
  -- debounced 300ms / min 2 chars is the CALLER's job; this just runs the
  -- query). ilike with the trgm index already on clients.full_name/phone.
  p_search text default null,
  p_limit integer default 20,
  -- Cursor from the previous page's last row: NULL for page 1.
  p_cursor_starts_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with v_limit as (
    select least(coalesce(p_limit, 20), 100) as n
  ),
  page as (
    select a.id, a.branch_id, a.starts_at, a.ends_at, a.status, a.source,
           a.service_id, s.name as service_name,
           a.staff_id, sp.display_name as staff_name,
           a.client_id, c.full_name as client_name, c.phone_e164 as client_phone,
           a.price_minor, a.invoice_id,
           -- One extra row fetched (limit n+1) so "is there a next page" costs
           -- no second query; row_number tells the two groups apart below.
           row_number() over (order by a.starts_at desc, a.id desc) as rn
    from public.appointments a
    join public.services s on s.id = a.service_id
    left join public.staff_profiles sp on sp.id = a.staff_id
    join public.clients c on c.id = a.client_id
    where a.business_id = p_business_id
      and a.deleted_at is null
      and (p_branch_id is null or a.branch_id = p_branch_id)
      and (p_staff_id is null or a.staff_id = p_staff_id)
      and (p_status is null or a.status = p_status)
      and (p_service_id is null or a.service_id = p_service_id)
      and (p_from_date is null or a.starts_at >= p_from_date::timestamptz)
      and (p_to_date is null or a.starts_at < (p_to_date + 1)::timestamptz)
      and (p_search is null or char_length(btrim(p_search)) < 2 or (
        c.full_name ilike '%' || p_search || '%'
        or c.phone_e164 ilike '%' || p_search || '%'
      ))
      and (
        p_cursor_starts_at is null
        or a.starts_at < p_cursor_starts_at
        or (a.starts_at = p_cursor_starts_at and a.id < p_cursor_id)
      )
    order by a.starts_at desc, a.id desc
    limit (select n + 1 from v_limit)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'branch_id', branch_id, 'starts_at', starts_at, 'ends_at', ends_at,
        'status', status, 'source', source, 'service_id', service_id,
        'service_name', service_name, 'staff_id', staff_id, 'staff_name', staff_name,
        'client_id', client_id, 'client_name', client_name, 'client_phone', client_phone,
        'price_minor', price_minor, 'invoice_id', invoice_id
      ) order by starts_at desc, id desc)
      from page, v_limit
      where page.rn <= v_limit.n
    ), '[]'::jsonb),
    'next_cursor', (
      select jsonb_build_object('starts_at', page.starts_at, 'id', page.id)
      from page, v_limit
      where page.rn = v_limit.n
        and exists (select 1 from page p2, v_limit vl where p2.rn = vl.n + 1)
    )
  )
  from v_limit
  limit 1;
$$;

comment on function public.list_appointments is
  'Server-side paginated appointment list (keyset cursor on starts_at,id desc). RLS (appointments_select) is the ONLY scope boundary -- SECURITY INVOKER, p_business_id/p_branch_id are filters, not a bypass. Search matches client name/phone via the existing trgm index.';

revoke all on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid
) from public;
revoke execute on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid
) from anon;
grant execute on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- get_calendar_appointments: a branch + date range + optional staff list
-- ---------------------------------------------------------------------------
-- Day boundaries in the BRANCH timezone, not UTC — a day-view calendar for a
-- New York branch must show "today" as New York's today, not UTC's. Returns
-- only the columns a calendar grid needs (CLAUDE.md §6: no select('*')).
create or replace function public.get_calendar_appointments(
  p_business_id uuid,
  p_branch_id uuid,
  p_from_date date,
  p_to_date date,
  -- NULL = every staff member the caller's RLS scope allows.
  p_staff_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.branches where id = p_branch_id;
  if v_tz is null then
    return jsonb_build_object('rows', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'timezone', v_tz,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'starts_at', a.starts_at,
        'ends_at', a.ends_at,
        'status', a.status,
        'staff_id', a.staff_id,
        'staff_name', sp.display_name,
        'service_id', a.service_id,
        'service_name', s.name,
        'client_id', a.client_id,
        'client_name', c.full_name
      ) order by a.starts_at)
      from public.appointments a
      join public.services s on s.id = a.service_id
      left join public.staff_profiles sp on sp.id = a.staff_id
      join public.clients c on c.id = a.client_id
      where a.business_id = p_business_id
        and a.branch_id = p_branch_id
        and a.deleted_at is null
        and a.status not in ('cancelled')
        -- Day boundaries converted FROM the branch's local dates, so a date
        -- range always means local calendar days at that branch.
        and a.starts_at >= (p_from_date::timestamp at time zone v_tz)
        and a.starts_at < ((p_to_date + 1)::timestamp at time zone v_tz)
        and (p_staff_ids is null or a.staff_id = any(p_staff_ids))
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_calendar_appointments is
  'Calendar-range query: branch + date range + optional staff filter, day boundaries in the BRANCH timezone. RLS is the scope boundary (SECURITY INVOKER). Only the columns a calendar grid needs.';

revoke all on function public.get_calendar_appointments(uuid, uuid, date, date, uuid[]) from public;
revoke execute on function public.get_calendar_appointments(uuid, uuid, date, date, uuid[]) from anon;
grant execute on function public.get_calendar_appointments(uuid, uuid, date, date, uuid[]) to authenticated;
