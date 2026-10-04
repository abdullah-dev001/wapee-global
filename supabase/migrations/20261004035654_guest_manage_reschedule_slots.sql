-- Phase 3 step 6 (cont.): slots for the guest reschedule screen.
--
-- THE GAP
-- -------
-- Reschedule needs free slots for the guest's EXISTING service/staff/branch,
-- but the public `get_slots` Edge Function takes `slug` + `service_id`, and the
-- manage flow only ever has a TOKEN — `get_booking` deliberately returns
-- `service_name`/`staff_name` (strings, for privacy), never the ids. There is
-- no way to call `get_slots` from the manage page without handing a guest
-- holding just a token the branch/service/staff ids, which is exactly what
-- booking-public-api.md's "a slot never carries a resource id" posture rules
-- out extending further.
--
-- THE FIX
-- -------
-- Resolve the token to its branch/service/staff SERVER-SIDE, inside this
-- function, then call `get_free_slots` with those — mirroring
-- `reschedule_booking` itself, which already does exactly this lookup. The
-- caller never sees an id, only slots.
create or replace function public.get_booking_reschedule_slots(
  p_token text,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row record;
begin
  v_id := public.resolve_manage_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select a.id, a.status, a.branch_id, a.service_id, a.staff_id, br.timezone
  into v_row
  from public.appointments a
  join public.branches br on br.id = a.branch_id
  where a.id = v_id;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Nothing to reschedule TO on a finished booking; same family of failure as
  -- cancel/reschedule itself, reported the same way.
  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_row.status);
  end if;

  return jsonb_build_object(
    'ok', true,
    'timezone', v_row.timezone,
    'slots', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'starts_at', fs.starts_at,
        'local_minute', fs.local_minute,
        'available', true
      ) order by fs.starts_at), '[]'::jsonb)
      from public.get_free_slots(
        v_row.branch_id, v_row.service_id, v_row.staff_id, p_from_date, p_to_date
      ) fs
    )
  );
end;
$$;

comment on function public.get_booking_reschedule_slots is
  'Slots for the guest reschedule screen, resolved from a manage TOKEN rather than ids: looks up the appointment''s own branch/service/staff server-side and calls get_free_slots with those, so no id ever reaches a guest holding just a token. Mirrors reschedule_booking''s own lookup. service_role only.';

revoke all on function public.get_booking_reschedule_slots(text, date, date) from public;
revoke execute on function public.get_booking_reschedule_slots(text, date, date) from anon, authenticated;
grant execute on function public.get_booking_reschedule_slots(text, date, date) to service_role;
