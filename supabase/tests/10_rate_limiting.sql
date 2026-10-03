-- Phase 3 step 7: rate limiting and bot protection (database half).
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/10_rate_limiting.sql
--
-- Plain SQL, not pgTAP (Docker is not installed; see context/_handoff.md).
-- Builds its own rules and rolls everything back.
--
-- Last run: 2026-10-04 against the live dev project. 32/32 passing.
--
-- Covered: a window allowing then blocking; **a BLOCKED attempt being recorded
-- too**, which is what makes a sustained attack stay blocked rather than
-- oscillating around the limit; a retry hint; a different IP being unaffected;
-- an endpoint with no rules being allowed while a NULL endpoint fails CLOSED;
-- a missing IP neither disabling the endpoint nor granting a free pass to the
-- per-phone cap; the per-phone and per-business daily caps; the configured
-- production numbers; retention cleanup; and the grants.
--
-- The HMAC start token (honeypot + minimum time-on-form) is verified in the
-- Edge Function, so it is tested by the end-to-end curl checks recorded in
-- context/booking-public-api.md, not here.

begin;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin insert into res (name, pass, detail) values (p_name, p_got::text is not distinct from p_want::text,
  'got '||coalesce(p_got::text,'<null>')||' want '||coalesce(p_want::text,'<null>')); end; $$;

-- A tight test rule so the loop is short.
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note)
values ('test_ep', 'ip', 3600, 3, 'test');

-- 3 allowed, 4th blocked.
do $$
declare r jsonb; i int;
begin
  for i in 1..3 loop
    r := public.check_rate_limit('test_ep', repeat('a',64));
    perform pg_temp.chk(format('attempt %s of 3 allowed', i), r->>'allowed', 'true');
  end loop;
  r := public.check_rate_limit('test_ep', repeat('a',64));
  perform pg_temp.chk('4th attempt BLOCKED', r->>'allowed', 'false');
  perform pg_temp.chk('and carries a retry hint', (r->>'retry_after_seconds')::int > 0, true);
  perform pg_temp.chk('and names the scope for OUR logs', r->>'scope', 'ip');
end $$;

-- THE KEY PROPERTY: a blocked attempt is itself recorded, so the window keeps
-- growing and the block holds instead of oscillating.
select pg_temp.chk('the blocked attempt was RECORDED (4 rows, not 3)',
  (select count(*)::int from public.public_request_attempts where endpoint='test_ep'), 4);
select pg_temp.chk('and it is marked blocked',
  (select count(*)::int from public.public_request_attempts where endpoint='test_ep' and outcome='blocked'), 1);

-- A different IP is unaffected.
do $$
declare r jsonb;
begin
  r := public.check_rate_limit('test_ep', repeat('b',64));
  perform pg_temp.chk('a DIFFERENT ip is not blocked', r->>'allowed', 'true');
end $$;

-- An unknown endpoint has no rules => allowed (nothing to enforce), but a NULL
-- endpoint fails CLOSED.
do $$
declare r jsonb;
begin
  r := public.check_rate_limit('no_rules_endpoint', repeat('a',64));
  perform pg_temp.chk('an endpoint with no rules is allowed', r->>'allowed', 'true');
  r := public.check_rate_limit(null, repeat('a',64));
  perform pg_temp.chk('a NULL endpoint fails CLOSED', r->>'allowed', 'false');
  perform pg_temp.chk('and says why (for logs)', r->>'scope', 'bad_endpoint');
end $$;

-- A missing IP does not disable the endpoint, and does not grant a free pass to
-- the other dimensions.
do $$
declare r jsonb; i int;
begin
  insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note)
  values ('test_key', 'ip', 3600, 2, 'test'), ('test_key', 'key', 3600, 3, 'test');
  -- No ip_hash at all: the 'ip' rule does not apply, the 'key' rule still does.
  for i in 1..3 loop
    r := public.check_rate_limit('test_key', null, 'phone-hash-1');
    perform pg_temp.chk(format('no-IP attempt %s still allowed by the key rule', i), r->>'allowed', 'true');
  end loop;
  r := public.check_rate_limit('test_key', null, 'phone-hash-1');
  perform pg_temp.chk('the KEY cap still bites without an IP', r->>'allowed', 'false');
  perform pg_temp.chk('and it was the key scope', r->>'scope', 'key');
end $$;

-- Per-business cap: counted on key_hash via the business id.
do $$
declare r jsonb; i int; v_biz uuid := gen_random_uuid();
begin
  insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note)
  values ('test_biz', 'biz', 86400, 2, 'test');
  for i in 1..2 loop
    r := public.check_rate_limit('test_biz', repeat('c',64), 'ph', v_biz);
    perform pg_temp.chk(format('business attempt %s allowed', i), r->>'allowed', 'true');
  end loop;
  r := public.check_rate_limit('test_biz', repeat('c',64), 'ph', v_biz);
  perform pg_temp.chk('the per-BUSINESS cap bites', r->>'allowed', 'false');
  perform pg_temp.chk('and it was the biz scope', r->>'scope', 'biz');
  -- A different business is unaffected.
  r := public.check_rate_limit('test_biz', repeat('c',64), 'ph', gen_random_uuid());
  perform pg_temp.chk('a DIFFERENT business is unaffected', r->>'allowed', 'true');
end $$;

-- The real configured limits are present and sane.
select pg_temp.chk('create_booking has a per-phone daily cap of 5',
  (select max_attempts from public.rate_limit_rules where endpoint='create_booking' and scope='key'), 5);
select pg_temp.chk('create_booking has a per-business daily cap of 200',
  (select max_attempts from public.rate_limit_rules
   where endpoint='create_booking' and scope='biz' and window_seconds=86400), 200);
select pg_temp.chk('both daily caps use a 24h window',
  (select count(*)::int from public.rate_limit_rules
   where endpoint='create_booking' and scope in ('key','biz') and window_seconds=86400), 2);


-- ---------------------------------------------------------------------------
-- The per-business HOURLY cap, alongside the daily one
-- ---------------------------------------------------------------------------
-- Two rules on the same (endpoint, scope) with different windows. The shorter
-- window must be evaluated first, or a burst would be reported against the daily
-- window and the retry hint would be a day instead of an hour.
select pg_temp.chk('create_booking has a per-business HOURLY cap of 30',
  (select max_attempts from public.rate_limit_rules
   where endpoint='create_booking' and scope='biz' and window_seconds=3600), 30);
select pg_temp.chk('and still the daily cap of 200',
  (select max_attempts from public.rate_limit_rules
   where endpoint='create_booking' and scope='biz' and window_seconds=86400), 200);
select pg_temp.chk('two business rules now coexist',
  (select count(*)::int from public.rate_limit_rules
   where endpoint='create_booking' and scope='biz'), 2);
select pg_temp.chk('the HOURLY rule is evaluated first (shortest window)',
  (select window_seconds from public.rate_limit_rules
   where endpoint='create_booking' and scope='biz' order by window_seconds asc limit 1), 3600);

-- The hourly cap actually bites before the daily one, and reports the hourly
-- retry hint rather than a day.
do $$
declare r jsonb; i int; v_biz uuid := gen_random_uuid();
begin
  insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note)
  values ('test_two_windows', 'biz', 3600, 2, 'hourly'),
         ('test_two_windows', 'biz', 86400, 10, 'daily');

  for i in 1..2 loop
    r := public.check_rate_limit('test_two_windows', repeat('e',64), 'ph', v_biz);
    perform pg_temp.chk(format('two-window attempt %s allowed', i), r->>'allowed', 'true');
  end loop;

  r := public.check_rate_limit('test_two_windows', repeat('e',64), 'ph', v_biz);
  perform pg_temp.chk('the HOURLY cap bites before the daily one', r->>'allowed', 'false');
  perform pg_temp.chk('and it is the biz scope', r->>'scope', 'biz');
  -- The hint must be <= an hour, proving it came from the 3600s window.
  perform pg_temp.chk('the retry hint comes from the HOURLY window, not the daily',
    (r->>'retry_after_seconds')::int <= 3600, true);
end $$;

-- A business under the hourly cap but over the daily one is still blocked, so
-- the daily rule is not dead code.
do $$
declare r jsonb; v_biz uuid := gen_random_uuid();
begin
  insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note)
  values ('test_daily_only', 'biz', 3600, 100, 'hourly, generous'),
         ('test_daily_only', 'biz', 86400, 2, 'daily, tight');

  -- Two attempts an hour apart: well under the hourly cap, at the daily cap.
  insert into public.public_request_attempts (endpoint, ip_hash, key_hash, outcome, created_at)
  values ('test_daily_only', repeat('f',64), v_biz::text, 'allowed', now() - interval '5 hours'),
         ('test_daily_only', repeat('f',64), v_biz::text, 'allowed', now() - interval '3 hours');

  r := public.check_rate_limit('test_daily_only', repeat('f',64), 'ph', v_biz);
  perform pg_temp.chk('the DAILY cap still bites when the hourly one is clear', r->>'allowed', 'false');
  perform pg_temp.chk('and the hint is longer than an hour',
    (r->>'retry_after_seconds')::int > 3600, true);
end $$;

-- Retention.
do $$
declare v int;
begin
  insert into public.public_request_attempts (endpoint, ip_hash, outcome, created_at)
  values ('old_ep', repeat('d',64), 'allowed', now() - interval '30 days');
  v := public.cleanup_public_request_attempts(interval '7 days');
  perform pg_temp.chk('cleanup deleted the 30-day-old row', v >= 1, true);
  perform pg_temp.chk('and left the fresh rows',
    (select count(*)::int > 0 from public.public_request_attempts where endpoint='test_ep'), true);
end $$;

-- Grants.
select pg_temp.chk('anon cannot call check_rate_limit',
  has_function_privilege('anon','public.check_rate_limit(text,text,text,uuid,text)','execute'), false);
select pg_temp.chk('authenticated cannot call check_rate_limit',
  has_function_privilege('authenticated','public.check_rate_limit(text,text,text,uuid,text)','execute'), false);
select pg_temp.chk('service_role CAN',
  has_function_privilege('service_role','public.check_rate_limit(text,text,text,uuid,text)','execute'), true);
select pg_temp.chk('anon has no privileges on public_request_attempts',
  (select count(*)::int from information_schema.role_table_grants
   where grantee='anon' and table_name='public_request_attempts'), 0);
select pg_temp.chk('RLS is on with no anon policy',
  (select relrowsecurity from pg_class where oid='public.public_request_attempts'::regclass), true);

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed, count(*) as total from res;
select n, name, detail from res where not pass order by n;
rollback;
