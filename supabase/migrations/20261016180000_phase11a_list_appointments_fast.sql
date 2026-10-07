-- Phase 11A performance, part 5: list_appointments joined the contact view for every appointment row (a security
-- barrier view cannot be flattened: the plan degraded to minutes). The name comes from clients (RLS), the phone
-- search from ONE uncorrelated lookup in clients_v, and the phone shown from clients_v for the <= 21 page rows only.
-- Behaviour is unchanged: no clients.view_contact -> client_phone null and phone search matches nothing.

create or replace function public.list_appointments(p_business_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_staff_id uuid DEFAULT NULL::uuid, p_status appointment_status DEFAULT NULL::appointment_status, p_service_id uuid DEFAULT NULL::uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with v_limit as (
    select least(coalesce(p_limit, 20), 100) as n
  ),
  page as (
    select a.id, a.branch_id, a.starts_at, a.ends_at, a.status, a.source,
           a.service_id, s.name as service_name,
           a.staff_id, sp.display_name as staff_name,
           a.client_id, c.full_name as client_name,
           a.price_minor, a.invoice_id,
           row_number() over (order by a.starts_at desc, a.id desc) as rn
    from public.appointments a
    join public.services s on s.id = a.service_id
    left join public.staff_profiles sp on sp.id = a.staff_id
    join public.clients c on c.id = a.client_id
    where a.business_id = p_business_id
      and a.deleted_at is null
      and (p_branch_id is null or a.branch_id = p_branch_id)
      and (p_staff_id is null or a.staff_id = p_staff_id)
      and (p_status is null or a.status = p_status)
      and (p_service_id is null or a.service_id = p_service_id)
      and (p_client_id is null or a.client_id = p_client_id)
      and (p_from_date is null or a.starts_at >= p_from_date::timestamptz)
      and (p_to_date is null or a.starts_at < (p_to_date + 1)::timestamptz)
      and (p_search is null or char_length(btrim(p_search)) < 2 or (
        c.full_name ilike '%' || p_search || '%'
        -- phone search: through the contact view, evaluated ONCE (uncorrelated), so a caller without
        -- clients.view_contact can never match on a number
        or c.id in (select v.id from public.clients_v v
                    where v.business_id = p_business_id and v.phone_e164 ilike '%' || p_search || '%')
      ))
      and (
        p_cursor_starts_at is null
        or a.starts_at < p_cursor_starts_at
        or (a.starts_at = p_cursor_starts_at and a.id < p_cursor_id)
      )
    order by a.starts_at desc, a.id desc
    limit (select n + 1 from v_limit)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'branch_id', branch_id, 'starts_at', starts_at, 'ends_at', ends_at,
        'status', status, 'source', source, 'service_id', service_id,
        'service_name', service_name, 'staff_id', staff_id, 'staff_name', staff_name,
        'client_id', client_id, 'client_name', client_name,
        'client_phone', (select v.phone_e164 from public.clients_v v where v.id = page.client_id),
        'price_minor', price_minor, 'invoice_id', invoice_id
      ) order by page.starts_at desc, page.id desc)
      from page, v_limit
      where page.rn <= v_limit.n
    ), '[]'::jsonb),
    'next_cursor', (
      select jsonb_build_object('starts_at', page.starts_at, 'id', page.id)
      from page, v_limit
      where page.rn = v_limit.n
        and exists (select 1 from page p2, v_limit vl where p2.rn = vl.n + 1)
    )
  )
  from v_limit
  limit 1;
$function$
;
