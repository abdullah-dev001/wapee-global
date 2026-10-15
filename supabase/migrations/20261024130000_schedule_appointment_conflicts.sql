-- Feature 10 audit: saving reduced working hours, or booking new time off, had
-- no awareness of existing future appointments at all. A future (pending or
-- confirmed) appointment outside the new hours was never deleted or hidden —
-- it still shows on the Calendar, shaded as closed — but nothing ever told the
-- person making the change that it happened. Decided with the user: warn with
-- a count and let them proceed (not a hard refusal like archive_staff/
-- archive_branch; a schedule edit is common and nothing is actually lost).
--
-- Two small read-only check functions, called by the client right before
-- saving so it can show a confirm dialog with the count. Both are STABLE,
-- SECURITY DEFINER (same posture as staff_archive_blockers: the caller may not
-- have direct access to every row these need to join), authenticated only.

-- ---------------------------------------------------------------------------
-- staff_schedule_conflicts: how many future appointments fall OUTSIDE the
-- given candidate set of weekly working-hours intervals, at this branch.
-- ---------------------------------------------------------------------------
create or replace function public.staff_schedule_conflicts(
  p_staff_id uuid,
  p_branch_id uuid,
  -- Same shape as replace_staff_working_hours: [{"day_of_week":1,"start_minute":540,"end_minute":1020}, ...]
  p_intervals jsonb
)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_n integer;
begin
  select b.timezone into v_tz from public.branches b where b.id = p_branch_id;
  if v_tz is null then
    return 0;
  end if;

  select count(*) into v_n
  from public.appointments a
  where a.staff_id = p_staff_id
    and a.branch_id = p_branch_id
    and a.deleted_at is null
    and a.status in ('pending', 'confirmed')
    and a.ends_at > now()
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) iv
      where (iv ->> 'day_of_week')::smallint = extract(dow from (a.starts_at at time zone v_tz))::smallint
        -- The appointment must fit ENTIRELY inside a working interval, not just start inside it.
        and (extract(hour from (a.starts_at at time zone v_tz)) * 60
             + extract(minute from (a.starts_at at time zone v_tz)))::integer >= (iv ->> 'start_minute')::integer
        and (extract(hour from (a.ends_at at time zone v_tz)) * 60
             + extract(minute from (a.ends_at at time zone v_tz)))::integer <= (iv ->> 'end_minute')::integer
    );
  return v_n;
end $$;
revoke all on function public.staff_schedule_conflicts(uuid, uuid, jsonb) from public, anon;
grant execute on function public.staff_schedule_conflicts(uuid, uuid, jsonb) to authenticated;

comment on function public.staff_schedule_conflicts(uuid, uuid, jsonb) is
  'How many of this staff member''s future pending/confirmed appointments at this branch would fall outside the given candidate working-hours intervals. Read-only; the client shows this as a confirm-and-proceed warning before calling replace_staff_working_hours, never a hard refusal.';

-- ---------------------------------------------------------------------------
-- staff_time_off_conflicts: how many future appointments overlap a candidate
-- time-off range.
-- ---------------------------------------------------------------------------
create or replace function public.staff_time_off_conflicts(
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.appointments a
  where a.staff_id = p_staff_id
    and a.deleted_at is null
    and a.status in ('pending', 'confirmed')
    and a.ends_at > now()
    and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
$$;
revoke all on function public.staff_time_off_conflicts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_time_off_conflicts(uuid, timestamptz, timestamptz) to authenticated;

comment on function public.staff_time_off_conflicts(uuid, timestamptz, timestamptz) is
  'How many of this staff member''s future pending/confirmed appointments overlap a candidate time-off range. Read-only, same warn-and-proceed use as staff_schedule_conflicts.';
