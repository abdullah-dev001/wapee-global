-- QA audit (my_role_labels security check): Supabase's default ACL on schema public
-- grants EXECUTE on every NEW function to anon/authenticated automatically (documented
-- in docs/security-review.md L5, "every migration revokes explicitly" — this one didn't).
-- `revoke all on function ... from public` does NOT remove anon's own direct grant from
-- the default ACL; it only strips the PUBLIC pseudo-role grant. Found by auditing every
-- function in public with has_function_privilege('anon', oid, 'EXECUTE') on dev.
--
-- Unintended anon-executable functions found (none leak data; anon's auth.uid() is
-- null so my_role_labels already returned [] and the two predicates below are
-- stateless with no sensitive inputs) — closed anyway since they were never meant to
-- be reachable by anon:
--   - my_role_labels(uuid)                               -- this review's subject
--   - enforce_staff_member_link()                        -- trigger function, never an RPC
--   - is_allowed_appointment_transition(status, status)  -- internal rule lookup
--   - website_asset_path_ok(text)                        -- internal path-shape check
--
-- Confirmed intentional and left untouched (both already explicitly granted + documented):
--   - get_public_pricing()      -- public pricing page, migration 20261021090000
--   - invite_preview(text)      -- token-gated, needed before login, docs/security-review.md L7

revoke execute on function public.my_role_labels(uuid) from anon;
revoke execute on function public.enforce_staff_member_link() from anon;
revoke execute on function public.is_allowed_appointment_transition(public.appointment_status, public.appointment_status) from anon;
revoke execute on function public.website_asset_path_ok(text) from anon;

-- Stop the default ACL from re-granting anon on every future function. authenticated
-- keeps getting it by default (existing, accepted pattern per security-review.md L5);
-- new public-facing functions grant anon explicitly, same as get_public_pricing /
-- invite_preview already do.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
