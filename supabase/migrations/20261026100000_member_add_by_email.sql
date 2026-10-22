-- Add staff by email (replaces invite links, part 1 of 2).
--
-- The owner / manager enters an email, a role, a branch and (optionally) an unlinked staff
-- profile. That is stored as a PENDING membership bound to the email: the same
-- `business_members` row an invite used to be (status 'invited', invited_email,
-- invite_expires_at), with NO token. When someone later signs in with that exact email AND the
-- email is VERIFIED (Google, or a confirmed email/password account), `claim_pending_memberships()`
-- joins them with the role the adder chose. An unverified email never joins.
--
--   * add_member_by_email(...)        -- adder side; returns {ok, code}, never raises after the
--                                        rate-limit counter is written (CLAUDE.md section 5)
--   * claim_pending_memberships()     -- invitee side; the caller's own email only
--   * outbox event 'member_added'     -- a plain "you were added" email: no token, links to /login
--   * rate_limit_rules 'member_add'   -- per business per hour, per adder per day
--
-- The role assignment is still written while the ADDER is the caller, so the escalation guard
-- (`enforce_role_assignment_guard` / `can_grant_at`) judges the adder, exactly as invites did.
-- Part 2 (20261026110000) retires the old token links once the new UI ships.

-- ---------------------------------------------------------------------------
-- Pending adds last 30 days (product decision, was 7 for invite links).
-- ---------------------------------------------------------------------------
alter table public.business_members
  alter column invite_expires_at set default (now() + interval '30 days');
comment on column public.business_members.invite_expires_at is
  'When a pending add (status invited) stops being claimable. Default 30 days; "resend" renews it.';

-- The claim looks a pending add up by email across every business.
-- Compared as lower(text): under `search_path = ''` the citext operators are not visible.
create index if not exists business_members_pending_email_idx
  on public.business_members ((lower(invited_email::text)))
  where status = 'invited' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Rate limits (keyed endpoint + scope + window since 20261004120000; check_rate_limit reads them).
-- ---------------------------------------------------------------------------
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('member_add', 'biz', 3600, 30, 'Adding people by email: 30 an hour per business (each add can send an email).'),
  ('member_add', 'key', 86400, 200, 'Adding people by email: 200 a day per adder (key = the adder''s user id).')
on conflict (endpoint, scope, window_seconds) do nothing;

-- ---------------------------------------------------------------------------
-- Outbox: the 'member_added' email. Addressed to the pending row's invited_email, which is
-- resolved at SEND time (never copied into the payload), and dropped as stale once the row is
-- no longer pending (joined, cancelled, expired).
-- ---------------------------------------------------------------------------
alter table public.message_outbox drop constraint message_outbox_event_check;
alter table public.message_outbox add constraint message_outbox_event_check check (event in (
  'booking_confirmed', 'pending_received', 'reminder', 'rescheduled', 'cancelled',
  'manage_link', 'review_request',
  'staff_new_booking', 'staff_pending_approval', 'staff_cancelled', 'staff_reminder',
  'report_summary', 'staff_low_stock', 'low_stock', 'form_request', 'portal_login',
  'member_added'));

alter table public.message_outbox drop constraint message_outbox_push_shape;
alter table public.message_outbox add constraint message_outbox_push_shape check (
  (event in ('report_summary', 'low_stock') and channel = 'email' and user_id is not null and client_id is null
     and appointment_id is null)
  or (event = 'member_added' and channel = 'email' and user_id is null and client_id is null
      and appointment_id is null)
  or (event not in ('report_summary', 'low_stock', 'member_added')
      and (channel = 'push') = (user_id is not null)
      and (channel = 'push') = (event like 'staff\_%')
      and (channel <> 'push') = (client_id is not null)));

-- Same body as 20261013130000 + the member_added branch.
CREATE OR REPLACE FUNCTION public.outbox_recipient(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  o record;
  v_addr text;
begin
  select ob.channel, ob.client_id, ob.business_id, ob.user_id, ob.event, ob.payload into o
  from public.message_outbox ob where ob.id = p_id;
  if o.channel is null or o.channel = 'push' then
    return jsonb_build_object('address', null, 'hash', null, 'masked', case when o.channel = 'push' then 'push' else null end);
  end if;
  if o.event in ('report_summary', 'low_stock') then
    select p.email::text into v_addr
    from public.profiles p
    join public.business_members m on m.user_id = p.id and m.business_id = o.business_id
         and m.status = 'active' and m.deleted_at is null
    where p.id = o.user_id limit 1;
  elsif o.event = 'member_added' then
    select m.invited_email::text into v_addr
    from public.business_members m
    where m.id = nullif(o.payload ->> 'member_id', '')::uuid and m.business_id = o.business_id
      and m.status = 'invited' and m.deleted_at is null;
  else
    select case when o.channel = 'email' then c.email::text else c.phone_e164 end into v_addr
    from public.clients c where c.id = o.client_id and c.business_id = o.business_id and c.deleted_at is null;
  end if;
  if v_addr is null then
    return jsonb_build_object('address', null, 'hash', null, 'masked', null);
  end if;
  return jsonb_build_object(
    'address', v_addr,
    'hash', public.message_recipient_hash(v_addr),
    'masked', case when o.channel = 'email' then public.mask_email(v_addr) else public.mask_phone(v_addr) end);
end $fn$;
revoke all on function public.outbox_recipient(uuid) from public, anon, authenticated;

-- Same body as 20261015110000 + the member_added staleness check.
CREATE OR REPLACE FUNCTION public.outbox_guard(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  o public.message_outbox;
  a record;
  rr record;
  v_r jsonb;
  v_sms_on boolean;
  v_cap integer;
  v_used integer;
begin
  select * into o from public.message_outbox where id = p_id;

  if not public.business_is_active(o.business_id) then return 'business_inactive'; end if;

  -- report_summary: the recipient must STILL be an active member holding
  -- reports.view_advanced at all scope, and the plan must still have the feature.
  if o.event = 'report_summary' then
    if not public.business_has_feature(o.business_id, 'advanced_reports')
       or not public.user_holds_all_scope(o.business_id, o.user_id, 'reports.view_advanced') then
      return 'stale';
    end if;
  end if;

  -- low stock: the recipient must STILL hold inventory.adjust for the branch, the add-on must still
  -- be on and the product must still be low (a restock between queueing and sending cancels it).
  if o.event in ('low_stock', 'staff_low_stock') then
    if not public.business_has_feature(o.business_id, 'inventory')
       or not exists (select 1 from public.low_stock_recipients(o.business_id, o.branch_id) r(user_id) where r.user_id = o.user_id)
       or not exists (select 1 from public.products p
                      where p.id = nullif(o.payload ->> 'product_id', '')::uuid and p.deleted_at is null and p.is_active
                        and p.low_stock_threshold is not null and p.stock_qty <= p.low_stock_threshold) then
      return 'stale';
    end if;
  end if;

  -- form_request: the signing link must still be usable, the add-on on and the client still reachable.
  if o.event = 'form_request' then
    if not public.business_has_feature(o.business_id, 'forms_consent')
       or not exists (select 1 from public.form_requests fr
                      where fr.id = nullif(o.payload ->> 'request_id', '')::uuid
                        and fr.used_at is null and fr.revoked_at is null and fr.expires_at > now()) then
      return 'stale';
    end if;
  end if;

  -- portal_login: the link must still be usable and the portal add-on on (a sign-in email that can no
  -- longer work is never sent).
  if o.event = 'portal_login' then
    if not public.business_has_feature(o.business_id, 'client_portal')
       or not exists (select 1 from public.portal_login_tokens pt
                      where pt.id = nullif(o.payload ->> 'token_id', '')::uuid
                        and pt.used_at is null and pt.revoked_at is null and pt.expires_at > now()) then
      return 'stale';
    end if;
  end if;

  -- member_added: only while the add is still pending (not joined, cancelled or expired).
  if o.event = 'member_added' then
    if not exists (select 1 from public.business_members m
                   where m.id = nullif(o.payload ->> 'member_id', '')::uuid and m.business_id = o.business_id
                     and m.status = 'invited' and m.deleted_at is null
                     and (m.invite_expires_at is null or m.invite_expires_at > now())) then
      return 'stale';
    end if;
  end if;

  if o.appointment_id is not null then
    select ap.status, ap.starts_at, ap.deleted_at into a from public.appointments ap where ap.id = o.appointment_id;
    if a.status is null or a.deleted_at is not null then return 'stale'; end if;
    if o.event in ('reminder', 'staff_reminder') and (a.status <> 'confirmed' or a.starts_at <= now()) then
      return 'stale';
    end if;
    if o.event in ('booking_confirmed', 'pending_received', 'rescheduled') and a.status = 'cancelled' then
      return 'stale';
    end if;
  end if;

  if o.event = 'review_request' then
    select r.used_at, r.expires_at, r.deleted_at into rr from public.review_requests r where r.id = o.review_request_id;
    if rr.expires_at is null or rr.used_at is not null or rr.deleted_at is not null or rr.expires_at <= now() then
      return 'stale';
    end if;
  end if;

  if o.channel = 'push' then
    if not exists (select 1 from public.push_tokens t where t.user_id = o.user_id) then return 'no_token'; end if;
  else
    v_r := public.outbox_recipient(p_id);
    if v_r->>'address' is null then return 'no_recipient'; end if;
    if o.channel = 'sms' then
      select ns.sms_enabled into v_sms_on from public.notification_settings ns where ns.branch_id = o.branch_id;
      if not coalesce(v_sms_on, false) then return 'sms_disabled'; end if;
    end if;
    -- Opt-out applies to the optional events only. Transactional ones always go.
    if o.event in ('reminder', 'review_request')
       and exists (select 1 from public.message_suppressions s
                   where s.business_id = o.business_id and s.channel = o.channel
                     and s.recipient_hash = v_r->>'hash') then
      return 'suppressed';
    end if;
    -- Per-recipient cap across all businesses.
    select value into v_cap from public.messaging_limits where key = 'recipient_daily';
    select count(*) into v_used from public.messages m
    where m.recipient_hash = v_r->>'hash' and m.status = 'sent' and m.created_at > now() - interval '24 hours';
    if v_used >= coalesce(v_cap, 5) then return 'recipient_cap'; end if;
  end if;

  -- Per-business daily cap (UTC day), counting rows already claimed or sent today.
  select value into v_cap from public.messaging_limits where key = 'daily_' || o.channel;
  select count(*) into v_used from public.message_outbox x
  where x.business_id = o.business_id and x.channel = o.channel and x.id <> o.id
    and x.status in ('sending', 'sent')
    and x.claimed_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  if v_used >= coalesce(v_cap, 500) then return 'daily_cap'; end if;

  return null;
end $fn$;
revoke all on function public.outbox_guard(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_member_by_email
-- ---------------------------------------------------------------------------
-- Order (CLAUDE.md section 5): permission -> rate limit (the counter row must survive, so every
-- later failure is a RETURN, never a raise) -> every other check -> one block of writes.
-- The answer is the same whether or not the email already has an account (no enumeration);
-- only "already a member of THIS business" is reported, which the adder can see in the list.
create or replace function public.add_member_by_email(
  p_business_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_id uuid default null,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_expires timestamptz := now() + interval '30 days';
  v_rl jsonb;
  v_role record;
  v_p record;
  v_staff record;
  v_pending uuid;
  v_member_id uuid;
  v_branch uuid;
begin
  if v_uid is null or p_business_id is null
     or not public.can(p_business_id, p_branch_id, 'users.invite') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- Counted before anything else can fail: a failed attempt is still an attempt.
  v_rl := public.check_rate_limit('member_add', null, v_uid::text, p_business_id);
  if not coalesce((v_rl ->> 'allowed')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited',
                              'retry_after_seconds', v_rl -> 'retry_after_seconds');
  end if;

  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  select r.id, r.business_id, r.name into v_role
  from public.roles r
  where r.id = p_role_id and r.deleted_at is null
    and (r.business_id is null or r.business_id = p_business_id);
  if v_role.id is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_role');
  end if;
  if v_role.business_id is not null and not public.business_has_feature(p_business_id, 'custom_roles') then
    return jsonb_build_object('ok', false, 'code', 'feature_unavailable', 'feature', 'custom_roles');
  end if;

  if p_branch_id is not null then
    select b.id into v_branch from public.branches b
    where b.id = p_branch_id and b.business_id = p_business_id and b.deleted_at is null;
    if v_branch is null then
      return jsonb_build_object('ok', false, 'code', 'unknown_branch');
    end if;
  else
    select b.id into v_branch from public.branches b
    where b.business_id = p_business_id and b.deleted_at is null
    order by b.is_primary desc, b.created_at
    limit 1;
    if v_branch is null then
      return jsonb_build_object('ok', false, 'code', 'unknown_branch');
    end if;
  end if;

  -- Nobody grants a role they could not hold themselves, at that branch and scope.
  for v_p in select rp.permission, rp.scope from public.role_permissions rp where rp.role_id = v_role.id loop
    if not public.can_grant_at(p_business_id, p_branch_id, v_p.permission, v_p.scope) then
      return jsonb_build_object('ok', false, 'code', 'cannot_grant', 'permission', v_p.permission);
    end if;
  end loop;

  if exists (
    select 1 from public.business_members m
    join public.profiles p on p.id = m.user_id
    where m.business_id = p_business_id and lower(p.email::text) = v_email
      and m.status <> 'invited' and m.deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_member');
  end if;

  -- A pending add for this email already exists: re-adding replaces its role, so the adder must
  -- be allowed to take away the role it has now (same rule as cancelling it).
  select m.id into v_pending from public.business_members m
  where m.business_id = p_business_id and lower(m.invited_email::text) = v_email
    and m.status = 'invited' and m.deleted_at is null;
  if v_pending is not null then
    for v_p in
      select rp.permission, rp.scope, a.branch_id
      from public.member_role_assignments a
      join public.role_permissions rp on rp.role_id = a.role_id
      where a.member_id = v_pending
    loop
      if not public.can_grant_at(p_business_id, v_p.branch_id, v_p.permission, v_p.scope) then
        return jsonb_build_object('ok', false, 'code', 'cannot_modify_higher_role');
      end if;
    end loop;
  end if;

  if p_staff_id is not null then
    select sp.id, sp.business_id, sp.member_id into v_staff
    from public.staff_profiles sp
    where sp.id = p_staff_id and sp.deleted_at is null;
    if v_staff.id is null or v_staff.business_id <> p_business_id then
      return jsonb_build_object('ok', false, 'code', 'unknown_staff');
    end if;
    if not public.staff_in_scope(p_business_id, p_staff_id, 'staff.manage') then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
    if v_staff.member_id is not null and v_staff.member_id is distinct from v_pending then
      return jsonb_build_object('ok', false, 'code', 'staff_has_login');
    end if;
  end if;

  -- All validation done. Write. The constraints / guard trigger are the race backstop; their
  -- refusal is answered as a code inside this block so the rate-limit row above survives.
  begin
    insert into public.business_members (
      business_id, invited_email, status, invite_token_hash, invite_expires_at, invited_by
    )
    values (p_business_id, v_email, 'invited', null, v_expires, v_uid)
    on conflict (business_id, invited_email) where status = 'invited' and deleted_at is null
    do update set
      invite_token_hash = null,
      invite_expires_at = excluded.invite_expires_at,
      invited_by = excluded.invited_by,
      updated_at = now()
    returning id into v_member_id;

    delete from public.member_role_assignments a where a.member_id = v_member_id;
    insert into public.member_role_assignments (member_id, role_id, branch_id, created_by)
    values (v_member_id, v_role.id, p_branch_id, v_uid);

    if p_staff_id is not null then
      -- A re-add that picks a different profile releases the earlier one.
      update public.staff_profiles set member_id = null
      where member_id = v_member_id and id <> p_staff_id;
      update public.staff_profiles set member_id = v_member_id where id = p_staff_id;
    end if;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'already_member');
    when insufficient_privilege then
      return jsonb_build_object('ok', false, 'code', 'cannot_grant');
  end;

  if p_staff_id is not null then
    perform public.write_audit_log(
      p_business_id, 'staff.linked', 'staff_profile', p_staff_id::text,
      jsonb_build_object('member_id', v_staff.member_id),
      jsonb_build_object('member_id', v_member_id, 'via', 'add_by_email')
    );
  end if;

  -- "You were added" email: no token, the address is resolved at send time.
  insert into public.message_outbox
    (business_id, branch_id, channel, event, idempotency_key, deliver_after, payload, max_attempts)
  values
    (p_business_id, v_branch, 'email', 'member_added',
     'member_added:' || v_member_id || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
     now(), jsonb_build_object('member_id', v_member_id, 'role', v_role.name),
     coalesce((select value from public.messaging_limits where key = 'max_attempts'), 5))
  on conflict (idempotency_key) do nothing;

  perform public.write_audit_log(
    p_business_id, 'member.added_by_email', 'business_member', v_member_id::text,
    null,
    jsonb_build_object('email', v_email, 'role_id', v_role.id, 'branch_id', p_branch_id,
                       'staff_id', p_staff_id, 'expires_at', v_expires)
  );

  return jsonb_build_object('ok', true, 'member_id', v_member_id, 'expires_at', v_expires);
end;
$$;

comment on function public.add_member_by_email is
  'Adds a pending membership bound to an email, with a role (+ branch, + optional unlinked staff profile). No token: the person joins when they sign in with that VERIFIED email (claim_pending_memberships). Needs users.invite; rate-limited; returns {ok, code}; audited; queues a member_added email.';

revoke all on function public.add_member_by_email(uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.add_member_by_email(uuid, text, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_pending_memberships
-- ---------------------------------------------------------------------------
-- The signed-in user joins every live pending add for their OWN email, but only when that email
-- is verified. Email and verification are read from auth.users on the server, never from the
-- JWT or the client. Idempotent: a second call joins nothing.
create or replace function public.claim_pending_memberships()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_confirmed timestamptz;
  v_provider text;
  v_joined uuid[] := '{}';
  r record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select lower(u.email::text), u.email_confirmed_at, u.raw_app_meta_data ->> 'provider'
    into v_email, v_confirmed, v_provider
  from auth.users u
  where u.id = v_uid and u.deleted_at is null and not coalesce(u.is_anonymous, false);

  -- Unverified (or no email): never joins. Same answer as "nothing pending".
  if v_email is null or v_confirmed is null then
    return jsonb_build_object('ok', true, 'joined', '[]'::jsonb);
  end if;

  for r in
    select m.id, m.business_id
    from public.business_members m
    join public.businesses b on b.id = m.business_id and b.deleted_at is null
    where lower(m.invited_email::text) = v_email
      and m.status = 'invited' and m.deleted_at is null
      and (m.invite_expires_at is null or m.invite_expires_at > now())
      and not exists (
        select 1 from public.business_members m2
        where m2.business_id = m.business_id and m2.user_id = v_uid and m2.deleted_at is null)
    order by m.created_at, m.id
    for update of m skip locked
  loop
    begin
      update public.business_members
      set user_id = v_uid,
          status = 'active',
          joined_at = now(),
          invite_token_hash = null,
          invite_expires_at = null,
          updated_at = now()
      where id = r.id and status = 'invited';
      if found then
        v_joined := v_joined || r.business_id;
        perform public.write_audit_log(
          r.business_id, 'member.joined_by_email', 'business_member', r.id::text,
          null, jsonb_build_object('user_id', v_uid, 'provider', coalesce(v_provider, 'email'))
        );
      end if;
    exception when unique_violation then
      -- Joined this business through another row meanwhile (two tabs): nothing to do.
      null;
    end;
  end loop;

  if cardinality(v_joined) > 0 then
    update public.profiles set default_business_id = v_joined[1]
    where id = v_uid and default_business_id is null;
  end if;

  return jsonb_build_object('ok', true, 'joined', to_jsonb(v_joined));
end;
$$;

comment on function public.claim_pending_memberships is
  'Joins the signed-in user to every live pending add for their own VERIFIED email (auth.users.email_confirmed_at). Unverified = joins nothing. Sets default_business_id only when empty. Idempotent; audited per join.';

revoke all on function public.claim_pending_memberships() from public, anon;
grant execute on function public.claim_pending_memberships() to authenticated;
