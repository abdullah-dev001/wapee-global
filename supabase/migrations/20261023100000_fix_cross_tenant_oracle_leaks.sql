-- Fix (QA audit F6-S1 / F6-S2): client_has_live_appt(uuid) and client_package_used(uuid) are SECURITY DEFINER,
-- granted directly to `authenticated`, and took an arbitrary id with NO membership check -- any signed-in user
-- could call them directly (not only through the RLS policy / view / RPC that was meant to be their only caller)
-- and learn, for any client or client package on the platform, whether it has a live appointment or exactly how
-- many sessions it has used. Reproduced live on dev in the QA audit and confirmed in a rolled-back transaction.
--
-- A plain `revoke ... from authenticated` was tried FIRST and proven to break real callers immediately
-- (`clients_select`'s own RLS expression calls client_has_live_appt under the caller's role, not the owner's --
-- revoking it raises "permission denied for function client_has_live_appt" on every client list). The fix
-- instead keeps the grant and adds an in-body authorisation check, deriving the business from the id the
-- function already takes so the check holds whether it is reached via RLS, a view, another DEFINER function,
-- or a direct RPC call. Both fixes were proven live: the real business owner still gets the true answer, a
-- real cross-tenant user gets a masked (false / 0) one, indistinguishable from a genuine negative.

create or replace function public.client_has_live_appt(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    join public.clients c on c.id = a.client_id
    where a.client_id = p_client_id
      and a.deleted_at is null
      and (public.is_member(c.business_id) or public.is_super_admin())
  )
$$;

create or replace function public.client_package_used(p_client_package_id uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select (count(*) filter (where kind = 'deduct') - count(*) filter (where kind = 'reversal'))::integer
  from public.session_usages su
  where su.client_package_id = p_client_package_id
    and exists (
      select 1 from public.client_packages cp
      where cp.id = p_client_package_id
        and public.package_visible(cp.business_id, cp.branch_id, cp.client_id)
    )
$$;

comment on function public.client_has_live_appt is
  'True when the client has a live (non-deleted) appointment, visible ONLY to a member of that client''s business or a super admin. Was callable by any signed-in user for any client id (QA audit F6-S1); fixed by an in-body is_member() check rather than revoking the authenticated grant, which would break clients_select/clients_v (both call this under the caller''s own role).';
comment on function public.client_package_used is
  'Sessions used (deduct minus reversal) on a client package, visible ONLY under the same rule client_packages_select/package_visible already use. Was callable by any signed-in user for any client_package_id (QA audit F6-S2); fixed by an in-body package_visible() check rather than revoking the authenticated grant, which would break list_client_packages (SECURITY INVOKER, relies on this function working under its caller''s role).';
