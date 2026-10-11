-- Phase 10C (3/3): outbox_guard re-checks a queued portal_login email at send time. Event + constraint are in 20261015090000.
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

  -- form_request: the signing link must still be usable, the add-on on and the client still reachable.
  if o.event = 'form_request' then
    if not public.business_has_feature(o.business_id, 'forms_consent')
       or not exists (select 1 from public.form_requests fr
                      where fr.id = nullif(o.payload ->> 'request_id', '')::uuid
                        and fr.used_at is null and fr.revoked_at is null and fr.expires_at > now()) then
      return 'stale';
    end if;
  end if;

  -- portal_login: the link must still be usable and the portal add-on on (a sign-in email that can no
  -- longer work is never sent).
  if o.event = 'portal_login' then
    if not public.business_has_feature(o.business_id, 'client_portal')
       or not exists (select 1 from public.portal_login_tokens pt
                      where pt.id = nullif(o.payload ->> 'token_id', '')::uuid
                        and pt.used_at is null and pt.revoked_at is null and pt.expires_at > now()) then
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
