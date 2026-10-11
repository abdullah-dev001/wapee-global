-- Phase 10A (4/4): the low-stock alert.
--
-- When a movement takes a product from ABOVE its alert level to AT or BELOW it, every active member
-- holding inventory.adjust for that branch is told ONCE: an email (`low_stock`) and a push
-- (`staff_low_stock`, only if they have a device). Both go through the existing outbox in the same
-- transaction as the stock movement; they are not repeated until the product is restocked above
-- the level and falls again. The worker re-checks everything at send time (`outbox_guard`): add-on
-- still on, recipient still holds the permission, product still low.

alter table public.message_outbox drop constraint message_outbox_event_check;
alter table public.message_outbox add constraint message_outbox_event_check check (event in (
  'booking_confirmed', 'pending_received', 'reminder', 'rescheduled', 'cancelled',
  'manage_link', 'review_request',
  'staff_new_booking', 'staff_pending_approval', 'staff_cancelled', 'staff_reminder',
  'report_summary', 'staff_low_stock', 'low_stock'));
alter table public.message_outbox drop constraint message_outbox_push_shape;
alter table public.message_outbox add constraint message_outbox_push_shape check (
  (event in ('report_summary', 'low_stock') and channel = 'email' and user_id is not null and client_id is null
     and appointment_id is null)
  or (event not in ('report_summary', 'low_stock')
      and (channel = 'push') = (user_id is not null)
      and (channel = 'push') = (event like 'staff\_%')
      and (channel <> 'push') = (client_id is not null)));

-- Members to alert for a branch: active, holding inventory.adjust at Branch/All scope for it.
create or replace function public.low_stock_recipients(p_business_id uuid, p_branch_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct m.user_id
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  join public.role_permissions rp on rp.role_id = a.role_id
  where m.business_id = p_business_id and m.status = 'active' and m.deleted_at is null and m.user_id is not null
    and rp.permission = 'inventory.adjust' and rp.scope in ('branch', 'all')
    and (rp.scope = 'all' or a.branch_id is null or a.branch_id = p_branch_id)
$$;
revoke all on function public.low_stock_recipients(uuid, uuid) from public, anon, authenticated;

create or replace function public.enqueue_low_stock(p_product_id uuid, p_movement_id uuid, p_stock integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_branch text;
  v_u uuid;
  v_payload jsonb;
begin
  select p.id, p.business_id, p.branch_id, p.name, p.unit, p.low_stock_threshold into v_p
  from public.products p where p.id = p_product_id;
  if v_p.id is null or not public.business_has_feature(v_p.business_id, 'inventory') then return; end if;
  select b.name into v_branch from public.branches b where b.id = v_p.branch_id;
  v_payload := jsonb_build_object('product_id', v_p.id, 'product', v_p.name, 'stock', p_stock,
                                  'threshold', v_p.low_stock_threshold, 'unit', v_p.unit, 'branch', v_branch);
  for v_u in select public.low_stock_recipients(v_p.business_id, v_p.branch_id) loop
    insert into public.message_outbox
      (business_id, branch_id, user_id, channel, event, idempotency_key, deliver_after, payload, max_attempts)
    values
      (v_p.business_id, v_p.branch_id, v_u, 'email', 'low_stock',
       'low_stock:' || p_product_id || ':' || p_movement_id || ':' || v_u, now(), v_payload,
       coalesce((select value from public.messaging_limits where key = 'max_attempts'), 5))
    on conflict (idempotency_key) do nothing;
    perform public.outbox_enqueue(v_p.business_id, v_p.branch_id, 'staff_low_stock',
      'staff_low_stock:' || p_product_id || ':' || p_movement_id || ':' || v_u, null, null, v_u, null, null, v_payload);
  end loop;
end $$;
revoke all on function public.enqueue_low_stock(uuid, uuid, integer) from public, anon, authenticated;

-- The movement trigger now raises the alert on the crossing.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_after integer;
  v_allow boolean;
begin
  select p.id, p.business_id, p.branch_id, p.stock_qty, p.deleted_at, p.is_active, p.low_stock_threshold into v_p
  from public.products p where p.id = new.product_id for update;
  if v_p.id is null or v_p.business_id <> new.business_id or v_p.branch_id <> new.branch_id then
    raise exception 'Stock movement does not match its product' using errcode = '23514';
  end if;
  v_after := v_p.stock_qty + new.quantity;
  select coalesce((select s.allow_negative_stock from public.inventory_settings s where s.branch_id = new.branch_id), false)
    into v_allow;
  if v_after < 0 and new.quantity < 0 and not v_allow then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;
  new.stock_after := v_after;
  perform set_config('wapee.stock', 'on', true);
  update public.products set stock_qty = v_after where id = new.product_id;
  perform set_config('wapee.stock', 'off', true);
  if new.quantity < 0 and v_p.deleted_at is null and v_p.is_active and v_p.low_stock_threshold is not null
     and v_p.stock_qty > v_p.low_stock_threshold and v_after <= v_p.low_stock_threshold then
    perform public.enqueue_low_stock(new.product_id, new.id, v_after);
  end if;
  return new;
end $$;
revoke all on function public.apply_stock_movement() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.outbox_recipient(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  o record;
  v_addr text;
begin
  select ob.channel, ob.client_id, ob.business_id, ob.user_id, ob.event into o
  from public.message_outbox ob where ob.id = p_id;
  if o.channel is null or o.channel = 'push' then
    return jsonb_build_object('address', null, 'hash', null, 'masked', case when o.channel = 'push' then 'push' else null end);
  end if;
  if o.event in ('report_summary', 'low_stock') then
    select p.email::text into v_addr
    from public.profiles p
    join public.business_members m on m.user_id = p.id and m.business_id = o.business_id
         and m.status = 'active' and m.deleted_at is null
    where p.id = o.user_id limit 1;
  else
    select case when o.channel = 'email' then c.email::text else c.phone_e164 end into v_addr
    from public.clients c where c.id = o.client_id and c.business_id = o.business_id and c.deleted_at is null;
  end if;
  if v_addr is null then
    return jsonb_build_object('address', null, 'hash', null, 'masked', null);
  end if;
  return jsonb_build_object(
    'address', v_addr,
    'hash', public.message_recipient_hash(v_addr),
    'masked', case when o.channel = 'email' then public.mask_email(v_addr) else public.mask_phone(v_addr) end);
end $fn$;
revoke all on function public.outbox_recipient(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.outbox_guard(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  o public.message_outbox;
  a record;
  rr record;
  v_r jsonb;
  v_sms_on boolean;
  v_cap integer;
  v_used integer;
begin
  select * into o from public.message_outbox where id = p_id;

  if not public.business_is_active(o.business_id) then return 'business_inactive'; end if;

  -- report_summary: the recipient must STILL be an active member holding
  -- reports.view_advanced at all scope, and the plan must still have the feature.
  if o.event = 'report_summary' then
    if not public.business_has_feature(o.business_id, 'advanced_reports')
       or not public.user_holds_all_scope(o.business_id, o.user_id, 'reports.view_advanced') then
      return 'stale';
    end if;
  end if;

  -- low stock: the recipient must STILL hold inventory.adjust for the branch, the add-on must still
  -- be on and the product must still be low (a restock between queueing and sending cancels it).
  if o.event in ('low_stock', 'staff_low_stock') then
    if not public.business_has_feature(o.business_id, 'inventory')
       or not exists (select 1 from public.low_stock_recipients(o.business_id, o.branch_id) r(user_id) where r.user_id = o.user_id)
       or not exists (select 1 from public.products p
                      where p.id = nullif(o.payload ->> 'product_id', '')::uuid and p.deleted_at is null and p.is_active
                        and p.low_stock_threshold is not null and p.stock_qty <= p.low_stock_threshold) then
      return 'stale';
    end if;
  end if;

  if o.appointment_id is not null then
    select ap.status, ap.starts_at, ap.deleted_at into a from public.appointments ap where ap.id = o.appointment_id;
    if a.status is null or a.deleted_at is not null then return 'stale'; end if;
    if o.event in ('reminder', 'staff_reminder') and (a.status <> 'confirmed' or a.starts_at <= now()) then
      return 'stale';
    end if;
    if o.event in ('booking_confirmed', 'pending_received', 'rescheduled') and a.status = 'cancelled' then
      return 'stale';
    end if;
  end if;

  if o.event = 'review_request' then
    select r.used_at, r.expires_at, r.deleted_at into rr from public.review_requests r where r.id = o.review_request_id;
    if rr.expires_at is null or rr.used_at is not null or rr.deleted_at is not null or rr.expires_at <= now() then
      return 'stale';
    end if;
  end if;

  if o.channel = 'push' then
    if not exists (select 1 from public.push_tokens t where t.user_id = o.user_id) then return 'no_token'; end if;
  else
    v_r := public.outbox_recipient(p_id);
    if v_r->>'address' is null then return 'no_recipient'; end if;
    if o.channel = 'sms' then
      select ns.sms_enabled into v_sms_on from public.notification_settings ns where ns.branch_id = o.branch_id;
      if not coalesce(v_sms_on, false) then return 'sms_disabled'; end if;
    end if;
    -- Opt-out applies to the optional events only. Transactional ones always go.
    if o.event in ('reminder', 'review_request')
       and exists (select 1 from public.message_suppressions s
                   where s.business_id = o.business_id and s.channel = o.channel
                     and s.recipient_hash = v_r->>'hash') then
      return 'suppressed';
    end if;
    -- Per-recipient cap across all businesses.
    select value into v_cap from public.messaging_limits where key = 'recipient_daily';
    select count(*) into v_used from public.messages m
    where m.recipient_hash = v_r->>'hash' and m.status = 'sent' and m.created_at > now() - interval '24 hours';
    if v_used >= coalesce(v_cap, 5) then return 'recipient_cap'; end if;
  end if;

  -- Per-business daily cap (UTC day), counting rows already claimed or sent today.
  select value into v_cap from public.messaging_limits where key = 'daily_' || o.channel;
  select count(*) into v_used from public.message_outbox x
  where x.business_id = o.business_id and x.channel = o.channel and x.id <> o.id
    and x.status in ('sending', 'sent')
    and x.claimed_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  if v_used >= coalesce(v_cap, 500) then return 'daily_cap'; end if;

  return null;
end $fn$;
revoke all on function public.outbox_guard(uuid) from public, anon, authenticated;
