-- Phase 3, step 5: the public booking page needs somewhere to start.
--
-- `get_slots` needs a service_id it does not yet have, and `create_booking` is
-- write-only. Nothing public returns the business/branch display info, the
-- bookable services, the staff list or the published form fields for a slug.
-- This migration adds exactly that, as one read-only function so the Edge
-- Function stays thin (same shape as `resolveBranch` + `get_free_slots`).
--
-- SECURITY DEFINER, STABLE, service_role only — identical posture to
-- `get_free_slots`: it does no permission check because the caller is always
-- the public Edge Function, which has already resolved and authorised the slug.
-- Direct `anon`/`authenticated` access is revoked, same as every other
-- booking-engine function.
create or replace function public.get_booking_page_catalogue(p_branch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'services', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'duration_minutes', s.duration_minutes,
            'price_minor', sb.price_minor,
            'category_name', c.name
          )
          order by c.sort_order nulls last, c.name nulls last, s.sort_order, s.name
        )
        from public.services s
        join public.service_branches sb on sb.service_id = s.id and sb.branch_id = p_branch_id
        left join public.service_categories c on c.id = s.category_id and c.deleted_at is null
        where s.business_id = (select br.business_id from public.branches br where br.id = p_branch_id)
          and s.deleted_at is null
          and s.is_active
          and s.is_bookable_online
          and sb.enabled
      ),
      '[]'::jsonb
    ),
    'staff', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', sp.id, 'display_name', sp.display_name)
          order by sp.sort_order, sp.display_name
        )
        from public.staff_profiles sp
        join public.staff_branches stb on stb.staff_id = sp.id and stb.branch_id = p_branch_id
        where sp.deleted_at is null
          and sp.is_active
          and sp.is_bookable_online
      ),
      '[]'::jsonb
    ),
    -- Which staff perform which bookable service, so the public page can filter
    -- the staff list once a service is chosen rather than offering someone who
    -- does not do that service.
    'service_staff', coalesce(
      (
        select jsonb_agg(distinct jsonb_build_object('service_id', ss.service_id, 'staff_id', ss.staff_id))
        from public.service_staff ss
        join public.staff_profiles sp on sp.id = ss.staff_id
        join public.staff_branches stb on stb.staff_id = sp.id and stb.branch_id = p_branch_id
        join public.services s on s.id = ss.service_id
        join public.service_branches sb on sb.service_id = s.id and sb.branch_id = p_branch_id
        where sp.deleted_at is null and sp.is_active and sp.is_bookable_online
          and s.deleted_at is null and s.is_active and s.is_bookable_online
          and sb.enabled
      ),
      '[]'::jsonb
    ),
    -- The published form, exactly as `create_booking` will validate answers
    -- against: the CURRENT snapshot shape, not the live-edit shape. Fields with
    -- no id applying to a given service are filtered client-side using
    -- applies_to_all_services + service_ids, same as the RPC does.
    'fields', public.build_form_fields_snapshot(
      (select br.business_id from public.branches br where br.id = p_branch_id)
    )
  );
$$;

comment on function public.get_booking_page_catalogue is
  'Read-only catalogue (services, staff, service_staff pairs, published form fields) for the public booking page to bootstrap itself. service_role only, called from the get_booking_page Edge Function after resolveBranch.';

revoke all on function public.get_booking_page_catalogue(uuid) from public;
revoke execute on function public.get_booking_page_catalogue(uuid) from anon, authenticated;
grant execute on function public.get_booking_page_catalogue(uuid) to service_role;
