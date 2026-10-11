-- Phase 6A, part 7: worker tweaks found while writing the Edge code.
--   * outbox_claim gains p_channels: the worker only claims channels whose provider
--     secrets are configured, so an unconfigured Twilio leaves SMS rows waiting
--     (they expire after 48 h) instead of burning attempts.
--   * push_remove_dead_tokens: Expo says DeviceNotRegistered -> forget the token.

drop function if exists public.outbox_claim(integer);

create or replace function public.outbox_claim(p_limit integer default 20, p_channels text[] default null)
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
      and (p_channels is null or channel = any (p_channels))
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
revoke all on function public.outbox_claim(integer, text[]) from public, anon, authenticated;
grant execute on function public.outbox_claim(integer, text[]) to service_role;

create or replace function public.push_remove_dead_tokens(p_outbox uuid, p_token_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_n integer;
begin
  select user_id into v_user from public.message_outbox where id = p_outbox and channel = 'push';
  if v_user is null or coalesce(array_length(p_token_ids, 1), 0) = 0 then return 0; end if;
  delete from public.push_tokens where id = any (p_token_ids) and user_id = v_user;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.push_remove_dead_tokens(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.push_remove_dead_tokens(uuid, uuid[]) to service_role;
