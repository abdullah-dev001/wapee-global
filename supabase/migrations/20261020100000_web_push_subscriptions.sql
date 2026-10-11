-- Web Push (VAPID) subscriptions live in push_tokens with platform = 'web':
--   token    = the subscription endpoint URL (unique, https)
--   web_keys = {"p256dh": "...", "auth": "..."}  (null for ios / android)
-- Native rows keep the Expo token shape. The send path (send_outbox) routes by platform.

alter table public.push_tokens add column web_keys jsonb;

alter table public.push_tokens drop constraint push_tokens_token_check;
alter table public.push_tokens add constraint push_tokens_shape_check check (
  (platform in ('ios', 'android')
     and token ~ '^Expo(nent)?PushToken\[[^\]]{8,200}\]$'
     and web_keys is null)
  or
  (platform = 'web'
     and token ~ '^https://[^\s]{8,2000}$'
     and jsonb_typeof(web_keys) = 'object'
     and jsonb_typeof(web_keys->'p256dh') = 'string'
     and jsonb_typeof(web_keys->'auth') = 'string'
     and length(web_keys->>'p256dh') between 20 and 200
     and length(web_keys->>'auth') between 8 and 100)
);

-- Native registration no longer accepts 'web' (it has its own RPC).
create or replace function public.register_push_token(p_token text, p_platform text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'not_signed_in'); end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^\]]{8,200}\]$' or p_platform not in ('ios', 'android') then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  insert into public.push_tokens (user_id, token, platform, web_keys) values ((select auth.uid()), p_token, p_platform, null)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, web_keys = null, last_seen_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.register_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'not_signed_in'); end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^\s]{8,2000}$'
     or p_p256dh is null or length(p_p256dh) not between 20 and 200
     or p_auth is null or length(p_auth) not between 8 and 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid_subscription');
  end if;
  -- A browser that signs in as someone else moves to that user: one owner per endpoint.
  insert into public.push_tokens (user_id, token, platform, web_keys)
  values ((select auth.uid()), p_endpoint, 'web', jsonb_build_object('p256dh', p_p256dh, 'auth', p_auth))
  on conflict (token) do update
    set user_id = excluded.user_id, platform = 'web', web_keys = excluded.web_keys, last_seen_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.register_web_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_web_push_subscription(text, text, text) to authenticated;

-- The worker needs platform + keys per token.
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
    select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform, 'web_keys', t.web_keys))
    from public.message_outbox o2 join public.push_tokens t on t.user_id = o2.user_id
    where o2.id = p_id and o2.channel = 'push'), '[]'::jsonb));
  return j;
end $$;
revoke all on function public.outbox_job(uuid) from public, anon, authenticated;
