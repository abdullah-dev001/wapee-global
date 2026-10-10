-- Public booking: a customer can choose WHICH location to book (docs/business-flows.md gap 1).
--
-- What already worked: get_booking_page / get_slots / create_booking accept an optional branch_id
-- and the engine (get_free_slots, create_booking) is per branch. What was missing:
--   * a way to LIST the branches a customer may book, with name / address / time zone;
--   * the manage page showing the branch address;
--   * the client portal "book a visit" always using the primary branch.
--
-- Only functions are added or replaced here: no table, column or policy changes.
-- The short code a link can carry (`?branch=<code>`) is the branch's invoice prefix: it is already
-- unique per business, constrained to ^[A-Z0-9][A-Z0-9-]{0,9}$, and frozen after the first invoice.

-- ---------------------------------------------------------------------------
-- get_bookable_branches: the locations a customer may pick (service_role only)
-- ---------------------------------------------------------------------------
-- "Bookable" is exactly branch_is_bookable(): online booking on, hours, a staffed service and staff
-- hours. Archived branches never appear. Public fields only; the Edge Function maps them again.
create or replace function public.get_bookable_branches(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', br.id,
        'name', br.name,
        'address', br.address,
        'timezone', br.timezone,
        'currency', br.currency,
        'country_code', br.country_code,
        'is_primary', br.is_primary,
        'code', br.invoice_prefix
      )
      order by br.is_primary desc, br.name, br.id
    ),
    '[]'::jsonb
  )
  from public.branches br
  where br.business_id = p_business_id
    and br.deleted_at is null
    and coalesce((public.branch_is_bookable(br.id) ->> 'bookable')::boolean, false);
$$;

comment on function public.get_bookable_branches is
  'The business''s live branches that pass branch_is_bookable(), primary first. Public fields only. service_role only (called by get_booking_page).';

revoke all on function public.get_bookable_branches(uuid) from public, anon, authenticated;
grant execute on function public.get_bookable_branches(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- get_booking: + branch_address (same body as 20261004100000)
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
    br.timezone, br.currency, br.name as branch_name, br.address as branch_address,
    biz.name as business_name,
    s.name as service_name,
    sp.display_name as staff_name,
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
    'branch_address', v_row.branch_address,
    'business_name', v_row.business_name,
    'client_first_name', v_row.client_first_name,
    'price_minor', v_row.price_minor,
    'currency', v_row.currency,
    'can_cancel', v_can_cancel,
    'can_reschedule', v_can_cancel,
    'cancel_cutoff_hours', v_row.cancel_cutoff_hours
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- portal_create_booking: optional branch (null = primary, as before)
-- ---------------------------------------------------------------------------
drop function if exists public.portal_create_booking(text, uuid, uuid, timestamptz, uuid, text);

create function public.portal_create_booking(
  p_session text,
  p_client_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_staff_id uuid default null,
  p_notes text default null,
  p_branch_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.portal_ctx(p_session);
  v_biz uuid;
  v_client record;
  v_branch uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  r jsonb;
  v_owner uuid;
begin
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  if p_client_id is null or not (v_ctx -> 'client_ids') ? p_client_id::text then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  select c.id, c.full_name, c.phone_e164, c.email::text as email into v_client from public.clients c where c.id = p_client_id and c.business_id = v_biz and c.deleted_at is null;
  if v_client.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  if p_branch_id is not null then
    -- A branch of another business (or an archived one) is reported like "not bookable".
    select b.id into v_branch from public.branches b
    where b.id = p_branch_id and b.business_id = v_biz and b.deleted_at is null;
  else
    select b.id into v_branch from public.branches b where b.business_id = v_biz and b.is_primary and b.deleted_at is null limit 1;
  end if;
  if v_branch is null then return jsonb_build_object('ok', false, 'code', 'not_bookable'); end if;

  r := public.create_booking(v_branch, p_service_id, p_starts_at, p_staff_id, v_client.full_name, v_client.phone_e164, v_client.email,
                             nullif(btrim(coalesce(p_notes, '')), ''), '[]'::jsonb, v_token);
  if not (r ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', case r ->> 'code' when 'missing_answer' then 'needs_details' when 'invalid_answer' then 'needs_details' else coalesce(r ->> 'code', 'server_error') end);
  end if;
  select a.client_id into v_owner from public.appointments a where a.id = (r ->> 'appointment_id')::uuid;
  perform public.portal_audit(v_biz, 'portal.booking_created', 'appointment', r ->> 'appointment_id',
    jsonb_build_object('client_id', p_client_id, 'service_id', p_service_id, 'starts_at', p_starts_at, 'branch_id', v_branch, 'same_client', v_owner = p_client_id));
  return jsonb_build_object('ok', true, 'appointment_id', r -> 'appointment_id', 'status', r -> 'status', 'starts_at', r -> 'starts_at',
                            'ends_at', r -> 'ends_at', 'service_name', r -> 'service_name');
end $$;

revoke all on function public.portal_create_booking(text, uuid, uuid, timestamptz, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.portal_create_booking(text, uuid, uuid, timestamptz, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- outbox_job: + branch_count, so a message names the location only when there is a choice
-- (same body as 20261020100100)
-- ---------------------------------------------------------------------------
create or replace function public.outbox_job(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j jsonb;
  v_r jsonb;
begin
  select jsonb_build_object(
    'id', o.id, 'channel', o.channel, 'event', o.event, 'attempt', o.attempts,
    'idempotency_key', case when o.idem_suffix = 0 then o.idempotency_key else o.idempotency_key || ':' || o.idem_suffix end,
    'business_id', o.business_id, 'branch_id', o.branch_id,
    'business_name', b.name, 'language', b.language, 'slug', b.slug,
    'branch_name', br.name, 'branch_address', br.address, 'branch_phone', br.phone, 'timezone', br.timezone,
    'branch_count', (select count(*) from public.branches x where x.business_id = o.business_id and x.deleted_at is null),
    'starts_at', a.starts_at, 'appointment_status', a.status,
    'service_name', s.name, 'staff_name', sp.display_name,
    'client_first_name', split_part(coalesce(c.full_name, ''), ' ', 1),
    'client_name', c.full_name,
    'payload', o.payload,
    'token', public.outbox_unseal(o.sealed)
  ) into j
  from public.message_outbox o
  join public.businesses b on b.id = o.business_id
  join public.branches br on br.id = o.branch_id
  left join public.appointments a on a.id = o.appointment_id
  left join public.services s on s.id = a.service_id
  left join public.staff_profiles sp on sp.id = a.staff_id
  left join public.clients c on c.id = o.client_id
  where o.id = p_id;

  v_r := public.outbox_recipient(p_id);
  j := j || jsonb_build_object('to', v_r->'address', 'recipient_hash', v_r->'hash');
  j := j || jsonb_build_object('tokens', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform, 'web_keys', t.web_keys))
    from public.message_outbox o2 join public.push_tokens t on t.user_id = o2.user_id
    where o2.id = p_id and o2.channel = 'push'), '[]'::jsonb));
  return j;
end $$;
revoke all on function public.outbox_job(uuid) from public, anon, authenticated;
