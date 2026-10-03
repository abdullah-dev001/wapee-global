-- Add a per-business HOURLY cap for create_booking, beside the daily one.
--
-- WHY BOTH
-- --------
-- The daily cap (200) bounds the total damage to one calendar in a day. It does
-- nothing about the SHAPE of that damage: 200 bookings in four minutes and 200
-- spread over a working day are the same number and very different events. The
-- first is an attack and floods the calendar before anyone can react; the second
-- is a busy branch.
--
-- An hourly cap of 30 catches the burst. It is still above any real salon's rate
-- — 30 online bookings in one hour would be a remarkable day for a single
-- location — while making a flood take seven hours instead of four minutes, which
-- is long enough for the owner to notice and for us to see it in the attempts
-- table.
--
-- HOW THE TWO INTERACT
-- --------------------
-- `check_rate_limit()` iterates the rules for an endpoint **ordered by
-- window_seconds ascending** and stops at the first block, so the hourly rule is
-- evaluated before the daily one and the retry hint comes from whichever window
-- actually filled. Both rows have scope 'biz' and are keyed on the business id,
-- so they count the same attempts over different spans. No code change is needed:
-- the function already handles any number of rules per endpoint.
--
-- The primary key is (endpoint, scope), so a second 'biz' row cannot simply be
-- inserted — the key has to distinguish the two windows.

-- Widen the key so one endpoint+scope can have several windows.
alter table public.rate_limit_rules
  drop constraint rate_limit_rules_pkey;

alter table public.rate_limit_rules
  add constraint rate_limit_rules_pkey primary key (endpoint, scope, window_seconds);

comment on table public.rate_limit_rules is
  'THE one place the public rate limits live. Read by check_rate_limit(), which evaluates every rule for an endpoint shortest-window-first and stops at the first block. Keyed (endpoint, scope, window_seconds) so one dimension can have several windows — e.g. a business has both an hourly and a daily cap. Tunable without a code change.';

-- The new rule.
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note)
values (
  'create_booking', 'biz', 3600, 30,
  'Per BUSINESS per HOUR: catches a burst the 200/day cap would not. Above any real salon''s rate; turns a 4-minute flood into a 7-hour one.'
)
on conflict (endpoint, scope, window_seconds) do update
  set max_attempts = excluded.max_attempts,
      note = excluded.note;

-- Prove both business rules exist and are ordered as intended, rather than
-- trusting that the insert did what it looks like.
do $$
declare v_hourly integer; v_daily integer; v_first integer;
begin
  select max_attempts into v_hourly from public.rate_limit_rules
  where endpoint = 'create_booking' and scope = 'biz' and window_seconds = 3600;

  select max_attempts into v_daily from public.rate_limit_rules
  where endpoint = 'create_booking' and scope = 'biz' and window_seconds = 86400;

  if v_hourly is distinct from 30 or v_daily is distinct from 200 then
    raise exception 'business caps are wrong: hourly=%, daily=%', v_hourly, v_daily;
  end if;

  -- The hourly rule must be seen first, or a burst would be reported against the
  -- daily window and the retry hint would be a day instead of an hour.
  select window_seconds into v_first from public.rate_limit_rules
  where endpoint = 'create_booking' and scope = 'biz'
  order by window_seconds asc limit 1;

  if v_first <> 3600 then
    raise exception 'the hourly business rule is not evaluated first (got %)', v_first;
  end if;
end $$;
