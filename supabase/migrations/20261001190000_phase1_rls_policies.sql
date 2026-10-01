-- Phase 1, part 4 of 4: RLS policies and the safety triggers.
-- Security lives here. Hiding a button in the UI is never the boundary.
--
-- NOTE: applied through the Supabase connector (the local CLI is signed in to a
-- different account and cannot link this project). Content matches the database.

-- businesses -----------------------------------------------------------------
create policy businesses_select_member
  on public.businesses for select to authenticated
  using (public.is_member(id) or public.is_super_admin());

-- Update needs settings.business. Deliberately NOT gated on business_is_active,
-- so an expired trial can still reach its own settings and billing.
create policy businesses_update_settings
  on public.businesses for update to authenticated
  using (public.has_permission(id, null, 'settings.business'))
  with check (public.has_permission(id, null, 'settings.business'));

-- No INSERT policy: businesses come only from create_business_with_owner().
-- No DELETE policy: soft delete via deleted_at.
grant select, update on public.businesses to authenticated;

create or replace function public.enforce_business_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.plan is distinct from old.plan
       or new.status is distinct from old.status
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.plan_activated_at is distinct from old.plan_activated_at then
      raise exception 'plan, status and trial dates are managed by Wapee'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_business_guard is
  'A tenant cannot extend its own trial or change its own plan or status.';

create trigger businesses_enforce_guard
  before update on public.businesses
  for each row execute function public.enforce_business_guard();

-- branches -------------------------------------------------------------------
create policy branches_select_member
  on public.branches for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());

create policy branches_insert_settings
  on public.branches for insert to authenticated
  with check (public.can(business_id, null, 'settings.business'));

create policy branches_update_settings
  on public.branches for update to authenticated
  using (public.can(business_id, null, 'settings.business'))
  with check (public.can(business_id, null, 'settings.business'));

grant select, insert, update on public.branches to authenticated;

-- business_members -----------------------------------------------------------
create policy business_members_select
  on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(business_id) or public.is_super_admin());

create policy business_members_insert_invite
  on public.business_members for insert to authenticated
  with check (public.can(business_id, null, 'users.invite'));

-- Own row is updatable so accepting an invite can set user_id/status/joined_at.
create policy business_members_update
  on public.business_members for update to authenticated
  using (user_id = auth.uid() or public.can(business_id, null, 'roles.manage'))
  with check (user_id = auth.uid() or public.can(business_id, null, 'roles.manage'));

grant select, insert, update on public.business_members to authenticated;

-- roles / role_permissions / permissions --------------------------------------
create policy roles_select
  on public.roles for select to authenticated
  using (business_id is null or public.is_member(business_id));

create policy roles_write_custom
  on public.roles for all to authenticated
  using (business_id is not null and not is_system and public.can(business_id, null, 'roles.manage'))
  with check (business_id is not null and not is_system and public.can(business_id, null, 'roles.manage'));

create policy role_permissions_select
  on public.role_permissions for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and (r.business_id is null or public.is_member(r.business_id))
  ));

create policy role_permissions_write_custom
  on public.role_permissions for all to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and r.business_id is not null and not r.is_system
      and public.can(r.business_id, null, 'roles.manage')
  ))
  with check (exists (
    select 1 from public.roles r
    where r.id = role_id and r.business_id is not null and not r.is_system
      and public.can(r.business_id, null, 'roles.manage')
  ));

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.permissions enable row level security;

create policy permissions_select_all
  on public.permissions for select to authenticated using (true);

grant select on public.permissions to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;

-- member_role_assignments ------------------------------------------------------
alter table public.member_role_assignments enable row level security;

create policy member_role_assignments_select
  on public.member_role_assignments for select to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id and (m.user_id = auth.uid() or public.is_member(m.business_id))
  ));

create policy member_role_assignments_write
  on public.member_role_assignments for all to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id and public.can(m.business_id, null, 'roles.manage')
  ))
  with check (exists (
    select 1 from public.business_members m
    where m.id = member_id and public.can(m.business_id, null, 'roles.manage')
  ));

grant select, insert, update, delete on public.member_role_assignments to authenticated;

-- Safety: nobody may grant a permission they do not themselves hold.
create or replace function public.enforce_role_assignment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
  v_missing text;
begin
  select m.business_id into v_business_id
  from public.business_members m where m.id = new.member_id;

  -- Service role / SQL console (no auth.uid()) is trusted: it runs the signup RPC.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  select rp.permission into v_missing
  from public.role_permissions rp
  where rp.role_id = new.role_id
    and not public.has_permission(v_business_id, new.branch_id, rp.permission)
  limit 1;

  if v_missing is not null then
    raise exception 'You cannot grant "%" because you do not have it yourself', v_missing
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_role_assignment_guard is
  'Privilege-escalation guard: you cannot grant a permission you do not hold.';

create trigger member_role_assignments_guard
  before insert or update on public.member_role_assignments
  for each row execute function public.enforce_role_assignment_guard();

-- Safety: a business always keeps at least one active Owner.
create or replace function public.enforce_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
  v_owner_count integer;
begin
  select m.business_id into v_business_id
  from public.business_members m where m.id = coalesce(old.member_id, new.member_id);

  select count(*) into v_owner_count
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  join public.roles r on r.id = a.role_id
  where m.business_id = v_business_id
    and m.status = 'active' and m.deleted_at is null
    and r.key = 'owner' and r.business_id is null
    and a.id is distinct from old.id;

  if v_owner_count = 0 then
    raise exception 'A business must always have at least one active Owner'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

comment on function public.enforce_last_owner is
  'Blocks removing the final Owner assignment of a business.';

create trigger member_role_assignments_last_owner
  before delete on public.member_role_assignments
  for each row execute function public.enforce_last_owner();

-- audit_logs: append-only --------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy audit_logs_select
  on public.audit_logs for select to authenticated
  using (public.is_super_admin() or public.has_permission(business_id, null, 'settings.business'));

-- No INSERT/UPDATE/DELETE policy: rows are written by SECURITY DEFINER functions
-- only, so the trail cannot be edited or erased from the app.
grant select on public.audit_logs to authenticated;
