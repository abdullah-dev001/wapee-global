-- Lower the per-business DAILY create_booking cap from 200 to 120.
--
-- 200 was set as "far above any single salon's capacity". With the hourly cap of
-- 30 now also in place, the daily number no longer has to absorb a burst on its
-- own, so it can sit closer to a realistic ceiling: 120 online bookings in one
-- day is still well beyond a single location's throughput, and it halves what a
-- determined attacker can leave on a calendar overnight.
--
-- A data change, not a schema change, so it is a plain UPDATE. The rule row
-- already exists (20261004090000) and the hourly one beside it (20261004120000).
update public.rate_limit_rules
set max_attempts = 120,
    note = 'Per BUSINESS per day: above any single location''s real throughput, '
           'below a flood. Lowered from 200 once the 30/hour burst cap existed.'
where endpoint = 'create_booking' and scope = 'biz' and window_seconds = 86400;

-- Assert it landed, rather than trusting the UPDATE matched a row.
do $$
declare v_daily integer; v_hourly integer;
begin
  select max_attempts into v_daily from public.rate_limit_rules
  where endpoint = 'create_booking' and scope = 'biz' and window_seconds = 86400;
  select max_attempts into v_hourly from public.rate_limit_rules
  where endpoint = 'create_booking' and scope = 'biz' and window_seconds = 3600;

  if v_daily is distinct from 120 then
    raise exception 'daily business cap is % (expected 120)', v_daily;
  end if;
  -- A daily cap below the hourly one would make the hourly rule unreachable.
  if v_hourly is null or v_hourly > v_daily then
    raise exception 'hourly cap (%) must not exceed the daily cap (%)', v_hourly, v_daily;
  end if;
end $$;
