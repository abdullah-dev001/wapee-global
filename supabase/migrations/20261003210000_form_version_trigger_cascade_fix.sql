-- Fix: deleting a business failed because a cascade tried to CREATE a form version.
--
-- THE BUG
-- -------
-- `delete from businesses` cascades into `custom_fields` and
-- `custom_field_services`. Both carry the AFTER DELETE trigger
-- `touch_form_version`, which calls `ensure_form_version()` to record that the
-- field set changed. With the business row already gone, the insert violates
-- the FK:
--
--   ERROR 23503: insert or update on table "form_versions" violates foreign key
--   constraint "form_versions_business_id_fkey"
--   DETAIL: Key (business_id)=(...) is not present in table "businesses".
--
-- This is the SECOND cascade bug in this family — 20261003140000 fixed the
-- immutability trigger refusing the same cascade. The pattern is the same and
-- worth naming: **a guard or bookkeeping trigger written for a tenant action
-- also fires for the cascade that is deleting the tenant.** The existing
-- `enforce_last_owner` gap noted in context/_database.md is a third instance.
--
-- THE FIX
-- -------
-- "The field set changed, so record a new version" is meaningless when the
-- business is being deleted — there is nothing left to version and nothing left
-- to read it. So the trigger does nothing when the business row has gone.
--
-- Checking for the parent's existence (rather than, say, inspecting
-- `pg_trigger_depth()`) is deliberate: it is the actual condition we care about,
-- and it stays correct whatever path the delete arrives by.

create or replace function public.touch_form_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  v_business_id := coalesce(new.business_id, old.business_id);

  -- The business is being deleted and this is the cascade. Versioning a form
  -- for a business that no longer exists is both impossible (FK) and pointless.
  if not exists (select 1 from public.businesses b where b.id = v_business_id) then
    return null;
  end if;

  perform public.ensure_form_version(v_business_id);
  return null;  -- AFTER trigger
end;
$$;

comment on function public.touch_form_version is
  'AFTER trigger on custom_fields / custom_field_services: creates a form version when the field set changes. No-ops when the business row is already gone, so deleting a business is not blocked by its own cascade.';

revoke all on function public.touch_form_version() from public;
revoke execute on function public.touch_form_version() from anon, authenticated;
