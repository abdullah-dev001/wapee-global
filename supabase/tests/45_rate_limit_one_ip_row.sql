-- F5 (QA run 2026-10-17): one create_booking attempt must count ONCE against
-- the per-IP cap (10 per hour), not ~3 times.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/45_rate_limit_one_ip_row.sql
--
-- Plain SQL. Uses the REAL create_booking rules and replays exactly what the
-- Edge Function does per attempt: (1) check with IP + phone, (2) check the
-- business caps WITHOUT the IP (skipIp). ROLLS BACK.
begin;

create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;

select pg_temp.chk('rule under test: create_booking ip cap is 10 per hour',
  (select max_attempts from public.rate_limit_rules where endpoint = 'create_booking' and scope = 'ip' and window_seconds = 3600), 10);

do $$
declare
  v_ip text := repeat('f5', 32);
  v_biz uuid := gen_random_uuid();
  r1 jsonb; r2 jsonb; i int; v_allowed int := 0;
begin
  for i in 1..10 loop
    -- A different phone each time, so only the IP cap can be the limit.
    r1 := public.check_rate_limit('create_booking', v_ip, 'phone-' || i, null);
    r2 := public.check_rate_limit('create_booking', null, null, v_biz);
    if (r1->>'allowed')::boolean and (r2->>'allowed')::boolean then
      v_allowed := v_allowed + 1;
    end if;
  end loop;
  perform pg_temp.chk('10 attempts from one IP within the hour are all allowed', v_allowed, 10);

  perform pg_temp.chk('exactly one ip row per attempt (10)',
    (select count(*)::int from public.public_request_attempts where ip_hash = v_ip), 10);
  perform pg_temp.chk('the business rows carry no IP',
    (select count(*)::int from public.public_request_attempts where key_hash = v_biz::text and ip_hash is not null), 0);
  perform pg_temp.chk('one business row per attempt (10)',
    (select count(*)::int from public.public_request_attempts where key_hash = v_biz::text), 10);
  perform pg_temp.chk('no all-null rows are written',
    (select count(*)::int from public.public_request_attempts
     where endpoint = 'create_booking' and ip_hash is null and key_hash is null and created_at > now() - interval '1 minute'), 0);

  r1 := public.check_rate_limit('create_booking', v_ip, 'phone-11', null);
  perform pg_temp.chk('the 11th attempt from that IP is blocked', r1->>'allowed', 'false');
  perform pg_temp.chk('and it is the ip scope that blocked', r1->>'scope', 'ip');

  -- Another IP is unaffected.
  r1 := public.check_rate_limit('create_booking', repeat('ab', 32), 'phone-12', null);
  perform pg_temp.chk('a different IP is still allowed', r1->>'allowed', 'true');
end $$;

-- Defensive: a single call that passes IP and business together also writes
-- only one ip row.
do $$
declare v_ip text := repeat('c5', 32); r jsonb;
begin
  r := public.check_rate_limit('create_booking', v_ip, null, gen_random_uuid());
  perform pg_temp.chk('combined call allowed', r->>'allowed', 'true');
  perform pg_temp.chk('combined call writes one ip row, not two',
    (select count(*)::int from public.public_request_attempts where ip_hash = v_ip), 1);
end $$;

-- The per-phone cap (5/day) still works on its own dimension.
do $$
declare v_ip text; r jsonb; i int;
begin
  for i in 1..5 loop
    v_ip := repeat(lpad(i::text, 2, '0'), 32);   -- a new IP each time
    r := public.check_rate_limit('create_booking', v_ip, 'same-phone', null);
  end loop;
  r := public.check_rate_limit('create_booking', repeat('99', 32), 'same-phone', null);
  perform pg_temp.chk('6th booking for one phone in a day is blocked', r->>'allowed', 'false');
  perform pg_temp.chk('by the key (phone) scope', r->>'scope', 'key');
end $$;

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total
from res;

select n, name, detail from res where not pass order by n;

rollback;
