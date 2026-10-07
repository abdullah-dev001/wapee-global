-- Phase 11A performance, part 3 (found by suite 31): a sub-select inside a policy runs WITH the caller's RLS, but
-- the old client_in_scope() was SECURITY DEFINER and saw every appointment. A manager of branch 1 could therefore
-- "see" a client with no first branch whose only appointment is in branch 2 (the appointment was hidden from the
-- sub-select, so the client looked appointment-less). The appointment look-ups behind clients_select are now
-- SECURITY DEFINER set functions, evaluated once per statement, exactly like the old helper saw the data.

create or replace function public.scoped_client_ids(p_permission text)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct a.client_id
  from public.appointments a
  where a.deleted_at is null
    and a.branch_id in (select public.perm_branch_ids(p_permission, true))
$$;

create or replace function public.own_client_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct a.client_id
  from public.appointments a
  where a.deleted_at is null and a.staff_id in (select public.own_staff_ids())
$$;

create or replace function public.client_has_live_appt(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.appointments a where a.client_id = p_client_id and a.deleted_at is null)
$$;

revoke all on function public.scoped_client_ids(text) from public, anon;
revoke all on function public.own_client_ids() from public, anon;
revoke all on function public.client_has_live_appt(uuid) from public, anon;
grant execute on function public.scoped_client_ids(text) to authenticated;
grant execute on function public.own_client_ids() to authenticated;
grant execute on function public.client_has_live_appt(uuid) to authenticated;

drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  (select public.is_super_admin())
  or business_id in (select public.perm_cover_business_ids('clients.view'))
  or (first_branch_id is not null and first_branch_id in (select public.perm_branch_ids('clients.view', true)))
  or id in (select public.scoped_client_ids('clients.view'))
  or (first_branch_id is null
      and business_id in (select public.perm_business_ids('clients.view', true))
      and not public.client_has_live_appt(id))
  or (business_id in (select public.perm_business_ids('clients.view', false))
      and id in (select public.own_client_ids()))
);
