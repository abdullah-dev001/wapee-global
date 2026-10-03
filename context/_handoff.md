# Handoff
Last updated: 2026-10-04 · Branch: `dev` · All work is pushed.

## Done
- **Phase 0:** Expo SDK 57 app (iOS/Android/web+PWA), theme from DESIGN_GUIDE, 13 UI primitives, responsive shell (bottom tabs / sidebar / header), i18n, PWA install hint + update toast.
- **Phase 2 — complete.** Catalogue and schedule: 13 tables with 5 exclusion constraints and Own-scope RLS; services UI (per-branch prices, server-side search); staff UI (login optional, branch + service assignment); schedule UI (per-person weeks, branch hours, time off, holidays, rooms). Five shared components built with **no new dependency**: MoneyInput, SearchInput, TimePicker, DayHoursRow, DateRangePicker. `lib/money` and `lib/time` partly implemented (75 unit tests).
- **Phase 1 — complete and accepted.** Full schema (11 tables, RLS on all, 46 permissions, 4 system roles, guard triggers); auth screens + session + route guard; onboarding wizard + `create_business_with_owner`; branch-owned country/currency/timezone/tax with per-branch invoice series; `usePermission`/`useFeature` with nav and route gating; invite flow (one-time 7-day link); trial lock screen + 3-day warning banner. Manager seed corrected to doc §9 (39 permissions). vitest added (`npm test`, **34 tests**).
- Verified on web (375/768/1280) and the iOS simulator. 30+ SQL security assertions pass against the live database. Advisors clean except the item below.
- Test data from Phase 1 has been cleaned up: **4 users and 3 businesses remain** (`Nova Hair Studio`, `Buenos Clinic`, `Rosario Clinic 19481`). No test users left.

- **Phase 3 backend is COMPLETE, DEPLOYED and VERIFIED over HTTP** (no UI). Steps 6 and 7 are done: rate limiting + bot protection are live, and the guest manage link works. **Four deployed Edge Functions** (`get_slots`, `create_booking`, `manage_booking` — all public; `resend_manage_link` — JWT required). **421 SQL assertions passing**, plus a full anonymous-caller curl verification recorded in `context/booking-public-api.md`.
- Earlier Phase 3 scope (unchanged): booking_settings per branch, custom fields + immutable form versions, clients/appointments/answers/manage tokens with 2 exclusion constraints, the DST-correct slot engine, **`create_booking` (one transaction, service_role only)**, `save_booking_settings` with the people_per_slot guard, `branch_is_bookable()`, and **two deployed Edge Functions** (`get_slots`, `create_booking`) verified end-to-end as an anonymous caller. **287 SQL assertions passing.** See `context/booking-engine.md`, `context/booking-public-api.md`, `context/booking-settings.md`.

## Next, in order
1. **Phase 3 UI — the only Phase 3 work left**: booking settings screen with live preview → public booking page `(public)/[slug]` (service → staff → slot → form → confirmation; reuses the shared `Calendar`, needs a new `TimeSlotPicker`) → the guest manage page. **The whole backend is ready and verified**; the UI must send `start_token` back and hide the `company_website` honeypot with `position:absolute;left:-9999px` (NOT `type="hidden"` / `display:none`).
2. **Highest-value follow-ups from Phase 2**, any order:
   - **No "give this person app access" link** between a staff profile and an invite — `context/staff.md`.
   - `useSaveService` / `useSaveStaff` are also multi-write and non-atomic.
3. **Small follow-ups left from Phase 1**, any order:
   - **Members UI gaps**: change a role, remove a member, revoke/resend an invite (`context/members.md`).
   - **`supabase/tests/04_invite_flow.sql` has never run** (no Docker). The same ground is covered by REST checks.
   - **`enforce_last_owner` has no "business is being deleted" exemption** — see Traps and `context/_database.md`.
   - **No `/billing` route yet** — the trial banner and the lock's allow-list both point at `/settings` until Phase 8.

## Open items
- **Leaked-password protection CANNOT be enabled on this plan.** The org `Wapee Global` is on **FREE**, and Supabase gates the HaveIBeenPwned check to **Pro and above** (confirmed in their docs + Management API, 2026-10-04). It will stay as a security-advisor warning until the project is upgraded. **Do it as part of going to production** — it is one dashboard toggle once on Pro: Authentication → Providers → Email.
- **Two Edge secrets are now REQUIRED** and are set: `PUBLIC_IP_HASH_SALT`, `PUBLIC_FORM_HMAC_KEY`. The code throws rather than defaulting, so a fresh/cloned project must set them or every public endpoint returns `server_error`.
- **`PUBLIC_SITE_ORIGINS` is unset**, so CORS falls back to placeholder domains. Set it before a real site calls the endpoints.
- **`supabase test db` needs Docker**, not installed. The pgTAP files in `supabase/tests/` are verified by running their assertions through the Supabase connector instead. Docker (or the DB password for `psql`) would let them run as a suite.
- **`expo-clipboard` was added** (invite link copy button), so the dev build needs a rebuild: `npm run ios`.
- **Android has never been run** — no emulator on this machine. Every UI task ends with a written Android code review instead (CLAUDE.md §4). Test on a real device via EAS build when possible.
- **Email is Supabase's built-in sender**: rate-limited, and it only delivers to project team members. Confirm test users with SQL (see `context/auth.md`). Resend replaces it in Phase 6.
- Placeholder domains (`app.wapee.com`, `wapee.site`) and placeholder app icons.

## Traps to remember
- **A `RETURN` in PL/pgSQL does NOT roll back; only an exception does.** `reschedule_booking` freed the old slot, then returned a failure — so every failure path cancelled the customer's booking and told them it failed. **Validation must finish before any mutation.** Now a permanent rule: CLAUDE.md §10a.
- **The real client IP here is `cf-connecting-ip`, NOT the last `x-forwarded-for` entry.** Measured on the deployed function: the last XFF entry is a *rotating* AWS proxy (`13.248.117.77`, `99.82.173.50`, …) while `cf-connecting-ip` is stable and correct. Keying on the last entry put every caller in a handful of shared buckets. A client-supplied `X-Forwarded-For` never arrives, and a request that sends `CF-Connecting-IP` is rejected by Cloudflare with **403 error 1000**. **Re-measure if this ever moves off Supabase/Cloudflare.**
- **An extension's reachability is schema USAGE *and* the function grant.** `pg_cron` keeps EXECUTE grants that `postgres` cannot revoke, but `anon`/`authenticated` have no USAGE on schema `cron`, so they are dead letters — which is why pg_cron is safe where `dblink` (in `extensions`, a schema the API roles CAN use) was not.
- **A rate limiter must FAIL CLOSED.** If the counter is unreachable, refuse. An unthrottled public write endpoint is worse than a brief outage.
- **A blocked attempt must itself be counted**, or a sustained attack oscillates around the limit instead of staying blocked.
- **An anon-key call is still a valid JWT.** `resend_manage_link` with only the publishable key reached the RPC and failed on the EXECUTE grant, surfacing as a 500 until the handler learned to map `42501`/`42883` to a clean 404. Correct boundary, wrong status code — check both.
- **`create_booking` must never `raise` for an expected failure.** It returns `{ok:false,code}` because step 7's rate-limit counter will live inside it, and a raise rolls the increment back — the same bug `accept_invite` had. Same rule for any future public RPC.
- **An exclusion constraint cannot express "at most N overlap."** Group bookings (`people_per_slot` > 1) and `resources.capacity` > 1 are guaranteed only by a counted check under `pg_advisory_xact_lock` inside `create_booking`. 1:1 IS a hard DB guarantee. Do not "simplify" the lock away.
- **A guard trigger on a tenant table also fires for `delete from businesses`.** This has now broken a business delete three times (form-version immutability, `touch_form_version`, and `enforce_last_owner` which is still outstanding). **Test every new trigger against deleting the business** — `supabase/tests/08` asserts it.
- **`dblink` must NOT be installed on this project.** `dblink_connect(text)` is executable by `anon`/`authenticated` and owned by a superuser role, so `postgres` cannot revoke it — installing it hands the API roles a connection primitive that cannot be locked down. Tried, caught by an assertion in the migration, reverted. True parallel tests need CI with a real connection string instead.
- **`select ... into` from an enum column needs an enum variable, not an int.** Cost a `22P02` in `get_free_slots` and would have again in `create_booking`.
- **Validation that normalises a value must be the thing that gets inserted.** `create_booking` validated answers into a cleaned variable and then inserted the RAW jsonb, silently throwing every normalisation away (a yes_no "TRUE" stayed "TRUE"). Caught only because a test asserted the stored value, not the return code.
- **The public Edge Functions are deployed with `verify_jwt = false`** and that is pinned in `supabase/config.toml`. A customer has no account. Do not "fix" it.
- **A public failure must not be distinguishable.** `resolveBranch` returns null identically for an unknown slug, a lapsed trial and booking switched off, and `_shared/response.ts` maps internal codes to a small public set. Adding a helpful new error message is how slug enumeration gets reintroduced.
- **`anon` has NO table privileges any more** (2026-10-03). Supabase's bootstrap had granted all 31 tables to anon since Phase 1; RLS was the only thing stopping it. A new table needs **no** anon grant. The single exception is `select on reserved_slugs`.
- **Postgres resolves an ambiguous local time (DST fall-back) to the SECOND, standard-time occurrence.** London `2027-10-31 01:00` local = `01:00Z` (GMT), not `00:00Z` (BST). The hour is therefore offered ONCE, which is what we want. Do not "fix" this to offer it twice.
- **`get_free_slots` is `service_role` only** — not even an Owner can call it. That is deliberate: it does no permission check because it is pure maths. Phase 4's dashboard must call it through a permission-checked wrapper, never directly.
- **`has_permission()` IGNORES the `own` scope.** It answers "do you hold this anywhere relevant to this branch", so it returns true for a Staff member on *anyone's* row. Narrowing to Own needs `has_permission_at_branch_scope()` **plus** a row check (`is_own_staff_profile()`). Forgetting the second half silently gives Staff the whole branch.
- **An exclusion constraint cannot express "at most N overlap".** Group bookings (`people_per_slot` > 1) and `resources.capacity` > 1 have **no DB guarantee**; they need a counted check under `pg_advisory_xact_lock` in `create_booking`. 1:1 booking is fully guaranteed.
- **`select ... into` on an enum column needs an enum variable.** `get_free_slots` assigned `slot_interval` into an `integer` and every call failed `22P02` until the fix migration. The `case` that maps the enum to minutes runs *after* the assignment.
- **The Phase 1 guards fire for `postgres` too.** A SQL test fixture must `alter table public.businesses disable trigger businesses_enforce_guard` to set a trial date, and must `act_as` the Owner before inserting `member_role_assignments` (or `enforce_role_assignment_guard` refuses: "you cannot grant what you do not have").
- **A SQL test's temp tables need grants.** Assertions that run `set local role authenticated` cannot read `pg_temp` tables without `grant usage on schema <real temp schema>` — and `GRANT` does not accept the `pg_temp` alias, so resolve `pg_my_temp_schema()` first.
- **Postgres has no range type over `time`.** Recurring hours are stored as `day_of_week` + minutes from local midnight (`int4range` for the overlap constraints). `lib/time` converts to "HH:MM".
- **`Calendar` (shared month grid) is the one date picker** — no library, works on all three platforms, RTL-ready, and Phase 3's booking page reuses it via `disabledDates`.
- **`Intl.DateTimeFormat` needs `timeZone: 'UTC'`** whenever formatting a calendar date or a UTC-midnight instant, or a device west of Greenwich shows the previous day. Bit both the weekday names and the closure list.
- **PKR and JPY have NO minor unit** (and KWD/BHD have three). `currencyExponent()` reads it from `Intl`; assuming 2 would be a 100x pricing error in a launch market.
- **Non-ASCII digits** (Arabic-Indic "١٢٣", Persian) must be mapped by codepoint — neither `Number()` nor `normalize('NFKD')` converts them, and a `[0-9]` filter deletes them.
- **`Drawer` already owns a ScrollView**; nesting another breaks scrolling on Android.
- **Saving a schedule must delete then insert**, never edit in place: the exclusion constraints refuse an edit that transiently overlaps itself. This now happens inside an RPC (`replace_staff_working_hours` and friends) so it is one transaction — **do not go back to writing those tables directly from the client.**
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
