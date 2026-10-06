-- Phase 8B (UI) backend additions.
--   admin_list_reviews: the audited way for a super admin to FIND a review to remove.
--   my_plan_usage:      per-location active staff + branch count, counted with the SAME
--                       rule as the staff-cap trigger, for the billing screen.

create or replace function public.admin_list_reviews(
  p_business_id uuid, p_limit integer default 20,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_n integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_items jsonb;
  v_more boolean;
  v_next jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_cursor');
  end if;

  with page as (
    select r.id, r.rating, r.comment, r.reviewer_first_name, r.status, r.featured_on_website, r.created_at
    from public.reviews r
    where r.business_id = p_business_id and r.deleted_at is null
      and (p_cursor_id is null or (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.id desc
    limit v_n + 1),
  numbered as (select p.*, row_number() over (order by p.created_at desc, p.id desc) rn from page p)
  select coalesce(jsonb_agg(to_jsonb(x) - 'rn' order by x.rn) filter (where x.rn <= v_n), '[]'::jsonb),
         count(*) > v_n,
         (select jsonb_build_object('created_at', y.created_at, 'id', y.id) from numbered y where y.rn = v_n)
    into v_items, v_more, v_next
  from numbered x;

  if p_cursor_id is null then
    perform public.write_audit_log(p_business_id, 'admin.list_reviews', 'business', p_business_id::text, null, null);
  end if;
  return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', case when v_more then v_next end);
end $$;
revoke all on function public.admin_list_reviews(uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.admin_list_reviews(uuid, integer, timestamptz, uuid) to authenticated;

create or replace function public.my_plan_usage(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_lim jsonb;
begin
  if (select auth.uid()) is null or not (public.is_member(p_business_id) or public.is_super_admin()) then
    return null;
  end if;
  v_lim := public.business_plan_limits(p_business_id);
  return coalesce(v_lim, '{}'::jsonb) || jsonb_build_object(
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'active_staff',
        (select count(*) from public.staff_branches sb
           join public.staff_profiles sp on sp.id = sb.staff_id and sp.is_active and sp.deleted_at is null
          where sb.branch_id = b.id)) order by b.is_primary desc, b.name), '[]'::jsonb)
      from public.branches b where b.business_id = p_business_id and b.deleted_at is null),
    'branch_count', (select count(*) from public.branches b where b.business_id = p_business_id and b.deleted_at is null));
end $$;
revoke all on function public.my_plan_usage(uuid) from public, anon;
grant execute on function public.my_plan_usage(uuid) to authenticated;
