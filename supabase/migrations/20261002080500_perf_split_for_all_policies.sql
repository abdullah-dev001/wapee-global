-- Performance advisor fixes (part 2 of 2).  *** NOT YET APPLIED ***
--
-- A FOR ALL policy also covers SELECT, so roles, role_permissions and
-- member_role_assignments each evaluate two permissive policies on every read.
-- Splitting the write policy into INSERT/UPDATE/DELETE removes the duplicate.
--
-- This needs DROP POLICY, which the Supabase connector refuses, and the local
-- CLI cannot link this project (it is signed in to a different account).
-- Apply with either:
--   supabase db push                      (once the CLI is signed in correctly)
--   or paste this file into the SQL editor
-- The rules are unchanged; only their per-action split differs.

drop policy if exists member_role_assignments_write on public.member_role_assignments;

create policy member_role_assignments_insert
  on public.member_role_assignments for insert to authenticated
  with check (exists (
    select 1 from public.business_members m
    where m.id = member_id and public.can(m.business_id, null, 'roles.manage')
  ));

create policy member_role_assignments_update
  on public.member_role_assignments for update to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id and public.can(m.business_id, null, 'roles.manage')
  ))
  with check (exists (
    select 1 from public.business_members m
    where m.id = member_id and public.can(m.business_id, null, 'roles.manage')
  ));

create policy member_role_assignments_delete
  on public.member_role_assignments for delete to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id and public.can(m.business_id, null, 'roles.manage')
  ));

drop policy if exists roles_write_custom on public.roles;

create policy roles_insert_custom
  on public.roles for insert to authenticated
  with check (business_id is not null and not is_system
              and public.can(business_id, null, 'roles.manage'));

create policy roles_update_custom
  on public.roles for update to authenticated
  using (business_id is not null and not is_system
         and public.can(business_id, null, 'roles.manage'))
  with check (business_id is not null and not is_system
              and public.can(business_id, null, 'roles.manage'));

create policy roles_delete_custom
  on public.roles for delete to authenticated
  using (business_id is not null and not is_system
         and public.can(business_id, null, 'roles.manage'));

drop policy if exists role_permissions_write_custom on public.role_permissions;

create policy role_permissions_insert_custom
  on public.role_permissions for insert to authenticated
  with check (exists (
    select 1 from public.roles r
    where r.id = role_id and r.business_id is not null and not r.is_system
      and public.can(r.business_id, null, 'roles.manage')
  ));

create policy role_permissions_update_custom
  on public.role_permissions for update to authenticated
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

create policy role_permissions_delete_custom
  on public.role_permissions for delete to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and r.business_id is not null and not r.is_system
      and public.can(r.business_id, null, 'roles.manage')
  ));
