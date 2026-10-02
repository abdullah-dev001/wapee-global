-- Fix: the accept_invite() rate limit never counted anything.
--
-- The counter was incremented in the same transaction that then raised on a bad
-- token. `raise exception` rolls the transaction back, so the INSERT that
-- recorded the attempt was undone every time — the table stayed empty and the
-- throttle could never trip. Verified: 12 bad attempts in a row, zero rows.
--
-- Postgres has no autonomous transactions, so the counter cannot be committed
-- separately without dblink and a stored credential. The function is
-- restructured instead: every failure is now a RETURN NULL rather than a RAISE,
-- so the transaction commits and the attempt row survives. The client turns a
-- null into the single generic message, exactly as before.
--
-- Two cases still raise, both safe:
-- - "not signed in", which is a client bug and is counted against nothing;
-- - the throttle itself, where the row is already at its cap so losing that one
--   increment to the rollback changes nothing.

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
  -- account (product decision). Raised, not returned: this is a client bug,
  -- not a guessable-token attempt, and nothing has been counted yet.
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if p_token is null or length(p_token) < 16 then
    return null;
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- Throttle: 10 attempts per token hash per hour. This INSERT must survive the
  -- function returning a failure, which is why every failure below is a RETURN
  -- and never a RAISE — a raise would roll this row back (the original bug).
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
    -- Raising here is safe and deliberate: the row is already at its cap, so
    -- losing this one increment to the rollback changes nothing.
    raise exception 'Too many attempts. Try again later.' using errcode = '54000';
  end if;

  select m.* into v_member
  from public.business_members m
  where m.invite_token_hash = v_hash
    and m.status = 'invited'
    and m.deleted_at is null;

  -- Every failure from here returns null, which the client renders as one
  -- generic message. Nothing distinguishes unknown / used / expired / wrong
  -- account, and nothing rolls back the attempt counter.
  if v_member.id is null then
    return null;
  end if;

  if v_member.invite_expires_at is not null and v_member.invite_expires_at <= now() then
    return null;
  end if;

  select p.email into v_caller_email from public.profiles p where p.id = auth.uid();

  if v_caller_email is null or v_caller_email <> v_member.invited_email then
    return null;
  end if;

  -- Already a member of this business through another row: nothing to accept.
  if exists (
    select 1 from public.business_members m2
    where m2.business_id = v_member.business_id
      and m2.user_id = auth.uid()
      and m2.deleted_at is null
  ) then
    return null;
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
  'The signed-in invitee joins. Single use, 7-day expiry, email must match. Returns NULL for every failure (so the attempt counter is not rolled back); the client shows one generic message. Raises only for "not signed in" and the throttle.';

revoke all on function public.accept_invite(text) from public;
revoke execute on function public.accept_invite(text) from anon;
grant execute on function public.accept_invite(text) to authenticated;
