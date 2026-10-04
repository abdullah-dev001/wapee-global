-- Phase 4 part A: dashboard appointment writes.
--
-- WHY SECURITY DEFINER, NOT INVOKER (unlike the Phase 2 replace_* RPCs)
-- -----------------------------------------------------------------------
-- The Phase 2 schedule RPCs (`replace_staff_working_hours` etc.) are INVOKER
-- because they are simple delete+insert and RLS alone is a clean boundary for
-- them. These RPCs are not that simple, for two concrete reasons:
--
-- 1. They must write `audit_logs`, and `write_audit_log()` is DEFINER-only
--    with EXECUTE revoked from `authenticated` entirely (it is designed to be
--    called FROM another DEFINER function, the same way `resend_manage_link`
--    already does it — see context/_database.md). An INVOKER function cannot
--    reach it.
-- 2. The collision check ("is this staff/resource free at this instant")
--    must see every other business's rows do not matter and every row in
--    THIS business does, regardless of the caller's own row-level grants —
--    the same reasoning `create_booking`/`reschedule_booking` already use.
--    An INVOKER function doing this under RLS would need the caller's own
--    policies to permit reading rows that are none of their business just to
--    check for a collision, which is either impossible (Own-scope staff) or a
--    privacy leak (seeing another branch's bookings to prove a conflict).
--
-- So: DEFINER, and the explicit `can()`/scope check INSIDE each function IS
-- the boundary — exactly the posture `resend_manage_link` already has, and
-- exactly why that one is DEFINER too. RLS still protects direct table
-- access (a client bypassing the RPC gets nothing); these RPCs are the
-- sanctioned write path, like `create_booking` is for the public side.
--
-- DASHBOARD AVAILABILITY != THE SLOT ENGINE
-- ------------------------------------------
-- `get_free_slots()` cannot be reused for the "is this instant bookable"
-- question here, because doc §6.2 is explicit that staff may book OUTSIDE
-- working hours and ignoring minimum notice / the booking window — and
-- `get_free_slots`'s branch/staff-hours joins are STRUCTURAL (no row exists
-- outside hours at all; `p_ignore_notice` only affects notice and
-- `online_booking_enabled`, not hours or the window). There is no flag that
-- makes it return an out-of-hours row.
--
-- So these RPCs never call `get_free_slots`. They run the SAME collision
-- maths `reschedule_booking` already uses directly against `appointments`/
-- `resources` (the exclusion-aware overlap query with `a.id <> v_id` for an
-- update), which is correct for "would this double-book, violate resource
-- capacity, or violate people_per_slot" — the THREE things staff may never
-- override — while skipping entirely the hours/notice/window EXISTENCE
-- checks, which staff MAY override. The DB exclusion constraint remains the
-- hard backstop underneath both paths either way.
--
-- VALIDATE EVERYTHING, MUTATE ONCE (CLAUDE.md §10a)
-- --------------------------------------------------
-- Every RPC here follows the rule the `reschedule_booking` bug established:
-- no write happens until every check has passed, and the whole mutation is
-- one statement. A RAISE is used freely in these (unlike the public RPCs),
-- because there is no rate-limit counter here to roll back — these are
-- authenticated, permission-checked calls, not public ones. Raising on an
-- unexpected error is correct; raising on an EXPECTED failure (a double-
-- booking, a bad transition) is still avoided in favour of returning
-- {ok:false,code}, for the same reason create_booking does: a clean,
-- translatable code beats a parsed Postgres error message in the UI.

-- ---------------------------------------------------------------------------
-- Shared helper: the collision check every write RPC below uses.
-- ---------------------------------------------------------------------------
-- Returns a code describing WHY a candidate instant cannot be written for a
-- given staff/resource/service/people_per_slot combination, or NULL if it is
-- clear. `p_exclude_appointment_id` lets an update exclude its own row.
create or replace function public.check_appointment_collision(
  p_branch_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_buffer_minutes integer,
  p_people_per_slot integer,
  p_use_resources boolean,
  p_exclude_appointment_id uuid default null
)
returns text  -- null | 'slot_unavailable' | 'slot_taken' | 'no_resource'
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_blocked_until timestamptz := p_ends_at + make_interval(mins => p_buffer_minutes);
  v_count integer;
  v_needs_resource boolean;
  v_resource_id uuid;
begin
  -- 1:1 staff collision (the exclusion constraint is still the hard backstop;
  -- this is the honest pre-check so a conflict is reported as a clean code
  -- rather than a caught `exclusion_violation`).
  if p_staff_id is not null and exists (
    select 1
    from public.appointments a
    where (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.staff_id = p_staff_id
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show')
      and a.is_exclusive
      and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
          && tstzrange(p_starts_at, v_blocked_until, '[)')
  ) then
    return 'slot_unavailable';
  end if;

  -- Group capacity (people_per_slot > 1): counted, not an exclusion
  -- constraint — an exclusion constraint cannot express "at most N overlap"
  -- (context/_database.md).
  if p_people_per_slot > 1 then
    select count(*) into v_count
    from public.appointments a
    where (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.staff_id = p_staff_id
      and a.service_id = p_service_id
      and a.starts_at = p_starts_at
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show');

    if v_count >= p_people_per_slot then
      return 'slot_taken';
    end if;
  end if;

  -- Resource capacity, same counted pattern.
  select exists (
    select 1 from public.service_resources sr where sr.service_id = p_service_id
  ) into v_needs_resource;

  if p_use_resources and v_needs_resource then
    select r.id into v_resource_id
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.service_id = p_service_id
      and r.branch_id = p_branch_id
      and r.deleted_at is null
      and r.is_active
      and r.capacity > coalesce((
        select count(*)
        from public.appointments ap
        where (p_exclude_appointment_id is null or ap.id <> p_exclude_appointment_id)
          and ap.resource_id = r.id
          and ap.deleted_at is null
          and ap.status not in ('cancelled', 'no_show')
          and tstzrange(ap.starts_at, ap.ends_at, '[)')
              && tstzrange(p_starts_at, p_ends_at, '[)')
      ), 0)
    order by r.name, r.id
    limit 1;

    if v_resource_id is null then
      return 'no_resource';
    end if;
  end if;

  return null;
end;
$$;

comment on function public.check_appointment_collision is
  'The collision-only check shared by create_appointment/update_appointment: staff double-booking, group capacity, resource capacity. Deliberately does NOT check hours/notice/window — those are the rules staff may override from the dashboard (doc 6.2). SECURITY INVOKER: pure read, called from inside the DEFINER RPCs below under their own lock.';

revoke all on function public.check_appointment_collision(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, boolean, uuid
) from public;
revoke execute on function public.check_appointment_collision(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, boolean, uuid
) from anon, authenticated;
grant execute on function public.check_appointment_collision(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, boolean, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- create_appointment: dashboard booking / walk-in
-- ---------------------------------------------------------------------------
create or replace function public.create_appointment(
  p_branch_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  -- NULL = "Any staff" — the SAME least-loaded rule create_booking uses.
  p_staff_id uuid default null,
  -- Attach to an existing client, OR create/attach by phone. Exactly one of
  -- p_client_id / p_client_phone must be meaningful.
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_notes text default null,
  p_internal_notes text default null,
  p_source public.booking_source default 'dashboard',
  -- Owner approves bookings (confirmation = manual): a DASHBOARD booking
  -- still honours that setting unless the caller explicitly overrides it,
  -- because the owner's staff are not customers and a receptionist confirming
  -- a slot on the phone with a client IS the approval.
  p_auto_confirm boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  v_staff_id uuid;
  v_collision text;
  v_status public.appointment_status;
  v_is_exclusive boolean;
  v_appointment_id uuid;
begin
  -- =========================================================================
  -- 1. Permission. appointments.create, narrowed to Own when the caller only
  --    holds Own scope AND is booking themselves (doc 9: Staff row is Own).
  -- =========================================================================
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

  -- Branch-or-all scope may book anyone; Own scope may only book the staff
  -- profile that belongs to the caller (CLAUDE.md's "has_permission() ignores
  -- own" trap — has_permission_at_branch_scope is the narrower half).
  if not public.has_permission_at_branch_scope(v_business_id, p_branch_id, 'appointments.create') then
    if p_staff_id is null or not public.is_own_staff_profile(p_staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  -- =========================================================================
  -- 2. Service
  -- =========================================================================
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

  -- =========================================================================
  -- 3. Client: by id, or find/create by phone (never overwrite)
  -- =========================================================================
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
      -- Same never-overwrite rule as create_booking: fill only what is empty.
      update public.clients c
      set full_name = coalesce(c.full_name, v_name),
          email = coalesce(c.email, v_email)
      where c.id = v_client_id;
    end if;
  end if;

  -- =========================================================================
  -- 4. THE LOCK. Same key create_booking/reschedule_booking use, so a
  --    dashboard booking and a public one competing for one slot serialise.
  -- =========================================================================
  perform pg_advisory_xact_lock(
    hashtext('booking:' || p_branch_id::text || ':' || p_service_id::text),
    hashtext(p_starts_at::text)
  );

  -- =========================================================================
  -- 5. Staff. "Any staff" still uses the least-loaded rule; NO hours/notice/
  --    window check — that is the whole point of a dashboard booking.
  -- =========================================================================
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
      p_branch_id, p_service_id, p_starts_at, v_ends_at + make_interval(mins => v_buffer)
    );
    if v_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_staff');
    end if;
  end if;

  -- =========================================================================
  -- 6. Collision check — the three things staff may NEVER override.
  -- =========================================================================
  v_collision := public.check_appointment_collision(
    p_branch_id, p_service_id, v_staff_id, p_starts_at, v_ends_at, v_buffer,
    v_people, v_use_resources
  );
  if v_collision is not null then
    return jsonb_build_object('ok', false, 'code', v_collision);
  end if;

  v_is_exclusive := v_people <= 1;
  v_status := case
    when v_confirmation = 'manual' and not p_auto_confirm then 'pending'
    else 'confirmed'
  end;

  -- =========================================================================
  -- 7. Write. The exclusion constraint is still the backstop.
  -- =========================================================================
  begin
    insert into public.appointments (
      business_id, branch_id, client_id, service_id, staff_id,
      starts_at, ends_at, duration_minutes, buffer_minutes,
      status, source, client_notes, internal_notes,
      form_version_id, is_exclusive, price_minor, created_by
    )
    values (
      v_business_id, p_branch_id, v_client_id, p_service_id, v_staff_id,
      p_starts_at, v_ends_at, v_duration, v_buffer,
      v_status, p_source,
      nullif(btrim(coalesce(p_client_notes, '')), ''),
      nullif(btrim(coalesce(p_internal_notes, '')), ''),
      public.ensure_form_version(v_business_id), v_is_exclusive, v_price_minor,
      (select auth.uid())
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
$$;

comment on function public.create_appointment is
  'Dashboard booking / walk-in. SECURITY DEFINER with an explicit can()/scope check (the write_audit_log + cross-tenant-safe collision check need it, like resend_manage_link). Staff may book outside hours/notice/window but never double-book or violate capacity — reuses check_appointment_collision, never get_free_slots. appointments.create at Branch/All books anyone; at Own scope only the caller''s own staff profile.';

revoke all on function public.create_appointment(
  uuid, uuid, timestamptz, uuid, uuid, text, text, text, text, text, public.booking_source, boolean
) from public;
revoke execute on function public.create_appointment(
  uuid, uuid, timestamptz, uuid, uuid, text, text, text, text, text, public.booking_source, boolean
) from anon;
grant execute on function public.create_appointment(
  uuid, uuid, timestamptz, uuid, uuid, text, text, text, text, text, public.booking_source, boolean
) to authenticated;
