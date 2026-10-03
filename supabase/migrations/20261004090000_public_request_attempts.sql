-- Phase 3 step 7: rate limiting and bot protection for the public endpoints.
--
-- WHAT THIS IS FOR
-- ----------------
-- `get_slots` and `create_booking` are unauthenticated by design: the customer
-- booking a haircut has no account. Without a throttle, anyone can enumerate a
-- business's free slots all day, or fill a salon's calendar with junk bookings.
-- Doc §13 requires "rate limiting and bot protection on public endpoints".
--
-- WHERE THE COUNTER LIVES, AND WHY IT MUST BE IN POSTGRES
-- ------------------------------------------------------
-- An Edge Function instance is ephemeral and horizontally scaled, so in-memory
-- counting is worthless — two requests can land on two instances. The counter is
-- therefore a table, and the decision is made by one SECURITY DEFINER function
-- so the window logic exists in exactly one place.
--
-- **Every attempt is recorded BEFORE the work is attempted, and the row survives
-- a failure.** This is the Phase 1 lesson (`accept_invite`): a `raise` rolls back
-- everything in the transaction including the counter, so an attacker whose
-- requests all fail would never be counted and could retry forever. Hence:
--   * `check_rate_limit()` records and decides in ONE call, committed by the
--     caller's transaction before the booking work begins;
--   * `create_booking` returns `{ok:false,code}` instead of raising, so its own
--     transaction commits and the attempt stays counted.
--
-- PRIVACY: THE IP IS NEVER STORED RAW
-- ----------------------------------
-- An IP address is personal data, and a plaintext log of every visitor's IP is a
-- liability with no upside. Only `sha256(salt || ip)` is stored, with the salt in
-- an Edge secret (`PUBLIC_IP_HASH_SALT`). The hash is stable enough to count
-- against, and useless for identifying anyone if the table leaks. Rotating the
-- salt resets every window, which is an acceptable, documented cost.
--
-- Hashing happens in the EDGE FUNCTION, not here: the salt belongs in Edge
-- secrets (doc §13) and must never be a database constant or a function
-- argument that could end up in `pg_stat_statements`.
--
-- `key_hash` is the second dimension — a hashed phone number or a business id —
-- so one function can express "this IP, this endpoint" and "this phone, any IP".

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table public.public_request_attempts (
  id bigint generated always as identity primary key,
  -- 'get_slots' | 'create_booking' | 'get_booking' | 'cancel_booking' |
  -- 'reschedule_booking'. Text, not an enum: a new public endpoint should not
  -- need a migration to be throttled, and the values are internal.
  endpoint text not null,
  -- sha256(salt || ip), hex. NEVER the raw IP. Null when the platform gave us
  -- no usable address (rare); such a request is counted under the other keys
  -- only, so a missing header cannot be used to escape the per-phone cap.
  ip_hash text,
  -- The second dimension: sha256(salt || phone) or a business id, depending on
  -- the window being counted. Null for IP-only windows.
  key_hash text,
  -- 'allowed' | 'blocked' | 'failed' | 'ok'. Recorded so a failed attempt still
  -- counts (the whole point), and so a later look at the data can tell a
  -- scraper apart from a business having a good day.
  outcome text not null default 'allowed',
  created_at timestamptz not null default now(),

  constraint public_request_attempts_endpoint_len check (char_length(endpoint) between 1 and 40),
  constraint public_request_attempts_ip_hash_format
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  constraint public_request_attempts_key_hash_len
    check (key_hash is null or char_length(key_hash) between 1 and 128),
  constraint public_request_attempts_outcome
    check (outcome in ('allowed', 'blocked', 'failed', 'ok'))
);

comment on table public.public_request_attempts is
  'Rate-limit ledger for the public booking endpoints. ip_hash is sha256(salt||ip) — NEVER a raw IP. Written only by check_rate_limit(); no RLS policy, so the app cannot read or write it. Rows older than the retention window are deleted nightly.';
comment on column public.public_request_attempts.ip_hash is
  'sha256(PUBLIC_IP_HASH_SALT || ip), hex, computed in the Edge Function. Rotating the salt resets every window.';
comment on column public.public_request_attempts.outcome is
  'allowed / blocked / failed / ok. A FAILED attempt is still an attempt: it must count, or an attacker whose requests all fail is never throttled.';

-- The windows are all "count rows for this key since T", so the indexes lead
-- with the key and carry the timestamp.
create index public_request_attempts_ip_idx
  on public.public_request_attempts (endpoint, ip_hash, created_at desc)
  where ip_hash is not null;
create index public_request_attempts_key_idx
  on public.public_request_attempts (endpoint, key_hash, created_at desc)
  where key_hash is not null;
-- For the retention delete.
create index public_request_attempts_created_idx
  on public.public_request_attempts (created_at);

-- RLS on with NO policy, exactly like `invite_accept_attempts`: only the
-- SECURITY DEFINER function below touches this table.
alter table public.public_request_attempts enable row level security;
revoke all on table public.public_request_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The limits, in ONE place
-- ---------------------------------------------------------------------------
-- A table rather than constants in the function body, so a limit can be tuned
-- (or raised for one business) without a code change, and so the numbers are
-- visible to anyone reading the schema.
create table public.rate_limit_rules (
  -- The endpoint this rule applies to, or '*' for every public endpoint.
  endpoint text not null,
  -- 'ip'    = count by ip_hash
  -- 'key'   = count by key_hash (a hashed phone, or a business id)
  scope text not null,
  -- The window, and how many attempts are allowed inside it.
  window_seconds integer not null,
  max_attempts integer not null,
  -- A human note, shown in no UI but read by whoever tunes these.
  note text,
  updated_at timestamptz not null default now(),

  primary key (endpoint, scope),
  -- 'ip'  = count by ip_hash
  -- 'key' = count by key_hash (a hashed phone)
  -- 'biz' = count by business id, stored in key_hash
  constraint rate_limit_rules_scope check (scope in ('ip', 'key', 'biz')),
  constraint rate_limit_rules_window check (window_seconds between 1 and 604800),
  constraint rate_limit_rules_max check (max_attempts between 1 and 1000000)
);

comment on table public.rate_limit_rules is
  'THE one place the public rate limits live. Read by check_rate_limit(). Tunable without a code change.';

alter table public.rate_limit_rules enable row level security;
revoke all on table public.rate_limit_rules from anon, authenticated;
-- Readable by a signed-in super admin, so the numbers can be inspected from the
-- Phase 8 admin screens without a SQL console.
create policy rate_limit_rules_select on public.rate_limit_rules
  for select to authenticated
  using (public.is_super_admin());

create trigger rate_limit_rules_set_updated_at
  before update on public.rate_limit_rules
  for each row execute function public.set_updated_at();

-- --- The chosen numbers, and the reasoning --------------------------------
--
-- get_slots is a READ and the booking page legitimately calls it several times
-- (month change, staff change, service change), so its per-IP window is
-- generous. It is still bounded, because slot enumeration across every slug is
-- the cheapest way to map a business's trade.
--
-- create_booking is a WRITE that creates real rows a human has to deal with, so
-- it is much tighter.
--
-- The per-phone and per-business caps are 24-hour windows (86400s):
--   * phone 5/day   — a real customer almost never books one business five times
--                     in a day; a family booking several slots is the edge case,
--                     and 5 leaves room for it.
--   * business 200/day — far above a single salon's real capacity, so it never
--                     bites a busy day, but it stops a calendar being filled
--                     with thousands of junk rows overnight.
-- Both are per (endpoint, scope) rows, so raising one for a large chain later is
-- an UPDATE, not a migration.
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('get_slots',          'ip',  60,    60,   'Reads. The booking page calls this on every month/staff/service change.'),
  ('create_booking',     'ip',  3600,  10,   'Writes. 10 bookings an hour from one address is already abnormal.'),
  ('create_booking',     'key', 86400, 5,    'Per PHONE per day: a real customer rarely books one business 5x in a day.'),
  ('create_booking',     'biz', 86400, 200,  'Per BUSINESS per day: above any single salon''s capacity, below a flood.'),
  ('get_booking',        'ip',  3600,  60,   'Manage-link reads. A guest refreshing their own page must not be blocked.'),
  ('cancel_booking',     'ip',  3600,  20,   'Writes against an existing booking.'),
  ('reschedule_booking', 'ip',  3600,  20,   'Writes against an existing booking.');

-- ---------------------------------------------------------------------------
-- check_rate_limit: record the attempt AND decide, in one call
-- ---------------------------------------------------------------------------
-- Recording and deciding together is deliberate. Two calls ("may I?" then
-- "I did") would race, and the second could be skipped by a caller that
-- crashed — which is exactly the caller an attacker controls.
--
-- Returns jsonb, never raises for an expected outcome:
--   {"allowed": true}
--   {"allowed": false, "retry_after_seconds": 123, "scope": "ip"}
--
-- The `scope` is for OUR logs, not the customer: the Edge Function returns a
-- bare 429 and never says which limit was hit, because "you hit the per-phone
-- cap" would confirm that the phone is known to us.
create or replace function public.check_rate_limit(
  p_endpoint text,
  p_ip_hash text default null,
  -- A hashed phone (create_booking) or null.
  p_key_hash text default null,
  -- The business, for the per-business daily cap. Resolved from the slug by the
  -- Edge Function, so a caller cannot aim this at someone else.
  p_business_id uuid default null,
  -- Recorded on the row. The caller passes 'allowed' here and may later record
  -- the real outcome; the count does not care, which is the point.
  p_outcome text default 'allowed'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer;
  v_oldest timestamptz;
  v_retry integer;
  v_scope_key text;
begin
  if p_endpoint is null or char_length(p_endpoint) = 0 then
    -- A programming error, not a request error. Fail CLOSED: a misconfigured
    -- caller must not get an unlimited endpoint.
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 60, 'scope', 'bad_endpoint');
  end if;

  -- Check every rule that applies, tightest first, and stop at the first block.
  for r in
    select rule.endpoint, rule.scope, rule.window_seconds, rule.max_attempts
    from public.rate_limit_rules rule
    where rule.endpoint = p_endpoint
    order by rule.window_seconds asc
  loop
    -- Which stored column this rule counts on.
    v_scope_key := case r.scope
      when 'ip'  then p_ip_hash
      when 'key' then p_key_hash
      when 'biz' then p_business_id::text
    end;

    -- No value for this dimension (e.g. no phone on a get_slots call, or the
    -- platform gave us no IP): the rule simply does not apply. It is NOT a
    -- block — otherwise a missing header would take the endpoint down — and it
    -- is not a free pass either, because the other rules still run.
    if v_scope_key is null then
      continue;
    end if;

    select count(*), min(a.created_at)
      into v_count, v_oldest
    from public.public_request_attempts a
    where a.endpoint = p_endpoint
      and a.created_at > now() - make_interval(secs => r.window_seconds)
      and case r.scope
        when 'ip'  then a.ip_hash = v_scope_key
        when 'key' then a.key_hash = v_scope_key
        when 'biz' then a.key_hash = v_scope_key
      end;

    if v_count >= r.max_attempts then
      -- Record the BLOCKED attempt too. A blocked request is still a request,
      -- and counting it is what makes a sustained attack stay blocked rather
      -- than oscillating around the limit.
      --
      -- The row is written against the dimension that blocked, so the window
      -- that is already full keeps growing and the block holds. An 'ip' block
      -- writes no key_hash: mixing dimensions on one row would make a phone's
      -- window count IP-blocked attempts that had nothing to do with it.
      insert into public.public_request_attempts (endpoint, ip_hash, key_hash, outcome)
      values (
        p_endpoint,
        case when r.scope = 'ip' then p_ip_hash else null end,
        case when r.scope = 'ip' then null else v_scope_key end,
        'blocked'
      );

      -- When the oldest attempt in the window expires, one slot frees up.
      v_retry := greatest(
        1,
        ceil(extract(epoch from (v_oldest + make_interval(secs => r.window_seconds) - now())))::integer
      );

      return jsonb_build_object(
        'allowed', false,
        'retry_after_seconds', v_retry,
        -- For our logs only. The Edge Function must not forward this.
        'scope', r.scope
      );
    end if;
  end loop;

  -- Allowed: record the attempt. Two rows are written when both an IP and a key
  -- dimension exist, so each window counts what it is supposed to count without
  -- needing a join.
  insert into public.public_request_attempts (endpoint, ip_hash, key_hash, outcome)
  values (p_endpoint, p_ip_hash, p_key_hash, coalesce(p_outcome, 'allowed'));

  if p_business_id is not null then
    insert into public.public_request_attempts (endpoint, ip_hash, key_hash, outcome)
    values (p_endpoint, p_ip_hash, p_business_id::text, coalesce(p_outcome, 'allowed'));
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

comment on function public.check_rate_limit is
  'Records an attempt AND decides, in one call, so the two cannot race. Returns {allowed:true} or {allowed:false,retry_after_seconds,scope}. A BLOCKED attempt is recorded too. Fails CLOSED on a bad endpoint. service_role only.';

revoke all on function public.check_rate_limit(text, text, text, uuid, text) from public;
revoke execute on function public.check_rate_limit(text, text, text, uuid, text) from anon, authenticated;
grant execute on function public.check_rate_limit(text, text, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- Even a hashed IP is data we have no reason to keep once no window could still
-- reference it. The longest window above is 24h; 7 days leaves room to look at
-- an incident after a weekend, and nothing is kept beyond that.
create or replace function public.cleanup_public_request_attempts(
  p_older_than interval default interval '7 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.public_request_attempts
  where created_at < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.cleanup_public_request_attempts is
  'Deletes attempt rows older than the retention window (default 7 days). Scheduled nightly by pg_cron; see the next migration.';

revoke all on function public.cleanup_public_request_attempts(interval) from public;
revoke execute on function public.cleanup_public_request_attempts(interval) from anon, authenticated;
grant execute on function public.cleanup_public_request_attempts(interval) to service_role;
