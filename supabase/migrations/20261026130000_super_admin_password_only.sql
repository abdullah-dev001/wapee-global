-- Super admin: password sign-in only, no TOTP (founder's decision 2026-10-23, against advice).
--
-- Before: every admin power needed a TOTP-verified (aal2) session (20261010120000).
-- After:  every admin power needs a session that was signed in WITH A PASSWORD within the last
--         12 hours (the JWT `amr` entry `{method: 'password', timestamp}`, which a token refresh
--         keeps unchanged). A Google / OAuth session, a recovery or magic-link session, or a
--         password sign-in older than 12 hours has NO admin power: `admin_gate()` answers
--         'reauth_required' and the ~55 RLS policies that call is_super_admin() see a stranger.
--
-- Protections that replace TOTP:
--   * admin_session_ok()                 password-only, 12-hour re-login
--   * custom_access_token_hook           refuses an OAuth (Google) sign-in for a super admin
--                                        (the amr check above is the boundary; the hook is
--                                        fail-open, so it is a second layer, not the only one)
--   * audit `admin.signed_in` / `admin.oauth_refused` for every non-refresh admin sign-in
--   * admin_signin_alerts                an alert email to the admin's own address for each of
--                                        those, sent by the send_outbox worker (the outbox itself
--                                        is business-scoped and cannot carry it)
--   * Supabase Auth's own per-IP sign-in rate limit (dashboard), unchanged
--
-- Not changed: platform_flag(), the admin RPCs (they all call admin_gate()), user_is_disabled
-- (a super admin is never "disabled"). The TOTP factor itself is removed separately, by hand,
-- on dev only for now.

-- ---------------------------------------------------------------------------
-- The session rule
-- ---------------------------------------------------------------------------
create or replace function public.admin_session_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array'
           then (select auth.jwt()) -> 'amr' else '[]'::jsonb end) e
    where e ->> 'method' = 'password'
      and (e ->> 'timestamp') ~ '^[0-9]{1,12}$'
      and to_timestamp((e ->> 'timestamp')::bigint) > now() - interval '12 hours'
  )
$$;
comment on function public.admin_session_ok is
  'The current session was signed in with a PASSWORD within the last 12 hours (JWT amr). The super admin boundary since TOTP was removed (20261026130000).';
revoke all on function public.admin_session_ok() from public, anon, authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.platform_flag() and public.admin_session_ok()
$$;
comment on function public.is_super_admin is
  'Platform super admin flag AND a password session signed in within 12 hours (no TOTP since 20261026130000). Unaudited when used by RLS: the audited read path is support_view_business.';

create or replace function public.admin_gate()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null or not public.platform_flag() then 'forbidden'
    when not public.admin_session_ok() then 'reauth_required'
  end
$$;
revoke all on function public.admin_gate() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin sign-in alerts (audit + email)
-- ---------------------------------------------------------------------------
create table public.admin_signin_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The hook's authentication_method: 'password', 'oauth', 'otp', 'recovery', ...
  method text not null check (char_length(method) between 1 and 40),
  -- 'allowed' or 'refused' (an OAuth attempt the hook turned away).
  outcome text not null check (outcome in ('allowed', 'refused')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
comment on table public.admin_signin_alerts is
  'One row per non-refresh super admin sign-in (or refused OAuth attempt); the send_outbox worker emails the admin''s own address. Written only by the auth hook; RLS on, no policy.';
create index admin_signin_alerts_due_idx on public.admin_signin_alerts (created_at)
  where status in ('pending', 'sending');
create index admin_signin_alerts_user_idx on public.admin_signin_alerts (user_id);
alter table public.admin_signin_alerts enable row level security;
revoke all on table public.admin_signin_alerts from anon, authenticated;

-- Called by the hook only. Never raises into the hook (the caller wraps it too).
create or replace function public.record_admin_sign_in(p_user uuid, p_method text, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after)
  values (null, p_user,
          case when p_outcome = 'refused' then 'admin.oauth_refused' else 'admin.signed_in' end,
          'user', p_user::text, jsonb_build_object('method', p_method));
  insert into public.admin_signin_alerts (user_id, method, outcome)
  values (p_user, left(coalesce(p_method, 'unknown'), 40), p_outcome);
end $$;
revoke all on function public.record_admin_sign_in(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The Auth hook (same suspended-login rule as 20261020110000, plus the admin rules).
-- VOLATILE now: it writes the audit row and the alert.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid;
  v_method text := event ->> 'authentication_method';
  v_admin boolean;
begin
  v_user := (event ->> 'user_id')::uuid;
  if public.user_is_disabled(v_user) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This account is disabled. Contact support@wapee.online'));
  end if;

  select coalesce(p.is_super_admin, false) into v_admin from public.profiles p where p.id = v_user;
  if coalesce(v_admin, false) and v_method is distinct from 'token_refresh' then
    begin
      perform public.record_admin_sign_in(v_user, v_method,
        case when v_method = 'oauth' then 'refused' else 'allowed' end);
    exception when others then
      raise warning 'custom_access_token_hook: admin sign-in record failed: % (%)', sqlerrm, sqlstate;
    end;
    if v_method = 'oauth' then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'Super admin accounts sign in with email and password.'));
    end if;
  end if;
  return event;
exception when others then
  -- FAIL-OPEN, as before: a bug here must never lock everyone out. Admin power still needs a
  -- password amr (admin_session_ok), so an OAuth token issued this way has none.
  return event;
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Worker side (service_role only): claim and finish alerts.
-- ---------------------------------------------------------------------------
create or replace function public.admin_alert_claim(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  -- Older than a day: no longer useful as an alert.
  update public.admin_signin_alerts set status = 'failed', last_error = 'expired', locked_until = null
  where status in ('pending', 'sending') and created_at < now() - interval '1 day';

  with c as (
    select a.id from public.admin_signin_alerts a
    where a.status = 'pending' or (a.status = 'sending' and a.locked_until < now())
    order by a.created_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  ), u as (
    update public.admin_signin_alerts a
    set status = 'sending', attempts = a.attempts + 1, locked_until = now() + interval '2 minutes'
    from c where a.id = c.id
    returning a.id, a.user_id, a.method, a.outcome, a.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'to', au.email, 'method', u.method, 'outcome', u.outcome, 'at', u.created_at)
         order by u.created_at), '[]'::jsonb)
    into v_rows
  from u join auth.users au on au.id = u.user_id;
  return v_rows;
end $$;
revoke all on function public.admin_alert_claim(integer) from public, anon, authenticated;
grant execute on function public.admin_alert_claim(integer) to service_role;

create or replace function public.admin_alert_finish(p_id uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_signin_alerts
  set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when p_ok then now() else sent_at end,
      last_error = case when p_ok then null else left(coalesce(p_error, 'error'), 300) end,
      locked_until = null
  where id = p_id and status = 'sending';
end $$;
revoke all on function public.admin_alert_finish(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_alert_finish(uuid, boolean, text) to service_role;

-- The per-minute cron call also fires for a due alert (same body as 20261008130000 + alerts).
create or replace function public.invoke_outbox_worker()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text := public.internal_secret('outbox_worker_url');
  v_token text := public.internal_secret('outbox_worker_token');
begin
  if v_url is null or v_token is null then return null; end if;
  if not exists (select 1 from public.message_outbox
                 where (status in ('pending', 'retry') and deliver_after <= now())
                    or (status = 'sending' and locked_until < now()))
     and not exists (select 1 from public.admin_signin_alerts
                     where status = 'pending' or (status = 'sending' and locked_until < now())) then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token', v_token),
    timeout_milliseconds := 20000);
end $$;
revoke all on function public.invoke_outbox_worker() from public, anon, authenticated;
