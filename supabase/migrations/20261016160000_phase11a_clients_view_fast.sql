-- Phase 11A performance, part 4: clients_v without a function call per row.
--
-- Measured: client_phone() cost ~4.7 ms per call (permission + visibility re-checked each time), so reading or
-- filtering the phone of 5000 clients took 25 s. The view is now a SECURITY DEFINER view (owner reads the columns)
-- that carries the row-visibility rule itself, set-based, exactly the clients_select policy expression, and is a
-- SECURITY BARRIER so no caller-supplied filter can be evaluated on a row the caller may not see (ilike is not
-- leakproof). The two columns are blanked unless the business is in contact_business_ids() (computed once).
--
-- The same predicate lives in the clients_select policy: suite 31 asserts clients == clients_v for every caller, so a
-- drift between the two fails the build. client_phone / client_email are gone (one less surface).

create or replace view public.clients_v with (security_barrier = true) as
select
  c.id, c.business_id, c.full_name,
  case when c.business_id in (select unnest(public.contact_business_ids())) then c.phone_e164 end as phone_e164,
  case when c.business_id in (select unnest(public.contact_business_ids())) then c.email::text end as email,
  c.notes, c.first_branch_id, c.source, c.created_at, c.updated_at, c.deleted_at, c.created_by,
  c.erased_at
from public.clients c
where (select public.is_super_admin())
   or c.business_id in (select public.perm_cover_business_ids('clients.view'))
   or (c.first_branch_id is not null and c.first_branch_id in (select public.perm_branch_ids('clients.view', true)))
   or c.id in (select public.scoped_client_ids('clients.view'))
   or (c.first_branch_id is null
       and c.business_id in (select public.perm_business_ids('clients.view', true))
       and not public.client_has_live_appt(c.id))
   or (c.business_id in (select public.perm_business_ids('clients.view', false))
       and c.id in (select public.own_client_ids()));

comment on view public.clients_v is
  'clients with phone/email BLANKED unless the caller holds clients.view_contact in that business. SECURITY DEFINER + SECURITY BARRIER view carrying the same visibility rule as the clients_select policy (suite 31 keeps them equal). The app reads this, never clients.phone_e164/email (those columns are not granted).';

revoke all on public.clients_v from public, anon;
grant select on public.clients_v to authenticated;

drop function public.client_phone(uuid);
drop function public.client_email(uuid);
