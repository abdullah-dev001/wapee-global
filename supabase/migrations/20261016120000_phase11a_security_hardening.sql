-- Phase 11A security review (docs/security-review.md), fixes for the findings that are cheap and safe.
--
--  * is_slug_available / my_grants were executable by ANON (unthrottled over PostgREST). Both are only used after
--    sign-in (onboarding step, permission loader). invite_preview stays: the invite landing page runs before login
--    and the token it takes is 256-bit random, stored hashed.
--  * business_is_active / suggest_invoice_prefix take any business id and answer without a membership check
--    (state of, and branch prefixes inside, somebody else's business). The app never calls them: they are used
--    inside DEFINER functions (which run as the owner), so the API role does not need EXECUTE.

revoke execute on function public.is_slug_available(text) from anon, public;
revoke execute on function public.my_grants(uuid) from anon, public;
grant execute on function public.is_slug_available(text) to authenticated;
grant execute on function public.my_grants(uuid) to authenticated;

revoke execute on function public.business_is_active(uuid) from authenticated, anon, public;
revoke execute on function public.suggest_invoice_prefix(uuid, text) from authenticated, anon, public;
grant execute on function public.business_is_active(uuid) to service_role;
grant execute on function public.suggest_invoice_prefix(uuid, text) to service_role;
