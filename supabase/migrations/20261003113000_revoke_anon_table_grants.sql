-- Defence in depth: take away anon's table privileges across public.
--
-- WHAT WAS FOUND
-- --------------
-- Supabase's project bootstrap runs
--   grant all on all tables in schema public to anon, authenticated;
-- and keeps doing it for new tables via default privileges. So **every one of
-- the 31 tables granted `anon` SELECT, INSERT, UPDATE, DELETE and TRUNCATE**,
-- going back to Phase 1.
--
-- Nothing was exposed: RLS is enabled on every table and `anon` has no policy
-- on any of them, so every anon query returned zero rows and every anon write
-- was refused. The verification suite for Phase 3 asserts this directly.
--
-- But a GRANT is the wrong place to be relying on nothing. With the grant in
-- place, a single over-broad policy written in a later phase — `for select
-- using (true)` on a lookup table, say — would silently publish that table to
-- the internet. With the grant removed, the same mistake fails closed, because
-- a role needs BOTH the table privilege and a passing policy.
--
-- This is the explicit Phase 3 requirement ("anon gets NO grants and NO
-- policies on any tenant table") applied to the whole schema rather than only
-- to the new tables, because leaving 23 older tables granted would make the
-- rule untestable and the next session would re-find this.
--
-- WHAT STILL WORKS
-- ----------------
-- * The public booking page: it never touches tables as `anon`. It calls Edge
--   Functions that use the service role (unaffected: service_role keeps
--   everything).
-- * Signup's slug check: `reserved_slugs` keeps SELECT for anon, which is the
--   one deliberate anon read in the product. `is_slug_available()` is
--   SECURITY DEFINER and would work either way, but the app also reads the
--   table directly.
-- * The dashboard: `authenticated` is untouched.
--
-- Default privileges are altered too, so a table created in a later phase does
-- not quietly re-grant itself to anon.

-- Existing tables.
revoke all privileges on all tables in schema public from anon;

-- Sequences and functions, for the same reason.
revoke all privileges on all sequences in schema public from anon;

-- The one intentional exception: signup checks a slug against the reserved
-- list before the user has an account.
grant select on public.reserved_slugs to anon;

-- Belt and braces for objects created as `postgres` (which is how migrations
-- run). `pg_default_acl` currently holds NO rows for schema public, so the
-- broad grants above came from one-time `grant all on all tables` statements at
-- project bootstrap rather than from default privileges — but setting these
-- makes the intent explicit and survives a future bootstrap re-run.
--
-- `alter default privileges for role supabase_admin` is NOT included: it fails
-- with 42501 because migrations run as `postgres`, which cannot change another
-- superuser role's defaults.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- NOTE for later phases: a new table needs NO grant for anon. If a future
-- feature genuinely needs an anon read (a public reviews list, say), grant
-- SELECT on that one table explicitly and write the policy, in the same
-- migration, with a comment saying why it is safe to publish.
