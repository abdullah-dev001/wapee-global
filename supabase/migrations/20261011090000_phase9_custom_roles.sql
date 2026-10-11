-- Phase 9A (1/4): custom roles.
--
-- Decided with the user:
--   * create / clone / edit / delete (soft) custom roles, any permission set from
--     the catalogue, scopes Own / Branch / All per permission; feature
--     `custom_roles` (business_has_feature) gates every write
--   * default (system) roles cannot be edited or deleted
--   * safety rules live in the DATABASE (triggers + RPCs), not the UI:
--       - a business always keeps one active Owner (existing trigger, kept)
--       - nobody grants a permission they do not hold, AT THAT SCOPE and for that
--         branch (the Phase 1 guard only compared permission names)
--       - only the Owner manages billing: `settings.billing` can never be in a
--         custom role
--       - a role in use cannot be deleted unless the caller names a replacement
--         role; then every assignment moves to it in ONE transaction
--       - every change is audit-logged (who, when, before, after)
--   * permission cache refresh: business_members.permissions_version is bumped
--     whenever a member's effective permissions can change; the UI reads
--     my_permissions_version() and refetches my_grants() when it moves.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.roles
  add column deleted_at timestamptz,
  add column created_by uuid references public.profiles (id) on delete set null;

create unique index roles_business_name_unique
  on public.roles (business_id, lower(name))
  where business_id is not null and deleted_at is null;

alter table public.business_members
  add column permissions_version bigint not null default 0;

-- A soft-deleted custom role disappears from lists. System roles are never deleted.
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using (deleted_at is null and (business_id is null or public.is_member(business_id)));

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function public.scope_rank(p_scope public.permission_scope)
returns integer language sql immutable set search_path = '' as $$
  select case p_scope when 'own' then 1 when 'branch' then 2 when 'all' then 3 end
$$;
revoke all on function public.scope_rank(public.permission_scope) from public, anon, authenticated;

-- Does the CALLER hold `p_permission` at >= p_scope, covering p_branch_id?
-- p_branch_id null means "for every branch" (a role assigned to all branches).
-- A grant covers a branch when its scope is `all`, or the assignment is for all
-- branches, or the assignment is for exactly that branch.
create or replace function public.can_grant_at(
  p_business_id uuid, p_branch_id uuid, p_permission text, p_scope public.permission_scope
) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select max(public.scope_rank(rp.scope))
    from public.business_members m
    join public.member_role_assignments a on a.member_id = m.id
    join public.roles r on r.id = a.role_id and r.deleted_at is null
    join public.role_permissions rp on rp.role_id = a.role_id
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active' and m.deleted_at is null
      and rp.permission = p_permission
      and (rp.scope = 'all'
           or a.branch_id is null
           or (p_branch_id is not null and a.branch_id = p_branch_id))
  ), 0) >= public.scope_rank(p_scope)
$$;
revoke all on function public.can_grant_at(uuid, uuid, text, public.permission_scope) from public, anon, authenticated;

-- Highest scope the caller holds a permission at anywhere (used when DEFINING a
-- role, which is not tied to a branch yet; assigning it is checked per branch).
create or replace function public.can_define_at(
  p_business_id uuid, p_permission text, p_scope public.permission_scope
) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select max(public.scope_rank(rp.scope))
    from public.business_members m
    join public.member_role_assignments a on a.member_id = m.id
    join public.roles r on r.id = a.role_id and r.deleted_at is null
    join public.role_permissions rp on rp.role_id = a.role_id
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active' and m.deleted_at is null
      and rp.permission = p_permission
  ), 0) >= public.scope_rank(p_scope)
$$;
revoke all on function public.can_define_at(uuid, text, public.permission_scope) from public, anon, authenticated;

-- Validates [{permission, scope}] -> {ok:true, items} | {ok:false, code[, permission]}
create or replace function public.normalise_role_permissions(p_perms jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_seen text[] := '{}';
  v_out jsonb := '[]';
  v_perm text;
  v_scope text;
begin
  if p_perms is null or jsonb_typeof(p_perms) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_permissions');
  end if;
  if jsonb_array_length(p_perms) = 0 then
    return jsonb_build_object('ok', false, 'code', 'empty_role');
  end if;
  if jsonb_array_length(p_perms) > 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid_permissions');
  end if;
  for v_item in select * from jsonb_array_elements(p_perms) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'permission') <> 'string'
       or jsonb_typeof(v_item -> 'scope') <> 'string' then
      return jsonb_build_object('ok', false, 'code', 'invalid_permissions');
    end if;
    v_perm := v_item ->> 'permission';
    v_scope := v_item ->> 'scope';
    if not exists (select 1 from public.permissions p where p.key = v_perm) then
      return jsonb_build_object('ok', false, 'code', 'unknown_permission', 'permission', v_perm);
    end if;
    if v_scope not in ('own', 'branch', 'all') then
      return jsonb_build_object('ok', false, 'code', 'invalid_scope', 'permission', v_perm);
    end if;
    if v_perm = any (v_seen) then
      return jsonb_build_object('ok', false, 'code', 'duplicate_permission', 'permission', v_perm);
    end if;
    v_seen := v_seen || v_perm;
    v_out := v_out || jsonb_build_object('permission', v_perm, 'scope', v_scope);
  end loop;
  return jsonb_build_object('ok', true, 'items', v_out);
end $$;
revoke all on function public.normalise_role_permissions(jsonb) from public, anon, authenticated;

-- A role's permission set as sorted jsonb (for audit before/after).
create or replace function public.role_permission_set(p_role_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('permission', rp.permission, 'scope', rp.scope)
                            order by rp.permission), '[]'::jsonb)
  from public.role_permissions rp where rp.role_id = p_role_id
$$;
revoke all on function public.role_permission_set(uuid) from public, anon, authenticated;

-- Common gate for the role RPCs: signed in, may manage roles, feature on.
create or replace function public.roles_gate(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.can(p_business_id, null, 'roles.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return public.feature_gate_error(p_business_id, 'custom_roles');
end $$;
revoke all on function public.roles_gate(uuid) from public, anon, authenticated;

-- Bump the permission-cache version of every member holding a role.
create or replace function public.bump_role_members(p_role_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.business_members m set permissions_version = m.permissions_version + 1
  where m.id in (select a.member_id from public.member_role_assignments a where a.role_id = p_role_id)
$$;
revoke all on function public.bump_role_members(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- role_permissions: system roles are fixed, billing is Owner-only, and nobody
-- writes a permission/scope they do not hold. The RPCs go through the same path.
create or replace function public.enforce_role_permission_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role record;
  v_row public.role_permissions;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select r.id, r.business_id, r.is_system, r.deleted_at into v_role from public.roles r where r.id = v_row.role_id;
  if not found then
    return v_row; -- the role is going (business delete cascade)
  end if;

  if v_role.business_id is null or v_role.is_system then
    if (select auth.uid()) is not null then
      raise exception 'The default roles cannot be changed' using errcode = '42501';
    end if;
    return v_row;
  end if;

  if tg_op <> 'DELETE' and new.permission = 'settings.billing' then
    raise exception 'billing_owner_only: only the Owner manages billing' using errcode = '23514';
  end if;

  if tg_op <> 'DELETE' and (select auth.uid()) is not null and not public.is_super_admin() then
    if not public.can_define_at(v_role.business_id, new.permission, new.scope)
       and not (tg_op = 'UPDATE' and old.permission = new.permission
                and public.scope_rank(new.scope) <= public.scope_rank(old.scope)) then
      raise exception 'You cannot grant "%" at "%" scope because you do not hold it', new.permission, new.scope
        using errcode = '42501';
    end if;
  end if;
  return v_row;
end $$;
revoke all on function public.enforce_role_permission_guard() from public, anon, authenticated;
create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function public.enforce_role_permission_guard();

-- roles: system rows fixed; only the RPCs may soft-delete; no hard delete via API.
create or replace function public.enforce_role_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.business_id is null then
      if (select auth.uid()) is not null then
        raise exception 'The default roles cannot be deleted' using errcode = '42501';
      end if;
      return old;
    end if;
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old; -- business delete cascade
    end if;
    if (select auth.uid()) is not null then
      raise exception 'Roles are never hard-deleted; use delete_custom_role' using errcode = '23514';
    end if;
    return old;
  end if;

  if (select auth.uid()) is not null then
    if old.business_id is null or old.is_system then
      raise exception 'The default roles cannot be changed' using errcode = '42501';
    end if;
    if new.business_id is distinct from old.business_id or new.key is distinct from old.key
       or new.is_system is distinct from old.is_system then
      raise exception 'A role cannot change its business, key or system flag' using errcode = '23514';
    end if;
    if new.deleted_at is distinct from old.deleted_at
       and coalesce(current_setting('wapee.role_rpc', true), '') <> 'on' then
      raise exception 'Use delete_custom_role to delete a role' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_role_guard() from public, anon, authenticated;
create trigger roles_guard before update or delete on public.roles
  for each row execute function public.enforce_role_guard();

-- member_role_assignments: the Phase 1 guard, now scope- and branch-aware, plus
-- same-business role, no deleted role, custom roles need the feature.
create or replace function public.enforce_role_assignment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
  v_role record;
  v_missing record;
  v_existing_assignments integer;
begin
  select m.business_id into v_business_id from public.business_members m where m.id = new.member_id;

  select r.id, r.business_id, r.deleted_at into v_role from public.roles r where r.id = new.role_id;
  if v_role.business_id is not null and v_role.business_id is distinct from v_business_id then
    raise exception 'That role belongs to another business' using errcode = '42501';
  end if;
  if v_role.deleted_at is not null then
    raise exception 'role_deleted' using errcode = '23514';
  end if;
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.business_id = v_business_id) then
    raise exception 'That branch belongs to another business' using errcode = '42501';
  end if;

  -- Service role / SQL console (no signed-in user) and super admin are trusted.
  if (select auth.uid()) is null or public.is_super_admin() then
    return new;
  end if;

  -- Founding Owner: a business with no role assignments at all (signup RPC).
  select count(*) into v_existing_assignments
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  where m.business_id = v_business_id;
  if v_existing_assignments = 0 then
    return new;
  end if;

  if v_role.business_id is not null and tg_op = 'INSERT'
     and not public.business_has_feature(v_business_id, 'custom_roles') then
    raise exception 'feature_unavailable' using errcode = 'P0001', detail = 'custom_roles', hint = 'upgrade_plan';
  end if;

  select rp.permission, rp.scope into v_missing
  from public.role_permissions rp
  where rp.role_id = new.role_id
    and not public.can_grant_at(v_business_id, new.branch_id, rp.permission, rp.scope)
  limit 1;
  if found then
    raise exception 'You cannot grant "%" because you do not have it yourself', v_missing.permission
      using errcode = '42501';
  end if;
  return new;
end $$;
-- (trigger member_role_assignments_guard already points at this function name)

-- ---------------------------------------------------------------------------
-- Audit + permission-cache triggers
-- ---------------------------------------------------------------------------
create or replace function public.audit_role_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_member_id uuid := coalesce(new.member_id, old.member_id);
  v_business_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select m.business_id into v_business_id from public.business_members m where m.id = v_member_id;
  if v_business_id is null or not exists (select 1 from public.businesses b where b.id = v_business_id) then
    return coalesce(new, old); -- member / business being deleted
  end if;

  update public.business_members m set permissions_version = m.permissions_version + 1 where m.id = v_member_id;

  if tg_op in ('UPDATE', 'DELETE') then
    select jsonb_build_object('assignment_id', old.id, 'role_id', old.role_id, 'role_key', r.key,
                              'role_name', r.name, 'branch_id', old.branch_id)
      into v_before from public.roles r where r.id = old.role_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select jsonb_build_object('assignment_id', new.id, 'role_id', new.role_id, 'role_key', r.key,
                              'role_name', r.name, 'branch_id', new.branch_id)
      into v_after from public.roles r where r.id = new.role_id;
  end if;

  perform public.write_audit_log(
    v_business_id,
    case tg_op when 'INSERT' then 'role.assigned' when 'DELETE' then 'role.unassigned' else 'role.assignment_changed' end,
    'member', v_member_id::text, v_before, v_after);
  return coalesce(new, old);
end $$;
revoke all on function public.audit_role_assignment() from public, anon, authenticated;
create trigger member_role_assignments_audit after insert or update or delete on public.member_role_assignments
  for each row execute function public.audit_role_assignment();

-- Direct (non-RPC) edits of a role or its permissions are audited here and bump
-- the cache version; the RPCs set wapee.role_rpc and write one richer row.
create or replace function public.audit_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role_id uuid;
  v_business_id uuid;
  v_row jsonb;
  v_old jsonb;
begin
  if tg_table_name = 'roles' then
    v_role_id := coalesce(new.id, old.id);
    v_business_id := coalesce(new.business_id, old.business_id);
  else
    v_role_id := coalesce(new.role_id, old.role_id);
    select r.business_id into v_business_id from public.roles r where r.id = v_role_id;
  end if;
  if v_business_id is null or not exists (select 1 from public.businesses b where b.id = v_business_id) then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'role_permissions' then
    perform public.bump_role_members(v_role_id);
  end if;
  if coalesce(current_setting('wapee.role_rpc', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  perform public.write_audit_log(
    v_business_id, 'role.' || tg_table_name || '_' || lower(tg_op), 'role', v_role_id::text, v_old, v_row);
  return coalesce(new, old);
end $$;
revoke all on function public.audit_role_change() from public, anon, authenticated;
create trigger roles_audit after insert or update on public.roles
  for each row execute function public.audit_role_change();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.audit_role_change();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- create_custom_role: `p_permissions` [{permission, scope}] OR `p_clone_from`
-- (a default role or a custom role of this business). If both are given the
-- explicit list wins. Cloning drops settings.billing and reports it.
create or replace function public.create_custom_role(
  p_business_id uuid,
  p_name text,
  p_permissions jsonb default null,
  p_clone_from uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_err jsonb;
  v_name text := btrim(coalesce(p_name, ''));
  v_perms jsonb;
  v_norm jsonb;
  v_src record;
  v_stripped jsonb := '[]';
  v_item jsonb;
  v_role_id uuid;
  v_key text;
begin
  v_err := public.roles_gate(p_business_id);
  if v_err is not null then return v_err; end if;

  if char_length(v_name) not between 2 and 60 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;
  if lower(v_name) in ('owner', 'manager', 'receptionist', 'staff')
     or exists (select 1 from public.roles r where r.business_id = p_business_id
                and r.deleted_at is null and lower(r.name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'code', 'name_taken');
  end if;
  if (select count(*) from public.roles r where r.business_id = p_business_id and r.deleted_at is null) >= 50 then
    return jsonb_build_object('ok', false, 'code', 'too_many_roles');
  end if;

  if p_permissions is null and p_clone_from is not null then
    select r.id, r.key into v_src from public.roles r
    where r.id = p_clone_from and r.deleted_at is null and (r.business_id is null or r.business_id = p_business_id);
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('permission', rp.permission, 'scope', rp.scope)), '[]'::jsonb)
      into v_perms from public.role_permissions rp where rp.role_id = p_clone_from and rp.permission <> 'settings.billing';
    if exists (select 1 from public.role_permissions rp where rp.role_id = p_clone_from and rp.permission = 'settings.billing') then
      v_stripped := '["settings.billing"]';
    end if;
  else
    v_perms := p_permissions;
  end if;

  v_norm := public.normalise_role_permissions(v_perms);
  if not (v_norm ->> 'ok')::boolean then return v_norm; end if;

  for v_item in select * from jsonb_array_elements(v_norm -> 'items') loop
    if v_item ->> 'permission' = 'settings.billing' then
      return jsonb_build_object('ok', false, 'code', 'billing_owner_only', 'permission', 'settings.billing');
    end if;
    if not public.can_define_at(p_business_id, v_item ->> 'permission', (v_item ->> 'scope')::public.permission_scope) then
      return jsonb_build_object('ok', false, 'code', 'cannot_grant', 'permission', v_item ->> 'permission');
    end if;
  end loop;

  -- All validation done. Write.
  perform set_config('wapee.role_rpc', 'on', true);
  v_key := 'c_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  begin
    insert into public.roles (business_id, key, name, is_system, created_by)
    values (p_business_id, v_key, v_name, false, auth.uid()) returning id into v_role_id;
  exception when unique_violation then
    perform set_config('wapee.role_rpc', 'off', true);
    return jsonb_build_object('ok', false, 'code', 'name_taken');
  end;
  insert into public.role_permissions (role_id, permission, scope)
  select v_role_id, x ->> 'permission', (x ->> 'scope')::public.permission_scope
  from jsonb_array_elements(v_norm -> 'items') x;
  perform set_config('wapee.role_rpc', 'off', true);

  perform public.write_audit_log(p_business_id, 'role.created', 'role', v_role_id::text, null,
    jsonb_build_object('name', v_name, 'permissions', public.role_permission_set(v_role_id),
                       'cloned_from', p_clone_from));
  return jsonb_build_object('ok', true, 'role_id', v_role_id, 'stripped', v_stripped);
end $$;

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
    delete from public.role_permissions where role_id = p_role_id;
    insert into public.role_permissions (role_id, permission, scope)
    select p_role_id, x ->> 'permission', (x ->> 'scope')::public.permission_scope
    from jsonb_array_elements(v_norm -> 'items') x;
  end if;
  perform public.bump_role_members(p_role_id);
  perform set_config('wapee.role_rpc', 'off', true);

  perform public.write_audit_log(v_role.business_id, 'role.updated', 'role', p_role_id::text, v_before,
    jsonb_build_object('name', coalesce(v_name, v_role.name), 'permissions', public.role_permission_set(p_role_id)));
  return jsonb_build_object('ok', true, 'role_id', p_role_id);
end $$;

-- delete_custom_role: soft delete. In use -> refused with the member count
-- unless p_replacement_role_id is given; then every assignment moves to it.
create or replace function public.delete_custom_role(
  p_role_id uuid,
  p_replacement_role_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role record;
  v_repl record;
  v_err jsonb;
  v_n integer;
  v_a record;
  v_p record;
  v_moved integer := 0;
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

  select count(*) into v_n from public.member_role_assignments a where a.role_id = p_role_id;

  if v_n > 0 then
    if p_replacement_role_id is null then
      return jsonb_build_object('ok', false, 'code', 'role_in_use', 'member_count', v_n);
    end if;
    if p_replacement_role_id = p_role_id then
      return jsonb_build_object('ok', false, 'code', 'invalid_replacement');
    end if;
    select r.id, r.business_id into v_repl from public.roles r
    where r.id = p_replacement_role_id and r.deleted_at is null
      and (r.business_id is null or r.business_id = v_role.business_id) for share;
    if v_repl.id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_replacement');
    end if;
    -- the caller must be able to grant the replacement AND to take away the old
    -- role, at every branch affected
    for v_a in select distinct a.branch_id from public.member_role_assignments a where a.role_id = p_role_id loop
      for v_p in select rp.permission, rp.scope from public.role_permissions rp
                 where rp.role_id in (p_replacement_role_id, p_role_id) loop
        if not public.can_grant_at(v_role.business_id, v_a.branch_id, v_p.permission, v_p.scope) then
          return jsonb_build_object('ok', false, 'code', 'cannot_grant', 'permission', v_p.permission);
        end if;
      end loop;
    end loop;
  end if;

  v_before := jsonb_build_object('name', v_role.name, 'permissions', public.role_permission_set(p_role_id),
                                 'member_count', v_n);

  -- All validation done. Write (one transaction).
  perform set_config('wapee.role_rpc', 'on', true);
  if v_n > 0 then
    update public.member_role_assignments a set role_id = p_replacement_role_id
    where a.role_id = p_role_id
      and not exists (select 1 from public.member_role_assignments x
                      where x.member_id = a.member_id and x.role_id = p_replacement_role_id
                        and coalesce(x.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
                          = coalesce(a.branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
    get diagnostics v_moved = row_count;
    -- members who already held the replacement at that branch: just drop the old one
    delete from public.member_role_assignments where role_id = p_role_id;
  end if;
  update public.roles set deleted_at = now() where id = p_role_id;
  perform set_config('wapee.role_rpc', 'off', true);

  perform public.write_audit_log(v_role.business_id, 'role.deleted', 'role', p_role_id::text, v_before,
    jsonb_build_object('deleted', true, 'replacement_role_id', p_replacement_role_id, 'reassigned', v_moved,
                       'dropped_duplicates', v_n - v_moved));
  return jsonb_build_object('ok', true, 'reassigned', v_moved, 'dropped_duplicates', v_n - v_moved);
end $$;

-- assign_member_role: add a role to a member, for one branch or all (null).
create or replace function public.assign_member_role(
  p_member_id uuid,
  p_role_id uuid,
  p_branch_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_m record;
  v_role record;
  v_p record;
  v_existing uuid;
  v_id uuid;
begin
  select m.id, m.business_id, m.status, m.deleted_at into v_m from public.business_members m where m.id = p_member_id;
  if v_m.id is null or v_m.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (select auth.uid()) is null or not public.can(v_m.business_id, null, 'roles.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_m.status not in ('active', 'invited') then
    return jsonb_build_object('ok', false, 'code', 'member_not_active');
  end if;
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.business_id = v_m.business_id and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_branch');
  end if;
  select r.id, r.business_id into v_role from public.roles r
  where r.id = p_role_id and r.deleted_at is null and (r.business_id is null or r.business_id = v_m.business_id) for share;
  if v_role.id is null then
    return jsonb_build_object('ok', false, 'code', 'role_unavailable');
  end if;
  if v_role.business_id is not null and not public.business_has_feature(v_m.business_id, 'custom_roles') then
    return jsonb_build_object('ok', false, 'code', 'feature_unavailable', 'feature', 'custom_roles');
  end if;

  select a.id into v_existing from public.member_role_assignments a
  where a.member_id = p_member_id and a.role_id = p_role_id
    and coalesce(a.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'assignment_id', v_existing, 'already_assigned', true);
  end if;

  for v_p in select rp.permission, rp.scope from public.role_permissions rp where rp.role_id = p_role_id loop
    if not public.can_grant_at(v_m.business_id, p_branch_id, v_p.permission, v_p.scope) then
      return jsonb_build_object('ok', false, 'code', 'cannot_grant', 'permission', v_p.permission);
    end if;
  end loop;

  -- All validation done. Write.
  insert into public.member_role_assignments (member_id, role_id, branch_id, created_by)
  values (p_member_id, p_role_id, p_branch_id, auth.uid()) returning id into v_id;
  return jsonb_build_object('ok', true, 'assignment_id', v_id, 'already_assigned', false);
end $$;

-- remove_member_role: you must be able to grant the role you remove (a
-- Manager-level role manager cannot strip an Owner), and the last Owner stays.
create or replace function public.remove_member_role(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_p record;
  v_is_owner boolean;
  v_other_owners integer;
begin
  select a.id, a.member_id, a.role_id, a.branch_id, m.business_id into v_a
  from public.member_role_assignments a join public.business_members m on m.id = a.member_id
  where a.id = p_assignment_id for update of a;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (select auth.uid()) is null or not public.can(v_a.business_id, null, 'roles.manage') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  for v_p in select rp.permission, rp.scope from public.role_permissions rp where rp.role_id = v_a.role_id loop
    if not public.can_grant_at(v_a.business_id, v_a.branch_id, v_p.permission, v_p.scope) then
      return jsonb_build_object('ok', false, 'code', 'cannot_modify_higher_role');
    end if;
  end loop;

  select exists (select 1 from public.roles r where r.id = v_a.role_id and r.business_id is null and r.key = 'owner')
    into v_is_owner;
  if v_is_owner then
    select count(*) into v_other_owners
    from public.member_role_assignments x
    join public.business_members m on m.id = x.member_id
    join public.roles r on r.id = x.role_id
    where m.business_id = v_a.business_id and m.status = 'active' and m.deleted_at is null
      and r.key = 'owner' and r.business_id is null and x.id <> p_assignment_id;
    if v_other_owners = 0 then
      return jsonb_build_object('ok', false, 'code', 'last_owner');
    end if;
  end if;

  -- All validation done. Write.
  delete from public.member_role_assignments where id = p_assignment_id;
  return jsonb_build_object('ok', true);
end $$;

-- Roles with their permissions and how many assignments use them (for the UI).
create or replace function public.list_roles(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not (public.can(p_business_id, null, 'roles.manage') or public.can(p_business_id, null, 'users.invite')) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'roles', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'key', r.key, 'name', r.name, 'is_system', r.business_id is null or r.is_system,
        'permissions', public.role_permission_set(r.id),
        'member_count', (select count(*) from public.member_role_assignments a where a.role_id = r.id))
      order by (r.business_id is null) desc, r.name), '[]'::jsonb)
    from public.roles r
    where r.deleted_at is null and (r.business_id is null or r.business_id = p_business_id)));
end $$;

-- The caller's permission-cache version for one business (cheap; poll on focus).
create or replace function public.my_permissions_version(p_business_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(max(m.permissions_version), 0)
  from public.business_members m
  where m.business_id = p_business_id and m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null
$$;

revoke all on function public.create_custom_role(uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.update_custom_role(uuid, text, jsonb) from public, anon;
revoke all on function public.delete_custom_role(uuid, uuid) from public, anon;
revoke all on function public.assign_member_role(uuid, uuid, uuid) from public, anon;
revoke all on function public.remove_member_role(uuid) from public, anon;
revoke all on function public.list_roles(uuid) from public, anon;
revoke all on function public.my_permissions_version(uuid) from public, anon;
grant execute on function public.create_custom_role(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.update_custom_role(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_custom_role(uuid, uuid) to authenticated;
grant execute on function public.assign_member_role(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_member_role(uuid) to authenticated;
grant execute on function public.list_roles(uuid) to authenticated;
grant execute on function public.my_permissions_version(uuid) to authenticated;
