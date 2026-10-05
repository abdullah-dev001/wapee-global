-- Phase 6A, part 3: enqueue + triggers + hooks into the existing seams.
--
--   outbox_enqueue          THE one place a row enters the queue (channel choice,
--                           quiet hours, token sealing, idempotency)
--   outbox_attach_token     seal a raw token into queued rows (same transaction)
--   notify_appointment_change   AFTER INSERT/UPDATE trigger on appointments, so
--                           EVERY RPC (create_booking, create_appointment, status
--                           RPCs, reschedule, mark_completed...) is covered, and
--                           the queue rows roll back with the action.
--   create_booking / resend_manage_link / create_review_request_internal /
--   reissue_review_request  redefined ONLY to add their enqueue call.
--
-- CHANNEL RULE (decided with the user): a client with an email gets EMAIL ONLY;
-- SMS only when there is no email AND the branch has SMS switched on. Never both.
-- Walk-ins (source = walk_in) generate no messages at all (doc decision).

create or replace function public.outbox_enqueue(
  p_business uuid, p_branch uuid, p_event text, p_key text,
  p_appointment uuid default null, p_client uuid default null, p_user uuid default null,
  p_review_request uuid default null, p_deliver_after timestamptz default null,
  p_payload jsonb default '{}'::jsonb, p_token text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_channel text;
  v_email text;
  v_phone text;
  v_ns record;
  v_start timestamptz;
  v_when timestamptz := coalesce(p_deliver_after, now());
  v_id uuid;
begin
  -- The business may be mid-delete (cascade): never write a row for it.
  if not exists (select 1 from public.businesses b where b.id = p_business and b.deleted_at is null) then
    return null;
  end if;

  select ns.reminders_enabled, ns.sms_enabled, ns.review_requests_enabled into v_ns
  from public.notification_settings ns where ns.branch_id = p_branch and ns.business_id = p_business;
  if v_ns.sms_enabled is null then return null; end if;

  if p_event in ('reminder', 'staff_reminder') and not v_ns.reminders_enabled then return null; end if;
  if p_event = 'review_request' and not v_ns.review_requests_enabled then return null; end if;

  if p_user is not null then
    v_channel := 'push';
  else
    select c.email::text, c.phone_e164 into v_email, v_phone
    from public.clients c where c.id = p_client and c.business_id = p_business and c.deleted_at is null;
    if not found then return null; end if;
    if v_email is not null and btrim(v_email) <> '' then v_channel := 'email';
    elsif v_ns.sms_enabled and v_phone is not null then v_channel := 'sms';
    else return null;
    end if;
  end if;

  -- Quiet hours: SMS reminders and review requests only.
  if v_channel = 'sms' and p_event in ('reminder', 'review_request') then
    if p_event = 'reminder' then
      select a.starts_at into v_start from public.appointments a where a.id = p_appointment;
    end if;
    v_when := public.notification_next_allowed(p_branch, v_when, v_start);
  end if;

  insert into public.message_outbox
    (business_id, branch_id, appointment_id, client_id, user_id, review_request_id,
     channel, event, idempotency_key, deliver_after, payload, sealed,
     max_attempts)
  values
    (p_business, p_branch, p_appointment, p_client, p_user, p_review_request,
     v_channel, p_event, p_key, v_when, coalesce(p_payload, '{}'::jsonb),
     case when p_token is null then null else public.outbox_seal(p_token) end,
     coalesce((select value from public.messaging_limits where key = 'max_attempts'), 5))
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end $$;
revoke all on function public.outbox_enqueue(uuid, uuid, text, text, uuid, uuid, uuid, uuid, timestamptz, jsonb, text) from public, anon, authenticated;

-- Seal a raw manage token into the confirmation row(s) queued for this appointment.
create or replace function public.outbox_attach_token(p_appointment uuid, p_token text)
returns void language sql security definer set search_path = '' as $$
  update public.message_outbox
  set sealed = public.outbox_seal(p_token)
  where appointment_id = p_appointment
    and event in ('booking_confirmed', 'pending_received')
    and status = 'pending';
$$;
revoke all on function public.outbox_attach_token(uuid, text) from public, anon, authenticated;

-- Cancel the not-yet-sent rows an appointment change has made pointless.
create or replace function public.outbox_cancel_unsent(p_appointment uuid, p_events text[], p_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.message_outbox
  set status = 'cancelled', sealed = null, finished_at = now(), last_error = p_reason
  where appointment_id = p_appointment and status in ('pending', 'retry') and event = any (p_events);
$$;
revoke all on function public.outbox_cancel_unsent(uuid, text[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The appointments trigger
-- ---------------------------------------------------------------------------
create or replace function public.notify_appointment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_u uuid;
  v_stamp text := to_char(now(), 'YYYYMMDDHH24MISSUS');
begin
  if new.source = 'walk_in' or new.deleted_at is not null then return null; end if;

  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      perform public.outbox_enqueue(new.business_id, new.branch_id, 'booking_confirmed',
        'booking_confirmed:' || new.id, new.id, new.client_id);
      for v_u in select public.push_recipient_users(new.business_id, new.branch_id, new.staff_id, 'appointments.view', v_actor) loop
        perform public.outbox_enqueue(new.business_id, new.branch_id, 'staff_new_booking',
          'staff_new_booking:' || new.id || ':' || v_u, new.id, null, v_u);
      end loop;
    elsif new.status = 'pending' then
      perform public.outbox_enqueue(new.business_id, new.branch_id, 'pending_received',
        'pending_received:' || new.id, new.id, new.client_id);
      for v_u in select public.push_recipient_users(new.business_id, new.branch_id, new.staff_id, 'appointments.approve', v_actor) loop
        perform public.outbox_enqueue(new.business_id, new.branch_id, 'staff_pending_approval',
          'staff_pending_approval:' || new.id || ':' || v_u, new.id, null, v_u);
      end loop;
    end if;
    return null;
  end if;

  -- UPDATE
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.outbox_cancel_unsent(new.id,
      array['reminder', 'staff_reminder', 'booking_confirmed', 'pending_received', 'rescheduled'], 'superseded');
    perform public.outbox_enqueue(new.business_id, new.branch_id, 'cancelled',
      'cancelled:' || new.id, new.id, new.client_id);
    for v_u in select public.push_recipient_users(new.business_id, new.branch_id, new.staff_id, 'appointments.view', v_actor) loop
      perform public.outbox_enqueue(new.business_id, new.branch_id, 'staff_cancelled',
        'staff_cancelled:' || new.id || ':' || v_u, new.id, null, v_u);
    end loop;
    return null;
  end if;

  if new.status in ('completed', 'no_show') and old.status <> new.status then
    perform public.outbox_cancel_unsent(new.id, array['reminder', 'staff_reminder'], 'superseded');
    return null;
  end if;

  if old.status = 'pending' and new.status = 'confirmed' then
    perform public.outbox_enqueue(new.business_id, new.branch_id, 'booking_confirmed',
      'booking_confirmed:' || new.id, new.id, new.client_id);
  end if;

  if new.starts_at is distinct from old.starts_at and new.status in ('pending', 'confirmed') then
    perform public.outbox_cancel_unsent(new.id, array['reminder', 'staff_reminder'], 'rescheduled');
    perform public.outbox_enqueue(new.business_id, new.branch_id, 'rescheduled',
      'rescheduled:' || new.id || ':' || v_stamp, new.id, new.client_id, null, null, null,
      jsonb_build_object('old_starts_at', old.starts_at));
  end if;

  -- A confirmed booking sent back to pending (guest rescheduled under manual
  -- confirmation): the approvers need to know.
  if old.status = 'confirmed' and new.status = 'pending' then
    for v_u in select public.push_recipient_users(new.business_id, new.branch_id, new.staff_id, 'appointments.approve', v_actor) loop
      perform public.outbox_enqueue(new.business_id, new.branch_id, 'staff_pending_approval',
        'staff_pending_approval:' || new.id || ':' || v_stamp || ':' || v_u, new.id, null, v_u);
    end loop;
  end if;

  return null;
end $$;
revoke all on function public.notify_appointment_change() from public, anon, authenticated;

drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify
  after insert or update on public.appointments
  for each row execute function public.notify_appointment_change();

-- ---------------------------------------------------------------------------
-- Review request seams (the only places a review token is minted)
-- ---------------------------------------------------------------------------
create or replace function public.create_review_request_internal(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_raw text;
  v_expires timestamptz := now() + interval '30 days';
  v_id uuid;
begin
  select a.id, a.business_id, a.branch_id, a.client_id into v_a
  from public.appointments a where a.id = p_appointment_id and a.deleted_at is null;
  if v_a.id is null then return null; end if;

  v_raw := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.review_requests (business_id, branch_id, appointment_id, client_id, token_hash, expires_at)
  values (v_a.business_id, v_a.branch_id, v_a.id, v_a.client_id,
          pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex'), v_expires)
  on conflict (appointment_id) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;  -- already had one: no new raw token

  -- Phase 6A: send it (sealed; same transaction as "mark completed").
  perform public.outbox_enqueue(v_a.business_id, v_a.branch_id, 'review_request',
    'review_request:' || v_id || ':' || left(pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex'), 16),
    v_a.id, v_a.client_id, null, v_id, now(), '{}'::jsonb, v_raw);

  return jsonb_build_object('token', v_raw, 'expires_at', v_expires);
end $$;
revoke all on function public.create_review_request_internal(uuid) from public, anon, authenticated;

create or replace function public.reissue_review_request(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_req record;
  v_raw text;
  v_expires timestamptz := now() + interval '30 days';
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status, a.client_id into v_a
  from public.appointments a where a.id = p_appointment_id and a.deleted_at is null for update of a;
  if v_a.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  if not public.can(v_a.business_id, v_a.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.has_permission_at_branch_scope(v_a.business_id, v_a.branch_id, 'appointments.edit') then
    if v_a.staff_id is null or not public.is_own_staff_profile(v_a.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;
  if v_a.status <> 'completed' then
    return jsonb_build_object('ok', false, 'code', 'not_completed');
  end if;

  select r.id, r.used_at into v_req from public.review_requests r
  where r.appointment_id = p_appointment_id and r.deleted_at is null for update;
  if v_req.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_req.used_at is not null
     or exists (select 1 from public.reviews rv where rv.appointment_id = p_appointment_id) then
    return jsonb_build_object('ok', false, 'code', 'already_reviewed');
  end if;

  v_raw := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  update public.review_requests
  set token_hash = pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex'),
      expires_at = v_expires, sent_at = null
  where id = v_req.id;

  perform public.write_audit_log(v_a.business_id, 'review_request.reissued', 'appointment',
    p_appointment_id::text, null, null);

  -- The old link just died, so the customer gets the new one (sealed, outbox).
  perform public.outbox_enqueue(v_a.business_id, v_a.branch_id, 'review_request',
    'review_request:' || v_req.id || ':' || left(pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex'), 16),
    v_a.id, v_a.client_id, null, v_req.id, now(), '{}'::jsonb, v_raw);

  return jsonb_build_object('ok', true, 'review_request',
    jsonb_build_object('token', v_raw, 'expires_at', v_expires));
end $$;

-- ---------------------------------------------------------------------------
-- Redefinitions that only ADD an enqueue call (bodies otherwise unchanged).
-- ---------------------------------------------------------------------------

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

  select a.id, a.business_id, a.branch_id, a.client_id, a.status, a.ends_at
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

  -- Phase 6A: send the new link through the outbox (token sealed, same transaction).
  perform public.outbox_enqueue(
    v_row.business_id, v_row.branch_id, 'manage_link',
    'manage_link:' || p_appointment_id || ':' || left(pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex'), 16),
    p_appointment_id, v_row.client_id, null, null, now(), '{}'::jsonb, v_token);

  return jsonb_build_object('ok', true, 'manage_token', v_token, 'expires_at', v_row.ends_at);
end;
$$;

create or replace function public.create_booking(
  p_branch_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_staff_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text default null,
  p_client_notes text default null,
  p_answers jsonb default '[]'::jsonb,
  p_manage_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_tz text;
  v_currency text;
  v_branch_name text;
  v_country text;
  v_dial_code text;

  v_enabled boolean;
  v_confirmation public.booking_confirmation_mode;
  v_staff_choice public.staff_choice_mode;
  v_notice integer;
  v_window integer;
  v_people integer;
  v_use_resources boolean;
  v_branch_buffer integer;
  v_require_email boolean;

  v_duration integer;
  v_service_buffer integer;
  v_buffer integer;
  v_service_name text;
  v_price_minor bigint;

  v_ends_at timestamptz;
  v_blocked_until timestamptz;
  v_local_date date;
  v_local_minute integer;
  v_today date;

  v_phone text;
  v_name text;
  v_email text;
  v_client_id uuid;

  v_staff_id uuid;
  v_staff_name text;
  v_resource_id uuid;
  v_resource_capacity integer := 1;
  v_needs_resource boolean;

  v_form_version_id uuid;
  v_fields jsonb;
  v_field jsonb;
  v_answer jsonb;
  v_value text;
  v_applies boolean;
  v_count integer;
  v_clean_answers jsonb := '[]'::jsonb;

  v_status public.appointment_status;
  v_is_exclusive boolean;
  v_appointment_id uuid;
  v_token text;
begin
  select b.business_id, b.timezone, b.currency, b.name, b.country_code
    into v_business_id, v_tz, v_currency, v_branch_name, v_country
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return jsonb_build_object('ok', false, 'code', 'business_inactive');
  end if;

  if not public.business_is_active(v_business_id) then
    return jsonb_build_object('ok', false, 'code', 'business_inactive');
  end if;

  select bs.online_booking_enabled, bs.confirmation, bs.staff_choice,
         bs.minimum_notice_minutes, bs.booking_window_days, bs.people_per_slot,
         bs.use_resources, bs.buffer_minutes, bs.require_client_email
    into v_enabled, v_confirmation, v_staff_choice,
         v_notice, v_window, v_people, v_use_resources, v_branch_buffer, v_require_email
  from public.booking_settings bs
  where bs.branch_id = p_branch_id and bs.deleted_at is null;

  if v_enabled is null or not v_enabled then
    return jsonb_build_object('ok', false, 'code', 'booking_disabled');
  end if;

  select s.duration_minutes, s.buffer_minutes, s.name
    into v_duration, v_service_buffer, v_service_name
  from public.services s
  where s.id = p_service_id
    and s.business_id = v_business_id
    and s.deleted_at is null
    and s.is_active
    and s.is_bookable_online;

  if v_duration is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_service');
  end if;

  select sb.price_minor into v_price_minor
  from public.service_branches sb
  where sb.service_id = p_service_id and sb.branch_id = p_branch_id and sb.enabled;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'service_unavailable');
  end if;

  v_buffer := case when coalesce(v_service_buffer, 0) > 0 then v_service_buffer else v_branch_buffer end;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  v_blocked_until := v_ends_at + make_interval(mins => v_buffer);
  v_local_date := (p_starts_at at time zone v_tz)::date;
  v_local_minute := extract(hour from (p_starts_at at time zone v_tz))::integer * 60
                  + extract(minute from (p_starts_at at time zone v_tz))::integer;
  v_today := (now() at time zone v_tz)::date;

  v_name := nullif(btrim(coalesce(p_client_name, '')), '');
  if v_name is null or char_length(v_name) > 160 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

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
  if v_email is not null
     and (v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 320) then
    -- Malformed. When email is OPTIONAL (doc §6.1 default) this is dropped
    -- rather than being fatal; when the branch REQUIRES it, dropping would lose
    -- the address the business depends on, so it is a rejection instead.
    v_email := null;
  end if;

  if coalesce(v_require_email, false) and v_email is null then
    return jsonb_build_object('ok', false, 'code', 'email_required');
  end if;

  if p_starts_at < now() + make_interval(mins => v_notice) then
    return jsonb_build_object('ok', false, 'code', 'too_soon');
  end if;

  if v_local_date > v_today + v_window then
    return jsonb_build_object('ok', false, 'code', 'outside_window');
  end if;

  v_form_version_id := public.ensure_form_version(v_business_id);
  select fv.fields into v_fields from public.form_versions fv where fv.id = v_form_version_id;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    p_answers := '[]'::jsonb;
  end if;

  if jsonb_array_length(p_answers) > 100 then
    return jsonb_build_object('ok', false, 'code', 'too_many_answers');
  end if;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    select f into v_field
    from jsonb_array_elements(v_fields) f
    where (f->>'id')::uuid = (v_answer->>'custom_field_id')::uuid;

    if v_field is null then
      return jsonb_build_object('ok', false, 'code', 'unknown_field',
                                'field_id', v_answer->>'custom_field_id');
    end if;

    v_applies := (v_field->>'applies_to_all_services')::boolean
                 or (v_field->'service_ids') @> to_jsonb(p_service_id::text);
    if not v_applies then
      return jsonb_build_object('ok', false, 'code', 'invalid_answer',
                                'field_id', v_field->>'id');
    end if;

    v_value := nullif(btrim(coalesce(v_answer->>'value', '')), '');

    if v_value is not null then
      if char_length(v_value) > 4000 then
        return jsonb_build_object('ok', false, 'code', 'invalid_answer',
                                  'field_id', v_field->>'id');
      end if;

      case v_field->>'field_type'
        when 'number' then
          if v_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
            return jsonb_build_object('ok', false, 'code', 'invalid_answer',
                                      'field_id', v_field->>'id');
          end if;
        when 'yes_no' then
          if lower(v_value) not in ('true', 'false') then
            return jsonb_build_object('ok', false, 'code', 'invalid_answer',
                                      'field_id', v_field->>'id');
          end if;
          v_value := lower(v_value);
        when 'dropdown' then
          if not ((v_field->'options') @> to_jsonb(v_value)) then
            return jsonb_build_object('ok', false, 'code', 'invalid_answer',
                                      'field_id', v_field->>'id');
          end if;
        when 'short_text' then
          if char_length(v_value) > 500 then
            return jsonb_build_object('ok', false, 'code', 'invalid_answer',
                                      'field_id', v_field->>'id');
          end if;
        else
          null;
      end case;
    end if;

    if v_value is not null then
      v_clean_answers := v_clean_answers || jsonb_build_object(
        'custom_field_id', v_field->>'id',
        'value', v_value,
        'is_sensitive', coalesce((v_field->>'is_sensitive')::boolean, false)
      );
    end if;
  end loop;

  for v_field in
    select f from jsonb_array_elements(v_fields) f
    where (f->>'is_required')::boolean
      and ((f->>'applies_to_all_services')::boolean
           or (f->'service_ids') @> to_jsonb(p_service_id::text))
  loop
    select a->>'value' into v_value
    from jsonb_array_elements(v_clean_answers) a
    where (a->>'custom_field_id')::uuid = (v_field->>'id')::uuid;

    if v_value is null then
      return jsonb_build_object('ok', false, 'code', 'missing_answer',
                                'field_id', v_field->>'id');
    end if;
  end loop;

  perform pg_advisory_xact_lock(
    hashtext('booking:' || p_branch_id::text || ':' || p_service_id::text),
    hashtext(p_starts_at::text)
  );

  v_is_exclusive := v_people <= 1;

  if p_staff_id is not null and v_staff_choice = 'hidden' then
    p_staff_id := null;
  end if;

  if p_staff_id is not null then
    select sp.id, sp.display_name into v_staff_id, v_staff_name
    from public.staff_profiles sp
    join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = p_branch_id
    join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = p_service_id
    where sp.id = p_staff_id
      and sp.business_id = v_business_id
      and sp.deleted_at is null
      and sp.is_active
      and sp.is_bookable_online;

    if v_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'staff_unavailable');
    end if;
  else
    v_staff_id := public.pick_staff_for_slot(p_branch_id, p_service_id, p_starts_at, v_blocked_until);
    if v_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_staff');
    end if;
    select sp.display_name into v_staff_name from public.staff_profiles sp where sp.id = v_staff_id;
  end if;

  if not exists (
    select 1
    from public.get_free_slots(p_branch_id, p_service_id, v_staff_id, v_local_date, v_local_date)
    where starts_at = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end if;

  if v_people > 1 then
    select count(*) into v_count
    from public.appointments a
    where a.staff_id = v_staff_id
      and a.service_id = p_service_id
      and a.starts_at = p_starts_at
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show');

    if v_count >= v_people then
      return jsonb_build_object('ok', false, 'code', 'slot_taken');
    end if;
  end if;

  select exists (select 1 from public.service_resources sr where sr.service_id = p_service_id)
    into v_needs_resource;

  if v_use_resources and v_needs_resource then
    select r.id, r.capacity into v_resource_id, v_resource_capacity
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.service_id = p_service_id
      and r.branch_id = p_branch_id
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

  select c.id into v_client_id
  from public.clients c
  where c.business_id = v_business_id
    and c.phone_e164 = v_phone
    and c.deleted_at is null;

  if v_client_id is null then
    insert into public.clients (business_id, full_name, phone_e164, email, first_branch_id, source)
    values (v_business_id, v_name, v_phone, v_email, p_branch_id, 'online')
    returning id into v_client_id;
  else
    update public.clients c
    set email = coalesce(c.email, v_email)
    where c.id = v_client_id
      and c.email is null
      and v_email is not null;
  end if;

  v_status := case when v_confirmation = 'manual' then 'pending' else 'confirmed' end;

  begin
    insert into public.appointments (
      business_id, branch_id, client_id, service_id, staff_id, resource_id,
      starts_at, ends_at, duration_minutes, buffer_minutes,
      status, source, client_notes, form_version_id, is_exclusive, price_minor,
      resource_capacity_at_booking
    )
    values (
      v_business_id, p_branch_id, v_client_id, p_service_id, v_staff_id, v_resource_id,
      p_starts_at, v_ends_at, v_duration, v_buffer,
      v_status, 'online', nullif(btrim(coalesce(p_client_notes, '')), ''),
      v_form_version_id, v_is_exclusive, v_price_minor,
      case when v_resource_id is null then 1 else coalesce(v_resource_capacity, 1) end
    )
    returning id into v_appointment_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_taken');
  end;

  insert into public.appointment_field_values
    (business_id, appointment_id, custom_field_id, form_version_id, value, is_sensitive)
  select
    v_business_id,
    v_appointment_id,
    (a->>'custom_field_id')::uuid,
    v_form_version_id,
    a->>'value',
    (a->>'is_sensitive')::boolean
  from jsonb_array_elements(v_clean_answers) a;

  v_token := coalesce(
    nullif(btrim(coalesce(p_manage_token, '')), ''),
    pg_catalog.encode(extensions.gen_random_bytes(32), 'hex')
  );

  if char_length(v_token) < 32 then
    v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  end if;

  insert into public.booking_manage_tokens
    (business_id, appointment_id, token_hash, expires_at)
  values (
    v_business_id, v_appointment_id,
    pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_ends_at
  );

  -- Phase 6A: seal the raw token into the confirmation row the appointments
  -- trigger just queued. Same transaction: if anything later fails, both vanish.
  perform public.outbox_attach_token(v_appointment_id, v_token);

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment_id,
    'status', v_status,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'local_date', v_local_date,
    'local_minute', v_local_minute,
    'timezone', v_tz,
    'service_name', v_service_name,
    'staff_name', v_staff_name,
    'branch_name', v_branch_name,
    'price_minor', v_price_minor,
    'currency', v_currency,
    'manage_token', v_token
  );
end;
$$;

comment on function public.create_booking is
  'The public booking write: one transaction, service_role only. Validates answers against the immutable form snapshot, re-checks the slot through get_free_slots under an advisory lock, counts group/resource capacity, upserts the client by phone WITHOUT overwriting, and issues a hashed manage token. Honours booking_settings.require_client_email. Returns jsonb {ok:true,...} or {ok:false,code,field_id} and never raises for an expected failure.';

