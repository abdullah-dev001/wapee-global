-- Invite flow: invite a member with a role and branch, accept it once.
--
-- Shape of the flow, and why:
--
-- 1. `invite_member()` runs as the INVITER. It creates the `invited` member row
--    AND the role assignment immediately, so `enforce_role_assignment_guard`
--    fires while `auth.uid()` is the inviter — which is the only moment the
--    "you cannot grant a permission you do not hold" rule can be checked. The
--    role is therefore fixed at invite time, never chosen on accept.
-- 2. The raw token is returned ONCE and never stored; only its sha256 hash is.
-- 3. `accept_invite()` runs as the INVITEE, who must already be signed in with
--    the invited address (decision: a link alone must never attach a membership
--    to an existing account). It only flips the row to `active`.
--
-- Both are SECURITY DEFINER because they read and write rows the caller cannot
-- see yet, but each one re-checks the caller itself. Errors are deliberately
-- generic: `accept_invite` must not reveal whether a token or email exists.

-- Clean up a throwaway probe used while writing this migration to confirm that
-- pg_catalog built-ins resolve under `search_path = ''`. It never shipped.
drop function if exists public._probe_searchpath();

-- Invites last 7 days unless told otherwise.
alter table public.business_members
  alter column invite_expires_at set default (now() + interval '7 days');

comment on column public.business_members.invite_expires_at is
  'When the invite link stops working. Default 7 days (product decision).';

-- Tracks accept attempts per token hash so a guessed-token sweep is throttled.
create table if not exists public.invite_accept_attempts (
  token_hash text primary key,
  attempts integer not null default 0,
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);

comment on table public.invite_accept_attempts is
  'Rate limiting for accept_invite(). Written only by that function; no RLS policy, so the app cannot read or write it.';

alter table public.invite_accept_attempts enable row level security;
-- No policy on purpose: only the SECURITY DEFINER function touches this table.
revoke all on table public.invite_accept_attempts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- invite_member: create the invite and its role assignment, return the token
-- ---------------------------------------------------------------------------
create or replace function public.invite_member(
  p_business_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_id uuid default null
)
returns table (member_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(trim(p_email));
  v_token text;
  v_member_id uuid;
  v_expires timestamptz := now() + interval '7 days';
  v_is_system boolean;
  v_role_business uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- The permission boundary. `can()` also refuses an inactive business.
  if not public.can(p_business_id, p_branch_id, 'users.invite') then
    raise exception 'You do not have permission to invite people'
      using errcode = '42501';
  end if;

  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  -- The role must be a system role or one belonging to THIS business, or an
  -- inviter could attach a role defined by someone else's tenant.
  select is_system, business_id into v_is_system, v_role_business
  from public.roles where id = p_role_id;

  if v_is_system is null then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if v_role_business is not null and v_role_business <> p_business_id then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  -- A branch, when given, must belong to this business.
  if p_branch_id is not null and not exists (
    select 1 from public.branches
    where id = p_branch_id and business_id = p_business_id and deleted_at is null
  ) then
    raise exception 'Unknown branch' using errcode = '22023';
  end if;

  -- Already a member? Re-inviting would create a second membership.
  if exists (
    select 1 from public.business_members m
    join public.profiles p on p.id = m.user_id
    where m.business_id = p_business_id
      and p.email = v_email
      and m.status <> 'invited'
      and m.deleted_at is null
  ) then
    raise exception 'That person is already a member of this business'
      using errcode = '23505';
  end if;

  -- 32 bytes of randomness, url-safe. Returned once; only the hash is kept.
  v_token := replace(replace(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
    '+', '-'), '/', '_');
  v_token := rtrim(v_token, '=');

  -- Re-inviting the same address replaces the pending invite, so the old link
  -- dies and there is never more than one live token per address.
  insert into public.business_members (
    business_id, invited_email, status, invite_token_hash, invite_expires_at, invited_by
  )
  values (
    p_business_id, v_email, 'invited',
    pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires, auth.uid()
  )
  on conflict (business_id, invited_email) where status = 'invited' and deleted_at is null
  do update set
    invite_token_hash = excluded.invite_token_hash,
    invite_expires_at = excluded.invite_expires_at,
    invited_by = excluded.invited_by,
    updated_at = now()
  returning id into v_member_id;

  -- The role assignment happens NOW, as the inviter, so the escalation guard
  -- checks the inviter's own permissions. Replace any role from a prior invite.
  delete from public.member_role_assignments where member_id = v_member_id;
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  values (v_member_id, p_role_id, p_branch_id);

  perform public.write_audit_log(
    p_business_id, 'member.invited', 'business_member', v_member_id::text,
    null,
    jsonb_build_object('email', v_email::text, 'role_id', p_role_id, 'branch_id', p_branch_id)
  );

  return query select v_member_id, v_token, v_expires;
end;
$$;

comment on function public.invite_member is
  'Invites someone with a role and branch. Returns the raw token ONCE. The role is assigned here so the escalation guard checks the inviter.';

-- ---------------------------------------------------------------------------
-- accept_invite: the signed-in invitee joins
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_member record;
  v_caller_email extensions.citext;
  v_attempts integer;
begin
  -- Must be signed in: a link alone must never attach a membership to an
  -- account (product decision). The caller proves the address by signing in.
  if auth.uid() is null then
    raise exception 'That invite link is not valid' using errcode = '42501';
  end if;

  if p_token is null or length(p_token) < 16 then
    raise exception 'That invite link is not valid' using errcode = '42501';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- Throttle: 10 attempts per token hash per hour. Counted before the lookup so
  -- a sweep over guessed tokens is limited whether or not they exist.
  insert into public.invite_accept_attempts (token_hash, attempts)
  values (v_hash, 1)
  on conflict (token_hash) do update set
    attempts = case
      when public.invite_accept_attempts.first_attempt_at < now() - interval '1 hour'
      then 1 else public.invite_accept_attempts.attempts + 1 end,
    first_attempt_at = case
      when public.invite_accept_attempts.first_attempt_at < now() - interval '1 hour'
      then now() else public.invite_accept_attempts.first_attempt_at end,
    last_attempt_at = now()
  returning attempts into v_attempts;

  if v_attempts > 10 then
    raise exception 'Too many attempts. Try again later.' using errcode = '54000';
  end if;

  select m.* into v_member
  from public.business_members m
  where m.invite_token_hash = v_hash
    and m.status = 'invited'
    and m.deleted_at is null;

  -- One generic message for every failure below: unknown token, already used,
  -- expired, wrong account. Nothing here reveals which.
  if v_member.id is null then
    raise exception 'That invite link is not valid' using errcode = '42501';
  end if;

  if v_member.invite_expires_at is not null and v_member.invite_expires_at <= now() then
    raise exception 'That invite link is not valid' using errcode = '42501';
  end if;

  select p.email into v_caller_email from public.profiles p where p.id = auth.uid();

  -- The signed-in account must be the invited address.
  if v_caller_email is null or v_caller_email <> v_member.invited_email then
    raise exception 'That invite link is not valid' using errcode = '42501';
  end if;

  -- Already a member of this business through another row: nothing to accept.
  if exists (
    select 1 from public.business_members m2
    where m2.business_id = v_member.business_id
      and m2.user_id = auth.uid()
      and m2.deleted_at is null
  ) then
    raise exception 'That invite link is not valid' using errcode = '42501';
  end if;

  update public.business_members
  set user_id = auth.uid(),
      status = 'active',
      joined_at = now(),
      -- Single use: the token dies here.
      invite_token_hash = null,
      invite_expires_at = null,
      updated_at = now()
  where id = v_member.id;

  perform public.write_audit_log(
    v_member.business_id, 'member.invite_accepted', 'business_member', v_member.id::text,
    null, jsonb_build_object('user_id', auth.uid())
  );

  -- The attempt row is no longer needed once the token is spent.
  delete from public.invite_accept_attempts where token_hash = v_hash;

  return v_member.business_id;
end;
$$;

comment on function public.accept_invite is
  'The signed-in invitee joins. Single use, 7-day expiry, email must match the signed-in account. Every failure returns the same generic message.';

-- ---------------------------------------------------------------------------
-- invite_preview: what the accept screen may show before signing in
-- ---------------------------------------------------------------------------
-- Deliberately tiny: the business name and the invited address, so the screen
-- can say "Join Nova Hair Studio as you@example.com". No role, no inviter, no
-- member id. Returns nothing at all for a bad, used or expired token.
create or replace function public.invite_preview(p_token text)
returns table (business_name text, invited_email text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.name, m.invited_email::text, m.invite_expires_at
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where p_token is not null
    and length(p_token) >= 16
    and m.invite_token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and m.status = 'invited'
    and m.deleted_at is null
    and (m.invite_expires_at is null or m.invite_expires_at > now())
    and b.deleted_at is null;
$$;

comment on function public.invite_preview is
  'Business name + invited email for a live invite token, so the accept screen can name them. Empty for a bad, used or expired token.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.invite_member(uuid, text, uuid, uuid) from public;
revoke all on function public.accept_invite(text) from public;
revoke all on function public.invite_preview(text) from public;

grant execute on function public.invite_member(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
-- anon needs the preview: the invitee opens the link before signing in.
grant execute on function public.invite_preview(text) to anon, authenticated;
