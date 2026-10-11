-- branch_is_bookable gains the reason `no_staff_hours`.
-- Found in manual testing: a service + staff member linked correctly but the staff
-- member had no working hours, so get_free_slots (no fallback to branch hours) returned
-- nothing and the public page said "No times available" while setup looked complete.
-- Now such a branch is reported as not bookable, with its own reason, so the Booking
-- settings warning card can say so. Only the function body changes.
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
      ) as has_staffed_service,
      -- get_free_slots intersects branch hours with the STAFF member's own working
      -- hours and has no fallback, so a performer with no staff_working_hours row at
      -- this branch yields zero slots whatever else is set.
      exists (
        select 1
        from public.service_branches sb
        join public.services s on s.id = sb.service_id
        join public.service_staff ss on ss.service_id = s.id
        join public.staff_branches stb on stb.staff_id = ss.staff_id and stb.branch_id = p_branch_id
        join public.staff_profiles sp on sp.id = ss.staff_id
        join public.staff_working_hours wh on wh.staff_id = sp.id and wh.branch_id = p_branch_id
        where sb.branch_id = p_branch_id and sb.enabled
          and s.deleted_at is null and s.is_active and s.is_bookable_online
          and sp.deleted_at is null and sp.is_active and sp.is_bookable_online
      ) as has_staff_hours
    from b
  )
  select jsonb_build_object(
    'bookable', coalesce(enabled, false) and has_hours and has_staffed_service and has_staff_hours,
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
        union all select 'no_staff_hours'
          where has_staffed_service and not has_staff_hours
      ) x
    )
  )
  from checks;
$$;

comment on function public.branch_is_bookable is
  'Whether the branch can actually take an online booking, plus every unmet reason (booking_disabled, no_branch_hours, no_bookable_service, no_bookable_staff, no_staffed_service). The settings screen, the website block and the public page all use this so they agree.';

comment on function public.branch_is_bookable is
  'Whether the branch can actually take an online booking, plus every unmet reason (booking_disabled, no_branch_hours, no_bookable_service, no_bookable_staff, no_staffed_service, no_staff_hours).';
