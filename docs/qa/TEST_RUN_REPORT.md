# Manual test run report — 2026-10-17

Checklist: `docs/PRODUCTION_READINESS.md` Part 5 (sections A–K and the carried-over items).
Tester: Claude, acting as a manual tester. Nothing was fixed during the run.

## How the run was done (read this first)

| | |
|---|---|
| Browser | Playwright with headless Chromium 153. Two sizes: **phone** 375×812 (Android user agent, touch) and **laptop** 1440×900. Browser time zone was Asia/Karachi, so time-zone mistakes would show up. |
| No-account items | Run on the **Vercel dev preview** (`wapee-global-git-dev-…vercel.app`) against **dev Supabase**: landing, public booking (Nova Hair Studio), K51, K52, deployed layout. Vercel protection was switched off by the founder for the run. |
| Items that need a login | Run on a **local stack**: `supabase start` (all 159 migrations replayed from empty) plus the `dev` branch web app on `localhost:8081`. The safety rules don't allow signing up or logging in on a hosted site. Locally, all roles were created as throwaway `eventzap4u+qa1017…@gmail.com` users, and auth emails were read from local Mailpit. |
| Local-only workarounds (not product changes) | (1) Applied dev's table grants to the local DB, because a from-empty replay is missing them (finding **F6**). (2) Added test-only Edge Function secrets in the gitignored `supabase/functions/.env`. (3) Routed `http://kong:8000` → `127.0.0.1:54321` in the test browser, because the local Edge runtime builds storage URLs with its internal host. (4) Set `profiles.is_super_admin` by SQL on a throwaway user, and generated TOTP codes locally from the enrolment key. (5) Created portal sign-in tokens and an unsubscribe token directly, because the real ones only exist inside emails, which are not sent locally. (6) Linked a service to a room by SQL, because there is no UI for it (**F15**). |
| Emails | Locally, customer emails go to `message_outbox`, but there is no Resend key, so they are never delivered. Their creation was checked in the DB. Auth emails (reset, email change) were read in Mailpit. On dev, **every customer email is currently rejected by Resend** (**F28**). |
| Screenshots | `docs/qa/run-2026-10-17/` (294 files, not committed). Names start with the checklist item, e.g. `A6-appt-drawer-1440.png`. |

## 1. Summary

| Section | PASS | FAIL | BLOCKED | Notes |
|---|---|---|---|---|
| A. Owner first day | 9 | 1 | 2 | A10 FAIL (F13). A1 verification email and A12 reminder delivery need a real inbox. |
| B. Money | 4 | 1 | 0 | B16 FAIL (F14) |
| C. Team and roles | 5 | 0 | 0 | |
| D. Schedule safety | 4 | 1 | 0 | D26 FAIL: rooms can't be linked to services in the UI (F15) |
| E. Clients | 3 | 1 | 0 | E29 FAIL (F18) |
| F. Plans, trial, super admin | 5 | 0 | 0 | |
| G. Website and reviews | 2 | 0 | 0 | Gallery image not verified on hosted |
| H. Multi-branch | 2 | 0 | 0 | |
| I. Add-ons | 5 | 1 | 0 | I45 portal FAIL (F22, F24, F25) |
| J. Mobile / desktop / PWA | 1 | 1 | 2 | J47 FAIL (F26). J48 and J50 need real devices. |
| K. Customer-only | 2 | 1 | 0 | K52 FAIL (F5) |
| Carried over | 8 | 1 | 1 | Portal FAIL (same as I45). PDF on native needs a device. |
| **Total** | **50** | **8** | **5** | Plus findings outside the checklist: F1, F6, F28 and others below |

**Biggest problems:**
- **F1 (Blocker):** "Any available person" bookings are refused.
- **F28 (High):** no customer email is delivered on dev.
- **F13 (High):** a customer who cancels sees "link not valid".
- **F5 (High):** the booking rate limit triggers after about 3 bookings.
- **F6 (High, deploy):** a fresh database built from the migrations is broken.

## 2. Failures (severity, how to reproduce, expected vs actual, suspected file)

### F1 — BLOCKER — "Any available person" refuses free slots
- **Steps:** 2+ staff do the same service, and one of them is not working that day (time off or different hours). Customer → `/<slug>/book` → service → "Any available person" → pick a shown time → Confirm.
- **Expected:** booked with the free staff member. **Actual:** `409 slot_unavailable` and the toast "That time was just taken. Pick another." This happens every time.
- **Seen on:** dev (Nova Hair Studio, Mon 19 Oct 10:30: "Dev Staff" was picked although only "Alex (test)" was free) and locally (Fri 23 Oct: QA Owner on time off was picked, QA Staff Two was free).
- **Cause:** `pick_staff_for_slot` only checks for overlapping appointments. It ignores working hours, time off and closures, so it picks the least-busy staff member, who is off. `create_booking` then re-checks with `get_free_slots` for that person and refuses.
- **Suspected:** `supabase/migrations/20261003110000_slot_engine.sql` (`pick_staff_for_slot`) and its caller in `create_booking`.

### F28 — HIGH (config) — dev cannot send any customer email
- **Seen:** the dev booking confirmation (outbox `07662ba2…`) went `dead` after 1 attempt. Log: `resend_403: validation_error`. On dev, 4 of 4 recent emails were rejected; the only 2 ever sent are from 9 Oct.
- **Expected:** emails delivered to customers. **Actual:** nothing is delivered to customer addresses (here `eventzap4u+…@gmail.com`).
- **Likely cause:** the Resend sender domain is not verified, or Resend is in test mode (it only sends to the account owner). Check the Resend dashboard and the `RESEND_FROM_EMAIL` secret, and check production too.
- **Effect:** every checklist step that expects an email (A1, A5, A12, G38 and the form, portal and unsubscribe emails) cannot pass on dev until this is fixed.

### F6 — HIGH (deploy / disaster recovery) — a fresh database from the migrations is missing grants
- **Steps:** `supabase start` (replay the 159 migrations into an empty DB) → open any public booking page.
- **Actual:**
  - `service_role` has no SELECT/INSERT/UPDATE/DELETE on 71 of 86 public tables (dev: 86/86), so every Edge Function fails (`server_error`, DB log "permission denied for table businesses").
  - `authenticated` is also missing grants that dev has: `appointments` I/S/U, `appointment_field_values`, `booking_manage_tokens`, `booking_settings`, `clients` I/U, `clients_v` D/I/U, `custom_fields`, `custom_field_services`, `form_versions`. The owner's Today screen shows "Couldn't load appointments / You don't have permission to do that." right after onboarding.
  - `pg_default_acl` for role `postgres` in `public` gives `service_role` only `Dxtm`.
- **Expected:** the migrations alone reproduce dev.
- **Effect:** any new environment, or a rebuilt production database, would be down. Production was not checked, because I was told not to touch it.
- **Suspected:** a migration that changes default privileges or revokes grants without matching explicit grants, or grants made on dev outside the migrations.

### F5 — HIGH — booking rate limit triggers after about 3 bookings, not 10
- **Steps (dev):** from one IP, make 4 booking attempts within a few minutes.
- **Expected:** about 10 per hour (rule `create_booking ip 3600s max 10`). **Actual:** the 4th attempt is `429` "Too many attempts".
- **Cause:** each attempt writes 3 `public_request_attempts` rows with the same `ip_hash` (IP+phone row, IP-only row from the second `checkRateLimit` call for the business, and the business row). All of them count against the IP limit.
- **Effect:** clinic Wi-Fi or mobile networks that share one IP (common with phone carriers) will block real customers.
- **Suspected:** `supabase/functions/create_booking/index.ts` (the second `checkRateLimit` call re-applies the IP rule) and `check_rate_limit` (`20261004090000_public_request_attempts.sql`).

### F13 — HIGH — customer cancel via manage link ends on "link not valid"
- **Steps:** customer opens the manage link → Cancel booking → "Yes, cancel it".
- **Expected:** a "booking cancelled" confirmation.
- **Actual:** the cancel succeeds (`200 {status:cancelled}`, and the slot is free again), but the page re-fetches with the now-revoked token (`404 invalid_token`) and shows "This link is not valid or has expired. Please check the link or contact the business."
- Reproduced twice locally: after a reschedule, and on a fresh booking.
- **Suspected:** `app/(public)/[slug]/manage.tsx` and its hook (refetch after cancel), plus `manage_booking` 'get', which maps a cancelled booking to `invalid_token`.

### F26 — MEDIUM-HIGH — Back button leaves the booking flow and the manage page
- **Steps (phone):** `/book` → choose a service (step 2) → browser/hardware Back. Or: manage page → Reschedule → Back.
- **Expected (J47):** go back one step. **Actual:** the whole page is left. The customer goes to the previous site (seen on Vercel) or to `/login` (seen locally), and loses their progress.
- **Suspected:** `app/(public)/[slug]/book.tsx` and `manage.tsx`: the steps are in-page state with no history entries and no web back handling.

### F9 — MEDIUM — a refused dashboard booking still creates the new client
- **Steps:** Calendar → New appointment → New client "QA Clash Client" → the same staff and time as an existing booking → Book.
- **Expected:** nothing is saved. **Actual:** "That time is no longer available.", but the client row is created (source `dashboard`). Each retry adds clutter.
- **Cause:** this is the CLAUDE.md §5 trap: `RETURN {ok:false}` runs after the insert, so nothing is rolled back.
- **Suspected:** the `create_appointment` RPC.

### F11 — MEDIUM — No-show and Completed are allowed before the appointment time
- **Steps:** an appointment two days in the future → Mark no-show → confirm. Also: Mark completed on a walk-in before its start.
- **Expected:** refused, or at least a warning. **Actual:** both are accepted, and the no-show dialog says "This cannot be undone".
- **Suspected:** the `mark_no_show` and `mark_completed` RPCs, and the drawer.

### F14 — MEDIUM — "Print / share" prints the drawer over the invoice
- **Steps:** invoice drawer → Print / share.
- **Actual:** the app goes to `/invoice-print/<id>`, but the invoice drawer and dim overlay stay open on top. The printed page shows the drawer (`B16-invoice-print.pdf`).
- Loading `/invoice-print/<id>` directly prints a full, uncut A4 page (`B16-invoice-print-direct.pdf`).
- Smaller issues on the print view: Back/Print buttons and the grey page background are printed, "Refund due" is missing, and the business name is printed twice.

### F15 — MEDIUM — no way to link a service to a room in the UI
- **Steps:** Schedule → Rooms → add a room. Booking settings → Advanced → "Use rooms, chairs or bays" on. Open a service.
- **Expected:** a choice of which rooms the service needs. **Actual:** there is no such field. The engine uses `service_resources` (it works when I linked a room by SQL: the booking got the room, and archiving that room was refused). A clinic cannot use rooms at all.

### F17 — MEDIUM — time-off list shows the wrong day
- **Steps:** Schedule → Time off → QA Owner, From/To `2026-10-23` → Save (branch Europe/London, BST).
- **Stored:** correct (23 Oct 00:00 to 24 Oct 00:00 London), and the booking page has no slots on the 23rd. **Shown in the list:** "Oct 22, 2026 – Oct 22, 2026".
- Branches ahead of UTC will always see the previous day.
- **Suspected:** the time-off list formatting in `src/features/schedule`.

### F20 — MEDIUM — a revoked session is not sent to the login page
- **Steps:** the owner has the dashboard open → the session is revoked elsewhere (admin Suspend revokes member sessions by design; a password reset does too) → keep using the open tab.
- **Expected:** the tab is sent to `/login` with a message.
- **Actual:** the dashboard stays on screen, and actions fail as anon ("permission denied for function deduct_session" in the DB log; on screen, the action just does nothing) until a manual reload shows the login page.

### F22 — MEDIUM — client portal shows the wrong package balance and UTC times
- Portal → Packages shows "5 of 5 sessions left" while one session was used. The dashboard shows "remaining 4", and the usage line is listed right below.
- The usage time shows "10/17/26, 8:35 PM", which is UTC. The branch time was 9:35 PM BST.

### F23 — MEDIUM (product question) — cancelling does not return a used package session
- A session was deducted for an appointment, then the customer cancelled the appointment in the portal. The session stays deducted (`session_usages` 'deduct', no reversal). Please confirm whether this is intended.

### F24 — MEDIUM — portal "Book a visit" shows every time twice
- One chip appears per eligible staff member, with no de-duplication. Selecting 14:00 highlights both chips. The booking itself works.

### Low-Medium
- **F8** Dates use US format for a UK clinic with an en-GB browser: "10/19/26", "October 19, 2026 at 10:00 AM", "7 AM" (`src/lib/time`).
- **F16** The Rooms tab says "These are saved now but do not affect bookings until the booking engine arrives." This is stale, developer-like text.
- **F18** Client profile "Upcoming appointments" lists a past completed visit (it is also in Visit history) and a cancelled one.
- **F19** For plan-gated pages, the Owner sees "You don't have access to this / Ask the business owner" instead of "Not included in your plan". Seen on `/settings/forms` (Team plan, Forms off) and `/settings/advanced-reports` (Solo).
- **F21** A failed file upload shows no error at all; the file just never appears.
- **F25** Portal Sign out shows "Couldn't load this page / Something went wrong" instead of the sign-in screen.
- **F27** The Members "Manage" drawer does not refresh after "Add role" until it is reopened.

### Low
- **F2** After a refused slot, the booking page jumps back to today instead of staying on the chosen day.
- **F3** The booking page shows the raw IANA zone id "Times shown in America/New_York".
- **F4** The details step has no summary of the chosen service, staff and time. The US phone placeholder is "700 900 123".
- **F7** `get_website` logs errors as "[object Object]".
- **F10** The appointment drawer says "Record the client's photo consent above", but there is no consent control above it.
- **F12** After Mark completed or Mark no-show, the open drawer keeps showing the old action buttons. The toast only repeats the button label.

**Other Low items:**
- Signed in, an unknown path (e.g. `/team`) shows a skeleton forever.
- A credit note is created with no confirm dialog.
- The closure and time-off dates are plain text boxes (no picker).
- The Country list has 250 items and no search.
- The selected location resets to the main location on every reload.
- Adding staff is non-atomic (insert, fail, then a client-side delete).
- The reschedule confirm dialog doesn't state the new time.
- The unsubscribe confirmation says "If this link was valid…".
- The review page shows the old token's state when only `#token` changes in the same tab.
- Data requests are shown in the browser time zone (everything else uses branch time).
- The weekly/monthly report switches have the accessible label "Off" instead of their names.
- There is no "email changed" message after the confirm link.
- The onboarding placeholder "Main salon" appears for a dental business.

## 3. Screens that looked wrong (screenshots in `docs/qa/run-2026-10-17/`)
- `B16-invoice-print.pdf`: invoice print covered by the drawer (F14).
- `I45-portal-confirm-375.png`: every time slot doubled (F24).
- `D26-rooms-1440.png`: developer-like copy about the "booking engine" (F16).
- `A6-appt-drawer-1440.png` / `-375.png`: US date format; "photo consent above" with nothing above (F8, F10).
- `I42-today-lowstock-1440.png`: header reads "QA Clinic 1017 · QA Clinic 1017" (business and location have the same name). The Today tile reads "0 / No pending approvals".
- `K-book-409-msg-375.png`: after the refusal, the date jumps back to today (F2).
- `G37-website-375.png`: Gallery tile is empty locally (the image URL is the internal `kong:8000` host). This is a local artefact and probably fine on hosted, but not verified.

All checked screens had no horizontal scroll at 375 (scrollWidth = 375), and bottom tabs were present on phone.

## 4. Still needs a real phone, inbox or decision
1. **Resend on dev** (F28): fix the domain or test mode first. Without it, no email check can pass.
2. **Real inbox after F28:** sign-up verification (A1), booking confirmation with manage link (A5), reminder the day before (A12), review email (G38), consent-form link (I44), portal sign-in link (I45), password reset on dev (F36), unsubscribe link inside a real reminder or review email (K53).
3. **Android phone (Chrome):** J47 system bars and hardware Back (F26 is expected to show), J48 PWA install + push on a new booking, J49 real airplane mode.
4. **iPhone Safari:** J50 booking page and manage link.
5. **Native app:** opening a client PDF file (Phase 10).
6. **Decisions:** F23 (return a package session on cancel?). Reminders: a booking made less than 24 h before the visit never gets a reminder; is that intended?
7. **Production:** read-only check of F6 (table grants for `service_role` / `authenticated`). Not done, because I was told not to touch prod.

## 5. Verdict: is it ready for a pilot clinic?
**Not yet. It is close for a single-practitioner clinic, and not ready for a multi-staff clinic.**

**What works well:**
- Onboarding and the setup card.
- Booking settings and custom questions; answers are visible to staff.
- Double-booking protection.
- Dashboard reschedule.
- Gapless invoice numbers, payments, credit notes and reports per currency.
- Role limits, enforced in both the UI and the database. This was tested live with Owner, Manager, Receptionist and Staff, including direct API calls.
- Schedule-change warnings and archive refusals.
- GDPR export and erase.
- Plan and add-on gating.
- Super admin with 2FA.
- Multi-location with separate currencies.
- Packages, inventory, forms and commission.
- The offline screen.

**What must be fixed before a real clinic uses it:**
1. **F1:** any clinic with two or more staff will lose online bookings on days when one person is off.
2. **F28:** customers get no confirmation, reminder or manage-link emails on dev. Check production the same way.
3. **F13:** customers who cancel are told their link is broken.
4. **F5:** a few bookings from one shared network lock everyone on it out for an hour.
5. **F26:** the Android Back button throws customers out of the booking flow.
6. **F6:** any rebuild of the database from the migrations takes the whole product down. Verify production before the next migration push.

After these are fixed, the Medium items (F9, F11, F14, F17, F20, F22, F24) should be fixed before more clinics are added. The rooms feature (F15) should not be offered yet.

---

## Fix round — 2026-10-18 (dev only)

One commit per fix. Each has a test, and each was re-run live. Migrations were applied to dev with `supabase db push --linked`, so each version matches its filename.

| Finding | Status | Commit | Migration | Tests | Live re-test |
|---|---|---|---|---|---|
| F1 "Any staff" refuses free slots | **Fixed** | d3b1022 | 20261025100000 | suite 44 (27/27); 06/08/11/12 green | Vercel dev, Nova: "Any available person" Mon 19 Oct → booked (Alex) |
| F13 cancel ends on "link not valid" | **Fixed** | 2cb9965 | — | `manageState.test.ts` | local: cancel → "Cancelled" view and note; no refetch |
| F5 IP cap trips at about 3 bookings | **Fixed** | ee1ae5e | 20261025110000 (+ `create_booking` redeployed to dev) | suite 45 (13/13); 10, 08 green | local HTTP: 10 allowed, 11th 429; dev: 1 ip row per booking |
| F26 Back leaves the booking/manage flow | **Fixed** | 6ddaebc | — | `stepHistory` (6), `historyDepth` (3) | local 375: Back walks the steps; dirty form asks first; manage Reschedule → Back → view |
| F9 refused booking creates a client | **Fixed** | e930e18 | 20261025120000 | suite 46 (5 fail before, 17/17 after) | local dashboard clash: no client row |
| F22 portal package balance / UTC times | **Fixed** | 744a4e8 | 20261025130000 | suite 26 (was failing on dev on this exact case; 111/111) | local portal: "4 of 5 sessions left", time in BST |
| F24 duplicate time chips | **Fixed** | 5671f64 | — | `slotList` (5) | local, two staff free: 31 chips, 31 unique (public page and portal) |
| F17 time-off list shows the wrong day | **Fixed** | d0528dc | — | `timeOffDisplay` (4, incl. DST, +5, −4) | local: "Oct 23, 2026 – Oct 23, 2026" |
| F11 no-show before the start | **Fixed** (no-show refused; early "completed" warns) | b27d071 | 20261025140000 | suite 47 (5 fail before, 9/9 after); suite 12 fixture updated (171/171) | local drawer: no "Mark no-show" on a future appointment; early-complete warning |

**Checks:**
- `tsc` clean and `eslint` clean.
- vitest 905/905.
- Public smoke against the local stack: 36/0 (1 skipped).
- All 41 plain/pgTAP SQL suites on dev: 0 failures (the `.sh` concurrency suites and the `.mjs` HTTP suites were not re-run).
- `check:migrations`: 164/164 replay from empty.
- Supabase security advisors: no new kinds of warning.

**Corrections and new findings:**
- **F6 was not a product bug.** The local Docker image gives different default privileges. Production and dev grants match (`service_role` 86/86 on both). `check:migrations` already applies hosted default privileges before replaying.
- **New (Low-Med):** `email_required` and `invalid_email` are missing from `_shared/response.ts` `CODE_MAP`. An API caller who leaves out a required email gets `500 server_error`. The booking form enforces email, so customers don't see this.
- **New (Low):** `create_booking` still inserts the client before its insert block. Losing an exclusion-constraint race can leave a client row behind. This is the public twin of F9.
- **Decided, not built yet:** F23. Return a package session when a customer cancels before the visit starts (founder: yes).

## Fix round 2 — 2026-10-18 (dev only)

| Item | Status | Commit | Migration | Tests | Live re-test |
|---|---|---|---|---|---|
| F23: a customer cancel returns the package session | **Built** | a39f917 | 20261025150000 | suite 48 (26/26); 11, 22, 26 green | local HTTP: manage-link cancel 2→1 used, portal cancel 1→0, portal shows "5 left" with two reversal lines, deduction rows unchanged |
| `email_required` returned 500 | **Fixed**: 400 plus a message under the email field | 569189c | — (edge; `create_booking` redeployed to dev) | `_shared/response.test.ts` (3), errorHandling (+1) | local HTTP: `400 {code: email_required}`, no client row |
| `create_booking` race left an orphan client | **Fixed** with a small change | ae4e797 | 20261025160000 | suite 49 (3 failures before, 10/10 after) | local smoke 36/0 |

Checks after round 2: tsc and eslint clean; vitest 908/908; all 43 plain/pgTAP SQL suites on dev with 0 failures; `check:migrations` 166/166.

Staff cancels from the dashboard still do not return a package session automatically (unchanged; staff reverse by hand).

**Dev cleanup:** the guarded delete of the QA throwaway rows was declined twice at the tool-approval step, so those rows are still on dev. The exact SQL was handed to the founder.
