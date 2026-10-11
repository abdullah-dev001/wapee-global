-- Phase 6A, part 4: the worker's database surface (service_role only) plus the
-- small authenticated / super-admin RPCs.
--
-- THE WORKER LOOP (Edge Function send_outbox):
--   outbox_claim(n)  -> jobs (guards already applied; stale / suppressed / capped /
--                       no-rate rows are finished here and never returned)
--   SMS:  outbox_reserve_sms(id, body)  -> debit taken atomically with the decision
--   provider call (Resend / Twilio / Expo)
--   outbox_complete(id, ...)  or  outbox_fail(id, error, retryable)  (refunds SMS)
--
-- Every expected failure is a RETURNED code, never a raise.

-- ---------------------------------------------------------------------------
-- small internals
-- ---------------------------------------------------------------------------
create or replace function public.outbox_clean_error(p_text text)
returns text language sql immutable set search_path = '' as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(p_text, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '[email]', 'g'),
          'https?://[^[:space:]]+', '[url]', 'g'),
        '\+?[0-9][0-9 ()-]{6,}[0-9]', '[number]', 'g'),
      '[0-9a-fA-F]{32,}', '[hex]', 'g'),
    200);
$$;
revoke all on function public.outbox_clean_error(text) from public, anon, authenticated;

-- {address, hash, masked} for an outbox row's recipient (null for push).
create or replace function public.outbox_recipient(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o record;
  v_addr text;
begin
  select ob.channel, ob.client_id, ob.business_id into o from public.message_outbox ob where ob.id = p_id;
  if o.channel is null or o.channel = 'push' then
    return jsonb_build_object('address', null, 'hash', null, 'masked', case when o.channel = 'push' then 'push' else null end);
  end if;
  select case when o.channel = 'email' then c.email::text else c.phone_e164 end into v_addr
  from public.clients c where c.id = o.client_id and c.business_id = o.business_id and c.deleted_at is null;
  if v_addr is null then
    return jsonb_build_object('address', null, 'hash', null, 'masked', null);
  end if;
  return jsonb_build_object(
    'address', v_addr,
    'hash', public.message_recipient_hash(v_addr),
    'masked', case when o.channel = 'email' then public.mask_email(v_addr) else public.mask_phone(v_addr) end);
end $$;
revoke all on function public.outbox_recipient(uuid) from public, anon, authenticated;

create or replace function public.outbox_log(
  p_id uuid, p_status text, p_code text, p_error text,
  p_provider text default null, p_provider_id text default null,
  p_segments integer default null, p_encoding text default null, p_credits integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_r jsonb;
begin
  select * into o from public.message_outbox where id = p_id;
  if o.id is null then return; end if;
  v_r := public.outbox_recipient(p_id);
  insert into public.messages
    (business_id, branch_id, outbox_id, appointment_id, channel, event, recipient_hash, recipient_masked,
     status, code, provider, provider_id, encoding, segments, credits, error)
  values
    (o.business_id, o.branch_id, o.id, o.appointment_id, o.channel, o.event, v_r->>'hash', v_r->>'masked',
     p_status, p_code, p_provider, p_provider_id, p_encoding, p_segments, p_credits,
     nullif(public.outbox_clean_error(p_error), ''));
end $$;
revoke all on function public.outbox_log(uuid, text, text, text, text, text, integer, text, integer) from public, anon, authenticated;

-- Terminal non-success: dead or skipped. Nulls the sealed token, logs once.
create or replace function public.outbox_finish(p_id uuid, p_status text, p_code text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.outbox_log(p_id, case when p_status = 'dead' then 'failed' else 'skipped' end, p_code, p_error);
  update public.message_outbox
  set status = p_status, sealed = null, locked_until = null, finished_at = now(),
      last_error = coalesce(p_code, public.outbox_clean_error(p_error))
  where id = p_id;
end $$;
revoke all on function public.outbox_finish(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- outbox_guard: the skip decision. Returns a code, or null = go ahead.
-- ---------------------------------------------------------------------------
create or replace function public.outbox_guard(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.outbox_guard(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- outbox_job: everything the worker needs to render and send ONE row.
-- ---------------------------------------------------------------------------
create or replace function public.outbox_job(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j jsonb;
  v_r jsonb;
begin
  select jsonb_build_object(
    'id', o.id, 'channel', o.channel, 'event', o.event, 'attempt', o.attempts,
    'idempotency_key', o.idempotency_key,
    'business_id', o.business_id, 'branch_id', o.branch_id,
    'business_name', b.name, 'language', b.language, 'slug', b.slug,
    'branch_name', br.name, 'branch_address', br.address, 'branch_phone', br.phone, 'timezone', br.timezone,
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
    select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token))
    from public.message_outbox o2 join public.push_tokens t on t.user_id = o2.user_id
    where o2.id = p_id and o2.channel = 'push'), '[]'::jsonb));
  return j;
end $$;
revoke all on function public.outbox_job(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- outbox_claim
-- ---------------------------------------------------------------------------
create or replace function public.outbox_claim(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_code text;
  v_jobs jsonb := '[]'::jsonb;
begin
  -- 1. Recover rows whose worker died. An SMS that had its debit taken may have
  --    been sent: it is NEVER re-sent (dead, no refund). Everything else retries.
  for r in
    select id, attempts, max_attempts, channel, provider_call_at
    from public.message_outbox
    where status = 'sending' and locked_until < now()
    for update skip locked
  loop
    if r.channel = 'sms' and r.provider_call_at is not null then
      perform public.outbox_finish(r.id, 'dead', 'ambiguous_send', null);
    elsif r.attempts >= r.max_attempts then
      perform public.outbox_finish(r.id, 'dead', 'lock_expired', null);
    else
      update public.message_outbox set status = 'retry', deliver_after = now(), locked_until = null where id = r.id;
    end if;
  end loop;

  -- 2. Claim due rows.
  for r in
    select id from public.message_outbox
    where status in ('pending', 'retry') and deliver_after <= now()
    order by deliver_after, created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    v_code := public.outbox_guard(r.id);
    if v_code is not null then
      perform public.outbox_finish(r.id, 'skipped', v_code, null);
      continue;
    end if;
    update public.message_outbox
    set status = 'sending', attempts = attempts + 1, claimed_at = now(),
        locked_until = now() + interval '5 minutes', provider_call_at = null
    where id = r.id;
    v_jobs := v_jobs || jsonb_build_array(public.outbox_job(r.id));
  end loop;

  return v_jobs;
end $$;
revoke all on function public.outbox_claim(integer) from public, anon, authenticated;
grant execute on function public.outbox_claim(integer) to service_role;

-- ---------------------------------------------------------------------------
-- outbox_reserve_sms: count segments, find the rate, debit. ATOMIC with the send
-- decision; refuses with a stored skip when there is no rate or not enough credit.
-- Idempotent per (outbox row, attempt).
-- ---------------------------------------------------------------------------
create or replace function public.outbox_reserve_sms(p_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.message_outbox;
  v_phone text;
  v_rate public.sms_country_rates;
  v_seg record;
  v_credits bigint;
  v_post jsonb;
  v_existing record;
begin
  select * into o from public.message_outbox where id = p_id for update;
  if o.id is null or o.status <> 'sending' or o.channel <> 'sms' then
    return jsonb_build_object('ok', false, 'code', 'not_sending');
  end if;
  if p_body is null or btrim(p_body) = '' or char_length(p_body) > 1000 then
    perform public.outbox_finish(o.id, 'dead', 'bad_body', null);
    return jsonb_build_object('ok', false, 'code', 'bad_body');
  end if;

  select c.phone_e164 into v_phone from public.clients c where c.id = o.client_id and c.deleted_at is null;
  if v_phone is null then
    perform public.outbox_finish(o.id, 'skipped', 'no_recipient', null);
    return jsonb_build_object('ok', false, 'code', 'no_recipient');
  end if;

  -- Already debited for this attempt (a repeated call): return the same answer.
  select l.id, l.amount, l.segments, l.encoding into v_existing
  from public.sms_credit_ledger l where l.outbox_id = o.id and l.attempt = o.attempts and l.kind = 'debit';
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'to', v_phone, 'segments', v_existing.segments,
      'encoding', v_existing.encoding, 'credits', -v_existing.amount, 'ledger_id', v_existing.id);
  end if;

  v_rate := public.sms_rate_for(v_phone);
  if v_rate.dial_code is null then
    perform public.outbox_finish(o.id, 'skipped', 'no_rate', null);
    return jsonb_build_object('ok', false, 'code', 'no_rate');
  end if;

  select * into v_seg from public.sms_segments(p_body);
  v_credits := v_seg.out_segments::bigint * v_rate.credits_per_segment;

  v_post := public.sms_ledger_post(o.business_id, 'debit', -v_credits, o.id, o.attempts, null,
    v_rate.dial_code, v_seg.out_segments, v_seg.out_encoding, null, null);
  if not (v_post->>'ok')::boolean then
    perform public.outbox_finish(o.id, 'skipped', 'skipped_no_credits', null);
    return jsonb_build_object('ok', false, 'code', 'skipped_no_credits');
  end if;

  update public.message_outbox set provider_call_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'to', v_phone, 'segments', v_seg.out_segments,
    'encoding', v_seg.out_encoding, 'credits', v_credits, 'ledger_id', (v_post->>'ledger_id')::bigint);
end $$;
revoke all on function public.outbox_reserve_sms(uuid, text) from public, anon, authenticated;
grant execute on function public.outbox_reserve_sms(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- outbox_complete: success.
-- ---------------------------------------------------------------------------
create or replace function public.outbox_complete(
  p_id uuid, p_provider text, p_provider_id text, p_dead_tokens uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.message_outbox;
  v_segments integer;
  v_encoding text;
  v_credits integer;
begin
  select * into o from public.message_outbox where id = p_id for update;
  if o.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if o.status = 'sent' then return jsonb_build_object('ok', true, 'already', true); end if;
  if o.status <> 'sending' then return jsonb_build_object('ok', false, 'code', 'not_sending'); end if;

  if coalesce(array_length(p_dead_tokens, 1), 0) > 0 and o.channel = 'push' then
    delete from public.push_tokens where id = any (p_dead_tokens) and user_id = o.user_id;
  end if;

  if o.channel = 'sms' then
    select l.segments, l.encoding, (-l.amount)::integer into v_segments, v_encoding, v_credits
    from public.sms_credit_ledger l where l.outbox_id = o.id and l.attempt = o.attempts and l.kind = 'debit';
  end if;

  perform public.outbox_log(o.id, 'sent', null, null, p_provider, p_provider_id,
    v_segments, v_encoding, v_credits);

  update public.message_outbox
  set status = 'sent', sealed = null, locked_until = null, sent_at = now(), finished_at = now(), last_error = null
  where id = o.id;

  if o.event = 'review_request' and o.review_request_id is not null then
    update public.review_requests set sent_at = now() where id = o.review_request_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.outbox_complete(uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.outbox_complete(uuid, text, text, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- outbox_fail: provider failure. Refunds the SMS debit of THIS attempt (once),
-- then retries with backoff (1, 4, 16, 64 minutes) or goes dead.
-- ---------------------------------------------------------------------------
create or replace function public.outbox_fail(p_id uuid, p_error text, p_retryable boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.message_outbox;
  l record;
  v_dead boolean;
begin
  select * into o from public.message_outbox where id = p_id for update;
  if o.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if o.status <> 'sending' then return jsonb_build_object('ok', false, 'code', 'not_sending'); end if;

  if o.channel = 'sms' then
    select id, business_id, amount, dial_code, segments, encoding into l
    from public.sms_credit_ledger x where x.outbox_id = o.id and x.attempt = o.attempts and x.kind = 'debit';
    if l.id is not null and not exists (select 1 from public.sms_credit_ledger r where r.ref_ledger_id = l.id and r.kind = 'refund') then
      perform public.sms_ledger_post(l.business_id, 'refund', -l.amount, o.id, o.attempts, l.id,
        l.dial_code, l.segments, l.encoding, 'provider failure', null);
    end if;
  end if;

  v_dead := (not p_retryable) or o.attempts >= o.max_attempts;
  if v_dead then
    perform public.outbox_finish(o.id, 'dead', case when p_retryable then 'max_attempts' else 'rejected' end, p_error);
    return jsonb_build_object('ok', true, 'status', 'dead');
  end if;

  update public.message_outbox
  set status = 'retry', locked_until = null, provider_call_at = null,
      last_error = public.outbox_clean_error(p_error),
      deliver_after = now() + make_interval(mins => power(4, o.attempts - 1)::integer)
  where id = o.id;
  return jsonb_build_object('ok', true, 'status', 'retry');
end $$;
revoke all on function public.outbox_fail(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.outbox_fail(uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- suppress_recipient: used by the unsubscribe link and by Twilio STOP (21610).
-- Returns the same thing whether or not anything was inserted.
-- ---------------------------------------------------------------------------
create or replace function public.suppress_recipient(p_business uuid, p_channel text, p_hash text, p_source text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_channel not in ('email', 'sms') or p_hash !~ '^[0-9a-f]{64}$'
     or p_source not in ('unsubscribe_link', 'provider_stop', 'manual') then
    return false;
  end if;
  insert into public.message_suppressions (business_id, channel, recipient_hash, source)
  values (p_business, p_channel, p_hash, p_source) on conflict do nothing;
  return true;
exception when foreign_key_violation then
  return false;
end $$;
revoke all on function public.suppress_recipient(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.suppress_recipient(uuid, text, text, text) to service_role;

-- recipient_hash for the link builder is already in the job; this lets the
-- unsubscribe function stay free of any database key.

-- ---------------------------------------------------------------------------
-- outbox_worker_authorize: the cron call carries a token from Vault; the Edge
-- Function asks here whether it is genuine (constant-time compare).
-- ---------------------------------------------------------------------------
create or replace function public.outbox_worker_authorize(p_token text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_expected text := public.internal_secret('outbox_worker_token');
begin
  if p_token is null or v_expected is null or char_length(p_token) <> char_length(v_expected) then
    return false;
  end if;
  return extensions.digest(p_token, 'sha256') = extensions.digest(v_expected, 'sha256');
end $$;
revoke all on function public.outbox_worker_authorize(text) from public, anon, authenticated;
grant execute on function public.outbox_worker_authorize(text) to service_role;

-- ---------------------------------------------------------------------------
-- Push tokens (authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'not_signed_in'); end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^\]]{8,200}\]$' or p_platform not in ('ios', 'android', 'web') then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  -- A device that signs in as someone else moves to that user: one owner per token.
  insert into public.push_tokens (user_id, token, platform) values ((select auth.uid()), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
$$;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Super admin: credits and rates (audited)
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_sms_credits(p_business uuid, p_credits bigint, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_post jsonb;
begin
  if not public.is_super_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_credits is null or p_credits = 0 or abs(p_credits) > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_post := public.sms_ledger_post(p_business, case when p_credits > 0 then 'purchase' else 'adjustment' end,
    p_credits, null, null, null, null, null, null, left(p_note, 300), (select auth.uid()));
  if not (v_post->>'ok')::boolean then return jsonb_build_object('ok', false, 'code', 'insufficient'); end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_business, (select auth.uid()), 'sms.credits_changed', 'business', p_business::text, null,
          jsonb_build_object('credits', p_credits, 'balance_after', v_post->'balance'));
  return jsonb_build_object('ok', true, 'balance', (v_post->>'balance')::bigint);
end $$;
revoke all on function public.admin_add_sms_credits(uuid, bigint, text) from public, anon;
grant execute on function public.admin_add_sms_credits(uuid, bigint, text) to authenticated;

create or replace function public.admin_set_sms_rate(p_dial text, p_country text, p_credits integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_dial is null or p_dial !~ '^[1-9][0-9]{0,3}$' or p_country is null or p_country !~ '^[A-Z]{2}$'
     or p_credits is null or p_credits <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  insert into public.sms_country_rates (dial_code, country_code, credits_per_segment, note, updated_by)
  values (p_dial, p_country, p_credits, left(p_note, 300), (select auth.uid()))
  on conflict (dial_code) do update
    set country_code = excluded.country_code, credits_per_segment = excluded.credits_per_segment,
        note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (null, (select auth.uid()), 'sms.rate_changed', 'sms_country_rate', p_dial, null,
          jsonb_build_object('country', p_country, 'credits_per_segment', p_credits));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_set_sms_rate(text, text, integer, text) from public, anon;
grant execute on function public.admin_set_sms_rate(text, text, integer, text) to authenticated;
