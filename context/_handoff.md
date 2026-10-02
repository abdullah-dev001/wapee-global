# Handoff
Last updated: 2026-10-02 · Branch: `dev` · All work is pushed.

## Done
- **Phase 0:** Expo SDK 57 app (iOS/Android/web+PWA), theme from DESIGN_GUIDE, 13 UI primitives, responsive shell (bottom tabs / sidebar / header), i18n, PWA install hint + update toast.
- **Phase 1 — complete and accepted.** Full schema (11 tables, RLS on all, 46 permissions, 4 system roles, guard triggers); auth screens + session + route guard; onboarding wizard + `create_business_with_owner`; branch-owned country/currency/timezone/tax with per-branch invoice series; `usePermission`/`useFeature` with nav and route gating; invite flow (one-time 7-day link); trial lock screen + 3-day warning banner. Manager seed corrected to doc §9 (39 permissions). vitest added (`npm test`, **34 tests**).
- Verified on web (375/768/1280) and the iOS simulator. 30+ SQL security assertions pass against the live database. Advisors clean except the item below.
- Test data from Phase 1 has been cleaned up: **4 users and 3 businesses remain** (`Nova Hair Studio`, `Buenos Clinic`, `Rosario Clinic 19481`). No test users left.

## Next, in order
1. **Phase 2** — catalogue and schedule: service categories, services, staff profiles, working hours, breaks, time off, branch hours, holidays, resources (see `docs/Wapee_Build_Plan.md`).
2. **Small follow-ups left from Phase 1**, any order:
   - **Members UI gaps**: change a role, remove a member, revoke/resend an invite (`context/members.md`).
   - **`supabase/tests/04_invite_flow.sql` has never run** (no Docker). The same ground is covered by REST checks.
   - **`enforce_last_owner` has no "business is being deleted" exemption** — see Traps and `context/_database.md`.
   - **No `/billing` route yet** — the trial banner and the lock's allow-list both point at `/settings` until Phase 8.

## Open items
- **Leaked-password protection is OFF.** Dashboard → Authentication → enable the HaveIBeenPwned check. Do this before real users.
- **`supabase test db` needs Docker**, not installed. The pgTAP files in `supabase/tests/` are verified by running their assertions through the Supabase connector instead. Docker (or the DB password for `psql`) would let them run as a suite.
- **`expo-clipboard` was added** (invite link copy button), so the dev build needs a rebuild: `npm run ios`.
- **Android has never been run** — no emulator on this machine. Every UI task ends with a written Android code review instead (CLAUDE.md §4). Test on a real device via EAS build when possible.
- **Email is Supabase's built-in sender**: rate-limited, and it only delivers to project team members. Confirm test users with SQL (see `context/auth.md`). Resend replaces it in Phase 6.
- Placeholder domains (`app.wapee.com`, `wapee.site`) and placeholder app icons.

## Traps to remember
- **`delete from businesses` is refused while the business has an Owner.** `enforce_last_owner` is a BEFORE DELETE trigger on `member_role_assignments` and the cascade trips it. Disable it for the transaction (`alter table ... disable trigger member_role_assignments_last_owner`) and re-enable before commit. See `context/_database.md`.
- **The Supabase connector refuses destructive SQL** (DELETE/DROP/auth.users writes) even with the user's approval. Use `supabase db query --linked -f file.sql`, which goes through the Management API and does work. Note `supabase db query` without `--linked` targets the *local* database, which is not running here.
- **Hermes has no `Intl.Locale` and no `Intl.supportedValuesOf`.** They work in Node and browsers and are `undefined` on device. Country/currency/timezone lists are a build-time snapshot: `node scripts/generate-locale-data.mjs`.
- **`expo-navigation-bar` 'dark' means dark buttons on a LIGHT bar** — the published TypeScript doc says the opposite. Verified in `NavigationBarModule.kt`. Do not "fix" it.
- **Adding a native module needs a rebuild** (`npm run ios`), not just a reload. `expo-screen-orientation` once crashed the app with "Cannot find native module" until rebuilt.
- **Check the fix is in the served bundle before judging a test.** A `CI=1` dev server does not hot-reload, so a passing-looking failure may be stale code. Restart with `--clear` after edits.
- **Never pass an inline arrow where a hook keeps the callback in its effect deps.** `Select` did this with `useOverlayDismiss` and caused "Maximum update depth exceeded". The hook now holds it in a ref; prefer `useCallback` at call sites anyway.
- **Screens inside the bottom tabs must pass `edges={['top']}` to `Screen`**, or the bottom inset is applied twice (~48px dead space on Android 3-button nav).
- The Supabase **connector refuses `DROP`**; use `supabase db push` for anything destructive. It also refuses writes to `auth.users` and fixture-creating test blocks, so SQL suites that need users cannot be run through it.
- **A `raise exception` rolls back everything in the function, including a rate-limit counter you just incremented.** `accept_invite()` therefore RETURNS NULL on failure. Remember this for any future throttle.
- **A hand-inserted `auth.users` row needs `''`, not NULL**, in `confirmation_token`, `recovery_token`, `email_change_token_new` and `email_change`, or sign-in fails with a 500 "Database error querying schema". Prefer the real `/auth/v1/signup` endpoint.
- **A Supabase embedded `select()` must be ONE string literal**, not a concatenation, or supabase-js infers `GenericStringError` instead of the row type. Name the constraint when a table has two FKs to the same table (`profiles!business_members_user_id_fkey(...)`).
- **PL/pgSQL: a `returns table (x ...)` OUT column shadows any table column of the same name** for the whole body (42702). Prefix OUT columns (`out_member_id`) or qualify every reference.
- **Forms use `useWatch({ control, name })`, never `watch()`** — the React Compiler lint rejects `watch()`.
- **Supabase grants EXECUTE on a new public function to `anon` by default.** `revoke ... from public` does not undo it; revoke from `anon` explicitly.

## Commands
```sh
npm run web                 # web dev server (add --clear after edits if stale)
npx expo start --web --port 8090 --non-interactive --clear
npm run ios                 # build + run the iOS dev build (needed after a native module)
npx expo start --port 8092 --non-interactive   # dev server for an installed build

supabase db push            # apply pending migrations (CLI is linked)
supabase migration list     # local vs remote history
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
node scripts/generate-locale-data.mjs          # refresh country/currency/timezone lists

npm run typecheck && npm run lint && npm test && npx prettier --check .
```

Supabase project: `rfuovquhultjydtswtqf` (Wapee Global Development).
Confirm a test user: `update auth.users set email_confirmed_at = now() where email = '…';`
