-- Feature 11 audit: saving reduced branch opening hours, or adding a holiday
-- closure, had no awareness of existing future appointments at all — the
-- exact same gap `staff_schedule_conflicts`/`staff_time_off_conflicts`
-- (migration 20261024130000) already fixed for a person's own hours/time off.
-- A branch hours change has an even wider blast radius (every staff member at
-- that branch), so it needs the same warn-with-a-count treatment. Decided
-- with the user for Feature 10 and applied the same way here: nothing is
-- deleted or hidden either way, so this warns rather than refuses.

-- ---------------------------------------------------------------------------
-- branch_hours_conflicts: how many future appointments at this branch (ANY
-- staff member) fall OUTSIDE the given candidate weekly opening-hours
-- intervals.
-- ---------------------------------------------------------------------------
create or replace function public.branch_hours_conflicts(
  p_branch_id uuid,
  -- Same shape as replace_branch_hours: [{"day_of_week":1,"start_minute":540,"end_minute":1020}, ...]
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
  where a.branch_id = p_branch_id
    and a.deleted_at is null
    and a.status in ('pending', 'confirmed')
    and a.ends_at > now()
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) iv
      where (iv ->> 'day_of_week')::smallint = extract(dow from (a.starts_at at time zone v_tz))::smallint
        and (extract(hour from (a.starts_at at time zone v_tz)) * 60
             + extract(minute from (a.starts_at at time zone v_tz)))::integer >= (iv ->> 'start_minute')::integer
        and (extract(hour from (a.ends_at at time zone v_tz)) * 60
             + extract(minute from (a.ends_at at time zone v_tz)))::integer <= (iv ->> 'end_minute')::integer
    );
  return v_n;
end $$;
revoke all on function public.branch_hours_conflicts(uuid, jsonb) from public, anon;
grant execute on function public.branch_hours_conflicts(uuid, jsonb) to authenticated;

comment on function public.branch_hours_conflicts(uuid, jsonb) is
  'How many future pending/confirmed appointments at this branch (any staff member) would fall outside the given candidate opening-hours intervals. Read-only; the client shows this as a confirm-and-proceed warning before calling replace_branch_hours, never a hard refusal. Mirrors staff_schedule_conflicts.';

-- ---------------------------------------------------------------------------
-- branch_closure_conflicts: how many future appointments at this branch fall
-- within a candidate closure's inclusive local-date range.
-- ---------------------------------------------------------------------------
create or replace function public.branch_closure_conflicts(
  p_branch_id uuid,
  p_starts_on date,
  p_ends_on date
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
  where a.branch_id = p_branch_id
    and a.deleted_at is null
    and a.status in ('pending', 'confirmed')
    and a.ends_at > now()
    and (a.starts_at at time zone v_tz)::date between p_starts_on and p_ends_on;
  return v_n;
end $$;
revoke all on function public.branch_closure_conflicts(uuid, date, date) from public, anon;
grant execute on function public.branch_closure_conflicts(uuid, date, date) to authenticated;

comment on function public.branch_closure_conflicts(uuid, date, date) is
  'How many future pending/confirmed appointments at this branch fall within a candidate closure''s inclusive local-date range. Same warn-and-proceed use as branch_hours_conflicts.';
