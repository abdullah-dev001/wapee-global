# Wapee — Production Readiness Report

Written 2026-10-16 on branch `dev` (head `a7d10f8`). Read-only analysis: nothing was changed, deleted or applied anywhere. Production was only read (migration list, Edge Function list, row counts, one HTTP check of the live site).

> **Update 2026-10-16 (on `dev`, not yet on prod):** dashboard **Reschedule** built (Part 3 #5); **booking-form answers** now shown on the appointment and the client profile (#10); raw error text removed from **Calendar, Clients and Invoices** (#9, add-on screens still to do); the two out-of-order migrations were **renamed** and the from-empty replay now produces the correct `set_business_status` (#4, Part 2.2). The 6 screenshots in Part 6 group A were deleted. Dev's migration-history repair (Part 2.3) was run on 2026-10-17: 159/159 matched, schema unchanged.

## Executive summary (10 lines)

1. **Not ready for a real clinic tomorrow.** The booking engine, security and money logic are strong and heavily tested, but a clinic would hit gaps in daily use within the first hour.
2. **What breaks first:** customers get **no emails** on production until the Resend domain and custom auth SMTP are proven, and staff **cannot move (reschedule) an appointment** from the dashboard. They can only cancel and re-book.
3. **Most screens were never clicked by a person in a browser.** That includes the Calendar create/detail drawers, invoices, clients profile, commission, packages, inventory, forms and portal dialogs. Their backends are tested; the screens are not.
4. **Production is behind dev:** 7 migrations and 13 commits (10 audit rounds of fixes) are on dev only. Production still has known bugs, such as the public website showing services that were hidden from online booking.
5. **New finding:** 2 dev-only migrations are dated before production's latest. One of them would be silently undone if the database were ever rebuilt from empty. Rename them before pushing (Part 2).
6. **There are no backups** (Supabase Free plan). Moving to Pro is a hard launch blocker, and so is basic monitoring.
7. **Audited and proven on dev (Features 1–11):** login, password reset, onboarding, invites, roles, super admin, plans/trial, services, staff/schedules, branches.
8. **Never audited feature by feature:** public booking, calendar, clients, invoices, commission, reports, reviews, website, notifications, packages, inventory, files, forms, portal, GDPR.
9. **About 25 places outside the audited features still show raw server error text** to users, mostly in calendar, clients and invoices.
10. **Fastest safe path:** fix the migration order, push dev to prod, set up email, move to Supabase Pro, add dashboard reschedule, then the founder clicks through Part 5 on a phone and a laptop. After that, start one pilot clinic.

### Evidence levels used everywhere below
- **PROVEN-LIVE**: run on DEV or PROD with real data, sessions or HTTP calls, and the result was seen.
- **TESTED**: covered by passing unit tests (851/851 pass today, re-run for this report) or SQL suites only.
- **CODE-READ**: someone read the code; it was not run.
- **Browser-tested**: a person or a browser robot actually clicked the screen. Unless it says "yes", **assume it was NEVER CLICKED IN A BROWSER.**

---

## PART 1 — Feature status

Status key: **Ready** · **Ready with caveats** (works, known limits) · **Risky** (backend fine, screen unproven or important gap) · **Not ready** · **Off at launch**.

"Audit round" = the feature-by-feature QA rounds (Feature 1 … Feature 11) done 2026-10-14 to 2026-10-16. **⚠ NEVER AUDITED** = no feature round has looked at it yet.

| # | Feature | Status | Evidence | Browser-tested? | Audit round | Known open issues | Owner must check by hand |
|---|---|---|---|---|---|---|---|
| 1 | Signup / login / logout | Ready with caveats | PROVEN-LIVE (suspended user refused at the real login endpoint on dev; invite cold-load in a real browser); TESTED | Partly (login picker via Playwright, 2026-10-22 round) | Feature 1 | Auth emails on prod need custom SMTP; the "too many emails" (429) error is not translated; the raw-error fix is on dev only | Sign up on prod with a Gmail address and receive the verification email |
| 2 | Password reset | Ready with caveats | TESTED (23 unit tests); CODE-READ | **No** | Feature 2 | Fix is on dev only (prod still strands 2FA admins) | Reset as a normal owner and as the super admin |
| 3 | Onboarding (create business) | Ready with caveats | PROVEN-LIVE (deleted-user case via SQL on dev); TESTED | Setup checklist yes; the onboarding form itself no | Feature 3 | Industry list is hard-coded; `industry_presets` table is empty on dev and prod | Create a business on a phone |
| 4 | Invites / joining a team | Ready with caveats | PROVEN-LIVE (real browser 2026-10-12; suite 04 20/20 live; Playwright invite → accept → staff Today) | Yes | Feature 4 | Invite token is in the URL query (can land in logs) | Invite a receptionist, accept on another device |
| 5 | Roles & permissions | Ready | PROVEN-LIVE (HTTP per role against every main table; branch-scoped custom role) | **No** (Roles screen) | Feature 5 | Solo "owner only" not enforced | Create a custom role on Business plan |
| 6 | Super admin | Ready | PROVEN-LIVE (real 2FA session, all 13 admin actions); prod has 1 super admin with verified 2FA | Yes (web, 2026-10-06 round) | Feature 6 | Search-by-owner-email fix on dev only | Sign in to `/admin` with code; assign a plan |
| 7 | Plans / trial / billing | Ready with caveats | PROVEN-LIVE (trial lifecycle on dev) | Yes for billing/admin screens (older round) | Features 7/8 | **Manual billing only** (no payment provider); period-end lock is on dev only; migration-order trap (Part 2) | Let a test trial expire; confirm the lock screen |
| 8 | Services & categories | Ready with caveats | PROVEN-LIVE (hidden-service leak proven and fixed on dev); TESTED | **No** (new Categories drawer never clicked) | Feature 9 | Prod still leaks hidden services on the website | Create category, service, branch price |
| 9 | Staff & schedules | Ready with caveats | PROVEN-LIVE (DST shift proven; orphan-booking checks); TESTED | Partly ("Add me as staff", login link via Playwright); new conflict warnings **No** | Feature 10 | Fixes on dev only | Reduce hours for someone with a future booking; expect a warning |
| 10 | Branches, hours, holidays, rooms | Ready with caveats | PROVEN-LIVE (branch RLS with real custom role); TESTED | Partly (Location edit via Playwright); new warnings **No** | Feature 11 | Fixes on dev only; extra branches are not billed automatically | Add a holiday over a booked day; expect a warning |
| 11 | Booking settings & booking form | Ready with caveats | TESTED (suites 06/08); setup checklist PROVEN-LIVE in a browser | Partly | ⚠ none | **Booking-form answers are never shown to staff** in the dashboard (code search confirms) | Add a custom question, book, look for the answer |
| 12 | Public booking page + guest manage link | Ready with caveats | PROVEN-LIVE (40-check HTTP smoke; Playwright full bookings at 2 locations; manage link over HTTP) | Booking yes; **cancel/reschedule dialogs on the manage page No** | ⚠ **NEVER AUDITED** | No confirmation email until email is set up; clients without email get nothing | Book from your phone; open the manage link; cancel |
| 13 | Calendar & appointments | **Risky** | TESTED (suite 12: 153/153); iOS simulator screenshot of Day view | **No** for create/detail drawers | ⚠ **NEVER AUDITED** | **No reschedule/edit from the dashboard** (`useUpdateAppointment` is not used by any screen); raw error text; no branch switcher on mobile Today/Calendar | Create, approve, complete, no-show, cancel, reopen |
| 14 | Clients | Ready with caveats | TESTED (suites 13/28/31); list screenshot on iOS simulator | **No** for profile, forms, archive | ⚠ **NEVER AUDITED** | Raw error text in list, form and profile | Add, edit, archive a client; check a Staff login cannot see phone/email |
| 15 | Invoices / payments / credit notes / tax | Ready with caveats | TESTED (310 SQL assertions + real 3-session concurrency test) | **No** (Phase 4/5 manual test was postponed and never done) | ⚠ **NEVER AUDITED** | Raw error text; credit notes by amount only; a 0-total invoice cannot be issued; no PDF on native | Draft → issue → pay → partial credit note → print |
| 16 | Commission | Risky | TESTED (suite 19, concurrency script) | **No** | ⚠ **NEVER AUDITED** | Raw error text on Rules tab | Set a 10% rule, pay an invoice, check earnings |
| 17 | Reports (basic & advanced) | Ready with caveats | TESTED; web print checked by browser emulation | **No** | ⚠ **NEVER AUDITED** | Top-service revenue ignores credit notes; packages report not built | Compare report totals with your invoices |
| 18 | Reviews | Ready with caveats | TESTED (suite 16, 419/419) | **No** | ⚠ **NEVER AUDITED** | Review link email depends on email setup; no UI to remove a review | Complete an appointment, open the review link, submit |
| 19 | Website builder & public site | Ready with caveats | TESTED; leak fix PROVEN-LIVE on dev | **No** (editor) | ⚠ **NEVER AUDITED** (only touched by Feature 9) | Prod leaks hidden services until migrations are pushed | Publish a site; open `/<slug>` on a phone |
| 20 | Email notifications, reminders, push | **Not ready on prod** | PROVEN-LIVE up to Resend on dev; one real email reached the Resend owner's inbox; **no delivery to an outside inbox proven** | No | ⚠ **NEVER AUDITED** | Resend domain and custom SMTP needed; no bounce handling; rescheduled/cancelled emails have no manage link; native push never on a device | Book with an outside email; receive confirmation and reminder |
| 21 | SMS | **Off at launch** | CODE-READ | n/a | ⚠ none | Off only in the UI; server would still try if a flag were set (no Twilio keys, so it fails) | Nothing |
| 22 | Embed widget | **Off at launch** | CODE-READ; framing blocked by `frame-ancestors` header | n/a | ⚠ none | Off only in the UI | Nothing |
| 23 | Packages & sessions (add-on) | Ready with caveats | TESTED (suite 22) | Not recorded (treat as No) | ⚠ **NEVER AUDITED** | Raw error text; no packages report; no badge on calendar rows | Sell a package on an invoice; use a session |
| 24 | Inventory (add-on) | Ready with caveats | TESTED; one real low-stock email delivered | Not recorded (treat as No) | ⚠ **NEVER AUDITED** | Raw error text; partial credit does not restore stock | Sell a product; watch stock drop |
| 25 | Files & photos (add-on) | Ready with caveats (web) | PROVEN-LIVE (HTTP: private bucket refuses direct access) | Not recorded | ⚠ **NEVER AUDITED** | PDF upload on native needs a device test; files stay in storage after a business is deleted | Upload a photo and a PDF to a client |
| 26 | Forms & consent (add-on) | Ready with caveats | TESTED + HTTP (single-use signing link) | **No** (signing screen) | ⚠ **NEVER AUDITED** | No PDF of a signed form | Send a consent form, sign on a phone |
| 27 | Client portal (add-on) | Ready with caveats | PROVEN-LIVE (53 HTTP checks, real sign-in email) | **No** (cancel / reschedule / book / sign-out buttons) | ⚠ **NEVER AUDITED** | No staff screen for customer sessions | Customer signs in, cancels, re-books |
| 28 | Multi-branch | Ready with caveats | PROVEN-LIVE (picker in a browser; branch RLS live) | Yes (booking picker) | Partly via Feature 11 | No switcher on mobile Today/Calendar; extra branches billed by hand | Switch branch on desktop; check numbers change |
| 29 | GDPR export / erase | Ready with caveats | TESTED (suite 29, 72/72) | Partly (erase dialog, requests list on web) | ⚠ **NEVER AUDITED** | **Suite 30 (real HTTP + storage) never run**; Export download never clicked | Export a throwaway client; erase it |
| 30 | Account settings / delete account | Ready with caveats | PROVEN-LIVE (HTTP 15/15) | Partly | ⚠ none | Email-change confirm link never seen (rate limit) | Change password; delete a throwaway account |
| 31 | Dashboard shell & header | Ready with caveats | Screenshots web 375/768/1280 + iOS simulator | Yes (screens), Android **never run** | ⚠ none | Android never run | Use the app on an Android phone in Chrome |
| 32 | Landing page / SEO / PWA | Ready with caveats | PROVEN-LIVE today: `https://wapee.online` answers 200, private routes send `noindex` | Yes (screenshots) | ⚠ none | Placeholder app icons; PWA install never tested on a real phone | Install the PWA on Android and iPhone |

---

## PART 2 — Production vs dev gap

### 2.1 Migrations on dev not on production
Production's latest applied migration is `20261024100500`; it has 152 applied, and the repo has 159.

| File | Older than prod's latest? | What it does |
|---|---|---|
| `20261014104921_list_businesses_search_owner_email.sql` → **renamed 2026-10-16 to `20261024160000_…`** | was YES; fixed | Super admin can find a business by the owner's email |
| `20261014140132_enforce_current_period_end.sql` → **renamed 2026-10-16 to `20261024160100_…`** | was YES (see 2.2); fixed | Paid plan locks when its period ends |
| `20261024110000_website_services_bookable_online.sql` | no | Website stops showing services hidden from online booking |
| `20261024120000_archive_staff.sql` | no | Archiving staff with future bookings is refused |
| `20261024130000_schedule_appointment_conflicts.sql` | no | Warnings when cutting hours or adding time off |
| `20261024140000_branch_appointment_conflicts.sql` | no | Warnings when cutting branch hours or adding closures |
| `20261024150000_archive_resource.sql` | no | Archiving a room with future bookings is refused |

### 2.2 New finding: the period-end migration would be undone by a from-empty rebuild — FIXED 2026-10-16 (renamed; replay verified)
`20261014140132` redefines `set_business_status`. `20261020110000_suspended_login_block.sql` also defines it and sorts later by filename. When migrations run in filename order (CI, a new environment, a disaster rebuild), the older body wins. It loses the "clear a stale period end when re-activating" fix, and nothing errors (`check:migrations` only checks for failures). On dev it works only because the file was applied last in real time.

- `supabase db push --include-all` on prod today would give the correct result, because it applies the missing files after everything else. **But the repo would still rebuild wrongly.**
- **Recommendation:** rename both files to timestamps after `20261024150000` (for example `20261024160000_…` and `20261024160100_…`). Then fix dev's history with `supabase migration repair`. That needs your sign-off, because it edits `schema_migrations`.

### 2.3 Dev's own migration history does not match the files (trap) — FIXED 2026-10-17 (repair run on dev; 159/159 matched, schema fingerprint unchanged)
Dev records 7 migrations under different version numbers than their filenames:
- `20261024100000` / `20261024100500` are recorded as `20261013083426` / `20261013083516`.
- `20261024110000…150000` are recorded as `20261014143620`, `20261015175756`, `20261015181336`, `20261015185038`, `20261015185044`.

A `supabase db push` to dev would try to re-run them. That is probably harmless (they are `create or replace`), but it would leave duplicate history rows. Reconcile this together with 2.2, with your sign-off.

### 2.4 Code on dev not on main (13 commits)
| Commit | Plain meaning |
|---|---|
| `08c0544`, `97e54d9` | Feature 1 audit report (docs) |
| `0b1d87d` | Login/signup screens show friendly errors instead of raw server text |
| `2b62836` | Password-reset link works again (also for 2FA admins) |
| `70c82c2` | Onboarding handles a deleted account cleanly |
| `a3a126b` | Invite errors are translated |
| `dbd206f` | Role/branch pickers only offer what the server will accept |
| `b020dfa` | Test-suite fix only |
| `a5763c5` | Super admin search by owner email (+ migration) |
| `388f0ed` | Paid period end now locks the business (+ migration) |
| `fbb32c8` | Services: category screen, friendly errors, website leak fix (+ migration) |
| `c0028a2` | Staff/schedule: never orphan a booking, DST time-off fix (+ 2 migrations) |
| `a7d10f8` | Branches: never orphan a booking on hours/closures/room archive (+ 2 migrations) |

Production web (`wapee.online`, built from `main`) therefore has none of these fixes.

### 2.5 Edge Functions
Both projects have the same 17 functions. No function source changed in git after 2026-10-10, and prod's functions were deployed on 2026-10-11, so **prod runs the current code**. Nine bundle hashes differ between dev and prod (`account`, `client_files`, `gdpr`, `get_review_request`, `get_website`, `sign_form`, `submit_review`, `unsubscribe`, `validate_widget`), most likely bundler differences. An optional redeploy from `dev` would remove the doubt.

### 2.6 Dashboard settings and secrets (not visible from code; status as far as can be seen)
| Item | Prod status | Evidence |
|---|---|---|
| `custom_access_token_hook` (suspended login) | **Unknown: must be checked** | Not visible from SQL; required (`docs/pre-launch-checklist.md` B2.8) |
| Custom SMTP for auth emails | **Unknown / probably not set** | Needed or real users never get verification emails |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | **Unknown** | Not listed (listing prints digests) |
| Vault `outbox_worker_url` | **Present on prod** | Seen today. The setup doc says to leave it unset until Resend works; if Resend is not ready, emails retry 5 times and then die. Check this. |
| TOTP / MFA | On (1 verified factor on prod) | SQL count |
| Site URL / redirect URLs, password length 8 | Unknown | Dashboard only |
| Leaked-password protection | Off (needs Pro) | `_handoff` |
| Backups / PITR | **None (Free plan)** | `_handoff` |
| Other Edge secrets (`PUBLIC_SITE_URL`, salts, VAPID, unsubscribe key) | Set 2026-10-11 | `docs/production-setup.md` |
| Prod data | 1 trialing business, 3 users, 0 appointments, 1 super admin | SQL count. Confirm whether this is test data; `docs/prod-test-data-wipe.sql` exists locally. |

### 2.7 Exact ordered steps to bring prod up to date
1. **Decide 2.2 / 2.3** (recommended: rename the two older files, repair dev history). Commit on `dev`.
2. `npm run check:migrations` (needs Docker/Colima): must show 159 applied, 0 failed.
3. `npx tsc --noEmit && npm run lint && npm test` on `dev`.
4. **You say "merge"**, then merge `dev` → `main` (CLAUDE.md §6 command). Vercel rebuilds `wapee.online` from `main`; confirm the deploy finished.
5. In `~/wapee-prod-cli` (check `project-ref` = `bvnurpuqrcwfqguxniio`): `supabase db push --linked`. Never `--include-seed`. Use `--include-all` only if you chose not to rename.
6. Run `scripts/schema-fingerprint.sql` on dev and prod; every category must match except vault names.
7. Run security + performance advisors on prod; only the accepted items in `docs/security-review.md` may remain.
8. Optional: `supabase functions deploy --use-api --project-ref bvnurpuqrcwfqguxniio` (removes the hash doubt).
9. Dashboard: turn **on** the Custom Access Token hook, then suspend a throwaway business and confirm sign-in is refused.
10. Email: verify the `mail.wapee.online` domain in Resend, set `RESEND_*` secrets, configure custom SMTP for auth, then do one real booking to an outside inbox.
11. Upgrade to Supabase **Pro**: backups, leaked-password protection, no idle pause.
12. Run `npm run smoke:public` once against prod with a throwaway business (it spends the 10-per-hour booking budget).

---

## PART 3 — Open issues (severity ranked)

| # | Severity | Issue | Source | Recommendation |
|---|---|---|---|---|
| 1 | **Blocker** | No backups until Supabase Pro; Free plan can also pause the project | `_handoff`, pre-launch A3/B6.1 | **Fix before launch** |
| 2 | **Blocker** | Email to customers and auth emails not proven on prod (Resend domain, custom SMTP) | notifications.md, pre-launch A6/B2.1 | **Fix before launch** |
| 3 | **Blocker** | Prod is missing 7 migrations + 13 commits of fixes (incl. website leaking hidden services) | Part 2 | **Fix before launch** |
| 4 | **High → fixed on dev 2026-10-16** | Migration ordering: a from-empty rebuild silently loses the period-end fix | Part 2.2 (new) | **Fix before launch** |
| 5 | **High → fixed on dev 2026-10-16** | No dashboard reschedule/edit of an appointment | launch-test-checklist, confirmed in code today | **Fix before launch** (clinics move bookings daily) |
| 6 | **High** | Most UI never clicked (calendar drawers, invoices, clients profile, commission, add-ons, portal dialogs) | every context file | **Before launch:** founder runs Part 5 |
| 7 | **High** | Suspended-login hook must be ON in prod dashboard (fail-open, otherwise only a 30-second client check) | auth.md, F6-01 | **Before launch** (one toggle + test) |
| 8 | **High** | No monitoring/alerts (Edge errors, dead emails, cron not running) | pre-launch B6.2 | **Before launch**, at least basic |
| 9 | Medium → **Calendar / Clients / Invoices fixed on dev 2026-10-16**; rest open | Raw server error text in ~25 places: Calendar (`DayView`, `TodayScreen`, `CreateAppointmentForm`, `AppointmentDetailDrawer`, `AppointmentListView`), Clients (`ClientListView`, `ClientForm`, `ClientProfileScreen`), Invoices (`InvoiceEditor`, `InvoiceDrawer`, `PaymentForm`, `InvoiceListView`, `InvoicePrintScreen`, `ReportsScreen`, `AppointmentInvoiceButton`), `SetupChecklist`, Commission `RulesTab`, `ScheduleTab`, Packages, Inventory, Files, Forms | grep today | **Before launch** for calendar/clients/invoices; after launch for add-ons |
| 10 | Medium → fixed on dev 2026-10-16 | Booking-form answers never shown to staff | launch-test-checklist, confirmed in code | **Before launch** for clinics (intake answers matter) |
| 11 | Medium | Clients without email get no notifications (SMS is off) | notifications.md | **Accept, with mitigation:** turn on "require client email" in Booking settings for each clinic branch (the toggle already exists) |
| 12 | Medium | GDPR suite 30 (real HTTP + storage) never run | qa/SUMMARY | **Before launch**: run on dev with its seed/cleanup scripts |
| 13 | Medium | Solo "owner only" not enforced (Solo can invite staff) | F1-04 | **Accept**: the landing page no longer promises it; update product doc §10 |
| 14 | Medium | Widget and SMS "off" only in the UI (F1-02/F5-01) | qa/SUMMARY | **Accept for launch**: framing is blocked by headers and there are no Twilio keys. Add a server check before turning either on. |
| 15 | Medium | Android never run; iOS only on simulator | `_handoff` | **Before launch** for Android-phone users of the PWA: test in Chrome on Android. Before the store release for native apps. |
| 16 | Medium | Dev migration history mismatch (7 rows) | Part 2.3 | Fix with #4 |
| 17 | Low | Invite token in URL query, not fragment | Feature 4 | **After launch** (risk: shows in server logs; link is single-use, 7 days) |
| 18 | Low | Industry presets not implemented (`industry_presets` empty; onboarding uses a hard-coded list) | Feature 3 | **Accept** |
| 19 | Low | Leaked-password protection off | security-review M6 | Turn on together with #1 |
| 20 | Low | Rescheduled/cancelled emails carry no manage link; no resend-manage-link button | notifications.md, launch checklist | After launch |
| 21 | Low | No branch switcher on mobile Today/Calendar | plan-features-ui | After launch |
| 22 | Low | Credit notes by amount only; 0-total invoice cannot be issued; top-service revenue ignores credit notes | invoices.md | Accept |
| 23 | Low | Email spam vector (anyone can book with someone else's email; caps are the only brake) | notifications.md | Accept + monitor |
| 24 | Low | No bounce/complaint webhooks | pre-launch B4.2 | After launch |
| 25 | Low | Business delete leaves files in storage | files-photos.md | After launch |
| 26 | Low | CI workflow written, never run | pre-launch B7.1 | After launch |
| 27 | Low | Placeholder app icons | `_handoff` | Before public launch (OK for a pilot) |
| 28 | Owner | Legal texts (privacy, terms, DPA), refund page lawyer review | pre-launch A5 | **Before launch** |
| 29 | Owner | Manual billing: no payment provider; extra branches billed by hand | business-flows.md | Accept for a pilot |

---

## PART 4 — Launch blockers vs nice-to-have

### Must be done before the first real clinic (ranked)
1. Supabase Pro (backups, no pause, leaked-password check).
2. Email working on prod: Resend domain + secrets + custom auth SMTP, then proven with a booking to an outside inbox.
3. Fix the migration order (Part 2.2), then push dev → main → prod (Part 2.7).
4. Turn on the suspended-login hook and test it.
5. Build dashboard reschedule (move an appointment to another time or staff).
6. Show booking-form answers on the appointment and the client profile.
7. Replace raw error text in Calendar, Clients and Invoices.
8. Founder runs the P0 items in Part 5 on a real Android phone and a laptop.
9. Basic alerts: dead emails, Edge Function 5xx, uptime of `wapee.online`.
10. Legal pages and DPA final.

### Nice to have (after the pilot starts)
Invite token in fragment, mobile branch switcher, manage link in reschedule emails, bounce webhooks, add-on error messages, CI, final icons, packages report, per-line credit notes.

### Could a clinic use this tomorrow? What breaks first?
**No, not tomorrow.** If a clinic started today on production:
1. **Within minutes:** patients book, but get **no confirmation or reminder email** (unless email was set up outside what this repo shows). The owner's own signup email may also not arrive.
2. **Within the first hour:** reception needs to move a patient to 3 pm. **There is no button for it**; they must cancel and re-book, and the patient gets a cancellation.
3. **Same day:** intake answers patients typed on the booking form are **not visible** to staff.
4. **Any time:** a network or server error shows English developer text in Calendar/Invoices instead of a clear message.
5. **Risk in the background:** no backups. One bad mistake or Supabase incident means data loss.

The core is solid: no double-booking, correct time zones, safe money records, and data isolation between businesses (tested live). What's missing is mainly operations and setup, plus two everyday features.

---

## PART 5 — Manual test checklist (for the founder)

Do this on **production after the push** (Part 2.7), or on dev first. Use a **phone (Android Chrome)** and a **laptop (Chrome, full width)**. Create throwaway test accounts with Gmail "plus" addresses (e.g. `you+owner@gmail.com`). Tick each item; write down anything that looks wrong and take a screenshot.

**Ordered by risk. P0 = must pass before a pilot.**

### A. Owner — first day (P0)
1. Laptop: go to `wapee.online` → "Start free trial" → sign up. **Expect:** a verification email arrives within 2 minutes (check spam). Click it, then you land in onboarding.
2. Fill in business name, country, time zone, currency. **Expect:** Today screen with a "Get ready for your first booking" card at 0 of 6.
3. Follow each card button: set opening hours, add a service with a price, tap "Add me as staff", assign the service. **Expect:** the counter goes up; "Copy booking link" unlocks.
4. Settings → Booking: add a custom question ("Any allergies?"), turn on "require client email". Save.
5. Phone: open the copied link `/<slug>/book`. Book a slot with a different email. **Expect:** confirmation screen with time, address, time zone; **a confirmation email arrives** with a manage link.
6. Laptop: Calendar. **Expect:** the booking appears at the correct local time. Open it. **Check:** can you see the allergy answer? (Expected today: NO, known gap #10.)
7. Try to move the booking to another time. (Expected today: **no way to do it**, known gap #5.)
8. Calendar → create a booking yourself at the same time for the same staff. **Expect:** refused with a clear message (no double-booking).
9. Create a walk-in. Mark one appointment Completed, one No-show, cancel one. **Expect:** status colours change; nothing shows English developer text.
10. Phone: open the manage link from the email → Cancel → confirm. **Expect:** cancelled; the slot is free again on the booking page.
11. Phone: book again, open manage link → Reschedule → pick a new time → confirm. **Expect:** new time shows in Calendar.
12. Next day check: **a reminder email arrived** before the appointment.

### B. Money (P0)
13. Open a completed appointment → create invoice → add a line → Issue. **Expect:** invoice number like `ABC-1`, then `ABC-2` for the next (no gaps).
14. Add a partial payment, then the rest. **Expect:** status Paid.
15. Create a credit note for part of it. **Expect:** a separate credit-note number; the original invoice is unchanged.
16. Print the invoice (web). **Expect:** a full page, not cut off.
17. Reports: check today's revenue equals what you invoiced minus the credit.

### C. Team and roles (P0)
18. Team → invite `you+recep@gmail.com` as Receptionist. Accept on the phone. **Expect:** lands on the dashboard; "You have joined".
19. As Receptionist: can create bookings and invoices; **cannot** issue a credit note or see Settings → Billing.
20. Invite `you+staff@gmail.com` as Staff, linked to a staff profile. **Expect:** Staff sees only their own appointments on Today; cannot see clients' phone/email.
21. Invite a Manager (Business plan or trial). **Expect:** can manage services and staff, cannot change the Owner.
22. As Owner, try to remove yourself as the only Owner. **Expect:** refused.

### D. Schedule safety (P1)
23. Give the staff member a future booking, then reduce their hours to exclude it. **Expect:** a warning with a count; saving still allowed; the booking is still there.
24. Add a holiday on a booked day (branch). **Expect:** warning with a count.
25. Try to archive the staff member with a future booking. **Expect:** refused with a reason.
26. Turn on rooms, add a room, give it a booking, try to archive it. **Expect:** refused.
27. Time off "whole day" on a date. **Expect:** the booking page shows no slots that whole local day.

### E. Clients (P1)
28. Add a client with phone. Add one with the same phone. **Expect:** duplicate warning.
29. Open the client profile. **Expect:** upcoming and past appointments, invoices.
30. Archive the client and then unarchive.
31. Owner: Export a throwaway client's data (file downloads). Erase it (type the name). **Expect:** the name is gone; invoices keep amounts.

### F. Plans, trial and super admin (P0 for super admin)
32. Super admin: sign in at `/admin` → enter the authenticator code. **Expect:** business list. Search by the owner's email (works after the push).
33. Assign a plan to the test business. **Expect:** the owner's Billing page shows the plan.
34. Suspend the test business. **Expect:** the owner cannot sign in ("This account is disabled"). Reactivate → can sign in again.
35. As a normal Owner, open `/admin`. **Expect:** not found.
36. Password reset: "Forgot password" for the owner and for the super admin. **Expect:** the email arrives, the new password works, the admin is asked for a code.

### G. Website and reviews (P1)
37. Website editor: add text and a photo, publish. Open `/<slug>` on the phone. **Expect:** looks right; services hidden from online booking are NOT shown (after the push).
38. Complete an appointment → the client gets a review email → submit 5 stars, then try 1 star. **Expect:** both accepted; the review shows on the website.

### H. Multi-branch (Business plan / trial, P1)
39. Add a second location with a different currency. **Expect:** the booking page shows a location picker; each location shows its own prices and currency.
40. Reports Overview: **Expect:** totals per currency, never added together.

### I. Add-ons (only if you will sell them, P2)
41. Packages: sell a 5-session package on an invoice, book, use a session. **Expect:** 4 left.
42. Inventory: sell a product. **Expect:** stock drops; a low-stock alert at the threshold.
43. Files: upload a photo and a PDF to a client. **Expect:** opens; disappears after deletion.
44. Forms: send a consent form; sign it on the phone. **Expect:** shows as signed; the link cannot be used twice.
45. Client portal: as a customer, request a sign-in link, view bookings, cancel one, book a new one, sign out.
46. Commission: set 10% for the staff member; pay an invoice in full. **Expect:** earnings show 10%.

### J. Mobile / desktop / PWA (P0 for Android Chrome)
47. Android phone: every screen above fits; bottom tabs; nothing hidden behind the system bar; hardware Back goes back one step (also inside the booking flow and the manage page).
48. Install the PWA (Add to Home screen). Open it. **Expect:** opens on Today; turn on notifications; get a push when a booking arrives.
49. Airplane mode: **Expect:** a "No internet connection" screen; it goes away when you are back online.
50. iPhone Safari: booking page and manage link work.

### K. Customer-only (no account, P0)
51. An invalid booking link shows a calm "not found", with no technical text.
52. Booking many times fast from one phone. **Expect:** after ~10 in an hour, a "try later" message.
53. Click "unsubscribe" in a booking email and press the button on the page. **Expect:** a confirmation page; that client stops getting those emails.

### Items carried over from earlier rounds that still need a real click
- Feature 1/2/3: wrong-password message, two-tab behaviour, reset link for a 2FA admin, onboarding form on a phone.
- Phase 3: guest manage page **cancel and reschedule confirm dialogs**.
- Phase 4/5: the whole **Calendar create/detail drawers** and **invoice** flow (postponed test, never done).
- Phase 9B: Roles matrix editing, Members manage drawer, Commission tabs, Advanced reports CSV/email schedule.
- Phase 10: portal cancel/reschedule/book/sign-out; forms signing; files PDF on native.
- Phase 11: GDPR Export file download, "Run export"/"Run erase" from Data requests, portal "Request erasure".
- Account: email-change confirmation link.
- Features 9–11: Categories drawer, the new conflict warnings, archive refusals (items 23–26 above).

---

## PART 6 — Cleanup proposal (NOT executed)

Everything below is still in git history after deletion: `git log -- <path>` and `git checkout <commit> -- <path>` bring it back. Deleting from the working tree does **not** shrink the repo; only a history rewrite would, and that is forbidden by CLAUDE.md §6. Nothing listed here is a migration, a test, a context file, CLAUDE.md, or a source-of-truth doc.

### A) Safe to delete — DONE 2026-10-16 (the 6 screenshots below were deleted)
| Path | Size | Why safe | Referenced by |
|---|---|---|---|
| `docs/screenshots/verification/b1-fresh.png` | 124 KB | Exact duplicate of `docs/screenshots/setup-checklist-1440.png` (same md5) | Only the folder is named in `docs/business-flows.md` |
| `docs/screenshots/verification/c3-solo-saved.png` | 71 KB | Exact duplicate of `c1-solo-summary.png` | Folder only |
| `docs/screenshots/verification/c3-team-saved.png` | 73 KB | Exact duplicate of `c1-team-summary.png` | Folder only |
| `docs/screenshots/location-375.png`, `location-1440.png`, `settings-hub-solo-1440.png` | 192 KB | One-off task screenshots, no reference anywhere | None |
| Local only, not in git: `dist/` | build output | Ignored by `.gitignore`; regenerated by `npm run build:web` | n/a |

Note: removing a duplicate breaks the "screenshot proves this" trail only if someone links the exact filename; nobody does today.

### B) Archive (move to `docs/archive/`)
| Path | Size | Why | Referenced by |
|---|---|---|---|
| `docs/screenshots/guide/` | 2.1 MB | Screenshots of the product guide; no reference | None |
| `docs/screenshots/landing/` | 3.0 MB | Landing screenshots | `context/landing.md` changelog (update the path if moved) |
| `docs/screenshots/verification/` (rest) | ~1.8 MB | Proof of the 2026-10-22 round | `docs/business-flows.md` (update path) |
| `docs/screenshots/setup-checklist-*.png` | 320 KB | Proof screenshots | `context/today.md` (update path) |
| `docs/qa/phase-1…6*.md`, `docs/qa/SUMMARY.md` | ~150 KB | Phases 1–6 audit, now **superseded** (its fixes shipped; this report replaces the summary) | `20261023090000` migration comment mentions `qa/phase-` (comment only, harmless) |
| `docs/launch-test-checklist.md` + `docs/launch-test-checklist/` (44 files) | ~420 KB | 567 cases from 2026-10-09; partly stale; Part 5 replaces it for the founder. **Keep if you still use the interactive artifact.** | `context/_handoff.md`, each other |
| `docs/manual-test-guide.md` | 88 KB | Older manual guide, overlaps Part 5 | `_handoff`, `launch-test-checklist.md`, `pre-launch-checklist.md` |
| `docs/feature-inventory.md` | 44 KB | Overlaps Part 1 | `go-live-plan.md`, `launch-test-checklist.md` |
| `docs/design-tokens.json` | 16 KB | No reference anywhere (the theme lives in `src/lib/theme`). **Check with the designer first.** | None |

Moving these changes no behaviour. Fix the few doc links in the same commit.

### C) Keep
- `docs/Wapee_Product_Overview_v2.md`, `docs/Wapee_Build_Plan.md`, `docs/DESIGN_GUIDE.md`, `docs/reference/*`: source of truth (CLAUDE.md).
- `docs/wapee-product-guide.html`: required by CLAUDE.md; `scripts/check-guide.mjs` reads it.
- `docs/production-setup.md`, `docs/go-live-plan.md`, `docs/pre-launch-checklist.md`, `docs/vercel-setup.md`, `docs/security-review.md`, `docs/performance-review.md`, `docs/business-flows.md`: referenced by context and migrations, still current.
- `docs/post-launch-backlog.md` (4 KB): no references, but it is a live backlog.
- `docs/qa/features/01-signup-login.md`: referenced by `context/auth.md`.
- `docs/prod-test-data-wipe.sql`: already **git-ignored and not committed**; local only. Keep or delete locally as you like; never commit it.
- All of `scripts/`: every file is used by `package.json` scripts or the docs (`check-migrations.sh`, `run-sql-suites.sh`, `schema-fingerprint.sql`, `smoke-public.mjs`, `build-landing.mjs`, `ogImage.mjs`, `generate-*.mjs`, `strip-dev-routes.mjs`, `check-guide.mjs`).
- `supabase/tests/*` including the HTTP `.mjs` and seed/cleanup files.
- `assets/`, `public/` (icons are placeholders; replace, don't delete).
- Dependencies: no clearly unused package found. `expo-system-ui`, `react-native-worklets`, `react-dom` and `expo-dev-client` have no direct import but are platform/peer requirements of Expo, Reanimated and web.

### Repo hygiene checks
- No tracked file matches `.gitignore`. `.env`, `ios/`, `dist/`, `.vercel/` and `.expo/` exist locally and are all ignored and not committed.
- Not checked: dead code inside `src/` (unused exports). Running a tool such as `knip` would need a new dev dependency, so ask first. One known unused export is `useUpdateAppointment`: **don't delete it**, it is the hook that dashboard reschedule needs (issue #5).
