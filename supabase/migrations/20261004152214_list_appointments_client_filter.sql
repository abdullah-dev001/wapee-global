-- Phase 4 part B2: the client profile's "visit history" needs server-
-- paginated past appointments for ONE client. `list_appointments` already
-- has branch/staff/status/service/date-range/search filters with keyset
-- pagination; this adds `p_client_id` alongside them rather than
-- re-implementing pagination a second time client-side (asked the user,
-- 2026-10-05).
--
-- Adding a parameter changes the function's signature. The connector
-- declined a combined drop+create in one call (destructive-SQL gate), so
-- this was applied as two separate calls against the live project: first
-- `create or replace` with the new signature (creates a second overload,
-- additive, non-destructive), then a plain `drop function` for the OLD
-- signature once the connector accepted it on its own. Both statements are
-- kept together here because together they are the actual final state —
-- a PL/pgSQL caller with a NAMED but not fully-qualified call (as the test
-- suite has) gets `function ... is not unique` while both overloads exist,
-- so the old one cannot be left behind the way the deprecated
-- `check_appointment_collision` v1 was.

drop function if exists public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid
);

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
  p_cursor_id uuid default null,
  -- NEW: one client's visit history (the client profile screen).
  p_client_id uuid default null
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
      and (p_client_id is null or a.client_id = p_client_id)
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
  'Server-side paginated appointment list (keyset cursor on starts_at,id desc). RLS (appointments_select) is the ONLY scope boundary -- SECURITY INVOKER, p_business_id/p_branch_id/p_client_id are filters, not a bypass. Search matches client name/phone via the existing trgm index. p_client_id added for the client profile''s visit history (Phase 4 part B2).';

revoke all on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid, uuid
) from public;
revoke execute on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid, uuid
) from anon;
grant execute on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- REPLAY FIX (2026-10-11): documentation comments that were edited by hand on the
-- dev database and never written to a migration (see 20261004045901, "applied
-- directly"). Text is dev's, verbatim. Comments only: no behaviour change.
-- ---------------------------------------------------------------------------
comment on function public.list_appointments(
  uuid, uuid, uuid, public.appointment_status, uuid, date, date, text, integer, timestamptz, uuid, uuid
) is
  'Server-side paginated appointment list (keyset cursor on starts_at,id desc). RLS (appointments_select) is the ONLY scope boundary -- SECURITY INVOKER, p_business_id/p_branch_id/p_client_id are filters, not a bypass. Search matches client name/phone via the existing trgm index. p_client_id added for the client profile''s visit history (Phase 4 part B2). The 11-arg overload (no p_client_id) predates this and is superseded -- see Phase 4 part B2 cleanup note.';

comment on function public.business_is_active(uuid) is
  'True while the business may be used: active, or trialing and not yet expired. No cron needed.';

comment on function public.mark_no_show(uuid) is
  'Dashboard no-show. confirmed -> no_show only. Terminal: never reopens. SECURITY DEFINER, can()/scope check is the boundary.';

comment on function public.approve_appointment(uuid) is
  'pending -> confirmed ONLY (checked directly, not via is_allowed_appointment_transition, to avoid becoming a side door into the no_show/completed -> confirmed reopen path, which has its own Owner/Manager-only + invoice_id guard in reopen_appointment). Needs appointments.approve. SECURITY DEFINER, can()/scope check is the boundary.';

comment on column public.business_members.invite_token_hash is
  'SHA-256 of the invite token. The raw token exists only in the emailed link.';

comment on table public.appointment_status_transitions is
  'The ONE place every allowed appointment status change is defined. cancelled/completed/no_show are terminal (no row with them as from_status) -- no reopen, ever (agreed with the user 2026-10-05). A correction is a new appointment, not a reopened one.';
