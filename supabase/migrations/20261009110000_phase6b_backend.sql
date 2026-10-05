-- Phase 6B backend (notifications UI):
--   * the messages log is readable with settings.booking (Owner + Manager), as decided
--   * push_preferences: per user, per business, one switch per push event
--   * outbox_enqueue honours those switches
--   * get_appointment_messages: send status for the appointment detail (no recipient)

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_super_admin() or public.can(business_id, branch_id, 'settings.booking'));

create table public.push_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  new_booking boolean not null default true,
  pending_approval boolean not null default true,
  cancelled boolean not null default true,
  reminder boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index push_preferences_business_idx on public.push_preferences (business_id);
alter table public.push_preferences enable row level security;
create policy push_preferences_select_own on public.push_preferences
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_preferences from anon, authenticated;
grant select on public.push_preferences to authenticated;
grant all on public.push_preferences to service_role;

create or replace function public.save_push_preferences(p_business uuid, p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  k text;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'code', 'not_signed_in'); end if;
  if not public.is_member(p_business) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  for k in select jsonb_object_keys(p_prefs) loop
    if k not in ('new_booking', 'pending_approval', 'cancelled', 'reminder')
       or jsonb_typeof(p_prefs -> k) <> 'boolean' then
      return jsonb_build_object('ok', false, 'code', 'invalid');
    end if;
  end loop;

  insert into public.push_preferences (user_id, business_id, new_booking, pending_approval, cancelled, reminder)
  values (v_user, p_business,
          coalesce((p_prefs ->> 'new_booking')::boolean, true),
          coalesce((p_prefs ->> 'pending_approval')::boolean, true),
          coalesce((p_prefs ->> 'cancelled')::boolean, true),
          coalesce((p_prefs ->> 'reminder')::boolean, true))
  on conflict (user_id, business_id) do update set
    new_booking = coalesce((p_prefs ->> 'new_booking')::boolean, push_preferences.new_booking),
    pending_approval = coalesce((p_prefs ->> 'pending_approval')::boolean, push_preferences.pending_approval),
    cancelled = coalesce((p_prefs ->> 'cancelled')::boolean, push_preferences.cancelled),
    reminder = coalesce((p_prefs ->> 'reminder')::boolean, push_preferences.reminder),
    updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.save_push_preferences(uuid, jsonb) from public, anon;
grant execute on function public.save_push_preferences(uuid, jsonb) to authenticated;

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
    -- The user's own per-event switch (no row = everything on).
    if exists (select 1 from public.push_preferences pp
               where pp.user_id = p_user and pp.business_id = p_business
                 and not case p_event
                   when 'staff_new_booking' then pp.new_booking
                   when 'staff_pending_approval' then pp.pending_approval
                   when 'staff_cancelled' then pp.cancelled
                   when 'staff_reminder' then pp.reminder
                   else true end) then
      return null;
    end if;
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

-- ---------------------------------------------------------------------------
-- get_appointment_messages: what happened to the CLIENT messages of one
-- appointment. Event / channel / status / code only: never a recipient, a body or
-- a link. Branch-or-wider appointments.view only (Staff at Own scope get nothing).
-- Status: sent | failed | skipped | queued (still in the outbox).
-- ---------------------------------------------------------------------------
create or replace function public.get_appointment_messages(p_appointment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_a record;
  v_items jsonb;
begin
  select a.id, a.business_id, a.branch_id into v_a
  from public.appointments a where a.id = p_appointment_id and a.deleted_at is null;
  if v_a.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.can(v_a.business_id, v_a.branch_id, 'appointments.view')
     or not public.has_permission_at_branch_scope(v_a.business_id, v_a.branch_id, 'appointments.view') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event', x.event, 'channel', x.channel, 'status', x.status, 'code', x.code, 'at', x.at)
         order by x.at desc), '[]'::jsonb)
  into v_items
  from (
    select * from (
      select m.event, m.channel, m.status, m.code, m.created_at as at
      from public.messages m
      where m.appointment_id = p_appointment_id and m.event not like 'staff\_%'
      union all
      select o.event, o.channel, 'queued', null, o.created_at
      from public.message_outbox o
      where o.appointment_id = p_appointment_id and o.status in ('pending', 'retry', 'sending')
        and o.event not like 'staff\_%'
    ) u order by u.at desc limit 20
  ) x;

  return jsonb_build_object('ok', true, 'items', v_items);
end $$;
revoke all on function public.get_appointment_messages(uuid) from public, anon;
grant execute on function public.get_appointment_messages(uuid) to authenticated;
