-- F5 (QA run 2026-10-17): one booking attempt counted ~3 times against the
-- per-IP create_booking cap (10/hour), so a 4th booking from one network was
-- refused. create_booking calls check_rate_limit twice (IP+phone first, then
-- the business caps once the slug is resolved) and the second call also wrote
-- the IP: one (ip, null) row plus one (ip, business) row.
--
-- Fix here: the business row no longer carries the IP, and an all-null row is
-- never written. The Edge Function's second call also stops sending the IP
-- (create_booking/index.ts), so one attempt writes exactly one ip row.
-- Body otherwise unchanged; grants are kept by CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_endpoint text, p_ip_hash text DEFAULT NULL::text, p_key_hash text DEFAULT NULL::text, p_business_id uuid DEFAULT NULL::uuid, p_outcome text DEFAULT 'allowed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  --
  -- ONE ATTEMPT = ONE ip row (QA F5). The business row carries NO ip_hash, so
  -- an 'ip' window never counts it, and an all-null row (a business-only call
  -- with no IP and no key) is not written at all.
  if p_ip_hash is not null or p_key_hash is not null then
    insert into public.public_request_attempts (endpoint, ip_hash, key_hash, outcome)
    values (p_endpoint, p_ip_hash, p_key_hash, coalesce(p_outcome, 'allowed'));
  end if;

  if p_business_id is not null then
    insert into public.public_request_attempts (endpoint, ip_hash, key_hash, outcome)
    values (p_endpoint, null, p_business_id::text, coalesce(p_outcome, 'allowed'));
  end if;

  return jsonb_build_object('allowed', true);
end;
$function$;
