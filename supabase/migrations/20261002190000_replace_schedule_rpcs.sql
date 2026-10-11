-- Make saving a week of hours transactional.
--
-- The client used to DELETE the week and then INSERT the new rows as two
-- separate requests. A failure between them left the week empty — visible and
-- re-editable, but wrong. A function body is one transaction, so either the whole
-- week is replaced or nothing changes.
--
-- Why delete-then-insert at all, rather than diffing: the exclusion constraints
-- make an in-place edit order-dependent. Moving 09:00–17:00 to 10:00–18:00 would
-- transiently overlap itself and be refused. Clearing first sidesteps that, and
-- inside one transaction it is invisible to everyone else.
--
-- **These are SECURITY INVOKER** (the default), so RLS still applies to every row
-- they touch — the policies remain the boundary. The explicit permission check at
-- the top is there to return a clear error instead of a silent "0 rows changed",
-- and to refuse the whole call before deleting anything.

-- ---------------------------------------------------------------------------
-- replace_staff_working_hours
-- ---------------------------------------------------------------------------
create or replace function public.replace_staff_working_hours(
  p_staff_id uuid,
  p_branch_id uuid,
  -- [{"day_of_week":1,"start_minute":540,"end_minute":1020}, ...]
  p_intervals jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select business_id into v_business_id
  from public.staff_profiles
  where id = p_staff_id and deleted_at is null;

  if v_business_id is null then
    raise exception 'Unknown staff member' using errcode = '22023';
  end if;

  -- The branch must belong to the same business as the staff member.
  if not exists (
    select 1 from public.branches
    where id = p_branch_id and business_id = v_business_id and deleted_at is null
  ) then
    raise exception 'Unknown branch' using errcode = '22023';
  end if;

  -- Same rule as the RLS policy: manage anyone, or manage_schedule for yourself.
  -- Checked here so the caller gets a real error rather than a silent no-op.
  if not (
    public.can(v_business_id, p_branch_id, 'staff.manage')
    or (public.can(v_business_id, p_branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(p_staff_id))
  ) then
    raise exception 'You do not have permission to change this schedule'
      using errcode = '42501';
  end if;

  -- One transaction from here: the delete and the insert stand or fall together.
  -- RLS still applies to both, so a caller who slipped past the check above
  -- would still be refused row by row.
  delete from public.staff_working_hours
  where staff_id = p_staff_id and branch_id = p_branch_id;

  insert into public.staff_working_hours
    (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select
    p_staff_id,
    p_branch_id,
    v_business_id,
    (entry ->> 'day_of_week')::smallint,
    (entry ->> 'start_minute')::integer,
    (entry ->> 'end_minute')::integer
  from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) as entry;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_staff_working_hours is
  'Replaces one staff member''s working hours at one branch, in a single transaction. SECURITY INVOKER: RLS still applies.';

-- ---------------------------------------------------------------------------
-- replace_staff_breaks
-- ---------------------------------------------------------------------------
create or replace function public.replace_staff_breaks(
  p_staff_id uuid,
  p_branch_id uuid,
  p_intervals jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select business_id into v_business_id
  from public.staff_profiles
  where id = p_staff_id and deleted_at is null;

  if v_business_id is null then
    raise exception 'Unknown staff member' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.branches
    where id = p_branch_id and business_id = v_business_id and deleted_at is null
  ) then
    raise exception 'Unknown branch' using errcode = '22023';
  end if;

  if not (
    public.can(v_business_id, p_branch_id, 'staff.manage')
    or (public.can(v_business_id, p_branch_id, 'staff.manage_schedule')
        and public.is_own_staff_profile(p_staff_id))
  ) then
    raise exception 'You do not have permission to change this schedule'
      using errcode = '42501';
  end if;

  delete from public.staff_breaks
  where staff_id = p_staff_id and branch_id = p_branch_id;

  insert into public.staff_breaks
    (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute, label)
  select
    p_staff_id,
    p_branch_id,
    v_business_id,
    (entry ->> 'day_of_week')::smallint,
    (entry ->> 'start_minute')::integer,
    (entry ->> 'end_minute')::integer,
    entry ->> 'label'
  from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) as entry;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_staff_breaks is
  'Replaces one staff member''s breaks at one branch, in a single transaction. SECURITY INVOKER: RLS still applies.';

-- ---------------------------------------------------------------------------
-- replace_branch_hours
-- ---------------------------------------------------------------------------
create or replace function public.replace_branch_hours(
  p_branch_id uuid,
  p_intervals jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select business_id into v_business_id
  from public.branches
  where id = p_branch_id and deleted_at is null;

  if v_business_id is null then
    raise exception 'Unknown branch' using errcode = '22023';
  end if;

  -- Opening hours are a property of the location, so settings.business —
  -- Owner-only after the 2026-10-02 seed fix.
  if not public.can(v_business_id, p_branch_id, 'settings.business') then
    raise exception 'You do not have permission to change the opening hours'
      using errcode = '42501';
  end if;

  delete from public.branch_hours where branch_id = p_branch_id;

  insert into public.branch_hours
    (branch_id, business_id, day_of_week, start_minute, end_minute)
  select
    p_branch_id,
    v_business_id,
    (entry ->> 'day_of_week')::smallint,
    (entry ->> 'start_minute')::integer,
    (entry ->> 'end_minute')::integer
  from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) as entry;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_branch_hours is
  'Replaces a branch''s opening hours, in a single transaction. SECURITY INVOKER: RLS still applies.';

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants EXECUTE to anon by default, so revoke it explicitly:
-- every one of these refuses an anonymous caller anyway, but the grant should
-- not be there.
-- ---------------------------------------------------------------------------
revoke all on function public.replace_staff_working_hours(uuid, uuid, jsonb) from public;
revoke execute on function public.replace_staff_working_hours(uuid, uuid, jsonb) from anon;
grant execute on function public.replace_staff_working_hours(uuid, uuid, jsonb) to authenticated;

revoke all on function public.replace_staff_breaks(uuid, uuid, jsonb) from public;
revoke execute on function public.replace_staff_breaks(uuid, uuid, jsonb) from anon;
grant execute on function public.replace_staff_breaks(uuid, uuid, jsonb) to authenticated;

revoke all on function public.replace_branch_hours(uuid, jsonb) from public;
revoke execute on function public.replace_branch_hours(uuid, jsonb) from anon;
grant execute on function public.replace_branch_hours(uuid, jsonb) to authenticated;
