-- Fix: `invite_member()` failed with 42702 "column reference member_id is ambiguous".
--
-- The function declared `returns table (member_id uuid, …)`, which puts
-- `member_id` in scope as an OUT variable for the whole body. The statements
-- that manage the role assignment also reference
-- `member_role_assignments.member_id`, so PL/pgSQL could not tell which one was
-- meant and refused at runtime — the invite only failed once a role assignment
-- was touched, which is why a first invite appeared to work.
--
-- The OUT columns are renamed with an `out_` prefix so they can never collide
-- with a column name. The returned JSON keys change with them, so the client
-- reads `out_member_id` / `out_token` / `out_expires_at`.

-- Renaming OUT columns changes the return type, which `create or replace` cannot
-- do (42P13). The function is two hours old and nothing depends on it yet.
drop function if exists public.invite_member(uuid, text, uuid, uuid);

create function public.invite_member(
  p_business_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_id uuid default null
)
returns table (out_member_id uuid, out_token text, out_expires_at timestamptz)
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
  -- `a.member_id` is qualified: an unqualified name would be ambiguous against
  -- this function's OUT columns, which is the bug this migration fixes.
  delete from public.member_role_assignments a where a.member_id = v_member_id;
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
  'Invites someone with a role and branch. Returns the raw token ONCE as out_token. The role is assigned here so the escalation guard checks the inviter.';

revoke all on function public.invite_member(uuid, text, uuid, uuid) from public;
revoke execute on function public.invite_member(uuid, text, uuid, uuid) from anon;
grant execute on function public.invite_member(uuid, text, uuid, uuid) to authenticated;
