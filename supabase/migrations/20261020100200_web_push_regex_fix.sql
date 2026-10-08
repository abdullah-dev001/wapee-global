-- Fixes 20261020100000: a Postgres regex repetition is capped at 255, so `{8,2000}` is invalid and only failed
-- when a web row was evaluated. Length is checked with char_length instead.
alter table public.push_tokens drop constraint push_tokens_shape_check;
alter table public.push_tokens add constraint push_tokens_shape_check check (
  (platform in ('ios', 'android')
     and token ~ '^Expo(nent)?PushToken\[[^\]]{8,200}\]$'
     and web_keys is null)
  or
  (platform = 'web'
     and token ~ '^https://[^[:space:]]+$'
     and char_length(token) between 16 and 2048
     and jsonb_typeof(web_keys) = 'object'
     and jsonb_typeof(web_keys->'p256dh') = 'string'
     and jsonb_typeof(web_keys->'auth') = 'string'
     and length(web_keys->>'p256dh') between 20 and 200
     and length(web_keys->>'auth') between 8 and 100)
);

create or replace function public.register_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'not_signed_in'); end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) not between 16 and 2048
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

