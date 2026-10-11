-- Fix: the form_versions immutability trigger blocked deleting a business.
--
-- `enforce_form_version_immutable` was a BEFORE UPDATE OR DELETE trigger that
-- raised unconditionally. That is right for an edit, but `form_versions` has
-- `business_id ... on delete cascade`, so deleting a business cascades into a
-- DELETE here and the trigger refused it:
--
--   ERROR 42501: form_versions rows are immutable
--   CONTEXT: SQL statement "DELETE FROM ONLY public.form_versions WHERE ..."
--
-- Found while cleaning up a regression-check business. Same class of bug as the
-- `enforce_last_owner` gap already noted in context/_database.md: a guard that
-- is correct for a tenant action wrongly fires for the cascade.
--
-- What immutability is actually protecting: nobody may **rewrite history** —
-- change a snapshot, or remove one while the business still exists and
-- appointments still point at it. It was never meant to make a business
-- undeletable (GDPR erasure has to work).
--
-- So UPDATE stays refused outright, and DELETE is refused only while the
-- business is still there. When the business row is going, the cascade may
-- take its form versions with it.
--
-- Note `appointments.form_version_id` is ON DELETE RESTRICT, so a version can
-- still never be deleted out from under a live appointment; that FK, not this
-- trigger, is what protects a referenced snapshot.

create or replace function public.enforce_form_version_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'form_versions rows are immutable'
      using errcode = '42501';
  end if;

  -- DELETE: allowed only as part of the business itself going away.
  -- When the business row still exists, this is someone trying to erase a
  -- snapshot that past bookings were made against.
  if exists (select 1 from public.businesses b where b.id = old.business_id) then
    raise exception 'form_versions rows cannot be deleted while the business exists'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

comment on function public.enforce_form_version_immutable is
  'No UPDATE ever. DELETE only when the parent business row is already gone, so a business can still be hard-deleted (GDPR) without the cascade being refused.';

revoke all on function public.enforce_form_version_immutable() from public;
revoke execute on function public.enforce_form_version_immutable() from anon, authenticated;
