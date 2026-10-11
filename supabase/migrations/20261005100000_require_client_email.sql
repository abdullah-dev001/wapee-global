-- `require_client_email`: the one toggleable default booking-form field.
--
-- WHY THIS COLUMN EXISTS
-- ---------------------
-- Doc §6.1 lists the default fields and says the owner "can only change
-- required/optional where allowed". Working through which of them can actually
-- move:
--
--   * Name     — required, locked. A booking with no name is not usable.
--   * Phone    — required, locked. It is the client IDENTITY: `clients` has a
--                unique index on (business_id, phone_e164) and `create_booking`
--                matches a returning customer by it. Optional phone would break
--                client matching outright, so this is not a product choice.
--   * Service / Date and time — structural, not form fields.
--   * Notes    — optional, locked. The doc lists it without qualification and a
--                mandatory free-text box mostly annoys customers.
--   * Email    — **the real toggle.** A clinic that emails every confirmation
--                needs it; a barber taking walk-in bookings does not.
--
-- So one boolean, defaulting to FALSE because doc §6.2's default is "Email
-- (optional)".
--
-- WHERE IT IS ENFORCED
-- -------------------
-- `create_booking` currently treats a malformed email as "drop it and carry on",
-- which is right when email is optional. With this on, a missing or malformed
-- address becomes a rejection with its own code, so the public page can mark the
-- field rather than silently losing it.

alter table public.booking_settings
  add column require_client_email boolean not null default false;

comment on column public.booking_settings.require_client_email is
  'Doc §6.1: email is the one default field whose required/optional state the owner may change. Name and phone are locked required (phone is the client identity), notes locked optional.';

-- ---------------------------------------------------------------------------
-- save_booking_settings: accept the new key
-- ---------------------------------------------------------------------------
-- Only the keys present in p_settings change, so adding one is a single line in
-- the UPDATE. Everything else about the function is unchanged, including the
-- people_per_slot downgrade guard.
create or replace function public.save_booking_settings(
  p_branch_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_tz text;
  v_new_people integer;
  v_old_people integer;
  v_conflict record;
  v_rows integer;
begin
  select b.business_id, b.timezone into v_business_id, v_tz
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_branch');
  end if;

  if not public.can(v_business_id, p_branch_id, 'settings.booking') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid_value');
  end if;

  select bs.people_per_slot into v_old_people
  from public.booking_settings bs
  where bs.branch_id = p_branch_id and bs.deleted_at is null;

  if v_old_people is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_branch');
  end if;

  -- --- The people_per_slot guard (unchanged) -------------------------------
  if p_settings ? 'people_per_slot' then
    v_new_people := (p_settings->>'people_per_slot')::integer;

    if v_new_people is null or v_new_people < 1 or v_new_people > 100 then
      return jsonb_build_object('ok', false, 'code', 'invalid_value',
                                'field', 'people_per_slot');
    end if;

    if v_new_people < v_old_people then
      select a.starts_at, a.staff_id, a.service_id, count(*) as booked
        into v_conflict
      from public.appointments a
      where a.branch_id = p_branch_id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        and a.starts_at > now()
      group by a.starts_at, a.staff_id, a.service_id
      having count(*) > v_new_people
      order by count(*) desc, a.starts_at
      limit 1;

      if v_conflict.starts_at is not null then
        return jsonb_build_object(
          'ok', false,
          'code', 'people_per_slot_conflict',
          'conflict', jsonb_build_object(
            'starts_at', v_conflict.starts_at,
            'local_date', (v_conflict.starts_at at time zone v_tz)::date,
            'local_minute',
              extract(hour from (v_conflict.starts_at at time zone v_tz))::integer * 60
            + extract(minute from (v_conflict.starts_at at time zone v_tz))::integer,
            'booked', v_conflict.booked,
            'new_limit', v_new_people,
            'service_name', (select s.name from public.services s where s.id = v_conflict.service_id),
            'staff_name', (select sp.display_name from public.staff_profiles sp where sp.id = v_conflict.staff_id),
            -- How many FUTURE slots are over the new limit, so the UI can say
            -- "3 upcoming bookings conflict" rather than naming only the worst.
            'conflicting_slots', (
              select count(*) from (
                select 1
                from public.appointments a2
                where a2.branch_id = p_branch_id
                  and a2.deleted_at is null
                  and a2.status not in ('cancelled', 'no_show')
                  and a2.starts_at > now()
                group by a2.starts_at, a2.staff_id, a2.service_id
                having count(*) > v_new_people
              ) x
            )
          )
        );
      end if;
    end if;
  end if;

  update public.booking_settings bs
  set
    online_booking_enabled = coalesce((p_settings->>'online_booking_enabled')::boolean, bs.online_booking_enabled),
    staff_choice           = coalesce((p_settings->>'staff_choice')::public.staff_choice_mode, bs.staff_choice),
    slot_display           = coalesce((p_settings->>'slot_display')::public.slot_display_mode, bs.slot_display),
    confirmation           = coalesce((p_settings->>'confirmation')::public.booking_confirmation_mode, bs.confirmation),
    show_prices            = coalesce((p_settings->>'show_prices')::boolean, bs.show_prices),
    slot_interval          = coalesce((p_settings->>'slot_interval')::public.slot_interval_mode, bs.slot_interval),
    buffer_minutes         = coalesce((p_settings->>'buffer_minutes')::integer, bs.buffer_minutes),
    minimum_notice_minutes = coalesce((p_settings->>'minimum_notice_minutes')::integer, bs.minimum_notice_minutes),
    booking_window_days    = coalesce((p_settings->>'booking_window_days')::integer, bs.booking_window_days),
    customer_can_cancel    = coalesce((p_settings->>'customer_can_cancel')::boolean, bs.customer_can_cancel),
    cancel_cutoff_hours    = coalesce((p_settings->>'cancel_cutoff_hours')::integer, bs.cancel_cutoff_hours),
    use_resources          = coalesce((p_settings->>'use_resources')::boolean, bs.use_resources),
    people_per_slot        = coalesce((p_settings->>'people_per_slot')::integer, bs.people_per_slot),
    require_client_email   = coalesce((p_settings->>'require_client_email')::boolean, bs.require_client_email)
  where bs.branch_id = p_branch_id and bs.deleted_at is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.save_booking_settings is
  'Saves booking settings. Only keys present in p_settings change. Blocks LOWERING people_per_slot when a FUTURE slot already holds more bookings than the new limit, returning the offending slot AND the count of conflicting slots so the UI can explain. Never rewrites existing appointments. SECURITY INVOKER: RLS stays the boundary.';

revoke all on function public.save_booking_settings(uuid, jsonb) from public;
revoke execute on function public.save_booking_settings(uuid, jsonb) from anon;
grant execute on function public.save_booking_settings(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- create_booking: honour the flag
-- ---------------------------------------------------------------------------
-- Only the email handling changes. When the branch requires an email, a missing
-- or malformed one is a rejection (`email_required`) instead of being quietly
-- dropped — a silent drop would lose the address the business is relying on.
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

revoke all on function public.create_booking(uuid, uuid, timestamptz, uuid, text, text, text, text, jsonb, text) from public;
revoke execute on function public.create_booking(uuid, uuid, timestamptz, uuid, text, text, text, text, jsonb, text) from anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, uuid, text, text, text, text, jsonb, text) to service_role;
