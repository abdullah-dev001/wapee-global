-- Fix to 20261018090000: a person who is the last Owner of a business that is ALREADY soft-deleted tripped the
-- last-owner guard (found by suite 33). The guard is lifted for that business only, for the one delete.

-- The deletion itself. service_role only. Idempotent: an account that is already gone answers ok + already_deleted.
create or replace function public.account_delete_commit(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocking jsonb;
  v_m record;
  v_roles jsonb;
begin
  -- Validate everything first (no write before this block ends).
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('ok', true, 'already_deleted', true);
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_super_admin) then
    return jsonb_build_object('ok', false, 'code', 'super_admin');
  end if;
  v_blocking := public.account_sole_owner_businesses(p_user_id);
  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object('ok', false, 'code', 'sole_owner', 'businesses', v_blocking);
  end if;

  -- Writes. One audit row per business the person belonged to: who held which roles, no personal data.
  for v_m in
    select m.id, m.business_id from public.business_members m
    where m.user_id = p_user_id and m.deleted_at is null
  loop
    select coalesce(jsonb_agg(r.name order by r.name), '[]'::jsonb) into v_roles
    from public.member_role_assignments a join public.roles r on r.id = a.role_id
    where a.member_id = v_m.id;
    insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
    values (v_m.business_id, null, 'member.account_deleted', 'member', v_m.id::text,
            jsonb_build_object('roles', v_roles), null);
    -- Assignments first: the member row must still exist when the last-owner trigger looks it up. A business that
    -- is already soft-deleted has no one left to protect, so the guard is lifted for it (and only it).
    if exists (select 1 from public.businesses b where b.id = v_m.business_id and b.deleted_at is not null) then
      perform set_config('wapee.erase_business', v_m.business_id::text, true);
    end if;
    delete from public.member_role_assignments where member_id = v_m.id;
    perform set_config('wapee.erase_business', '', true);
  end loop;
  -- staff_profiles.member_id goes to NULL by its own foreign key; the staff profile and appointments stay.
  delete from public.business_members where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.push_preferences where user_id = p_user_id;
  update public.profiles
     set email = 'deleted-' || p_user_id::text || '@deleted.invalid', full_name = null, avatar_url = null,
         default_business_id = null, deleted_at = now()
   where id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (null, null, 'account.deleted', 'user', p_user_id::text, null, null);
  -- Sessions, identities, MFA factors and the (anonymised) profile go with the auth user.
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', true, 'already_deleted', false);
end $$;

