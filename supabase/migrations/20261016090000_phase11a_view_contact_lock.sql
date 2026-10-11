-- Phase 11A: clients.view_contact is now a DATABASE boundary, not UI omission.
--
-- Before: any signed-in member who could read a client row could `select phone_e164, email` straight from
-- PostgREST (RLS masks rows, never columns), and list_appointments returned the phone to everybody.
-- Now: `authenticated` has NO privilege on clients.phone_e164 / clients.email. Contact data is reachable only
-- through `clients_v`, which returns it for callers who hold clients.view_contact in that business and NULL
-- for everyone else. Row visibility is still RLS on clients (the view is security_invoker).
--
-- The permission is computed ONCE per statement (an uncorrelated InitPlan over contact_business_ids()),
-- the value is fetched per row only when allowed (CASE short-circuits).

create or replace function public.contact_business_ids()
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.business_id), '{}'::uuid[])
  from public.business_members m
  where m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null
    and public.can(m.business_id, null, 'clients.view_contact')
$$;
revoke all on function public.contact_business_ids() from public, anon;
grant execute on function public.contact_business_ids() to authenticated;

-- The contact value of ONE client the caller can see. Row visibility is the same predicate as the
-- clients_select policy (client_access); the permission is re-checked, so a direct call cannot be
-- used to read what the view would blank.
create or replace function public.client_phone(p_client_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select c.phone_e164 from public.clients c
  where c.id = p_client_id
    and public.can(c.business_id, null, 'clients.view_contact')
    and public.client_access(c.business_id, c.id, 'clients.view')
$$;
create or replace function public.client_email(p_client_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select c.email::text from public.clients c
  where c.id = p_client_id
    and public.can(c.business_id, null, 'clients.view_contact')
    and public.client_access(c.business_id, c.id, 'clients.view')
$$;
revoke all on function public.client_phone(uuid) from public, anon;
revoke all on function public.client_email(uuid) from public, anon;
grant execute on function public.client_phone(uuid) to authenticated;
grant execute on function public.client_email(uuid) to authenticated;

-- The column lock. Table-level SELECT cannot be narrowed by a column REVOKE, so it is replaced by an
-- explicit column list. INSERT / UPDATE stay table-level (writing a number does not reveal one).
revoke select on public.clients from authenticated;
grant select (id, business_id, full_name, notes, first_branch_id, source, created_at, updated_at, deleted_at, created_by)
  on public.clients to authenticated;

create view public.clients_v with (security_invoker = true) as
select
  c.id, c.business_id, c.full_name,
  case when c.business_id in (select unnest(public.contact_business_ids())) then public.client_phone(c.id) end as phone_e164,
  case when c.business_id in (select unnest(public.contact_business_ids())) then public.client_email(c.id) end as email,
  c.notes, c.first_branch_id, c.source, c.created_at, c.updated_at, c.deleted_at, c.created_by
from public.clients c;

comment on view public.clients_v is
  'clients with phone/email BLANKED unless the caller holds clients.view_contact in that business. Rows follow clients RLS (security_invoker). The app reads this, never clients.phone_e164/email directly (those columns are not granted).';
revoke all on public.clients_v from public, anon;
grant select on public.clients_v to authenticated;

-- list_appointments is SECURITY INVOKER: it read c.phone_e164 for every caller. It now reads the gated view
-- (phone and phone-search both come back empty without the permission).
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
           a.client_id, c.full_name as client_name, c.phone_e164 as client_phone,
           a.price_minor, a.invoice_id,
           row_number() over (order by a.starts_at desc, a.id desc) as rn
    from public.appointments a
    join public.services s on s.id = a.service_id
    left join public.staff_profiles sp on sp.id = a.staff_id
    join public.clients_v c on c.id = a.client_id
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
        or c.phone_e164 ilike '%' || p_search || '%'
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
        'client_id', client_id, 'client_name', client_name, 'client_phone', client_phone,
        'price_minor', price_minor, 'invoice_id', invoice_id
      ) order by starts_at desc, id desc)
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
