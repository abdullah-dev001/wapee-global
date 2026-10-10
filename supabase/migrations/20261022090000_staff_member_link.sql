-- Link app logins (business_members) to staff profiles (staff_profiles.member_id).
--
-- Until now nothing set `staff_profiles.member_id`, so a Staff-role login never owned a
-- profile: "own" scope showed nothing and push recipients for their bookings were empty
-- (docs/business-flows.md gap 2). This migration adds the write path:
--
--   * link_staff_member(staff, member)   -- link / re-link / unlink (member = null)
--   * add_me_as_staff(business, branch)  -- one-click profile for the signed-in Owner/Manager
--   * invite_member(..., p_staff_id)     -- pick an unlinked profile at invite time; the invited
--                                           business_members row IS the member row that accept_invite
--                                           later activates, so the link survives accept untouched
--   * a guard so the column can only be written through those RPCs (API roles are refused)
--   * unlink automatically when a member is removed (soft-deleted)
--
-- Rules (all validated BEFORE the single write, see CLAUDE.md §5):
--   * the caller must manage that staff profile (staff_in_scope(... 'staff.manage'))
--   * the member must be a live member (active or invited) of the SAME business
--   * a member has at most one live profile; a profile has at most one member
--     (the existing partial unique index is the backstop)

-- ---------------------------------------------------------------------------
-- Guard: API roles cannot set member_id directly (no audit, no tenant check)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: `current_user` is 'authenticated' / 'anon' for a PostgREST
-- request and the function owner inside the SECURITY DEFINER RPCs below, so only the RPC
-- path (and service_role / postgres) can set the column. Setting NULL is always allowed:
-- the ON DELETE SET NULL foreign-key action must keep working.
create or replace function public.enforce_staff_member_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.member_id is not null
     and (tg_op = 'INSERT' or new.member_id is distinct from old.member_id)
     and current_user in ('authenticated', 'anon') then
    raise exception 'staff_profiles.member_id is managed by link_staff_member'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger staff_profiles_member_link_guard
  before insert or update of member_id on public.staff_profiles
  for each row execute function public.enforce_staff_member_link();

-- ---------------------------------------------------------------------------
-- A removed member releases its profile
-- ---------------------------------------------------------------------------
create or replace function public.release_staff_on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.staff_profiles set member_id = null where member_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.release_staff_on_member_removed() from public, anon, authenticated;

create trigger business_members_release_staff
  after update of deleted_at on public.business_members
  for each row execute function public.release_staff_on_member_removed();

-- ---------------------------------------------------------------------------
-- link_staff_member
-- ---------------------------------------------------------------------------
create or replace function public.link_staff_member(p_staff_id uuid, p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff record;
  v_member record;
  v_other uuid;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select sp.id, sp.business_id, sp.member_id into v_staff
  from public.staff_profiles sp
  where sp.id = p_staff_id and sp.deleted_at is null
  for update;
  if v_staff.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.staff_in_scope(v_staff.business_id, v_staff.id, 'staff.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_member_id is not null then
    select m.id, m.business_id, m.status into v_member
    from public.business_members m
    where m.id = p_member_id and m.deleted_at is null
    for update;
    -- A member of another business is reported exactly like an unknown one.
    if v_member.id is null or v_member.business_id <> v_staff.business_id
       or v_member.status not in ('active', 'invited') then
      return jsonb_build_object('ok', false, 'code', 'member_not_found');
    end if;

    select sp.id into v_other
    from public.staff_profiles sp
    where sp.member_id = p_member_id and sp.deleted_at is null and sp.id <> p_staff_id
    limit 1;
    if v_other is not null then
      return jsonb_build_object('ok', false, 'code', 'member_already_linked', 'staff_id', v_other);
    end if;
  end if;

  if v_staff.member_id is not distinct from p_member_id then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  -- All validation done. One write; the unique index is the race backstop.
  begin
    update public.staff_profiles set member_id = p_member_id where id = p_staff_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'member_already_linked');
  end;

  perform public.write_audit_log(
    v_staff.business_id,
    case when p_member_id is null then 'staff.unlinked' else 'staff.linked' end,
    'staff_profile', p_staff_id::text,
    jsonb_build_object('member_id', v_staff.member_id),
    jsonb_build_object('member_id', p_member_id)
  );
  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

comment on function public.link_staff_member is
  'Links (or, with a null member, unlinks) a staff profile to a login of the same business. Needs staff.manage over the profile. Returns {ok, code}; audited.';

revoke all on function public.link_staff_member(uuid, uuid) from public, anon;
grant execute on function public.link_staff_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- add_me_as_staff: the signed-in Owner / Manager becomes a bookable staff member
-- ---------------------------------------------------------------------------
create or replace function public.add_me_as_staff(p_business_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_member uuid;
  v_branch uuid;
  v_name text;
  v_email extensions.citext;
  v_existing uuid;
  v_staff uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select m.id into v_member
  from public.business_members m
  where m.business_id = p_business_id and m.user_id = v_uid
    and m.status = 'active' and m.deleted_at is null;
  if v_member is null or not public.can(p_business_id, null, 'staff.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_branch_id is not null then
    select b.id into v_branch from public.branches b
    where b.id = p_branch_id and b.business_id = p_business_id and b.deleted_at is null;
  else
    select b.id into v_branch from public.branches b
    where b.business_id = p_business_id and b.deleted_at is null
    order by b.is_primary desc, b.created_at
    limit 1;
  end if;
  if v_branch is null then
    return jsonb_build_object('ok', false, 'code', 'branch_not_found');
  end if;
  if not public.can(p_business_id, v_branch, 'staff.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select sp.id into v_existing
  from public.staff_profiles sp
  where sp.member_id = v_member and sp.deleted_at is null
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'already_staff', 'staff_id', v_existing);
  end if;

  -- The plan's staff cap, answered as a code instead of an exception.
  begin
    perform public.check_staff_cap(p_business_id, v_branch, 1);
  exception when others then
    if sqlerrm = 'staff_cap_reached' then
      return jsonb_build_object('ok', false, 'code', 'staff_cap_reached');
    end if;
    raise;
  end;

  select nullif(trim(p.full_name), ''), p.email into v_name, v_email
  from public.profiles p where p.id = v_uid;
  v_name := left(coalesce(v_name, nullif(split_part(v_email::text, '@', 1), ''), 'Me'), 120);

  -- All validation done. Write.
  insert into public.staff_profiles
    (business_id, member_id, display_name, email, is_active, is_bookable_online, created_by)
  values
    (p_business_id, v_member, v_name, v_email, true, true, v_uid)
  returning id into v_staff;

  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v_staff, v_branch, p_business_id);

  perform public.write_audit_log(
    p_business_id, 'staff.self_added', 'staff_profile', v_staff::text, null,
    jsonb_build_object('member_id', v_member, 'branch_id', v_branch)
  );
  return jsonb_build_object('ok', true, 'staff_id', v_staff, 'branch_id', v_branch);
end;
$$;

comment on function public.add_me_as_staff is
  'Creates a bookable staff profile from the caller''s own name and email, assigned to one branch, linked to their membership. Needs staff.manage.';

revoke all on function public.add_me_as_staff(uuid, uuid) from public, anon;
grant execute on function public.add_me_as_staff(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- invite_member: optional staff profile to link (same body as 20261002162000 + p_staff_id)
-- ---------------------------------------------------------------------------
drop function if exists public.invite_member(uuid, text, uuid, uuid);

create function public.invite_member(
  p_business_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_id uuid default null,
  p_staff_id uuid default null
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
  v_staff record;
  v_pending uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not public.can(p_business_id, p_branch_id, 'users.invite') then
    raise exception 'You do not have permission to invite people'
      using errcode = '42501';
  end if;

  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select is_system, business_id into v_is_system, v_role_business
  from public.roles where id = p_role_id;

  if v_is_system is null then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if v_role_business is not null and v_role_business <> p_business_id then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches
    where id = p_branch_id and business_id = p_business_id and deleted_at is null
  ) then
    raise exception 'Unknown branch' using errcode = '22023';
  end if;

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

  -- Staff profile to link: validated before anything is written.
  if p_staff_id is not null then
    select sp.id, sp.business_id, sp.member_id into v_staff
    from public.staff_profiles sp
    where sp.id = p_staff_id and sp.deleted_at is null;
    if v_staff.id is null or v_staff.business_id <> p_business_id then
      raise exception 'Unknown staff profile' using errcode = '22023';
    end if;
    if not public.staff_in_scope(p_business_id, p_staff_id, 'staff.manage') then
      raise exception 'You do not have permission to manage that staff profile'
        using errcode = '42501';
    end if;
    select m.id into v_pending from public.business_members m
    where m.business_id = p_business_id and m.invited_email = v_email
      and m.status = 'invited' and m.deleted_at is null;
    if v_staff.member_id is not null and v_staff.member_id is distinct from v_pending then
      raise exception 'That staff profile already has a login' using errcode = '23505';
    end if;
  end if;

  v_token := replace(replace(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
    '+', '-'), '/', '_');
  v_token := rtrim(v_token, '=');

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

  delete from public.member_role_assignments a where a.member_id = v_member_id;
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  values (v_member_id, p_role_id, p_branch_id);

  if p_staff_id is not null then
    -- A re-invite that picks a different profile releases the earlier one.
    update public.staff_profiles set member_id = null
    where member_id = v_member_id and id <> p_staff_id;
    update public.staff_profiles set member_id = v_member_id where id = p_staff_id;
    perform public.write_audit_log(
      p_business_id, 'staff.linked', 'staff_profile', p_staff_id::text,
      jsonb_build_object('member_id', v_staff.member_id),
      jsonb_build_object('member_id', v_member_id, 'via', 'invite')
    );
  end if;

  perform public.write_audit_log(
    p_business_id, 'member.invited', 'business_member', v_member_id::text,
    null,
    jsonb_build_object('email', v_email::text, 'role_id', p_role_id, 'branch_id', p_branch_id,
                       'staff_id', p_staff_id)
  );

  return query select v_member_id, v_token, v_expires;
end;
$$;

comment on function public.invite_member is
  'Invites someone with a role and branch, optionally linking an unlinked staff profile. Returns the raw token ONCE as out_token. The role is assigned here so the escalation guard checks the inviter.';

revoke all on function public.invite_member(uuid, text, uuid, uuid, uuid) from public;
revoke execute on function public.invite_member(uuid, text, uuid, uuid, uuid) from anon;
grant execute on function public.invite_member(uuid, text, uuid, uuid, uuid) to authenticated;
