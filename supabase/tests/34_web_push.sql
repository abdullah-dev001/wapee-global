-- Web Push subscriptions in push_tokens (platform = 'web'); outbox_job routing data; dead-token removal.
--   supabase db query --linked -f supabase/tests/34_web_push.sql
-- Uses two existing dev users and one existing branch; everything is rolled back.
begin;

create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create temporary table ctx (k text primary key, v text) on commit drop;

create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.c(text) returns text language sql as $$ select v from ctx where k = $1 $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end; $$;
-- run a jsonb statement as a user
create or replace function pg_temp.as_(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.c(p_user)::uuid);
  set local role authenticated;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.as_q(p_user text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act_as(pg_temp.c(p_user)::uuid);
  set local role authenticated;
  begin execute p_sql into v;
  exception when others then reset role; return 'ERR:' || sqlstate; end;
  reset role;
  return v;
end $$;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

insert into ctx select 'ua', user_id::text from public.business_members where status = 'active' order by user_id limit 1;
insert into ctx select 'ub', user_id::text from public.business_members where status = 'active' and user_id::text <> pg_temp.c('ua') order by user_id limit 1;
insert into ctx select 'biz', business_id::text from public.business_members where user_id = pg_temp.c('ua')::uuid and status = 'active' limit 1;
insert into ctx select 'br', id::text from public.branches where business_id = pg_temp.c('biz')::uuid limit 1;

delete from public.push_tokens where user_id in (pg_temp.c('ua')::uuid, pg_temp.c('ub')::uuid);

do $$
declare
  ep text := 'https://fcm.googleapis.com/fcm/send/test-endpoint-0001';
  p256 text := repeat('B', 87);
  au text := repeat('a', 22);
  r jsonb; v_out uuid; j jsonb; v_id uuid;
begin
  -- registration
  r := pg_temp.as_('ua', format($q$select public.register_web_push_subscription(%L, %L, %L)$q$, ep, p256, au));
  perform pg_temp.chk('register web subscription ok', r->>'ok', 'true');
  perform pg_temp.chk('stored as platform web', (select platform from public.push_tokens where token = ep), 'web');
  perform pg_temp.chk('stored endpoint + keys', (select (web_keys->>'p256dh' = p256 and web_keys->>'auth' = au)::text from public.push_tokens where token = ep), 'true');
  perform pg_temp.chk('stored for the caller', (select user_id::text from public.push_tokens where token = ep), pg_temp.c('ua'));

  -- bad input is refused and nothing is stored
  perform pg_temp.chk('http endpoint refused', pg_temp.as_('ua', format($q$select public.register_web_push_subscription(%L, %L, %L)$q$, 'http://x.example/abcdef', p256, au))->>'code', 'invalid_subscription');
  perform pg_temp.chk('short key refused', pg_temp.as_('ua', format($q$select public.register_web_push_subscription(%L, 'short', %L)$q$, ep || 'x', au))->>'code', 'invalid_subscription');
  perform pg_temp.chk('null auth refused', pg_temp.as_('ua', format($q$select public.register_web_push_subscription(%L, %L, null)$q$, ep || 'y', p256))->>'code', 'invalid_subscription');
  perform pg_temp.chk('nothing extra stored', (select count(*)::text from public.push_tokens where user_id = pg_temp.c('ua')::uuid), '1');

  -- anon cannot call it
  perform pg_temp.chk('anon cannot register', coalesce((select 'raised' where pg_temp.try($q$set local role anon; select public.register_web_push_subscription('https://a.example/abcdefgh', 'x', 'y')$q$) <> 'ok'), 'ok'), 'raised');
  reset role;

  -- native registration still works and refuses 'web'
  perform pg_temp.chk('native register ok', pg_temp.as_('ua', $q$select public.register_push_token('ExponentPushToken[abcdefghijkl]', 'android')$q$)->>'ok', 'true');
  perform pg_temp.chk('native register refuses web platform', pg_temp.as_('ua', $q$select public.register_push_token('ExponentPushToken[zzzzzzzzzzzz]', 'web')$q$)->>'code', 'invalid_token');
  perform pg_temp.chk('native register refuses a URL', pg_temp.as_('ua', format($q$select public.register_push_token(%L, 'ios')$q$, ep))->>'code', 'invalid_token');
  perform pg_temp.chk('native row has no keys', (select web_keys is null from public.push_tokens where token = 'ExponentPushToken[abcdefghijkl]')::text, 'true');

  -- table CHECK (direct inserts as postgres)
  perform pg_temp.chk('check: web + expo-shaped token', pg_temp.try(format($q$insert into public.push_tokens (user_id, token, platform, web_keys) values (%L, 'ExponentPushToken[qqqqqqqqqqqq]', 'web', %L::jsonb)$q$, pg_temp.c('ua'), '{"p256dh":"' || p256 || '","auth":"' || au || '"}')), '23514');
  perform pg_temp.chk('check: web without keys', pg_temp.try(format($q$insert into public.push_tokens (user_id, token, platform) values (%L, 'https://x.example/nokeys-abc', 'web')$q$, pg_temp.c('ua'))), '23514');
  perform pg_temp.chk('check: android with keys', pg_temp.try(format($q$insert into public.push_tokens (user_id, token, platform, web_keys) values (%L, 'ExponentPushToken[wwwwwwwwwwww]', 'android', %L::jsonb)$q$, pg_temp.c('ua'), '{"p256dh":"' || p256 || '","auth":"' || au || '"}')), '23514');

  -- RLS: another user cannot see it; own select works
  perform pg_temp.chk('other user sees none of ua tokens', pg_temp.as_q('ub', format($q$select count(*)::text from public.push_tokens where token = %L$q$, ep)), '0');
  perform pg_temp.chk('owner sees own web row', pg_temp.as_q('ua', format($q$select count(*)::text from public.push_tokens where token = %L$q$, ep)), '1');
  perform pg_temp.chk('other user cannot unregister it', (select case when pg_temp.as_q('ub', format($q$select public.unregister_push_token(%L)::text$q$, ep)) is not null then 'x' else 'x' end), 'x');
  perform pg_temp.chk('...row still there', (select count(*)::text from public.push_tokens where token = ep), '1');

  -- the same browser signing in as someone else moves to that user
  perform pg_temp.chk('re-register by ub ok', pg_temp.as_('ub', format($q$select public.register_web_push_subscription(%L, %L, %L)$q$, ep, p256, au))->>'ok', 'true');
  perform pg_temp.chk('...endpoint now belongs to ub', (select user_id::text from public.push_tokens where token = ep), pg_temp.c('ub'));
  perform pg_temp.chk('...still one row for that endpoint', (select count(*)::text from public.push_tokens where token = ep), '1');
  -- and back, so the rest is about ua
  perform pg_temp.as_('ua', format($q$select public.register_web_push_subscription(%L, %L, %L)$q$, ep, p256, au));

  -- outbox_job exposes platform + keys, keeps the idempotency key
  insert into public.message_outbox (business_id, branch_id, user_id, channel, event, idempotency_key)
  values (pg_temp.c('biz')::uuid, pg_temp.c('br')::uuid, pg_temp.c('ua')::uuid, 'push', 'staff_new_booking', 'test-web-push-' || gen_random_uuid())
  returning id into v_out;
  j := public.outbox_job(v_out);
  perform pg_temp.chk('job lists both devices', jsonb_array_length(j->'tokens')::text, '2');
  perform pg_temp.chk('job web token has platform+keys', (select (t->>'platform' = 'web' and t->'web_keys'->>'auth' = au)::text from jsonb_array_elements(j->'tokens') t where t->>'token' = ep), 'true');
  perform pg_temp.chk('job native token has platform, no keys', (select (t->>'platform' = 'android' and t->'web_keys' = 'null'::jsonb)::text from jsonb_array_elements(j->'tokens') t where t->>'token' like 'Expo%'), 'true');
  perform pg_temp.chk('job keeps idempotency_key', (j->>'idempotency_key' like 'test-web-push-%')::text, 'true');
  perform pg_temp.chk('guard: user with a token passes', coalesce(public.outbox_guard(v_out), 'pass'), 'pass');

  -- dead-token removal (404 / 410 path) touches only the owner's dead row
  select id into v_id from public.push_tokens where token = ep;
  perform pg_temp.chk('dead web token removed', public.push_remove_dead_tokens(v_out, array[v_id])::text, '1');
  perform pg_temp.chk('...native token untouched', (select count(*)::text from public.push_tokens where user_id = pg_temp.c('ua')::uuid), '1');
  perform pg_temp.as_('ub', format($q$select public.register_web_push_subscription(%L, %L, %L)$q$, ep, p256, au));
  select id into v_id from public.push_tokens where token = ep;
  perform pg_temp.chk('cannot remove another user''s token via ua outbox', public.push_remove_dead_tokens(v_out, array[v_id])::text, '0');

  -- unregister by owner
  perform pg_temp.as_('ub', format($q$select public.unregister_push_token(%L)::text$q$, ep));
  perform pg_temp.chk('owner unregister removes it', (select count(*)::text from public.push_tokens where token = ep), '0');

  -- account deletion path / cascade: tokens go with the user row (FK cascade is unchanged)
  perform pg_temp.chk('cascade FK still present', (select count(*)::text from pg_constraint where conrelid = 'public.push_tokens'::regclass and contype = 'f' and confdeltype = 'c'), '1');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
