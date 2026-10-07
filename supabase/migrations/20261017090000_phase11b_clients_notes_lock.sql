-- Phase 11A follow-up: clients.notes follows clients.view_contact (decided with the product owner; no new permission).
-- Free-text notes about a person are as sensitive as the phone number. `authenticated` loses SELECT on the column;
-- clients_v returns it only where the caller holds clients.view_contact (same rule as phone / email). Writing the
-- column is unchanged (table-level UPDATE / INSERT).

revoke select (notes) on public.clients from authenticated;

create or replace view public.clients_v with (security_barrier = true) as
select
  c.id, c.business_id, c.full_name,
  case when c.business_id in (select unnest(public.contact_business_ids())) then c.phone_e164 end as phone_e164,
  case when c.business_id in (select unnest(public.contact_business_ids())) then c.email::text end as email,
  case when c.business_id in (select unnest(public.contact_business_ids())) then c.notes end as notes,
  c.first_branch_id, c.source, c.created_at, c.updated_at, c.deleted_at, c.created_by,
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
  'clients with phone / email / notes BLANKED unless the caller holds clients.view_contact in that business. SECURITY DEFINER + SECURITY BARRIER view (intentional, see docs/security-review.md) carrying the same visibility rule as the clients_select policy; suite 31 keeps them equal. The app reads this, never clients.phone_e164 / email / notes (not granted).';
