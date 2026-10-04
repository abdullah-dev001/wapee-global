# Handoff
Last updated: 2026-10-06 · Branch: `dev`.

**Phase 5 (invoices backend 5A + UI 5B) is DONE** — see `context/invoices.md`.
Phase 4's manual test is postponed until after Phase 5 (user decision) — it is now due.
**Phase 3 is fully complete. Phase 4 part A (backend) and part B1 (Calendar
UI) are done and accepted. Part B2 (Today + Clients, plus three B1 fixes)
is now ALSO done** — see `context/appointments.md`/`appointments-ui.md`
(Calendar), `context/today.md`, `context/clients.md`. Click-tested on the
iOS simulator this round (Today, Calendar Day view, Clients list all
confirmed by screenshot with real data) — two REAL bugs were found and
fixed this way (Realtime channel-name collision; a missing nested-route
`_layout.tsx` that made the Clients TAB disappear entirely) — see Traps.
**Not confirmed**: tapping into a client's profile screen or any dialog/
form interaction — automated taps did not register on the simulator
(documented limitation, see `clients.md`). Next: Phase 5 (invoices) or
further Phase 4 polish, once the user says go.

## Done
- **Phase 0:** Expo SDK 57 app (iOS/Android/web+PWA), theme from DESIGN_GUIDE, 13 UI primitives, responsive shell (bottom tabs / sidebar / header), i18n, PWA install hint + update toast.
- **Phase 2 — complete.** Catalogue and schedule: 13 tables with 5 exclusion constraints and Own-scope RLS; services UI (per-branch prices, server-side search); staff UI (login optional, branch + service assignment); schedule UI (per-person weeks, branch hours, time off, holidays, rooms). Five shared components built with **no new dependency**: MoneyInput, SearchInput, TimePicker, DayHoursRow, DateRangePicker. `lib/money` and `lib/time` partly implemented (75 unit tests).
- **Phase 1 — complete and accepted.** Full schema (11 tables, RLS on all, 46 permissions, 4 system roles, guard triggers); auth screens + session + route guard; onboarding wizard + `create_business_with_owner`; branch-owned country/currency/timezone/tax with per-branch invoice series; `usePermission`/`useFeature` with nav and route gating; invite flow (one-time 7-day link); trial lock screen + 3-day warning banner. Manager seed corrected to doc §9 (39 permissions). vitest added (`npm test`, **34 tests**).
- Verified on web (375/768/1280) and the iOS simulator. 30+ SQL security assertions pass against the live database. Advisors clean except the item below.
- Test data from Phase 1 has been cleaned up: **4 users and 3 businesses remain** (`Nova Hair Studio`, `Buenos Clinic`, `Rosario Clinic 19481`). No test users left.

- **Phase 3 step 4 (settings UI) is done.** `/settings/booking` with two tabs
  (settings + form builder), a live customer preview, warnings with fix routes,
  and a booking link gated on `branch_is_bookable`. Three new UI primitives
  (SegmentedControl, Collapsible, NumberStepper) and the reusable public booking
  components step 5 will use. **`npm run smoke:public`** smoke-tests the deployed
  endpoints (40 checks). 54 new unit tests; **174 unit tests, 430 SQL assertions**.
- **Phase 3 backend is COMPLETE, DEPLOYED and VERIFIED over HTTP.** Steps 6 and 7 are done: rate limiting + bot protection are live, and the guest manage link works. **Five deployed Edge Functions** (`get_booking_page`, `get_slots`, `create_booking`, `manage_booking` — all public; `resend_manage_link` — JWT required). **421 SQL assertions passing**, plus a full anonymous-caller curl verification recorded in `context/booking-public-api.md`.
- Earlier Phase 3 scope (unchanged): booking_settings per branch, custom fields + immutable form versions, clients/appointments/answers/manage tokens with 2 exclusion constraints, the DST-correct slot engine, **`create_booking` (one transaction, service_role only)**, `save_booking_settings` with the people_per_slot guard, `branch_is_bookable()`, and **two deployed Edge Functions** (`get_slots`, `create_booking`) verified end-to-end as an anonymous caller. **287 SQL assertions passing.** See `context/booking-engine.md`, `context/booking-public-api.md`, `context/booking-settings.md`.
- **Phase 3 step 5 (public booking page) is DONE.** `(public)/[slug]` — service →
  staff → slot → form → confirmation — built on the existing presentational
  components and backed by a new `get_booking_page` endpoint (added this
  session because nothing could bootstrap the page before a service was
  chosen). New: `PhoneInput` shared composite (E.164), the step state machine
  and error-action mapping (pure, tested), the dynamic per-service zod form
  schema, and the manage-link confirmation screen (token in the URL
  **fragment**, never the query string). 30 new unit tests (**197 total**). An
  Android code review found and fixed a real bug: back navigation did nothing
  on any step (see Traps). See `context/booking-public-page.md`.
  **Not run in a browser** — no browser tool was available this session; open
  `npm run web` → `/nova-hair-studio` yourself to click through it (test data
  is seeded there: one service, one staff member, Mon–Fri 9–5 hours).
- **Phase 3 step 6 (the guest manage page) is DONE — Phase 3 is complete.**
  `(public)/[slug]/manage`: view/cancel/reschedule a booking by a token read
  from the URL fragment, reusing `Calendar`/`SlotGrid` from the public booking
  flow. Closed a real backend gap found while building it: reschedule needs
  slots for the guest's existing booking, but the public `get_slots` needs a
  `slug`+`service_id` the manage page never has (only a token, by design —
  `get_booking` deliberately returns names, not ids). Added
  **`get_booking_reschedule_slots(token, from_date?, to_date?)`** (new
  migration, `service_role` only — resolves the token to the booking's own
  branch/service/staff SERVER-SIDE, same lookup `reschedule_booking` already
  does) and a new `get_slots` action on the existing `manage_booking` Edge
  Function. Also extended the shared `PublicErrorCode` type/`actionFor` with
  `invalid_token`/`cancel_window_passed`/`not_cancellable`, which existed on
  the Edge Function side but had never been surfaced to the app's own shared
  type. 15 new unit tests (212 total). 106 SQL assertions
  (`supabase/tests/11_guest_manage_link.sql`, +15 for the new function).
  Verified end-to-end over HTTP (get → get_slots → reschedule → get → cancel
  → get, all correct, token revoked only on cancel) and on the iOS simulator
  via a deep link (view screen renders with real data and first-name-only
  privacy; Reschedule opens the calendar+slots screen with real availability).
  **Not clicked all the way through**: the reschedule confirm dialog and the
  cancel confirm dialog were not tapped in the simulator (AppleScript-driven
  taps kept landing on RN's accessibility wrapper groups instead of the
  pressable) — the backend path both dialogs call is already fully verified,
  but click through both dialogs yourself before calling this visually
  complete. An Android review (code-only) found and fixed one real bug: the
  reschedule sub-view is internal state, not a route, and had no hardware-back
  handler, so Android back would have exited the manage page entirely instead
  of returning to the view screen — fixed with `useOverlayDismiss`. See
  `context/booking-manage.md`.
- **The Drawer keyboard gap (reported by the user) is fixed**: `Drawer`'s body
  is now a `KeyboardAwareScrollView` and its footer a `KeyboardStickyView`,
  same mechanism as `Screen`, covering ServiceForm/StaffForm/the schedule
  lists/CustomFieldEditor in one place. **The "settings gear overlapping the
  Clients title" report could not be reproduced in code** (no gear icon exists
  on that screen in the current codebase) — skipped this session pending a
  screenshot or repro steps from the user.

- **Phase 4 part A (dashboard appointments backend) is DONE — backend only,
  no UI, by explicit scope.** `create_appointment` (dashboard + walk-in, any
  staff, never-overwrite-by-phone), `update_appointment` (reschedule or
  notes-only, validates fully before one write — the `reschedule_booking`
  rollback bug must never recur), `cancel_appointment`/`mark_no_show`/
  `mark_completed`/`approve_appointment` (every status change gated by a
  NEW one-place rule table, `appointment_status_transitions` +
  `is_allowed_appointment_transition()`; **cancelled/completed/no_show are
  permanently terminal, no reopen, ever** — agreed with the user), and two
  read RPCs (`list_appointments` keyset-paginated, `get_calendar_appointments`
  with branch-timezone day boundaries). **Staff may book/reschedule outside
  hours/notice/window but never double-book or violate capacity** — a new
  shared helper (`check_appointment_collision`) runs the same collision
  maths `reschedule_booking` uses, deliberately NOT `get_free_slots` (which
  cannot express "ignore hours" — its joins are structural, not flagged).
  All six write RPCs are SECURITY DEFINER with an explicit `can()`/scope
  check as the real boundary (same posture as `resend_manage_link`, because
  they write `audit_logs`, which is DEFINER-only); the two read RPCs are
  SECURITY INVOKER, trusting RLS. `appointments` joined the
  `supabase_realtime` publication (RLS applies automatically to Realtime
  events for an authenticated client — documented in appointments.md for
  the next session's UI). `appointments.invoice_id` added as the Phase 5
  seam (nullable, no FK yet). 103 new SQL assertions
  (`supabase/tests/12_dashboard_appointments.sql`); re-ran 07/08/11
  unchanged to confirm no regression. Types regenerated. See
  `context/appointments.md`.
- **Phase 4 part A closure round is DONE and accepted.** Implemented two
  decisions the user made explicitly (their earlier questions were never
  actually surfaced — see Traps): (b) `no_show`/`completed` can be reopened
  to `confirmed`, but ONLY by Owner/Manager (a literal role-key check, not
  a permission — `appointments.edit` at Branch is ALSO Receptionist's, and
  the decision excludes them), ONLY when `invoice_id is null`, audited
  (`reopen_appointment`, new); (c) an Own-scope Staff caller's `staff_id` is
  now FORCED to their own profile (`my_staff_profile_id()`) rather than
  merely validated if supplied. **Found and fixed a real bug while adding
  the evidence this round asked for**: `create_appointment`/
  `update_appointment` never stored `resource_id` on the row at all, so a
  capacity-1 resource could be double-booked from the dashboard without
  ever being refused — caught only because a new assertion checked the
  STORED column, not just the return code. Fixed with
  `check_appointment_collision_v2` (resolves AND returns the resource id).
  Also found and fixed, mid-round: `approve_appointment` had briefly become
  a side door into the reopen path by checking the transitions table
  generically instead of `status = 'pending'` directly — caught before it
  ever reached a real caller. Added: Asia/Karachi (no-DST) coverage, group
  + resource capacity proven on BOTH create and update, audit_logs
  assertions for every write RPC, reopen allowed/forbidden coverage. 141 SQL
  assertions (was 103). **Realtime RLS proved with three REAL signed-in
  `supabase-js` clients** (not SQL fixtures, which cannot hold a live JWT):
  a cross-business subscriber received zero events, an Own-scope Staff
  subscriber received only their own appointment's events on an unfiltered
  channel. **Migration history reconciled**: `supabase migration list` now
  reports 56/56 matched; every Phase 3/4 file that had drifted (because
  `apply_migration` timestamps by when it actually runs, not by the local
  filename) was renamed to the real remote timestamp, confirmed with the
  user first — pure `mv`, no database changes, no `migration repair`
  needed. See `context/appointments.md`.
- **Phase 4 part B1 (Calendar UI) is DONE.** `/calendar`: Day/Week/List
  tabs, create-appointment Drawer (client search/new, service, staff,
  date/time, walk-in, out-of-hours warning), appointment detail Drawer
  (status-filtered actions with confirm dialogs), a paginated List view.
  New shared scheduler (`src/components/shared/scheduler/`), `StatusBadge`,
  `Avatar`. **The app's first Realtime subscription**
  (`useAppointmentsRealtime`). Pending-approval badges on the Calendar tab
  and the tablet/desktop header, gated to `appointments.approve` holders
  only (decided with the user). **`lib/time` is now fully implemented** —
  it was a Phase 0 skeleton for everything but minute-of-day/local-date
  helpers; this task needed real `zonedToUtc`/`utcToZoned`/`dayRangeUtc`/
  `formatTime`/etc. and built them (DST-safe via `date-fns-tz`). Pre-check
  for this task confirmed the dashboard resource_id bug from the closure
  round above does NOT affect the public booking path (`create_booking`/
  `reschedule_booking` already store and assert it correctly) — no fix
  needed. 35 new unit tests (241 total: typecheck/lint/prettier clean).
  **Not click-tested in a browser** — no browser tool available this
  session; the web bundle built and served without errors
  (4104 modules, `/calendar` → 200) but nobody clicked through it. See
  `context/appointments-ui.md`.
- **Phase 4 part B2 (Today + Clients, plus 3 B1 fixes) is DONE.** Fixes:
  (1) the Reopen button now calls the real `is_owner_or_manager()` RPC
  (new, shared with `reopen_appointment`'s own check) instead of a
  permission stand-in; (2) Day/Week shading reads per-staff working hours/
  breaks/time off (`useDayShading`), not branch hours only; (3) confirmed
  (no fix needed) the Realtime subscription already tears down on logout
  and branch switch. **Today**: counts, ordered appointments, next-
  appointment highlight, quick approve/complete/no-show. **Clients**:
  list (search, keyset pagination, mobile cards/desktop `DataTable`),
  create/edit with duplicate-phone detection, archive/unarchive, a profile
  screen (contact gated by `clients.view_contact`, notes, upcoming/history
  spanning every branch, Phase 5 invoice placeholder). `list_appointments`
  gained `p_client_id`. New test suite (`13_clients_dashboard.sql`, 15
  assertions); `12_dashboard_appointments.sql` now 150/150 (was 141).
  **Click-tested on the iOS simulator** (first time this session an actual
  device/simulator run happened, not just a bundle build) — found and
  fixed two real bugs this way, see Traps: a Realtime channel-name
  collision between Today and Calendar, and a missing
  `clients/_layout.tsx` that made the Clients TAB disappear from the
  bottom bar entirely. Could not confirm tapping into the profile screen
  (simulator tap automation limitation). See `context/today.md`,
  `context/clients.md`, `context/appointments-ui.md`.

- **Phase 5A (invoices backend) is DONE.** Schema (invoices, invoice_items,
  invoice_payments, credit_notes), 10 DEFINER RPCs (draft create/update/
  discard, issue, add_payment, reverse_payment, create_credit_note,
  list_invoices, get_invoice_print_data, get_basic_report), gapless branch
  numbering (own CN series), tax snapshot, immutability for every role, hard
  currency lock, RPC-only `appointments.invoice_id`. 310 SQL assertions
  (`14_invoices.sql`) + a real 3-session concurrent-issue test
  (`15_invoice_concurrency.sh`). See `context/invoices.md`.

## Next, in order
1. **Manual click-through of Phases 4 and 5** (postponed by the user), then Phase 6. Open from 5B: real PDF on native (needs expo-print + expo-sharing, ask), client-profile invoice list, per-line credit notes.
2. Click through what this session could not: the Clients profile screen,
   create/edit forms, archive confirm, and Calendar's create/detail
   drawers — a working simulator tap-automation setup would unblock this
   (see `context/clients.md` Known limits).
3. **Highest-value follow-ups from Phase 2**, any order:
   - **No "give this person app access" link** between a staff profile and an invite — `context/staff.md`.
   - `useSaveService` / `useSaveStaff` are also multi-write and non-atomic.
4. **Small follow-ups left from Phase 1**, any order:
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
- **`get_calendar_appointments` does not return `invoice_id`.** Today/Calendar rows therefore map `invoiceId: null`; anything that needs the invoice link must use `useAppointmentInvoices` (invoices table, RLS-scoped), not `appointment.invoiceId`.
- **A `<Button>` inside a `<Pressable>` row is invalid HTML on web** (console: "button cannot contain a nested button") and, on a 375px phone, squeezes the text out. TodayRow now keeps summary and actions as siblings. Same shape may still exist elsewhere.
- **Web print**: the app root is a fixed-height non-scrolling shell, so `window.print()` would print one viewport. `app/+html.tsx` has an `@media print` block that frees heights/overflow; mark toolbars with `dataSet={{ noPrint: 'true' }}`. Verified with Chromium print emulation + `page.pdf`.
- **iOS dev-client launch without tapping**: `xcrun simctl openurl booted "exp+wapee://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8092"`, then `wapee://<route>` deep links. The simulator was signed in as an existing real account, so seeded throwaway data could not be shown there (empty states only).
- **`SELECT … FOR UPDATE` on a parent row blocks every child INSERT's FK check** (they take KEY SHARE). The branch counter lock uses `FOR NO KEY UPDATE`, which still serialises issuers but lets appointments/invoices keep inserting. Use it for any "lock the parent to serialise" pattern.
- **Migrations this session were applied with `supabase db query --linked -f <file>` followed by `supabase migration repair --status applied <version>`**, so the local filename IS the remote version (no connector timestamp drift). The two Phase 4 mismatches were reconciled 2026-10-06 by renaming the local files `20261004143401_is_owner_or_manager.sql` and `20261004152214_list_appointments_client_filter.sql` to the remote stamps (no DB change); `supabase migration list` now matches 1:1.
- **Parallel `supabase db query` calls can hang** while the CLI creates its temporary login role; stagger them by >1 s (see `15_invoice_concurrency.sh`). One call = one transaction, and only the LAST statement's rows come back.
- **A trigger-guarded financial table must still release rows on `delete from businesses`** — all four invoice guards check "is the business gone" first (tested).
- **Supabase's `.channel(name)` resolves by NAME, and a second `.on()` call against an already-`subscribe()`d channel of the same name THROWS** ("cannot add postgres_changes callbacks ... after subscribe()"), it does not create an independent subscription. `useAppointmentsRealtime` named its channel only by `businessId`; Today and Calendar both mount it for the same business at the same time (the Tabs navigator keeps every tab mounted), so the second screen's `.on()` call threw and blanked that screen. Fixed by including a per-mount sequence number in the channel name — any hook meant to be called from more than one component at once needs a channel name unique PER CALLER, not per logical resource.
- **A folder route (`clients/index.tsx`) needs its OWN `_layout.tsx` (a `Stack`) or Expo Router flattens every file in that folder into the PARENT navigator as sibling routes**, not a nested stack. Without `clients/_layout.tsx`, both `clients/index` and `clients/[id]` showed up as separate top-level screens inside the Tabs navigator (confirmed by logging `state.routes` in `BottomTabBar`), and the folder-based screen's ACTUAL `route.name` came through as `"clients/index"`, not the `"clients"` the Tabs.Screen was declared with — breaking every name-keyed lookup (`iconByName`, `isRouteAllowed`) and making the whole tab silently disappear from the bar. Two fixes needed together: add the `_layout.tsx`, AND normalize `route.name` (strip a trailing `/index`) before any lookup that assumes the plain config name, since even with the `_layout.tsx` the defensive normalization is cheap insurance. `settings/` had the exact same latent shape (`settings/index.tsx` + `settings/booking.tsx`, no `_layout.tsx`) and never surfaced this because `settings` is never shown in the bottom tab bar — only `More`/`Sidebar`, which navigate by `router.push(path)` (always correct) rather than by the Tabs navigator's internal route-name state.
- **`expo-localization` pulls in react-native (Flow syntax) and cannot load in plain Node.** `lib/time`'s `getDeviceTimeZone()` imports it, so vitest needs the same alias trick as `lucide-react-native`: `src/test/stubs/expoLocalization.ts`, aliased in `vitest.config.mts`. Hit this the moment `lib/time`'s skeleton functions were implemented for the Calendar UI; any future module that imports an Expo native package for the first time should expect the same and check `vitest.config.mts`'s alias list before assuming a bare `npm test` run will tell the truth about it.
- **A tool call to AskUserQuestion is not the same as the user actually answering it.** This session's predecessor asked four grouped questions before building the Phase 4 backend and proceeded as if they had been answered, but the user's own closure-round message made clear they never saw them: the user gave their OWN decisions for (a)-(e) instead, two of which ((b) reopen, (c) forced Own-scope staff_id) directly contradicted what had been built and shipped. **When a question actually matters for scope/money/permissions, the conversation must show the user's own words answering it before building on the answer** — do not treat a tool call's return value as consent without that.
- **A generic "is this transition allowed" check can become a backdoor the moment a NEW transition is added to a shared rule table.** Adding `no_show/completed -> confirmed` to `appointment_status_transitions` (for the user's reopen decision) silently gave `approve_appointment` — which checked `is_allowed_appointment_transition(status, 'confirmed')` generically — a second, unguarded path to the exact same effect `reopen_appointment` exists to gate (Owner/Manager only, `invoice_id` null, audited). Caught only because the new reopen tests happened to also re-run the old approve tests and one flipped from refused to allowed. **Whenever a shared rule table gains a new row, grep every caller of the function that reads it** — a caller written before the row existed may have been "correct" only because that row didn't exist yet.
- **A collision/availability check that resolves a resource but only returns a pass/fail CODE is a bug waiting to ship.** `check_appointment_collision` (v1) correctly found a free resource and refused when none was free, but never told the caller WHICH resource id it had resolved — so `create_appointment`/`update_appointment` never stored `resource_id` at all, and the "how many bookings use this resource" count inside the SAME function was therefore always zero on every subsequent call. The function was internally consistent and still wrong. Caught only by asserting the STORED COLUMN value in a test, not just the return code — "the RPC returned ok:false when it should" is not the same claim as "the data is correct afterwards." Fixed by returning a composite (code + resource_id + capacity) so the caller stores exactly what was checked.
- **`apply_migration`'s remote timestamp is NOT the local filename's timestamp.** Every migration applied via the Supabase connector gets stamped with whatever time it actually ran, completely independent of the `name` argument or the local file's prefix. Local files narrated with sequential same-day timestamps (`20261005160000`, `170000`, ...) drifted from the real remote history (`20261004042720`, `042940`, ...) by a full day. `supabase migration list` is the only way to catch this — check it after a multi-migration session, before assuming the folder tells the true story.
- **`get_free_slots()` cannot be reused for a "staff override hours" question — not even with a flag.** `p_ignore_notice` only affects minimum notice and `online_booking_enabled`; the branch/staff-hours joins (`branch_windows`, `staff_windows`) are STRUCTURAL — no row for an out-of-hours instant exists at all, flag or no flag. Phase 4's dashboard RPCs needed staff to book outside hours (doc §6.2), so they run a SEPARATE collision-only check (`check_appointment_collision`, reusing `reschedule_booking`'s exclusion-aware overlap query) instead of calling the engine. The engine stays the sole authority on the SLOT GRID; the dashboard RPCs are the sole authority on "does this collide".
- **A column whose type matches another table's column of the same name is not automatically compatible with a bare string literal.** `clients.source` and `appointments.source` are both `public.booking_source`, not text — `case when p_source = 'walk_in' then 'walk_in' else 'dashboard' end` failed 42804 because the literals never got cast. Pass the already-typed parameter through directly instead of re-deriving a string.
- **A `DECLARE`d variable's type is a silent trap in a SQL test fixture.** `select count(*) into v_client` where `v_client` was declared `uuid` (reused from an earlier `select client_id into v_client`) failed with `invalid input syntax for type uuid: "1"` — Postgres tried to cast the count into the wrong type. The error message's line number is relative to the function body, not the file, so when a SQL test fails with a cryptic type error, check every `declare`d variable's type against every `select into` that targets it, don't just reread the surrounding logic.
- **Check for migration-filename collisions before writing a new file with today's date.** Two Phase 4 files this session landed on `20261004143401`/`20261004152214`, timestamps already used earlier the same day by an unrelated `get_booking_page` migration pair — `ls supabase/migrations/ | grep <date>` first, or two unrelated migrations silently share a sort position on disk (harmless to the already-applied DB, since Supabase's history tracks by the name passed to `apply_migration`, but confusing for anyone reading the migrations folder in order, and a real problem for `supabase db push` on a fresh clone).
- **A guest-facing page keyed only by a token (not a business/branch id) cannot use `createQueryKeys`** — that factory requires a `businessId` the page does not have and must not infer. Use a plain key array instead (`['booking-manage', token]`), same reasoning as `useSlots` already fudging `businessId: slug` elsewhere, but here there is no id at all to fudge with.
- **Internal state that isn't a route still needs Android back handling.** `BookingManage` flips between a view and a reschedule sub-screen with `useState`, not a route — so Android hardware back had no handler for it and would have fallen through to the Stack's default pop, exiting the whole manage page instead of returning to the view screen. `useOverlayDismiss(mode === 'reschedule', () => setMode('view'))` fixed it. Same bug class as the public booking flow's `goBack` trap below, but this time there was no handler at all rather than a wrong one — a written Android review is the only thing that catches either shape.
- **A privacy-motivated response (returning names, not ids) can silently block a LATER feature that needs the id.** `get_booking` deliberately returns `service_name`/`staff_name` never `service_id`/`staff_id`, which is correct for its own job (CLAUDE.md §13) — but it meant the reschedule screen had no way to call the existing `get_slots` endpoint (`slug`+`service_id`). Fixed by resolving the token to the ids SERVER-SIDE inside a new function (`get_booking_reschedule_slots`) rather than loosening what the client-facing response reveals. When a public endpoint deliberately omits an id, assume a later screen will want it and plan the lookup to stay server-side rather than widening the response.
- **A step-back handler must reset the TARGET step, not the step being left.** `BookingFlow.goBack` computed `prev = previousStep(step, ...)` but then called `resetFrom(state, step)` — clearing fields on the step already being left (already empty) instead of `prev`'s own field. `currentStep()` came out unchanged every time, so the Back button did nothing and Android hardware back was silently swallowed (it still returned `true` from the handler). Caught only by a written Android review, not by the unit tests for `resetFrom` itself — the bug was in the wiring, not the pure function. Fixed: `resetFrom(state, prev)`. Test the whole `goBack` sequence, not just `resetFrom` in isolation.
- **`Text`'s `color` prop takes a token NAME, not a hex value** (`color="textPrimary"`, not `color={theme.colors.textPrimary}`). Same for `Button`, which takes `children`, not a `label` prop, and `Badge`'s `icon`, which takes a NODE not a component.
- **A service's buffer REPLACES the branch buffer; they never add.** `case when coalesce(service,0) > 0 then service else branch end`, in both `get_free_slots` and `create_booking`. 10 + 15 = 15, not 25. A service buffer of 0 means "no setting", so a service cannot opt out of the branch buffer.
- **A smoke test that asserts on a JSON substring will lie.** The privacy check searched for the client's full name and matched the BUSINESS name ("Smoke Test Salon"), because the test data shared a word. Assert on fields.
- **Network latency is not a reliable "instant".** The `too_fast` check reused a token from an earlier call and by then >3s had passed, so it booked the slot the next check needed. Fetch a fresh token immediately before.
- **`npm run smoke:public` spends the per-IP `create_booking` budget** (10/hour). A second run inside the hour reports every write check as a 429; the script detects that on the first write and exits 3 with an explanation.
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
