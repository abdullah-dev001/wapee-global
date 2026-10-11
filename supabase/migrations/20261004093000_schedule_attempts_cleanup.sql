-- Nightly retention cleanup for public_request_attempts, via pg_cron.
--
-- WHY A SCHEDULER AND NOT "CLEAN UP AS WE GO"
-- -------------------------------------------
-- Opportunistic cleanup inside the request path only runs while traffic flows,
-- which is exactly backwards: a table that grew during an attack would stop
-- being trimmed the moment the attack stopped. And it puts a DELETE on the
-- critical path of a booking.
--
-- `pg_cron` is a first-party Supabase extension, unlike the `dblink` case that
-- was rejected (see context/_handoff.md). It still gets the same treatment: the
-- migration ASSERTS that neither API role can reach it, and fails loudly rather
-- than leaving a door open. That assertion is the whole reason the dblink
-- mistake was caught, so it is now the pattern for any extension.
--
-- WHAT IT DOES
-- ------------
-- One job, 03:17 UTC nightly (an odd minute, so it does not pile up with every
-- other cron job in the world on the hour), deleting attempt rows older than
-- 7 days. The longest rate-limit window is 24h, so 7 days keeps nothing a window
-- needs while leaving room to look at an incident after a weekend.

create extension if not exists pg_cron;

comment on extension pg_cron is
  'Scheduler. Used for the public_request_attempts retention job. Not reachable from the app: anon and authenticated have no EXECUTE and no access to the cron schema.';

-- ---------------------------------------------------------------------------
-- Lock it away from the API roles
-- ---------------------------------------------------------------------------
-- pg_cron lives in the `cron` schema and exposes `cron.schedule`, which runs
-- arbitrary SQL as the job's owner. `authenticated` reaching that would be a
-- privilege escalation, so usage is revoked explicitly. (Supabase already
-- restricts this; the point is that it is asserted below rather than assumed.)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      revoke all on schema cron from public, anon, authenticated;
    exception when insufficient_privilege then
      raise notice 'pg_cron: could not revoke on schema cron; relying on its own grants';
    end;
  end if;
end $$;

-- The assertion that matters.
--
-- **Reachability is schema USAGE *and* the function grant, not the grant alone.**
-- Five cron functions keep an EXECUTE grant that `postgres` cannot revoke
-- (they are owned by `supabase_admin`), exactly as `dblink_connect` did. The
-- difference, and the reason pg_cron is safe here while dblink was not:
--
--   schema cron acl = {supabase_admin=UC/supabase_admin, postgres=U*/supabase_admin}
--
-- `anon` and `authenticated` have **no USAGE on the schema at all**, so they
-- cannot name those functions and the grants are dead letters. dblink's
-- functions sat in `extensions`, a schema the API roles CAN use, which is what
-- made that one reachable.
--
-- So this checks the real condition. If a future change grants the API roles
-- usage on `cron`, the migration fails instead of shipping.
do $$
declare r record; v_reachable text[] := '{}';
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron'
  loop
    -- Both halves must be true for a role to actually call it.
    if (has_schema_privilege('anon', 'cron', 'usage')
        and has_function_privilege('anon', r.sig, 'execute'))
       or (has_schema_privilege('authenticated', 'cron', 'usage')
           and has_function_privilege('authenticated', r.sig, 'execute')) then
      v_reachable := v_reachable || r.sig::text;
    end if;
  end loop;

  if array_length(v_reachable, 1) > 0 then
    raise exception 'pg_cron is REACHABLE from the API: %. Revoke usage on schema cron.', v_reachable;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------------
-- Unscheduled first so re-running the migration (or changing the schedule
-- later) is idempotent rather than creating a second job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup_public_request_attempts') then
    perform cron.unschedule('cleanup_public_request_attempts');
  end if;

  perform cron.schedule(
    'cleanup_public_request_attempts',
    -- 03:17 UTC daily.
    '17 3 * * *',
    $job$ select public.cleanup_public_request_attempts(interval '7 days'); $job$
  );
end $$;

-- Prove it is actually registered, rather than trusting that the call worked.
do $$
declare v_count integer;
begin
  select count(*) into v_count from cron.job
  where jobname = 'cleanup_public_request_attempts' and active;

  if v_count <> 1 then
    raise exception 'the retention job is not scheduled (found % active jobs)', v_count;
  end if;
end $$;
