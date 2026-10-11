-- Phase 11A performance: RLS that does not cost a permission lookup PER ROW.
--
-- Measured on 50k appointments / 20k invoices / 60k messages in one business (docs/performance-review.md):
-- every row a policy looked at cost ~1 ms (can() -> business_is_active + has_permission, then
-- has_permission_at_branch_scope, then is_super_admin()), and list_appointments / list_invoices / the reports
-- must look at every matching row before they can sort and LIMIT, so a page took 10-60+ seconds.
--
-- Fix: the SET of branches (businesses) the caller may see is computed ONCE per statement by a STABLE function and
-- the policy tests membership of that set (an uncorrelated sub-select is evaluated once). Semantics are unchanged:
--   old  can(b, br, P) AND has_permission_at_branch_scope(b, br, P)   ==   br IN perm_branch_ids(P, branch_only => true)
--        (branch/all scope implies the permission, and perm_branch_ids requires an ACTIVE business, like can())
--   old  can(b, br, P) with any scope                                  ==   br IN perm_branch_ids(P, false)
--   old  is_member(b)                                                  ==   b IN member_business_ids()
--   old  covers_every_branch(b, P)                                     ==   b IN perm_cover_business_ids(P)
-- Own-scope terms (is_own_staff_profile ...) stay per row but are only reached for rows the set did not already
-- allow. Suite 31 proves old == new for every role against every rewritten table.

create or replace function public.perm_branch_ids(p_permission text, p_branch_scope_only boolean)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct b.id
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  join public.role_permissions rp on rp.role_id = a.role_id and rp.permission = p_permission
       and (not p_branch_scope_only or rp.scope in ('branch', 'all'))
  join public.branches b on b.business_id = m.business_id
       and (rp.scope = 'all' or a.branch_id is null or a.branch_id = b.id)
  where m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null
    and public.business_is_active(m.business_id)
$$;

create or replace function public.perm_business_ids(p_permission text, p_branch_scope_only boolean)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct m.business_id
  from public.business_members m
  join public.member_role_assignments a on a.member_id = m.id
  join public.role_permissions rp on rp.role_id = a.role_id and rp.permission = p_permission
       and (not p_branch_scope_only or rp.scope in ('branch', 'all'))
  where m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null
    and public.business_is_active(m.business_id)
$$;

create or replace function public.perm_cover_business_ids(p_permission text)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.business_id
  from public.business_members m
  where m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null
    and public.covers_every_branch(m.business_id, p_permission)
$$;

create or replace function public.member_business_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.business_id
  from public.business_members m
  where m.user_id = (select auth.uid()) and m.status = 'active' and m.deleted_at is null
$$;

revoke all on function public.perm_branch_ids(text, boolean) from public, anon;
revoke all on function public.perm_business_ids(text, boolean) from public, anon;
revoke all on function public.perm_cover_business_ids(text) from public, anon;
revoke all on function public.member_business_ids() from public, anon;
grant execute on function public.perm_branch_ids(text, boolean) to authenticated;
grant execute on function public.perm_business_ids(text, boolean) to authenticated;
grant execute on function public.perm_cover_business_ids(text) to authenticated;
grant execute on function public.member_business_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------
drop policy appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated using (
  (select public.is_super_admin())
  or branch_id in (select public.perm_branch_ids('appointments.view', true))
  or (staff_id is not null
      and public.can(business_id, branch_id, 'appointments.view')
      and public.is_own_staff_profile(staff_id))
);

drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  branch_id in (select public.perm_branch_ids('invoices.view', true)));
drop policy invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select to authenticated using (
  branch_id in (select public.perm_branch_ids('invoices.view', true)));
drop policy invoice_payments_select on public.invoice_payments;
create policy invoice_payments_select on public.invoice_payments for select to authenticated using (
  branch_id in (select public.perm_branch_ids('invoices.view', true)));
drop policy credit_notes_select on public.credit_notes;
create policy credit_notes_select on public.credit_notes for select to authenticated using (
  branch_id in (select public.perm_branch_ids('invoices.view', true)));

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  (select public.is_super_admin())
  or (branch_id is not null and branch_id in (select public.perm_branch_ids('settings.booking', false)))
  or (branch_id is null and business_id in (select public.perm_business_ids('settings.booking', false)))
);

drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  (select public.is_super_admin())
  or business_id in (select public.perm_cover_business_ids('clients.view'))
  or public.client_in_scope(business_id, id, first_branch_id, 'clients.view')
  or (public.can(business_id, null, 'clients.view')
      and exists (select 1 from public.appointments a
                  where a.client_id = clients.id and a.deleted_at is null and a.staff_id is not null
                    and public.is_own_staff_profile(a.staff_id)))
);

-- Plain "is a member of the business" reads (joined into every appointment / invoice list).
drop policy services_select on public.services;
create policy services_select on public.services for select to authenticated using (
  (select public.is_super_admin()) or business_id in (select public.member_business_ids()));
drop policy staff_profiles_select on public.staff_profiles;
create policy staff_profiles_select on public.staff_profiles for select to authenticated using (
  (select public.is_super_admin()) or business_id in (select public.member_business_ids()));
drop policy branches_select_member on public.branches;
create policy branches_select_member on public.branches for select to authenticated using (
  (select public.is_super_admin()) or business_id in (select public.member_business_ids()));
drop policy service_branches_select on public.service_branches;
create policy service_branches_select on public.service_branches for select to authenticated using (
  (select public.is_super_admin()) or business_id in (select public.member_business_ids()));
drop policy staff_branches_select on public.staff_branches;
create policy staff_branches_select on public.staff_branches for select to authenticated using (
  (select public.is_super_admin()) or business_id in (select public.member_business_ids()));
