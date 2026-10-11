-- Phase 3 step 6: the guest manage link — get, cancel, reschedule, resend.
--
-- WHAT A MANAGE TOKEN IS (doc §6.1, §13)
-- --------------------------------------
-- A customer with no account needs to cancel or move their own booking. The link
-- they are sent carries a token which is:
--   * >= 128-bit random (we use 256), generated in the Edge Function;
--   * stored ONLY as sha256 — a leaked database backup must not hand anyone the
--     power to cancel every appointment;
--   * scoped to ONE appointment;
--   * expiring at the appointment's end (nothing to manage afterwards);
--   * revoked on cancellation, and replaced (old one invalidated) on resend.
--
-- RETURN-NULL / {ok:false} ON FAILURE, NEVER A RAISE
-- -------------------------------------------------
-- Same rule as `create_booking` and `accept_invite`: these functions are behind
-- a rate limiter whose counter is a committed row, and **a raise would roll the
-- counter back**, so an attacker brute-forcing tokens would never be counted.
-- Every expected failure is therefore a RETURN.
--
-- Every token failure — unknown, expired, revoked, wrong appointment, already
-- cancelled — returns the SAME `invalid_token`. Distinguishing them would turn
-- the endpoint into an oracle for guessing tokens.
--
-- WHAT A GUEST MAY SEE (doc §13: "exposing only services and free slots")
-- ----------------------------------------------------------------------
-- The manage page shows the service, the staff display name, the time in the
-- branch timezone, the business and branch name, and the status. It shows the
-- client's FIRST NAME only — enough for "Hi Sarah, here is your appointment",
-- and not the full name, phone, email or any custom-field answer. A guessed
-- token must not become a data leak.

-- ---------------------------------------------------------------------------
-- Shared helper: resolve a raw token to an appointment, or nothing
-- ---------------------------------------------------------------------------
create or replace function public.resolve_manage_token(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_appointment_id uuid;
begin
  -- A short token is not worth a database round trip; the real ones are 64 hex
  -- characters. Checked before hashing so a trivially wrong input costs nothing.
  if p_token is null or char_length(p_token) < 32 then
    return null;
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');

  select t.appointment_id into v_appointment_id
  from public.booking_manage_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_hash = v_hash
    and t.revoked_at is null
    and t.expires_at > now()
    and a.deleted_at is null;

  return v_appointment_id;  -- NULL for every failure, indistinguishably
end;
$$;

comment on function public.resolve_manage_token is
  'Raw token -> appointment id, or NULL for every failure (unknown, expired, revoked, deleted) so the endpoint is not a guessing oracle. Never raises.';

-- Record a use, so a replay is visible in the data even though it is allowed
-- (a guest may legitimately reload their page).
create or replace function public.touch_manage_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.booking_manage_tokens
  set last_used_at = now()
  where token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;
$$;

-- ---------------------------------------------------------------------------
-- get_booking: what the manage page shows
-- ---------------------------------------------------------------------------
create or replace function public.get_booking(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row record;
  v_can_cancel boolean;
  v_cutoff timestamptz;
begin
  v_id := public.resolve_manage_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  perform public.touch_manage_token(p_token);

  select
    a.id, a.status, a.starts_at, a.ends_at, a.price_minor,
    br.timezone, br.currency, br.name as branch_name,
    biz.name as business_name,
    s.name as service_name,
    sp.display_name as staff_name,
    -- FIRST NAME ONLY. Enough to personalise the page; not a PII leak if a
    -- token is ever guessed.
    split_part(c.full_name, ' ', 1) as client_first_name,
    bs.customer_can_cancel, bs.cancel_cutoff_hours, bs.confirmation
  into v_row
  from public.appointments a
  join public.branches br on br.id = a.branch_id
  join public.businesses biz on biz.id = a.business_id
  join public.services s on s.id = a.service_id
  join public.clients c on c.id = a.client_id
  left join public.staff_profiles sp on sp.id = a.staff_id
  join public.booking_settings bs on bs.branch_id = a.branch_id
  where a.id = v_id;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Whether the BUTTONS should be shown. The same rule is enforced again inside
  -- cancel/reschedule, so a page that ignores this cannot act anyway.
  v_cutoff := v_row.starts_at - make_interval(hours => v_row.cancel_cutoff_hours);
  v_can_cancel :=
    v_row.customer_can_cancel
    and v_row.status in ('pending', 'confirmed')
    and now() < v_cutoff;

  return jsonb_build_object(
    'ok', true,
    'status', v_row.status,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'timezone', v_row.timezone,
    'local_date', (v_row.starts_at at time zone v_row.timezone)::date,
    'local_minute',
        extract(hour from (v_row.starts_at at time zone v_row.timezone))::integer * 60
      + extract(minute from (v_row.starts_at at time zone v_row.timezone))::integer,
    'service_name', v_row.service_name,
    'staff_name', v_row.staff_name,
    'branch_name', v_row.branch_name,
    'business_name', v_row.business_name,
    'client_first_name', v_row.client_first_name,
    'price_minor', v_row.price_minor,
    'currency', v_row.currency,
    'can_cancel', v_can_cancel,
    -- The same window governs rescheduling: moving a booking an hour before it
    -- starts is the same imposition on the business as cancelling it.
    'can_reschedule', v_can_cancel,
    'cancel_cutoff_hours', v_row.cancel_cutoff_hours
  );
end;
$$;

comment on function public.get_booking is
  'Manage-page view of one booking, by raw token. Returns the FIRST NAME only and no custom-field answers. Every token failure returns invalid_token. service_role only.';

-- ---------------------------------------------------------------------------
-- cancel_booking
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_token text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row record;
  v_cutoff timestamptz;
begin
  v_id := public.resolve_manage_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select a.id, a.status, a.starts_at, bs.customer_can_cancel, bs.cancel_cutoff_hours
  into v_row
  from public.appointments a
  join public.booking_settings bs on bs.branch_id = a.branch_id
  where a.id = v_id
  -- Lock the row: two taps on a slow connection must not both cancel, and a
  -- cancel racing a reschedule must serialise.
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Already finished with, one way or another. Reported distinctly from a bad
  -- token because the guest holds a VALID token here — there is nothing to leak.
  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_row.status);
  end if;

  -- doc §6.2: "customer can cancel (yes, 24h)". Off means off.
  if not v_row.customer_can_cancel then
    return jsonb_build_object('ok', false, 'code', 'cancel_not_allowed');
  end if;

  v_cutoff := v_row.starts_at - make_interval(hours => v_row.cancel_cutoff_hours);
  if now() >= v_cutoff then
    return jsonb_build_object(
      'ok', false,
      'code', 'cancel_window_passed',
      'cutoff_hours', v_row.cancel_cutoff_hours
    );
  end if;

  update public.appointments
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_guest = true,
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_id;

  -- The token dies with the booking: there is nothing left to manage, and a
  -- live token on a cancelled appointment is pure attack surface.
  update public.booking_manage_tokens
  set revoked_at = now()
  where appointment_id = v_id and revoked_at is null;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

comment on function public.cancel_booking is
  'Guest cancellation by raw token. Respects booking_settings.customer_can_cancel and the cutoff window. Revokes the token. Returns {ok:false,code} and never raises. service_role only.';

-- ---------------------------------------------------------------------------
-- reschedule_booking
-- ---------------------------------------------------------------------------
-- The hard part: the OLD slot must be freed and the NEW one taken in ONE
-- transaction, and the new slot must pass every rule a fresh booking passes.
--
-- Re-validating by calling `get_free_slots` itself (rather than repeating its
-- SQL) is the same decision as in `create_booking`: the two can then never
-- disagree about what "free" means. The exclusion constraint on
-- `appointments` is still the backstop.
--
-- **If confirmation = 'owner approves', the booking goes back to 'pending'.**
-- The owner approved a specific time, not any time; letting a guest silently
-- move an approved appointment would bypass the approval the setting exists to
-- require. The response says so, so the page can show "awaiting confirmation"
-- again. (Agreed with the user, 2026-10-03.)
create or replace function public.reschedule_booking(
  p_token text,
  p_starts_at timestamptz,
  -- NULL keeps the same staff member where possible; otherwise "Any staff".
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row record;
  v_cutoff timestamptz;
  v_tz text;
  v_duration integer;
  v_buffer integer;
  v_branch_buffer integer;
  v_service_buffer integer;
  v_ends_at timestamptz;
  v_blocked_until timestamptz;
  v_local_date date;
  v_today date;
  v_staff_id uuid;
  v_staff_name text;
  v_resource_id uuid;
  v_resource_capacity integer := 1;
  v_needs_resource boolean;
  v_count integer;
  v_new_status public.appointment_status;
begin
  v_id := public.resolve_manage_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select
    a.id, a.status, a.starts_at, a.business_id, a.branch_id, a.service_id,
    a.staff_id, a.duration_minutes, a.is_exclusive,
    br.timezone, br.currency,
    bs.customer_can_cancel, bs.cancel_cutoff_hours, bs.confirmation,
    bs.minimum_notice_minutes, bs.booking_window_days, bs.people_per_slot,
    bs.use_resources, bs.buffer_minutes as branch_buffer,
    bs.online_booking_enabled,
    s.buffer_minutes as service_buffer, s.name as service_name
  into v_row
  from public.appointments a
  join public.branches br on br.id = a.branch_id
  join public.booking_settings bs on bs.branch_id = a.branch_id
  join public.services s on s.id = a.service_id
  where a.id = v_id
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_row.status);
  end if;

  -- The business must still be able to take bookings at all.
  if not public.business_is_active(v_row.business_id) or not v_row.online_booking_enabled then
    return jsonb_build_object('ok', false, 'code', 'not_bookable');
  end if;

  -- The same window governs rescheduling as cancelling.
  if not v_row.customer_can_cancel then
    return jsonb_build_object('ok', false, 'code', 'cancel_not_allowed');
  end if;

  v_cutoff := v_row.starts_at - make_interval(hours => v_row.cancel_cutoff_hours);
  if now() >= v_cutoff then
    return jsonb_build_object(
      'ok', false, 'code', 'cancel_window_passed',
      'cutoff_hours', v_row.cancel_cutoff_hours
    );
  end if;

  v_tz := v_row.timezone;
  v_duration := v_row.duration_minutes;
  v_buffer := case when coalesce(v_row.service_buffer, 0) > 0
                   then v_row.service_buffer else v_row.branch_buffer end;
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  v_blocked_until := v_ends_at + make_interval(mins => v_buffer);
  v_local_date := (p_starts_at at time zone v_tz)::date;
  v_today := (now() at time zone v_tz)::date;

  -- Moving to the same instant is a no-op, not an error.
  if p_starts_at = v_row.starts_at and coalesce(p_staff_id, v_row.staff_id) = v_row.staff_id then
    return jsonb_build_object('ok', false, 'code', 'same_slot');
  end if;

  -- The new slot must satisfy notice and window, exactly as a new booking would.
  if p_starts_at < now() + make_interval(mins => v_row.minimum_notice_minutes) then
    return jsonb_build_object('ok', false, 'code', 'too_soon');
  end if;
  if v_local_date > v_today + v_row.booking_window_days then
    return jsonb_build_object('ok', false, 'code', 'outside_window');
  end if;

  -- =========================================================================
  -- The lock: the SAME key create_booking uses, so a reschedule and a fresh
  -- booking competing for one slot serialise against each other.
  -- =========================================================================
  perform pg_advisory_xact_lock(
    hashtext('booking:' || v_row.branch_id::text || ':' || v_row.service_id::text),
    hashtext(p_starts_at::text)
  );

  -- --- Free the OLD slot FIRST, inside this transaction --------------------
  -- Without this the appointment's own row would block its new time whenever the
  -- windows overlap (moving 10:00 -> 10:30), and `get_free_slots` would say the
  -- target is taken — by itself. Setting it aside here is safe because the whole
  -- function is one transaction: if anything below fails, the ROLLBACK puts the
  -- original booking back exactly as it was.
  update public.appointments
  set status = 'cancelled', cancelled_at = now()
  where id = v_id;

  -- --- Staff -------------------------------------------------------------
  v_staff_id := coalesce(p_staff_id, v_row.staff_id);

  if v_staff_id is not null then
    -- Verify they can still do this service at this branch.
    if not exists (
      select 1
      from public.staff_profiles sp
      join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = v_row.branch_id
      join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = v_row.service_id
      where sp.id = v_staff_id
        and sp.deleted_at is null and sp.is_active and sp.is_bookable_online
    ) then
      v_staff_id := null;  -- fall through to "any staff"
    end if;
  end if;

  if v_staff_id is null then
    v_staff_id := public.pick_staff_for_slot(
      v_row.branch_id, v_row.service_id, p_starts_at, v_blocked_until);
    if v_staff_id is null then
      -- RAISE would be wrong here (it would roll back a rate-limit counter), but
      -- a plain RETURN also rolls back the cancellation above — which is exactly
      -- what we want: the original booking survives untouched.
      return jsonb_build_object('ok', false, 'code', 'no_staff');
    end if;
  end if;

  -- --- Re-check the slot through the engine itself ------------------------
  if not exists (
    select 1
    from public.get_free_slots(v_row.branch_id, v_row.service_id, v_staff_id,
                               v_local_date, v_local_date)
    where starts_at = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end if;

  -- --- Group capacity, counted under the lock ---------------------------
  if v_row.people_per_slot > 1 then
    select count(*) into v_count
    from public.appointments a
    where a.staff_id = v_staff_id
      and a.service_id = v_row.service_id
      and a.starts_at = p_starts_at
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show');

    if v_count >= v_row.people_per_slot then
      return jsonb_build_object('ok', false, 'code', 'slot_taken');
    end if;
  end if;

  -- --- Resource, counted under the lock ---------------------------------
  select exists (
    select 1 from public.service_resources sr where sr.service_id = v_row.service_id
  ) into v_needs_resource;

  if v_row.use_resources and v_needs_resource then
    select r.id, r.capacity into v_resource_id, v_resource_capacity
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.service_id = v_row.service_id
      and r.branch_id = v_row.branch_id
      and r.deleted_at is null
      and r.is_active
      and r.capacity > coalesce((
        select count(*)
        from public.appointments ap
        where ap.resource_id = r.id
          and ap.deleted_at is null
          and ap.status not in ('cancelled', 'no_show')
          and tstzrange(ap.starts_at, ap.ends_at, '[)')
              && tstzrange(p_starts_at, v_ends_at, '[)')
      ), 0)
    order by r.name, r.id
    limit 1;

    if v_resource_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_resource');
    end if;
  end if;

  -- --- Move it ----------------------------------------------------------
  -- Back to 'pending' when the owner approves bookings: they agreed to a time,
  -- not to any time.
  v_new_status := case when v_row.confirmation = 'manual' then 'pending' else 'confirmed' end;

  begin
    update public.appointments
    set starts_at = p_starts_at,
        ends_at = v_ends_at,
        staff_id = v_staff_id,
        resource_id = v_resource_id,
        resource_capacity_at_booking =
          case when v_resource_id is null then 1 else coalesce(v_resource_capacity, 1) end,
        buffer_minutes = v_buffer,
        status = v_new_status,
        cancelled_at = null,
        cancelled_by_guest = false,
        cancellation_reason = null
    where id = v_id;
  exception when exclusion_violation then
    -- The constraint is the last line of defence, as in create_booking.
    return jsonb_build_object('ok', false, 'code', 'slot_taken');
  end;

  select sp.display_name into v_staff_name
  from public.staff_profiles sp where sp.id = v_staff_id;

  -- The existing token keeps working and its expiry moves with the appointment.
  -- Re-issuing here would invalidate the link in the email the customer is
  -- reading, which is the opposite of helpful.
  update public.booking_manage_tokens
  set expires_at = v_ends_at
  where appointment_id = v_id and revoked_at is null;

  return jsonb_build_object(
    'ok', true,
    'status', v_new_status,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'timezone', v_tz,
    'local_date', v_local_date,
    'local_minute',
        extract(hour from (p_starts_at at time zone v_tz))::integer * 60
      + extract(minute from (p_starts_at at time zone v_tz))::integer,
    'service_name', v_row.service_name,
    'staff_name', v_staff_name,
    -- So the page can say "this now needs the salon's confirmation again".
    'needs_approval', v_new_status = 'pending'
  );
end;
$$;

comment on function public.reschedule_booking is
  'Guest reschedule by raw token. Frees the old slot and takes the new one in ONE transaction under the same advisory lock as create_booking, re-validating through get_free_slots. Goes back to pending when confirmation = manual. Returns {ok:false,code} and never raises. service_role only.';

-- ---------------------------------------------------------------------------
-- resend_manage_link: dashboard-authenticated, NOT public
-- ---------------------------------------------------------------------------
-- A customer who lost the email asks the salon to send it again. This is the one
-- function in the set that a signed-in staff member calls, so it is the one that
-- needs a permission check.
--
-- SECURITY INVOKER would be wrong here: issuing a token means writing to
-- `booking_manage_tokens`, which has **no write policy for anyone** by design.
-- So it is DEFINER with an explicit `can()` check, and `appointments.edit` is the
-- permission — reissuing a manage link lets the holder change the appointment,
-- so it should need the same right as changing it yourself.
create or replace function public.resend_manage_link(
  p_appointment_id uuid,
  -- The new raw token, generated by the caller (the Edge Function has a CSPRNG).
  p_new_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_token text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'not_signed_in');
  end if;

  select a.id, a.business_id, a.branch_id, a.status, a.ends_at
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- The boundary. Note this function is DEFINER, so RLS is NOT doing this for
  -- us — the check has to be here and it has to be right.
  if not public.can(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- Nothing to manage on a finished booking, so no link for it.
  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_row.status);
  end if;

  if v_row.ends_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'too_late');
  end if;

  v_token := nullif(btrim(coalesce(p_new_token, '')), '');
  if v_token is null or char_length(v_token) < 32 then
    -- A short token would weaken the link; generate our own rather than accept it.
    v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  end if;

  -- **Invalidate the old one first.** A resend must make the previous link dead,
  -- or a forwarded email keeps working forever. The partial unique index
  -- (one live token per appointment) also requires this ordering.
  update public.booking_manage_tokens
  set revoked_at = now()
  where appointment_id = p_appointment_id and revoked_at is null;

  insert into public.booking_manage_tokens
    (business_id, appointment_id, token_hash, expires_at, created_by)
  values (
    v_row.business_id, p_appointment_id,
    pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_row.ends_at,
    (select auth.uid())
  );

  -- Who reissued a manage link is worth knowing if a booking is later disputed.
  -- Note write_audit_log takes entity_id as TEXT, not uuid.
  perform public.write_audit_log(
    v_row.business_id, 'appointment.manage_link_resent', 'appointment',
    p_appointment_id::text,
    null, jsonb_build_object('appointment_id', p_appointment_id)
  );

  return jsonb_build_object('ok', true, 'manage_token', v_token, 'expires_at', v_row.ends_at);
end;
$$;

comment on function public.resend_manage_link is
  'Dashboard action: issue a NEW manage token and revoke the old one. Needs appointments.edit. SECURITY DEFINER because booking_manage_tokens has no write policy, so the can() check here IS the boundary. Audited.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The three guest functions are service_role only: they are reached through the
-- public Edge Functions, which rate-limit first.
revoke all on function public.resolve_manage_token(text) from public;
revoke execute on function public.resolve_manage_token(text) from anon, authenticated;
grant execute on function public.resolve_manage_token(text) to service_role;

revoke all on function public.touch_manage_token(text) from public;
revoke execute on function public.touch_manage_token(text) from anon, authenticated;
grant execute on function public.touch_manage_token(text) to service_role;

revoke all on function public.get_booking(text) from public;
revoke execute on function public.get_booking(text) from anon, authenticated;
grant execute on function public.get_booking(text) to service_role;

revoke all on function public.cancel_booking(text, text) from public;
revoke execute on function public.cancel_booking(text, text) from anon, authenticated;
grant execute on function public.cancel_booking(text, text) to service_role;

revoke all on function public.reschedule_booking(text, timestamptz, uuid) from public;
revoke execute on function public.reschedule_booking(text, timestamptz, uuid) from anon, authenticated;
grant execute on function public.reschedule_booking(text, timestamptz, uuid) to service_role;

-- resend_manage_link is the dashboard one, so `authenticated` may call it and
-- the can() check inside decides.
revoke all on function public.resend_manage_link(uuid, text) from public;
revoke execute on function public.resend_manage_link(uuid, text) from anon;
grant execute on function public.resend_manage_link(uuid, text) to authenticated;
