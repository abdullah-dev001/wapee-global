-- Phase 9B: the Members gaps (remove a member, revoke an invite). Change-a-role
-- and resend-an-invite need nothing new (assign/remove_member_role from 9A, and
-- invite_member replaces the pending invite and its token).
--
-- Same safety rules as role assignments, enforced here and not in the UI:
--   * the caller must be able to GRANT every role the target holds (a Manager-level
--     role manager cannot remove an Owner), at the branch it is held for
--   * the last active Owner stays; nobody removes themselves (leave = ask an Owner)
--   * everything is audited (who, when, before)

create or replace function public.remove_member(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_m record;
  v_a record;
  v_p record;
  v_owner_roles integer;
  v_other_owners integer;
  v_before jsonb;
begin
  select m.id, m.business_id, m.user_id, m.status, m.deleted_at, m.invited_email, p.email as email, p.full_name
    into v_m
  from public.business_members m left join public.profiles p on p.id = m.user_id
  where m.id = p_member_id for update of m;
  if v_m.id is null or v_m.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (select auth.uid()) is null or not public.can(v_m.business_id, null, 'roles.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_m.status = 'invited' then
    return jsonb_build_object('ok', false, 'code', 'use_revoke_invite');
  end if;
  if v_m.user_id = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'code', 'cannot_remove_self');
  end if;

  for v_a in select a.id, a.role_id, a.branch_id from public.member_role_assignments a where a.member_id = p_member_id loop
    for v_p in select rp.permission, rp.scope from public.role_permissions rp where rp.role_id = v_a.role_id loop
      if not public.can_grant_at(v_m.business_id, v_a.branch_id, v_p.permission, v_p.scope) then
        return jsonb_build_object('ok', false, 'code', 'cannot_modify_higher_role');
      end if;
    end loop;
  end loop;

  select count(*) into v_owner_roles from public.member_role_assignments a join public.roles r on r.id = a.role_id
  where a.member_id = p_member_id and r.business_id is null and r.key = 'owner';
  if v_owner_roles > 0 then
    select count(*) into v_other_owners
    from public.member_role_assignments x
    join public.business_members m on m.id = x.member_id
    join public.roles r on r.id = x.role_id
    where m.business_id = v_m.business_id and m.status = 'active' and m.deleted_at is null and m.id <> p_member_id
      and r.business_id is null and r.key = 'owner';
    if v_other_owners = 0 then
      return jsonb_build_object('ok', false, 'code', 'last_owner');
    end if;
  end if;

  select jsonb_build_object('email', coalesce(v_m.email, v_m.invited_email), 'name', v_m.full_name,
    'roles', coalesce(jsonb_agg(jsonb_build_object('role', r.name, 'branch_id', a.branch_id)), '[]'::jsonb))
    into v_before
  from public.member_role_assignments a join public.roles r on r.id = a.role_id where a.member_id = p_member_id;

  -- All validation done. Write. (The assignment-delete trigger audits each role.)
  delete from public.member_role_assignments where member_id = p_member_id;
  update public.business_members set status = 'disabled', deleted_at = now() where id = p_member_id;
  perform public.write_audit_log(v_m.business_id, 'member.removed', 'member', p_member_id::text, v_before, null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.revoke_invite(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_m record;
  v_a record;
  v_p record;
begin
  select m.id, m.business_id, m.status, m.deleted_at, m.invited_email into v_m
  from public.business_members m where m.id = p_member_id for update;
  if v_m.id is null or v_m.deleted_at is not null or v_m.status <> 'invited' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (select auth.uid()) is null or not public.can(v_m.business_id, null, 'users.invite') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  for v_a in select a.role_id, a.branch_id from public.member_role_assignments a where a.member_id = p_member_id loop
    for v_p in select rp.permission, rp.scope from public.role_permissions rp where rp.role_id = v_a.role_id loop
      if not public.can_grant_at(v_m.business_id, v_a.branch_id, v_p.permission, v_p.scope) then
        return jsonb_build_object('ok', false, 'code', 'cannot_modify_higher_role');
      end if;
    end loop;
  end loop;
  delete from public.member_role_assignments where member_id = p_member_id;
  update public.business_members set status = 'disabled', deleted_at = now(), invite_token_hash = null
  where id = p_member_id;
  perform public.write_audit_log(v_m.business_id, 'invite.revoked', 'member', p_member_id::text,
    jsonb_build_object('email', v_m.invited_email), null);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
