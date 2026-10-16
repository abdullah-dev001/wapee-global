-- Feature 6 audit: list_businesses' search covered name + slug only, with no
-- way to find a business by its owner's email (a real onboarding gap: a
-- support ticket or sales email arrives by email, not by business name).
-- Smallest fix: the search also matches any ACTIVE Owner's email on that
-- business. Everything else (validation, pagination, status/plan filters,
-- the audited-once-per-search rule) is unchanged.
create or replace function public.list_businesses(
  p_search text default null, p_status text default null, p_plan text default null,
  p_limit integer default 20, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_n integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_search text := nullif(btrim(p_search), '');
  v_items jsonb;
  v_more boolean;
  v_next jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if v_search is not null and char_length(v_search) < 2 then
    return jsonb_build_object('ok', false, 'code', 'search_too_short');
  end if;
  if p_status is not null and p_status not in ('trialing', 'active', 'inactive', 'suspended') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;
  if p_plan is not null and p_plan not in ('solo', 'team', 'business') then
    return jsonb_build_object('ok', false, 'code', 'invalid_plan');
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_cursor');
  end if;
  if v_search is not null then
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with page as (
    select b.id, b.name, b.slug, b.industry, b.created_at, s.status::text as status, s.plan::text as plan,
           s.trial_ends_at, public.business_is_active(b.id) as is_active,
           (select count(*) from public.branches br where br.business_id = b.id and br.deleted_at is null) as branch_count,
           (select count(*) from public.staff_profiles sp
             where sp.business_id = b.id and sp.is_active and sp.deleted_at is null) as staff_count
    from public.businesses b
    join public.business_subscriptions s on s.business_id = b.id
    where b.deleted_at is null
      and (p_status is null or s.status::text = p_status)
      and (p_plan is null or s.plan::text = p_plan)
      and (v_search is null or b.name ilike v_search or b.slug::text ilike v_search or exists (
        select 1
        from public.business_members bm
        join public.member_role_assignments mra on mra.member_id = bm.id
        join public.roles r on r.id = mra.role_id and r.business_id is null and r.key = 'owner'
        join public.profiles p on p.id = bm.user_id
        where bm.business_id = b.id and bm.status = 'active' and bm.deleted_at is null
          and p.email ilike v_search
      ))
      and (p_cursor_id is null or (b.created_at, b.id) < (p_cursor_created_at, p_cursor_id))
    order by b.created_at desc, b.id desc
    limit v_n + 1),
  numbered as (select p.*, row_number() over (order by p.created_at desc, p.id desc) rn from page p)
  select coalesce(jsonb_agg(to_jsonb(x) - 'rn' order by x.rn) filter (where x.rn <= v_n), '[]'::jsonb),
         count(*) > v_n,
         (select jsonb_build_object('created_at', y.created_at, 'id', y.id) from numbered y where y.rn = v_n)
    into v_items, v_more, v_next
  from numbered x;

  if p_cursor_id is null then  -- log the search once, not every page
    perform public.write_audit_log(null, 'admin.list_businesses', 'business', null, null,
      jsonb_build_object('search', p_search, 'status', p_status, 'plan', p_plan));
  end if;
  return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', case when v_more then v_next end);
end $$;
