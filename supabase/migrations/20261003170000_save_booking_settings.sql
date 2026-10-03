-- Phase 3: save_booking_settings — the settings write path, with the
-- people_per_slot downgrade guard.
--
-- WHY AN RPC AT ALL
-- -----------------
-- A plain UPDATE through RLS would be enough for most of these columns. One is
-- not: **lowering `people_per_slot` can leave already-booked slots
-- overbooked**, and that needs a check the policy cannot express.
--
-- THE GUARD (decided with the user, 2026-10-03)
-- ---------------------------------------------
-- * Old rows are NEVER touched. A customer who already has a place keeps it.
--   Their `is_exclusive` stays false, so the exclusion constraint continues to
--   ignore them — the booking remains valid and visible.
-- * The change is blocked ONLY when a **future** slot already holds more
--   bookings than the new limit would allow. Past slots cannot be fixed and
--   blocking on them would make the setting permanently unchangeable.
-- * Otherwise the change is allowed.
-- * The refusal carries a reason code AND the offending slot, so the UI can say
--   "Tuesday 14:00 has 3 bookings; the new limit is 1" instead of a dead end.
--
-- Raising `people_per_slot` is always safe and is never blocked.
--
-- RETURN SHAPE: jsonb, like create_booking
--   {"ok": true}
--   {"ok": false, "code": "people_per_slot_conflict",
--    "conflict": {"starts_at": ..., "booked": 3, "new_limit": 1, ...}}
--   {"ok": false, "code": "forbidden" | "unknown_branch" | "invalid_value"}
--
-- SECURITY INVOKER, deliberately: the three Phase 2 schedule RPCs set the
-- precedent (see context/_database.md). RLS stays the boundary, so the
-- `settings.booking` policy on `booking_settings` is what authorises the write;
-- the explicit permission check below only exists to return a clear
-- `forbidden` instead of a silent zero-row update.

create or replace function public.save_booking_settings(
  p_branch_id uuid,
  -- Only the keys present are changed, so the UI can save one section at a
  -- time without having to send every column back.
  p_settings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_tz text;
  v_new_people integer;
  v_old_people integer;
  v_conflict record;
  v_rows integer;
begin
  select b.business_id, b.timezone into v_business_id, v_tz
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_branch');
  end if;

  -- RLS would refuse the UPDATE anyway; this turns a confusing no-op into a
  -- clear answer (same reasoning as the Phase 2 replace_* RPCs).
  if not public.can(v_business_id, p_branch_id, 'settings.booking') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid_value');
  end if;

  select bs.people_per_slot into v_old_people
  from public.booking_settings bs
  where bs.branch_id = p_branch_id and bs.deleted_at is null;

  if v_old_people is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_branch');
  end if;

  -- =========================================================================
  -- The people_per_slot guard
  -- =========================================================================
  if p_settings ? 'people_per_slot' then
    v_new_people := (p_settings->>'people_per_slot')::integer;

    if v_new_people is null or v_new_people < 1 or v_new_people > 100 then
      return jsonb_build_object('ok', false, 'code', 'invalid_value',
                                'field', 'people_per_slot');
    end if;

    -- Only a DOWNGRADE can conflict.
    if v_new_people < v_old_people then
      -- Find the worst offending FUTURE slot: the one with the most bookings.
      -- Grouped by the three things that define a shared slot in the engine's
      -- counting rule (staff + service + exact start instant).
      select a.starts_at, a.staff_id, a.service_id, count(*) as booked
        into v_conflict
      from public.appointments a
      where a.branch_id = p_branch_id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        -- FUTURE only: a past slot cannot be fixed, and blocking on it would
        -- freeze this setting forever.
        and a.starts_at > now()
      group by a.starts_at, a.staff_id, a.service_id
      having count(*) > v_new_people
      order by count(*) desc, a.starts_at
      limit 1;

      if v_conflict.starts_at is not null then
        return jsonb_build_object(
          'ok', false,
          'code', 'people_per_slot_conflict',
          'conflict', jsonb_build_object(
            'starts_at', v_conflict.starts_at,
            -- The local date and time, so the UI can name the slot without
            -- redoing the timezone conversion.
            'local_date', (v_conflict.starts_at at time zone v_tz)::date,
            'local_minute',
              extract(hour from (v_conflict.starts_at at time zone v_tz))::integer * 60
            + extract(minute from (v_conflict.starts_at at time zone v_tz))::integer,
            'booked', v_conflict.booked,
            'new_limit', v_new_people,
            'service_name', (select s.name from public.services s where s.id = v_conflict.service_id),
            'staff_name', (select sp.display_name from public.staff_profiles sp where sp.id = v_conflict.staff_id)
          )
        );
      end if;
    end if;
  end if;

  -- =========================================================================
  -- The update
  -- =========================================================================
  -- Every column is coalesced against its current value, so an absent key means
  -- "leave it alone". The CHECK constraints on the table remain the authority on
  -- ranges; this function only adds the rule they cannot express.
  --
  -- Old appointment rows are deliberately NOT rewritten: `is_exclusive` is a
  -- snapshot of the rule at booking time and changing it retroactively could
  -- make the exclusion constraint refuse rows that are already committed.
  update public.booking_settings bs
  set
    online_booking_enabled = coalesce((p_settings->>'online_booking_enabled')::boolean, bs.online_booking_enabled),
    staff_choice           = coalesce((p_settings->>'staff_choice')::public.staff_choice_mode, bs.staff_choice),
    slot_display           = coalesce((p_settings->>'slot_display')::public.slot_display_mode, bs.slot_display),
    confirmation           = coalesce((p_settings->>'confirmation')::public.booking_confirmation_mode, bs.confirmation),
    show_prices            = coalesce((p_settings->>'show_prices')::boolean, bs.show_prices),
    slot_interval          = coalesce((p_settings->>'slot_interval')::public.slot_interval_mode, bs.slot_interval),
    buffer_minutes         = coalesce((p_settings->>'buffer_minutes')::integer, bs.buffer_minutes),
    minimum_notice_minutes = coalesce((p_settings->>'minimum_notice_minutes')::integer, bs.minimum_notice_minutes),
    booking_window_days    = coalesce((p_settings->>'booking_window_days')::integer, bs.booking_window_days),
    customer_can_cancel    = coalesce((p_settings->>'customer_can_cancel')::boolean, bs.customer_can_cancel),
    cancel_cutoff_hours    = coalesce((p_settings->>'cancel_cutoff_hours')::integer, bs.cancel_cutoff_hours),
    use_resources          = coalesce((p_settings->>'use_resources')::boolean, bs.use_resources),
    people_per_slot        = coalesce((p_settings->>'people_per_slot')::integer, bs.people_per_slot)
  where bs.branch_id = p_branch_id and bs.deleted_at is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- RLS refused after all (the permission check above passed but the policy
    -- did not, e.g. the business went inactive mid-request).
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.save_booking_settings is
  'Saves booking settings. Only keys present in p_settings change. Blocks LOWERING people_per_slot when a FUTURE slot already holds more bookings than the new limit, returning the offending slot so the UI can explain. Never rewrites existing appointments. SECURITY INVOKER: RLS stays the boundary.';

-- Callable by the dashboard. RLS and the explicit check both apply.
revoke all on function public.save_booking_settings(uuid, jsonb) from public;
revoke execute on function public.save_booking_settings(uuid, jsonb) from anon;
grant execute on function public.save_booking_settings(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- branch_is_bookable: "may the booking link be shown as active?"
-- ---------------------------------------------------------------------------
-- The user's requirement (2026-10-03): the booking link/page must not be
-- presented as active until the branch actually has hours and at least one
-- bookable service + staff. Otherwise the page loads and offers nothing, which
-- reads as broken software rather than as unfinished setup.
--
-- One function so the settings screen, the website block and the public page
-- all answer the question the same way.
create or replace function public.branch_is_bookable(p_branch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select br.id, br.business_id
    from public.branches br
    where br.id = p_branch_id and br.deleted_at is null
  ),
  checks as (
    select
      (select online_booking_enabled from public.booking_settings bs
        where bs.branch_id = p_branch_id and bs.deleted_at is null) as enabled,
      exists (select 1 from public.branch_hours bh where bh.branch_id = p_branch_id) as has_hours,
      exists (
        select 1
        from public.service_branches sb
        join public.services s on s.id = sb.service_id
        where sb.branch_id = p_branch_id and sb.enabled
          and s.deleted_at is null and s.is_active and s.is_bookable_online
      ) as has_service,
      exists (
        select 1
        from public.staff_branches stb
        join public.staff_profiles sp on sp.id = stb.staff_id
        where stb.branch_id = p_branch_id
          and sp.deleted_at is null and sp.is_active and sp.is_bookable_online
      ) as has_staff,
      -- A service and a staff member are not enough: somebody must actually
      -- perform a service that is offered here.
      exists (
        select 1
        from public.service_branches sb
        join public.services s on s.id = sb.service_id
        join public.service_staff ss on ss.service_id = s.id
        join public.staff_branches stb on stb.staff_id = ss.staff_id and stb.branch_id = p_branch_id
        join public.staff_profiles sp on sp.id = ss.staff_id
        where sb.branch_id = p_branch_id and sb.enabled
          and s.deleted_at is null and s.is_active and s.is_bookable_online
          and sp.deleted_at is null and sp.is_active and sp.is_bookable_online
      ) as has_staffed_service
    from b
  )
  select jsonb_build_object(
    'bookable', coalesce(enabled, false) and has_hours and has_staffed_service,
    -- Every unmet requirement, so the UI can list them rather than showing one
    -- at a time.
    'reasons', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select 'booking_disabled' as r where not coalesce(enabled, false)
        union all select 'no_branch_hours' where not has_hours
        union all select 'no_bookable_service' where not has_service
        union all select 'no_bookable_staff' where not has_staff
        union all select 'no_staffed_service'
          where has_service and has_staff and not has_staffed_service
      ) x
    )
  )
  from checks;
$$;

comment on function public.branch_is_bookable is
  'Whether the branch can actually take an online booking, plus every unmet reason (booking_disabled, no_branch_hours, no_bookable_service, no_bookable_staff, no_staffed_service). The settings screen, the website block and the public page all use this so they agree.';

revoke all on function public.branch_is_bookable(uuid) from public;
revoke execute on function public.branch_is_bookable(uuid) from anon;
grant execute on function public.branch_is_bookable(uuid) to authenticated;
grant execute on function public.branch_is_bookable(uuid) to service_role;
