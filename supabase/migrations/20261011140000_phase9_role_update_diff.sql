-- Phase 9A fix: update_custom_role writes a DIFF instead of delete + re-insert.
-- Found by the boundary test "a delegate may keep an existing permission they do
-- not hold": the re-insert tripped the escalation guard on rows that had not
-- changed, so such an edit failed and nothing could be removed from the role.
-- (The first version, in 20261011090000, is applied and is not edited.)

-- update_custom_role: rename and/or replace the whole permission set. Default
-- roles are refused. Only permissions that are NEW or RAISED must be held by
-- the caller; removing is always allowed.
create or replace function public.update_custom_role(
  p_role_id uuid,
  p_name text default null,
  p_permissions jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role record;
  v_err jsonb;
  v_name text;
  v_norm jsonb;
  v_item jsonb;
  v_old_scope public.permission_scope;
  v_before jsonb;
begin
  select r.id, r.business_id, r.name, r.is_system, r.deleted_at into v_role
  from public.roles r where r.id = p_role_id for update;
  if v_role.id is null or v_role.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_role.business_id is null or v_role.is_system then
    -- the default roles are public reference data, so naming them leaks nothing
    return jsonb_build_object('ok', false,
      'code', case when (select auth.uid()) is null then 'forbidden' else 'system_role' end);
  end if;
  v_err := public.roles_gate(v_role.business_id);
  if v_err is not null then return v_err; end if;

  if p_name is null and p_permissions is null then
    return jsonb_build_object('ok', false, 'code', 'nothing_to_change');
  end if;

  if p_name is not null then
    v_name := btrim(p_name);
    if char_length(v_name) not between 2 and 60 then
      return jsonb_build_object('ok', false, 'code', 'invalid_name');
    end if;
    if lower(v_name) in ('owner', 'manager', 'receptionist', 'staff')
       or exists (select 1 from public.roles r where r.business_id = v_role.business_id and r.deleted_at is null
                  and r.id <> p_role_id and lower(r.name) = lower(v_name)) then
      return jsonb_build_object('ok', false, 'code', 'name_taken');
    end if;
  end if;

  if p_permissions is not null then
    v_norm := public.normalise_role_permissions(p_permissions);
    if not (v_norm ->> 'ok')::boolean then return v_norm; end if;
    for v_item in select * from jsonb_array_elements(v_norm -> 'items') loop
      if v_item ->> 'permission' = 'settings.billing' then
        return jsonb_build_object('ok', false, 'code', 'billing_owner_only', 'permission', 'settings.billing');
      end if;
      select rp.scope into v_old_scope from public.role_permissions rp
      where rp.role_id = p_role_id and rp.permission = v_item ->> 'permission';
      if (v_old_scope is null
          or public.scope_rank((v_item ->> 'scope')::public.permission_scope) > public.scope_rank(v_old_scope))
         and not public.can_define_at(v_role.business_id, v_item ->> 'permission',
                                      (v_item ->> 'scope')::public.permission_scope) then
        return jsonb_build_object('ok', false, 'code', 'cannot_grant', 'permission', v_item ->> 'permission');
      end if;
    end loop;
  end if;

  v_before := jsonb_build_object('name', v_role.name, 'permissions', public.role_permission_set(p_role_id));

  -- All validation done. Write.
  perform set_config('wapee.role_rpc', 'on', true);
  if v_name is not null then
    begin
      update public.roles set name = v_name where id = p_role_id;
    exception when unique_violation then
      perform set_config('wapee.role_rpc', 'off', true);
      return jsonb_build_object('ok', false, 'code', 'name_taken');
    end;
  end if;
  if p_permissions is not null then
    -- DIFF, not replace: unchanged rows are not rewritten, so the guard only
    -- ever sees what is genuinely new or raised (a delegate may keep a
    -- permission they do not hold themselves; they just cannot add it).
    delete from public.role_permissions rp
    where rp.role_id = p_role_id
      and not exists (select 1 from jsonb_array_elements(v_norm -> 'items') x where x ->> 'permission' = rp.permission);
    update public.role_permissions rp set scope = (x ->> 'scope')::public.permission_scope
    from jsonb_array_elements(v_norm -> 'items') x
    where rp.role_id = p_role_id and x ->> 'permission' = rp.permission
      and rp.scope is distinct from (x ->> 'scope')::public.permission_scope;
    insert into public.role_permissions (role_id, permission, scope)
    select p_role_id, x ->> 'permission', (x ->> 'scope')::public.permission_scope
    from jsonb_array_elements(v_norm -> 'items') x
    where not exists (select 1 from public.role_permissions rp where rp.role_id = p_role_id and rp.permission = x ->> 'permission');
  end if;
  perform public.bump_role_members(p_role_id);
  perform set_config('wapee.role_rpc', 'off', true);

  perform public.write_audit_log(v_role.business_id, 'role.updated', 'role', p_role_id::text, v_before,
    jsonb_build_object('name', coalesce(v_name, v_role.name), 'permissions', public.role_permission_set(p_role_id)));
  return jsonb_build_object('ok', true, 'role_id', p_role_id);
end $$;

revoke all on function public.update_custom_role(uuid, text, jsonb) from public, anon;
grant execute on function public.update_custom_role(uuid, text, jsonb) to authenticated;
