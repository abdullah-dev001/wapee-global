-- Phase 9B part 1: close the "single-branch assumption" holes found in 9A.
--
-- Until now these policies asked can(business, NULL, perm) = "do you hold this
-- ANYWHERE", so a Manager assigned to branch A could edit branch B's staff,
-- services, custom fields and clients, and anyone with settings.business at one
-- branch read the whole audit log. Decided with the user (2026-10-06):
--   * staff: change a profile / its time off / its service assignment only if
--     EVERY branch the staff member works at is covered by the caller. A profile
--     with no branch yet (a brand-new one the creator is about to assign) may be
--     touched by any staff.manage holder: the creation flow needs it, and it works
--     nowhere. Assigning/removing at a branch is already per branch (unchanged).
--   * services, service categories, custom fields (business-wide definitions):
--     need the permission for ALL branches. A branch manager still sets price and
--     on/off per branch (service_branches, resources: already per branch).
--   * clients: visible/editable when the caller holds the permission at BRANCH
--     scope for a branch where the client has an appointment or was first booked.
--     Clients not yet tied to any branch (no visits, no first branch) stay visible
--     to every clients.view holder so a new one can be created and then booked.
--     All-branch holders see everyone. Own-scope staff keep "my clients".
--   * audit log: Owner / All-scope settings.business holders only.

create or replace function public.perm_all_branches(p_business_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and public.can_grant_at(p_business_id, null, p_permission, 'branch')
$$;

create or replace function public.staff_in_scope(p_business_id uuid, p_staff_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and (public.can_grant_at(p_business_id, null, p_permission, 'branch')
          or not exists (select 1 from public.staff_branches sb where sb.staff_id = p_staff_id)
          or not exists (select 1 from public.staff_branches sb
                         where sb.staff_id = p_staff_id and not public.can(p_business_id, sb.branch_id, p_permission)))
$$;

create or replace function public.client_in_scope(p_business_id uuid, p_client_id uuid, p_first_branch uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can(p_business_id, null, p_permission)
     and (
       public.can_grant_at(p_business_id, null, p_permission, 'branch')
       or exists (select 1 from public.appointments a
                  where a.client_id = p_client_id and a.deleted_at is null
                    and public.has_permission_at_branch_scope(p_business_id, a.branch_id, p_permission))
       or (p_first_branch is not null and public.has_permission_at_branch_scope(p_business_id, p_first_branch, p_permission))
       or (p_first_branch is null
           and not exists (select 1 from public.appointments a where a.client_id = p_client_id and a.deleted_at is null))
     )
$$;

revoke all on function public.perm_all_branches(uuid, text) from public, anon;
revoke all on function public.staff_in_scope(uuid, uuid, text) from public, anon;
revoke all on function public.client_in_scope(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.perm_all_branches(uuid, text) to authenticated;
grant execute on function public.staff_in_scope(uuid, uuid, text) to authenticated;
grant execute on function public.client_in_scope(uuid, uuid, uuid, text) to authenticated;

-- staff_profiles (insert stays "staff.manage anywhere": the profile has no branch yet)
drop policy staff_profiles_update on public.staff_profiles;
create policy staff_profiles_update on public.staff_profiles for update to authenticated
  using (public.staff_in_scope(business_id, id, 'staff.manage'))
  with check (public.can(business_id, null, 'staff.manage'));
drop policy staff_profiles_delete on public.staff_profiles;
create policy staff_profiles_delete on public.staff_profiles for delete to authenticated
  using (public.staff_in_scope(business_id, id, 'staff.manage'));

-- staff_time_off
drop policy staff_time_off_insert on public.staff_time_off;
drop policy staff_time_off_update on public.staff_time_off;
drop policy staff_time_off_delete on public.staff_time_off;
create policy staff_time_off_insert on public.staff_time_off for insert to authenticated
  with check (public.staff_in_scope(business_id, staff_id, 'staff.manage')
              or (public.can(business_id, null, 'staff.manage_schedule') and public.is_own_staff_profile(staff_id)));
create policy staff_time_off_update on public.staff_time_off for update to authenticated
  using (public.staff_in_scope(business_id, staff_id, 'staff.manage')
         or (public.can(business_id, null, 'staff.manage_schedule') and public.is_own_staff_profile(staff_id)))
  with check (public.staff_in_scope(business_id, staff_id, 'staff.manage')
              or (public.can(business_id, null, 'staff.manage_schedule') and public.is_own_staff_profile(staff_id)));
create policy staff_time_off_delete on public.staff_time_off for delete to authenticated
  using (public.staff_in_scope(business_id, staff_id, 'staff.manage')
         or (public.can(business_id, null, 'staff.manage_schedule') and public.is_own_staff_profile(staff_id)));

-- service_staff (which services a staff member performs)
drop policy service_staff_insert on public.service_staff;
drop policy service_staff_delete on public.service_staff;
create policy service_staff_insert on public.service_staff for insert to authenticated
  with check (public.staff_in_scope(business_id, staff_id, 'staff.manage'));
create policy service_staff_delete on public.service_staff for delete to authenticated
  using (public.staff_in_scope(business_id, staff_id, 'staff.manage'));

-- services, categories (business-wide definitions)
drop policy services_insert on public.services;
drop policy services_update on public.services;
drop policy services_delete on public.services;
create policy services_insert on public.services for insert to authenticated
  with check (public.perm_all_branches(business_id, 'services.manage'));
create policy services_update on public.services for update to authenticated
  using (public.perm_all_branches(business_id, 'services.manage'))
  with check (public.perm_all_branches(business_id, 'services.manage'));
create policy services_delete on public.services for delete to authenticated
  using (public.perm_all_branches(business_id, 'services.manage'));
drop policy service_categories_insert on public.service_categories;
drop policy service_categories_update on public.service_categories;
drop policy service_categories_delete on public.service_categories;
create policy service_categories_insert on public.service_categories for insert to authenticated
  with check (public.perm_all_branches(business_id, 'services.manage'));
create policy service_categories_update on public.service_categories for update to authenticated
  using (public.perm_all_branches(business_id, 'services.manage'))
  with check (public.perm_all_branches(business_id, 'services.manage'));
create policy service_categories_delete on public.service_categories for delete to authenticated
  using (public.perm_all_branches(business_id, 'services.manage'));

-- service_resources: a link to a room belongs to THAT room's branch
drop policy service_resources_insert on public.service_resources;
drop policy service_resources_delete on public.service_resources;
create policy service_resources_insert on public.service_resources for insert to authenticated
  with check (exists (select 1 from public.resources r where r.id = resource_id
                      and public.can(r.business_id, r.branch_id, 'services.manage')));
create policy service_resources_delete on public.service_resources for delete to authenticated
  using (exists (select 1 from public.resources r where r.id = resource_id
                 and public.can(r.business_id, r.branch_id, 'services.manage')));

-- custom fields (the booking form's questions: business-wide)
drop policy custom_fields_insert on public.custom_fields;
drop policy custom_fields_update on public.custom_fields;
drop policy custom_fields_delete on public.custom_fields;
create policy custom_fields_insert on public.custom_fields for insert to authenticated
  with check (public.perm_all_branches(business_id, 'settings.booking'));
create policy custom_fields_update on public.custom_fields for update to authenticated
  using (public.perm_all_branches(business_id, 'settings.booking'))
  with check (public.perm_all_branches(business_id, 'settings.booking'));
create policy custom_fields_delete on public.custom_fields for delete to authenticated
  using (public.perm_all_branches(business_id, 'settings.booking'));
drop policy custom_field_services_insert on public.custom_field_services;
drop policy custom_field_services_delete on public.custom_field_services;
create policy custom_field_services_insert on public.custom_field_services for insert to authenticated
  with check (public.perm_all_branches(business_id, 'settings.booking'));
create policy custom_field_services_delete on public.custom_field_services for delete to authenticated
  using (public.perm_all_branches(business_id, 'settings.booking'));

-- clients
drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (
    public.is_super_admin()
    or public.client_in_scope(business_id, id, first_branch_id, 'clients.view')
    or (public.can(business_id, null, 'clients.view')
        and exists (select 1 from public.appointments a
                    where a.client_id = clients.id and a.deleted_at is null and a.staff_id is not null
                      and public.is_own_staff_profile(a.staff_id)))
  );
drop policy clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using (public.client_in_scope(business_id, id, first_branch_id, 'clients.edit'))
  with check (public.can(business_id, null, 'clients.edit'));

-- audit log: Owner / All-scope only
drop policy audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_super_admin()
         or (public.has_permission(business_id, null, 'settings.business')
             and public.can_grant_at(business_id, null, 'settings.business', 'all')));

-- ---------------------------------------------------------------------------
-- (b) A report email's payload (revenue figures) must not outlive the send,
-- exactly like the sealed token: emptied the moment the row reaches a final
-- status, and a CHECK keeps it that way.
-- ---------------------------------------------------------------------------
create or replace function public.purge_report_payload()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event = 'report_summary' and new.status in ('sent', 'dead', 'skipped', 'cancelled') then
    new.payload := '{}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function public.purge_report_payload() from public, anon, authenticated;
create trigger message_outbox_purge_report_payload before insert or update on public.message_outbox
  for each row execute function public.purge_report_payload();
alter table public.message_outbox add constraint message_outbox_report_payload_only_while_open check (
  event <> 'report_summary' or status in ('pending', 'sending', 'retry') or payload = '{}'::jsonb);
