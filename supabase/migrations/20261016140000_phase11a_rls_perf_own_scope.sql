-- Phase 11A performance, part 2: the OWN-scope and branch-scope paths of appointments_select / clients_select were
-- still per-row (is_own_staff_profile, client_in_scope), so a Receptionist, a branch Manager or a Staff member paid
-- ~1 ms for every row they could NOT see. Everything is now set-based too. Semantics unchanged (suite 31):
--   is_own_staff_profile(staff_id)                 ==  staff_id IN own_staff_ids()
--   can(b, br, P) (any scope, active business)      ==  br IN perm_branch_ids(P, false)
--   client_in_scope(b, c, first_branch, P) =
--     can(b,null,P) AND ( covers_every_branch(b,P)
--        OR EXISTS live appointment of c in a branch where P holds at branch/all scope
--        OR first_branch IS NOT NULL AND P at branch/all scope in first_branch
--        OR first_branch IS NULL AND P at branch/all scope somewhere in b AND c has no live appointment )

create or replace function public.own_staff_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sp.id
  from public.staff_profiles sp
  join public.business_members m on m.id = sp.member_id
  where sp.deleted_at is null
    and m.user_id = (select auth.uid()) and m.status = 'active' and m.deleted_at is null
$$;
revoke all on function public.own_staff_ids() from public, anon;
grant execute on function public.own_staff_ids() to authenticated;

drop policy appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated using (
  (select public.is_super_admin())
  or branch_id in (select public.perm_branch_ids('appointments.view', true))
  or (staff_id in (select public.own_staff_ids())
      and branch_id in (select public.perm_branch_ids('appointments.view', false)))
);

drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  (select public.is_super_admin())
  or business_id in (select public.perm_cover_business_ids('clients.view'))
  or (first_branch_id is not null and first_branch_id in (select public.perm_branch_ids('clients.view', true)))
  or exists (select 1 from public.appointments a
             where a.client_id = clients.id and a.deleted_at is null
               and a.branch_id in (select public.perm_branch_ids('clients.view', true)))
  or (first_branch_id is null
      and business_id in (select public.perm_business_ids('clients.view', true))
      and not exists (select 1 from public.appointments a where a.client_id = clients.id and a.deleted_at is null))
  or (business_id in (select public.perm_business_ids('clients.view', false))
      and exists (select 1 from public.appointments a
                  where a.client_id = clients.id and a.deleted_at is null
                    and a.staff_id in (select public.own_staff_ids())))
);
