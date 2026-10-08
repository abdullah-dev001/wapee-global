-- Fixes 20261020100200: `jsonb_typeof(null)` is null, and a CHECK that evaluates to null PASSES, so a web row
-- without web_keys was accepted. Require the column explicitly.
alter table public.push_tokens drop constraint push_tokens_shape_check;
alter table public.push_tokens add constraint push_tokens_shape_check check (
  (platform in ('ios', 'android')
     and token ~ '^Expo(nent)?PushToken\[[^\]]{8,200}\]$'
     and web_keys is null)
  or
  (platform = 'web'
     and web_keys is not null
     and token ~ '^https://[^[:space:]]+$'
     and char_length(token) between 16 and 2048
     and jsonb_typeof(web_keys) = 'object'
     and jsonb_typeof(web_keys->'p256dh') = 'string'
     and jsonb_typeof(web_keys->'auth') = 'string'
     and length(web_keys->>'p256dh') between 20 and 200
     and length(web_keys->>'auth') between 8 and 100)
);
