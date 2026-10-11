-- Phase 4 closure round — two decisions from the user, both implemented here:
--
-- (b) no_show and completed MAY be reopened to confirmed, but ONLY by
--     Owner/Manager, ONLY when invoice_id is null, and it is audit-logged.
--     `cancelled` stays permanently final (no row for it, same as before).
-- (c) Staff creating an appointment for themselves must have staff_id FORCED
--     to their own staff profile — not merely accepted if they happen to
--     pass it. `create_appointment` previously REQUIRED an Own-scope caller
--     to pass their own id and refused if they omitted it; omitting it fell
--     through to "Any staff" for anyone with Branch/All scope, which was
--     correct there but the Own-scope refusal was a gap, not a force: a
--     caller who held ONLY Own scope but passed no staff_id got a plain
--     `forbidden` rather than being silently booked for themselves. Fixed to
--     force it instead.

-- ---------------------------------------------------------------------------
-- (b) Reopen transitions, in the SAME one place the rule already lives.
-- ---------------------------------------------------------------------------
insert into public.appointment_status_transitions (from_status, to_status) values
  ('no_show', 'confirmed'),
  ('completed', 'confirmed')
on conflict do nothing;
-- `cancelled` still has no outgoing row at all — permanently final.

-- ---------------------------------------------------------------------------
-- reopen_appointment: Owner/Manager ONLY (a literal role check, not a
-- permission — appointments.edit at Branch scope is ALSO held by
-- Receptionist per doc §9, and the user's decision was "Owner/Manager
-- only", which no existing permission expresses). The first RPC in the
-- project to check a role key directly rather than a permission; that is a
-- deliberate, narrow exception for reopening a FINISHED record, not a
-- precedent to copy elsewhere.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_is_owner_or_manager boolean;
begin
  select a.id, a.business_id, a.branch_id, a.status, a.invoice_id
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Must still be a member of an ACTIVE business — same floor every other
  -- RPC here applies via can(), even though this check is role-based, not
  -- permission-based.
  if not public.business_is_active(v_row.business_id) and not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select exists (
    select 1
    from public.business_members bm
    join public.member_role_assignments mra on mra.member_id = bm.id
    join public.roles r on r.id = mra.role_id
    where bm.business_id = v_row.business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
      and bm.deleted_at is null
      and r.key in ('owner', 'manager')
      and (mra.branch_id is null or mra.branch_id = v_row.branch_id)
  ) into v_is_owner_or_manager;

  if not (v_is_owner_or_manager or public.is_super_admin()) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.is_allowed_appointment_transition(v_row.status, 'confirmed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  -- An invoiced appointment is a financial record now; reopening it would
  -- let the underlying service/time disagree with what was billed. Phase 5
  -- owns correcting an invoiced appointment (credit note / reversal), not a
  -- reopen here.
  if v_row.invoice_id is not null then
    return jsonb_build_object('ok', false, 'code', 'invoiced');
  end if;

  update public.appointments set status = 'confirmed' where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.reopened', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'confirmed')
  );

  return jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

comment on function public.reopen_appointment is
  'no_show/completed -> confirmed. Owner/Manager ONLY (literal role check, not has_permission -- appointments.edit is also Receptionist''s at Branch scope and the user''s decision excludes them). Refused when invoice_id is set. Audit-logged. Decided 2026-10-05.';

revoke all on function public.reopen_appointment(uuid) from public;
revoke execute on function public.reopen_appointment(uuid) from anon;
grant execute on function public.reopen_appointment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (c) Helper: the caller's OWN staff profile in a business, or null.
-- ---------------------------------------------------------------------------
create or replace function public.my_staff_profile_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sp.id
  from public.staff_profiles sp
  join public.business_members m on m.id = sp.member_id
  where sp.business_id = p_business_id
    and sp.deleted_at is null
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.deleted_at is null
  limit 1;
$$;

comment on function public.my_staff_profile_id is
  'The caller''s own staff_profiles row in this business, or null if they have none. Used to FORCE staff_id for an Own-scope caller, rather than merely accepting it if supplied.';

revoke all on function public.my_staff_profile_id(uuid) from public;
revoke execute on function public.my_staff_profile_id(uuid) from anon;
grant execute on function public.my_staff_profile_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (c) create_appointment: FORCE staff_id for an Own-scope-only caller.
-- ---------------------------------------------------------------------------
-- Previous behaviour: an Own-scope caller who PASSED their own staff_id was
-- allowed; one who passed null (asking for "any staff") or someone else's
-- id was refused with a bare `forbidden`. That second half was correct
-- (never book someone else), but never FORCING their own id when the
-- caller plainly has exactly one legitimate choice was the gap — the user's
-- decision is explicit that Own-scope staff creating for themselves should
-- not need to know or pass their own staff_id at all.
create or replace function public.create_appointment(
  p_branch_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_staff_id uuid default null,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_notes text default null,
  p_internal_notes text default null,
  p_source public.booking_source default 'dashboard',
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

  v_own_staff_id uuid;
  v_staff_id uuid;
  v_collision text;
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

  -- Own-scope caller: FORCE their own staff_id, ignoring whatever was
  -- passed (including null) — they have exactly one legitimate choice, so
  -- there is nothing to ask permission for and nothing to validate against.
  -- Passing someone else's id here is simply overridden, not honoured: this
  -- is "book for yourself", not "impersonate a staff_id parameter".
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
      p_branch_id, p_service_id, p_starts_at, v_ends_at + make_interval(mins => v_buffer)
    );
    if v_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_staff');
    end if;
  end if;

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
  'Dashboard booking / walk-in. SECURITY DEFINER with an explicit can()/scope check. An Own-scope-only caller has their staff_id FORCED to their own profile (my_staff_profile_id), not merely validated if supplied. Staff may book outside hours/notice/window but never double-book or violate capacity -- reuses check_appointment_collision, never get_free_slots.';
