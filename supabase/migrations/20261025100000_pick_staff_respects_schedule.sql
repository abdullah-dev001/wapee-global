-- F1 (QA run 2026-10-17): "Any available person" refused free slots.
--
-- pick_staff_for_slot() only checked for an overlapping appointment. It ignored
-- working hours, breaks, time off and branch closures, so it could pick the
-- least-busy staff member who is NOT WORKING that day. create_booking then
-- re-checked that person against get_free_slots() and returned
-- slot_unavailable, although the slot shown to the customer belonged to a
-- colleague who was free.
--
-- Fix: a candidate must have the exact start as an AVAILABLE slot in the slot
-- engine (get_free_slots), the one place that owns hours, breaks, time off,
-- closures, buffers, capacity and resources. Minimum notice is ignored here on
-- purpose: it is a branch rule that applies to every staff member equally, and
-- the callers enforce it themselves (create_booking re-checks the engine with
-- notice; the dashboard ignores notice by design).
--
-- The dashboard may book outside working hours on purpose (staff see an
-- "outside working hours" warning). To keep that, a new last argument
-- p_allow_off_schedule falls back to the old narrow rule (no overlapping
-- exclusive appointment) when nobody is free per the engine. Only
-- create_appointment passes true; create_booking and reschedule_booking keep
-- the strict default.
--
-- The signature changes, so the old 4-argument function is dropped and the
-- grants are re-applied (service_role only, as before).

drop function if exists public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz);

create function public.pick_staff_for_slot(
  p_branch_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_allow_off_schedule boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_tz text;
  v_local_date date;
  v_staff_id uuid;
begin
  select b.business_id, b.timezone into v_business_id, v_tz
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return null;
  end if;

  v_local_date := (p_starts_at at time zone v_tz)::date;

  -- 1. Someone who is genuinely free per the slot engine.
  select sp.id into v_staff_id
  from public.staff_profiles sp
  join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = p_branch_id
  join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = p_service_id
  where sp.business_id = v_business_id
    and sp.deleted_at is null
    and sp.is_active
    and sp.is_bookable_online
    and exists (
      select 1
      from public.get_free_slots(p_branch_id, p_service_id, sp.id, v_local_date, v_local_date, true, false) f
      where f.starts_at = p_starts_at
        and f.available
    )
  order by
    -- fewest appointments that LOCAL day at this branch
    (
      select count(*)
      from public.appointments a
      where a.staff_id = sp.id
        and a.branch_id = p_branch_id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        and (a.starts_at at time zone v_tz)::date = v_local_date
    ) asc,
    sp.sort_order asc,
    sp.id asc
  limit 1;

  if v_staff_id is not null or not p_allow_off_schedule then
    return v_staff_id;
  end if;

  -- 2. Dashboard only: nobody is on schedule, so keep the old narrow rule
  --    (no overlapping exclusive appointment), as staff may book off-hours.
  select sp.id into v_staff_id
  from public.staff_profiles sp
  join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = p_branch_id
  join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = p_service_id
  where sp.business_id = v_business_id
    and sp.deleted_at is null
    and sp.is_active
    and sp.is_bookable_online
    and not exists (
      select 1 from public.appointments a
      where a.staff_id = sp.id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        and a.is_exclusive
        and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
            && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by
    (
      select count(*)
      from public.appointments a
      where a.staff_id = sp.id
        and a.branch_id = p_branch_id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        and (a.starts_at at time zone v_tz)::date = v_local_date
    ) asc,
    sp.sort_order asc,
    sp.id asc
  limit 1;

  return v_staff_id;
end;
$$;

revoke all on function public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz, boolean) from public;
revoke execute on function public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz, boolean) from anon, authenticated;
grant execute on function public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz, boolean) to service_role;

-- create_appointment (dashboard): same body as before; only the "any staff"
-- call now passes p_allow_off_schedule => true.
CREATE OR REPLACE FUNCTION public.create_appointment(p_branch_id uuid, p_service_id uuid, p_starts_at timestamp with time zone, p_staff_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_client_name text DEFAULT NULL::text, p_client_phone text DEFAULT NULL::text, p_client_email text DEFAULT NULL::text, p_client_notes text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_source booking_source DEFAULT 'dashboard'::booking_source, p_auto_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_business_id uuid;
  v_tz text;
  v_duration integer;
  v_service_buffer integer;
  v_service_name text;
  v_branch_buffer integer;
  v_people integer;
  v_use_resources boolean;
  v_confirmation public.booking_confirmation_mode;
  v_buffer integer;
  v_ends_at timestamptz;
  v_price_minor bigint;

  v_client_id uuid;
  v_phone text;
  v_name text;
  v_email text;
  v_country text;
  v_dial_code text;

  v_own_staff_id uuid;
  v_staff_id uuid;
  v_collision public.appointment_collision_result;
  v_status public.appointment_status;
  v_is_exclusive boolean;
  v_appointment_id uuid;
begin
  if not public.can(
    (select business_id from public.branches where id = p_branch_id), p_branch_id, 'appointments.create'
  ) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select b.business_id, b.timezone into v_business_id, v_tz
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.has_permission_at_branch_scope(v_business_id, p_branch_id, 'appointments.create') then
    v_own_staff_id := public.my_staff_profile_id(v_business_id);
    if v_own_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
    p_staff_id := v_own_staff_id;
  end if;

  select s.duration_minutes, s.buffer_minutes, s.name
    into v_duration, v_service_buffer, v_service_name
  from public.services s
  where s.id = p_service_id and s.business_id = v_business_id and s.deleted_at is null;

  if v_duration is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_service');
  end if;

  select sb.price_minor into v_price_minor
  from public.service_branches sb
  where sb.service_id = p_service_id and sb.branch_id = p_branch_id and sb.enabled;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'service_unavailable');
  end if;

  select bs.buffer_minutes, bs.people_per_slot, bs.use_resources, bs.confirmation
    into v_branch_buffer, v_people, v_use_resources, v_confirmation
  from public.booking_settings bs
  where bs.branch_id = p_branch_id;

  v_buffer := case when coalesce(v_service_buffer, 0) > 0 then v_service_buffer else v_branch_buffer end;
  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  if p_client_id is not null then
    select c.id into v_client_id
    from public.clients c
    where c.id = p_client_id and c.business_id = v_business_id and c.deleted_at is null;

    if v_client_id is null then
      return jsonb_build_object('ok', false, 'code', 'unknown_client');
    end if;
  else
    v_name := nullif(btrim(coalesce(p_client_name, '')), '');
    if v_name is null or char_length(v_name) > 160 then
      return jsonb_build_object('ok', false, 'code', 'invalid_name');
    end if;

    select br.country_code into v_country from public.branches br where br.id = p_branch_id;
    select c.dial_code into v_dial_code
    from (values
      ('GB','44'),('US','1'),('CA','1'),('PK','92'),('AE','971'),('SA','966'),
      ('IN','91'),('AU','61'),('NZ','64'),('IE','353'),('DE','49'),('FR','33'),
      ('ES','34'),('IT','39'),('NL','31'),('BE','32'),('SE','46'),('NO','47'),
      ('DK','45'),('FI','358'),('PL','48'),('PT','351'),('ZA','27'),('NG','234'),
      ('KE','254'),('EG','20'),('TR','90'),('MY','60'),('SG','65'),('ID','62'),
      ('PH','63'),('TH','66'),('BD','880'),('LK','94'),('QA','974'),('KW','965'),
      ('BH','973'),('OM','968'),('JO','962'),('LB','961'),('MA','212'),('TN','216')
    ) as c(code, dial_code)
    where c.code = v_country;

    v_phone := public.normalise_phone_e164(p_client_phone, v_dial_code);
    if v_phone is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_phone');
    end if;

    v_email := nullif(btrim(lower(coalesce(p_client_email, ''))), '');
    if v_email is not null and (v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 320) then
      return jsonb_build_object('ok', false, 'code', 'invalid_email');
    end if;

    select c.id into v_client_id
    from public.clients c
    where c.business_id = v_business_id and c.phone_e164 = v_phone and c.deleted_at is null;

    if v_client_id is null then
      insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id, source)
      values (v_business_id, v_name, v_phone, v_email, p_branch_id, p_source)
      returning id into v_client_id;
    else
      update public.clients c
      set full_name = coalesce(c.full_name, v_name),
          email = coalesce(c.email, v_email)
      where c.id = v_client_id;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('booking:' || p_branch_id::text || ':' || p_service_id::text),
    hashtext(p_starts_at::text)
  );

  if p_staff_id is not null then
    if not exists (
      select 1
      from public.staff_profiles sp
      join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = p_branch_id
      join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = p_service_id
      where sp.id = p_staff_id and sp.business_id = v_business_id
        and sp.deleted_at is null and sp.is_active
    ) then
      return jsonb_build_object('ok', false, 'code', 'staff_unavailable');
    end if;
    v_staff_id := p_staff_id;
  else
    v_staff_id := public.pick_staff_for_slot(
      p_branch_id, p_service_id, p_starts_at, v_ends_at + make_interval(mins => v_buffer), true
    );
    if v_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_staff');
    end if;
  end if;

  v_collision := public.check_appointment_collision_v2(
    p_branch_id, p_service_id, v_staff_id, p_starts_at, v_ends_at, v_buffer,
    v_people, v_use_resources
  );
  if v_collision.code is not null then
    return jsonb_build_object('ok', false, 'code', v_collision.code);
  end if;

  v_is_exclusive := v_people <= 1;
  v_status := case
    when v_confirmation = 'manual' and not p_auto_confirm then 'pending'
    else 'confirmed'
  end;

  begin
    insert into public.appointments (
      business_id, branch_id, client_id, service_id, staff_id, resource_id,
      starts_at, ends_at, duration_minutes, buffer_minutes,
      status, source, client_notes, internal_notes,
      form_version_id, is_exclusive, price_minor, created_by,
      resource_capacity_at_booking
    )
    values (
      v_business_id, p_branch_id, v_client_id, p_service_id, v_staff_id, v_collision.resource_id,
      p_starts_at, v_ends_at, v_duration, v_buffer,
      v_status, p_source,
      nullif(btrim(coalesce(p_client_notes, '')), ''),
      nullif(btrim(coalesce(p_internal_notes, '')), ''),
      public.ensure_form_version(v_business_id), v_is_exclusive, v_price_minor,
      (select auth.uid()),
      coalesce(v_collision.resource_capacity, 1)
    )
    returning id into v_appointment_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end;

  perform public.write_audit_log(
    v_business_id, 'appointment.created', 'appointment', v_appointment_id::text,
    null, jsonb_build_object('starts_at', p_starts_at, 'staff_id', v_staff_id, 'source', p_source)
  );

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment_id,
    'status', v_status,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'staff_id', v_staff_id,
    'client_id', v_client_id
  );
end;
$function$;
