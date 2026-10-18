-- F22 (QA run 2026-10-17): the client portal showed "5 of 5 sessions left"
-- after a session was used. portal_packages used client_package_used(), which
-- is gated by package_visible() (a signed-in member check). The portal has no
-- member, so the count was always 0. It now counts usages directly for the
-- portal client's own packages (scoped by the session's client ids and
-- business, as before), and returns the branch time zone for display.

CREATE OR REPLACE FUNCTION public.portal_packages(p_session text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_ids uuid[];
  v_biz uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if not public.business_has_feature(v_biz, 'packages') then return jsonb_build_object('ok', true, 'available', false, 'rows', '[]'::jsonb); end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_ctx -> 'client_ids');
  return jsonb_build_object('ok', true, 'available', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', cp.id, 'name', cp.name, 'sessions_purchased', cp.sessions_purchased, 'sessions_bonus', cp.sessions_bonus,
        'used', u.used,
        'remaining', cp.sessions_purchased + cp.sessions_bonus - u.used,
        -- The package's branch time zone, so the portal shows usage times in
        -- branch time instead of UTC (QA F22).
        'timezone', br.timezone,
        'sold_at', cp.sold_at, 'expires_at', cp.expires_at,
        'is_expired', cp.expires_at is not null and cp.expires_at <= now(),
        'is_cancelled', exists (select 1 from public.client_package_cancellations x where x.client_package_id = cp.id),
        'history', coalesce((select jsonb_agg(jsonb_build_object('kind', u.kind, 'at', u.created_at, 'service_name', s.name) order by u.created_at desc)
                             from public.session_usages u left join public.services s on s.id = u.service_id
                             where u.client_package_id = cp.id), '[]'::jsonb)) order by cp.sold_at desc)
    from public.client_packages cp
    join public.branches br on br.id = cp.branch_id
    -- Counted here, NOT with client_package_used(): that helper is gated by
    -- package_visible(), which needs a signed-in member, so in the portal it
    -- always counted 0 and showed every session as left (QA F22).
    cross join lateral (
      select (count(*) filter (where su.kind = 'deduct') - count(*) filter (where su.kind = 'reversal'))::integer as used
      from public.session_usages su
      where su.client_package_id = cp.id
    ) u
    where cp.client_id = any (v_ids) and cp.business_id = v_biz), '[]'::jsonb));
end $function$;
