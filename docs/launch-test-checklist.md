# Launch test checklist (manual)

Built from the CODE on branch `dev` (routes in `app/`, screens in `src/`, RPCs / RLS in `supabase/migrations`, Edge Functions, `src/config/permissions.ts`, `src/config/launch.ts`). Docs and context files were used only as hints; where they disagree with the code, see **Doc vs code mismatches**.

**567 cases** in 43 areas · P0 212 · P1 326 · P2 29 · 543 runnable on the dev build, 24 need a production build or a real device.

Priorities: **P0** launch blocker (security, money, data loss, booking correctness) · **P1** core behaviour · **P2** polish / edge.

An interactive version of the same cases (filters, pass / fail / blocked / skip, notes, progress, failure report) is published as an Artifact: https://claude.ai/artifact/M2rEHAy5j39v4SFsWH7Jji (private until shared from its Share menu). Its counts match this file.

## Contents

1. [Setup](#setup)
2. [Actors](#actors)
3. [Areas and counts](#areas-and-counts)
4. [Counts per actor](#counts-per-actor)
5. [Doc vs code mismatches](#doc-vs-code-mismatches)
6. [Needs production build / real device](#needs-production-build--real-device)

## Setup

### Where to test
| Item | Value |
|---|---|
| App (dev) | `npm run web` (Expo web, e.g. `http://localhost:8090`). Public pages: `/<slug>`, `/<slug>/book`, `/<slug>/manage#token=…`, `/<slug>/review#token=…`, `/<slug>/sign#token=…`, `/<slug>/portal`. On dev the legal pages are `/privacy.html` and `/terms.html` (pretty URLs need the production host). |
| Backend | Dev Supabase project only (the one in `context/_handoff.md`). Never run destructive tests on production. |
| Production-only checks | See the section "Needs production build / real device" (area `PROD` and every case marked "prod/device"). |

### Accounts (never write passwords anywhere — ask the owner for them)
| Name used in this checklist | What it is |
|---|---|
| **owner dev account** | Owner of *Nova Hair Studio* (`nova-hair-studio`, America/New_York, on trial). Shared: non-destructive tests only. |
| **manager dev account** | Manager in Nova Hair Studio. |
| **receptionist dev account** | Receptionist in Nova Hair Studio. |
| **staff dev account** | Staff in Nova Hair Studio, linked to staff profile "Dev Staff". |
| **super admin dev account** | `is_super_admin`, TOTP enrolled (authenticator needed for aal2). Sign in WITHOUT entering the code to test the aal1 case. |
| Throwaway accounts (create yourself) | Gmail `+alias` addresses: Business owner, Team owner, Solo owner, KWD owner, expired-trial owner, suspended owner, custom-role member, two-branch member, multi-business member, 3+ invitees. Delete them after testing. |
| Test inbox for customer emails | `wapeeglobal@gmail.com` is the ONLY inbox that receives real emails on dev (Resend test sender). Use it as the CLIENT email for notification, portal and form-link tests. |

### Businesses to prepare
| Key | Plan / status | Locations (currency, timezone, prefix) | Add-ons | Used by |
|---|---|---|---|---|
| NOVA | trial (shared) | 1: USD, America/New_York | all (trial) | most role tests with the 4 dev accounts |
| QA-BIZ | **Business** (super admin assigns) | Main: USD America/New_York `MAI`; Karachi: PKR Asia/Karachi `KHI` | all on | multi-branch, two-branch member, custom roles, advanced reports, add-ons |
| QA-TEAM | **Team** | 1: GBP Europe/London | packages OFF, others on, custom roles OFF | gates, staff cap 5, commission |
| QA-SOLO | **Solo** | 1: JPY Asia/Tokyo (0 decimals) | none | gates, staff cap 1, JPY money |
| QA-KWD | trial | 1: KWD Asia/Kuwait (3 decimals) | all (trial) | KWD money, edge data |
| QA-EXPIRED | trial ended (super admin / SQL `trial_ends_at` in the past) | 1 | — | lock screen, rights while inactive |
| QA-SUSP | suspended (super admin) | 1 | — | suspended login block |

### Seed data per business (create through the UI where possible)
- Opening hours Mon–Sat 09:00–17:00; one holiday; one staff time off; one break.
- Services: 30 min priced, 60 min with 15 min buffer, a free (0) one, one not bookable online, one inactive.
- Staff: 3 (2 with logins, 1 without), assigned to services and the location.
- Booking settings variants as each case needs (manual confirmation, people per slot 3, notice 120 min, window 7 days, cutoff 24 h).
- Custom fields: all 5 types, one required, one sensitive, one for a single service.
- Clients: 25+ (one with the test inbox email, one without email, one with emoji name, one with Arabic name, one 160-char name).
- Appointments in every status (pending, confirmed, completed, no-show, cancelled), one walk-in, some today, some next week.
- Invoices: draft, issued unpaid, partial, paid, credited; one with discount; one with package + product lines.
- Add-on data: 2 packages, 3 products (one at its alert level), a consent form + an intake form, photos with and without consent.
- Website: all 7 sections filled, published; 13 reviews (for the 12-featured cap).

### Tools
Two browsers or a private window (two users at once) · Chrome DevTools (network throttling, offline, responsive mode at **375 / 768 / 1024 / 1440**, Application tab) · an authenticator app (super admin) · read-only SQL access to the dev project for audit/DB checks (ask the owner) · a phone for device cases.

### Rules while testing
- Public `create_booking` allows **10 bookings per hour per IP** (5 per phone per day, 30/h and 120/day per business). Run rate-limit cases LAST or from another network.
- Emails take up to ~2 minutes (worker every minute, reminders every 5 minutes).
- Record every case as **Pass / Fail / Blocked / Skip** with a note. A "KNOWN GAP" in a case means the code does not have the feature yet: mark it Fail (gap) or Blocked, never Pass.
- Bug report: ID, screen, actor, steps, expected, actual, screenshot (the artifact can copy failures in this format).

## Actors

Each case names the actor who runs it. 'Must be refused' lines say what the OTHER actors (or bad input) must not be able to do.

| Code | Actor | Cases |
|---|---|---|
| `SA` | Super admin (TOTP, aal2) | 19 |
| `SA1` | Super admin, password only (aal1) | 2 |
| `OWN` | Owner (business active: trial or plan) | 183 |
| `OWN-T` | Owner on trial | 11 |
| `OWN-X` | Owner, trial ended / inactive | 6 |
| `OWN-S` | Owner, business suspended | 3 |
| `MGR` | Manager (branch-scoped) | 33 |
| `REC` | Receptionist | 47 |
| `STF` | Staff (own scope) | 62 |
| `CUS` | Custom role (limited permissions) | 4 |
| `SOLO` | Owner on Solo plan | 10 |
| `TEAM` | Owner on Team plan | 20 |
| `BIZ` | Owner on Business plan | 11 |
| `MULTI` | Member of two businesses | 3 |
| `TWOBR` | Member of two branches, different roles | 1 |
| `INVITEE` | Invited person | 6 |
| `GUEST` | Guest customer (no account) | 47 |
| `PORTAL` | Portal customer (email link) | 10 |
| `ANON` | Signed-out visitor | 23 |
| `OTHER` | Signed-in user of another business | 4 |
| `ANY` | Any signed-in member | 17 |
| `TST` | Tester (device / platform / build check) | 45 |

## Areas and counts

| Area | File | Cases | P0 | P1 | P2 |
|---|---|---|---|---|---|
| **AUTH** Auth, session and route guard | [auth.md](launch-test-checklist/auth.md) | 24 | 7 | 15 | 2 |
| **ACC** Account: change email, change password, delete account | [acc.md](launch-test-checklist/acc.md) | 11 | 2 | 8 | 1 |
| **ONB** Onboarding (create business) | [onb.md](launch-test-checklist/onb.md) | 9 | 1 | 7 | 1 |
| **ROLE** Roles, permissions and navigation gating | [role.md](launch-test-checklist/role.md) | 20 | 10 | 8 | 2 |
| **MEM** Members and invites | [mem.md](launch-test-checklist/mem.md) | 18 | 7 | 10 | 1 |
| **PLAN** Plans, billing, trial, lock screen, feature gating | [plan.md](launch-test-checklist/plan.md) | 15 | 4 | 11 | 0 |
| **ADM** Super admin | [adm.md](launch-test-checklist/adm.md) | 18 | 5 | 11 | 2 |
| **SVC** Services, categories, rooms (resources) | [svc.md](launch-test-checklist/svc.md) | 12 | 2 | 9 | 1 |
| **STF** Staff | [stf.md](launch-test-checklist/stf.md) | 7 | 1 | 6 | 0 |
| **SCH** Schedule: working hours, breaks, time off, branch hours, holidays | [sch.md](launch-test-checklist/sch.md) | 13 | 2 | 9 | 2 |
| **BKS** Booking settings, booking form (custom fields), live preview | [bks.md](launch-test-checklist/bks.md) | 15 | 3 | 11 | 1 |
| **BKP** Public booking page /<slug>/book | [bkp.md](launch-test-checklist/bkp.md) | 24 | 12 | 11 | 1 |
| **BKM** Guest manage page /<slug>/manage#token= | [bkm.md](launch-test-checklist/bkm.md) | 10 | 6 | 4 | 0 |
| **APT** Appointments and calendar | [apt.md](launch-test-checklist/apt.md) | 26 | 9 | 16 | 1 |
| **TOD** Today screen | [tod.md](launch-test-checklist/tod.md) | 6 | 0 | 5 | 1 |
| **CLI** Clients | [cli.md](launch-test-checklist/cli.md) | 12 | 5 | 7 | 0 |
| **INV** Invoices, payments, credit notes | [inv.md](launch-test-checklist/inv.md) | 21 | 14 | 6 | 1 |
| **REP** Reports: basic and advanced | [rep.md](launch-test-checklist/rep.md) | 11 | 1 | 10 | 0 |
| **COM** Commission (Team+) | [com.md](launch-test-checklist/com.md) | 6 | 2 | 4 | 0 |
| **BR** Multi-branch (locations) — Business plan | [br.md](launch-test-checklist/br.md) | 9 | 4 | 5 | 0 |
| **NOT** Notifications: emails, unsubscribe, settings, message log, push | [not.md](launch-test-checklist/not.md) | 20 | 4 | 14 | 2 |
| **REV** Reviews | [rev.md](launch-test-checklist/rev.md) | 9 | 3 | 6 | 0 |
| **WEB** Website editor and public website | [web.md](launch-test-checklist/web.md) | 12 | 2 | 10 | 0 |
| **PKG** Add-on: Packages and sessions | [pkg.md](launch-test-checklist/pkg.md) | 9 | 4 | 5 | 0 |
| **STK** Add-on: Inventory | [stk.md](launch-test-checklist/stk.md) | 8 | 1 | 7 | 0 |
| **FIL** Add-on: Files and photos | [fil.md](launch-test-checklist/fil.md) | 7 | 4 | 3 | 0 |
| **FRM** Add-on: Forms and consent | [frm.md](launch-test-checklist/frm.md) | 9 | 3 | 6 | 0 |
| **POR** Add-on: Client portal /<slug>/portal | [por.md](launch-test-checklist/por.md) | 10 | 6 | 4 | 0 |
| **GDPR** Data rights: export, erase, requests, delete business | [gdpr.md](launch-test-checklist/gdpr.md) | 7 | 4 | 3 | 0 |
| **SEC** Security checks a tester can do by URL / UI | [sec.md](launch-test-checklist/sec.md) | 13 | 11 | 2 | 0 |
| **LEG** Legal pages and LegalLinks | [leg.md](launch-test-checklist/leg.md) | 2 | 0 | 2 | 0 |
| **LCH** Launch switches (features OFF at launch) | [lch.md](launch-test-checklist/lch.md) | 2 | 2 | 0 | 0 |
| **OFF** Offline overlay | [off.md](launch-test-checklist/off.md) | 2 | 0 | 1 | 1 |
| **PWA** PWA (testable parts on the dev build) | [pwa.md](launch-test-checklist/pwa.md) | 2 | 0 | 0 | 2 |
| **NAV** App shell, navigation and branch switcher | [nav.md](launch-test-checklist/nav.md) | 6 | 1 | 4 | 1 |
| **RSP** Responsive layouts 375 / 768 / 1024 / 1440 | [rsp.md](launch-test-checklist/rsp.md) | 11 | 0 | 11 | 0 |
| **A11Y** Keyboard, focus and accessibility basics | [a11y.md](launch-test-checklist/a11y.md) | 5 | 0 | 2 | 3 |
| **STATE** Loading, empty and error states | [state.md](launch-test-checklist/state.md) | 7 | 0 | 7 | 0 |
| **EDGE** Data edge cases | [edge.md](launch-test-checklist/edge.md) | 10 | 3 | 5 | 2 |
| **PROD** Needs production build / real device (NOT testable on the dev web build) | [prod.md](launch-test-checklist/prod.md) | 22 | 8 | 14 | 0 |
| **DENY** Role denial matrix (every default role x every permission it lacks) | [deny.md](launch-test-checklist/deny.md) | 70 | 35 | 35 | 0 |
| **SCOPE** Scope checks: Own (Staff) and Branch (Manager / Receptionist) | [scope.md](launch-test-checklist/scope.md) | 24 | 24 | 0 | 0 |
| **GATE** Plan and add-on gates (feature must be hidden AND blocked) | [gate.md](launch-test-checklist/gate.md) | 13 | 0 | 12 | 1 |
| **Total** | | **567** | **212** | **326** | **29** |

## Counts per actor

A case can name more than one actor, so these add up to more than the total.

| Actor | Cases |
|---|---|
| Owner (business active: trial or plan) (`OWN`) | 183 |
| Staff (own scope) (`STF`) | 62 |
| Receptionist (`REC`) | 47 |
| Guest customer (no account) (`GUEST`) | 47 |
| Tester (device / platform / build check) (`TST`) | 45 |
| Manager (branch-scoped) (`MGR`) | 33 |
| Signed-out visitor (`ANON`) | 23 |
| Owner on Team plan (`TEAM`) | 20 |
| Super admin (TOTP, aal2) (`SA`) | 19 |
| Any signed-in member (`ANY`) | 17 |
| Owner on trial (`OWN-T`) | 11 |
| Owner on Business plan (`BIZ`) | 11 |
| Owner on Solo plan (`SOLO`) | 10 |
| Portal customer (email link) (`PORTAL`) | 10 |
| Owner, trial ended / inactive (`OWN-X`) | 6 |
| Invited person (`INVITEE`) | 6 |
| Custom role (limited permissions) (`CUS`) | 4 |
| Signed-in user of another business (`OTHER`) | 4 |
| Owner, business suspended (`OWN-S`) | 3 |
| Member of two businesses (`MULTI`) | 3 |
| Super admin, password only (aal1) (`SA1`) | 2 |
| Member of two branches, different roles (`TWOBR`) | 1 |

## Doc vs code mismatches

The code wins. Each row says which case exercises it.

| # | Document | Document says | Code does | Cases |
|---|---|---|---|---|
| 1 | docs/feature-inventory.md §1, §15 | Web Push (VAPID) is 'Not built'. | Built: `src/lib/push/webPush.ts`, `public/sw.js` push handler, `send_outbox` web-push path, `register_web_push_subscription`. | NOT-016, NOT-017, PROD-005, PROD-006 |
| 2 | docs/feature-inventory.md §2 | Account deletion and change email / password are 'Not built'. | Built: `/settings/account`, `/settings/delete-account`, `account` Edge Function, public `/delete-account`. | ACC-* |
| 3 | docs/feature-inventory.md §1 | Brand placeholders `app.wapee.com`, `wapee.site`, `com.wapee.app`, `support@wapee.com`. | `src/config/brand.ts`: `app.wapee.online`, `wapee.online`, `online.wapee.app`, `support@wapee.online`. | PLAN-001, AUTH-018 |
| 4 | context/account.md, context/notifications.md | Account and My notifications are for every member, including Staff. | The Settings nav item needs `settings.business` or `settings.booking`; Receptionist / Staff have no menu path to Account, My notifications or Delete my account (typing `/settings/account` works). The header avatar is a TODO placeholder. | ROLE-005, ACC-001, NAV-006 |
| 5 | context/account.md | Slug `delete-account` is reserved. | Reserved in the DB (`reserved_slugs`), but missing from `src/config/reservedSlugs.ts`, so the form only fails at the server. | ONB-003 |
| 6 | src/config/reservedSlugs.ts header ('Adding a new app route? Add it here') | Every app route is reserved. | `today`, `more`, `members`, `schedule`, `website`, `packages`, `inventory`, `commission`, `accept-invite`, `invoice-print`, `report-print` are in neither list: a business could take them and its website would be unreachable. | ONB-004 |
| 7 | docs/Wapee_Product_Overview_v2.md decision 13, §6.3 | Calendar: create / reschedule / cancel via form. | `update_appointment` RPC and `useUpdateAppointment` exist, but no screen uses them: no edit / reschedule / notes edit in the dashboard. | APT-020 |
| 8 | docs/Wapee_Product_Overview_v2.md decision 3, §6.1 | The business can resend the guest manage link from the dashboard. | `resend_manage_link` Edge Function exists; no UI calls it. | APT-021, NOT-009 |
| 9 | docs/Wapee_Product_Overview_v2.md §6.3 ('Services: name, category…') | Services have categories. | Category picker exists but there is no UI to create, rename or delete a category (`useCreateCategory` unused). | SVC-008 |
| 10 | docs/Wapee_Product_Overview_v2.md §10 plan table | Solo plan: default roles 'Owner only'. | Not enforced: a Solo business can invite Manager / Receptionist / Staff (only the 1-staff cap applies). | MEM-018 |
| 11 | docs/Wapee_Product_Overview_v2.md §7, §12 (sensitive fields gated) | Booking-form answers (incl. sensitive) are visible to permitted roles. | Answers are stored and RLS-gated but shown nowhere in the dashboard (no client/appointment view of answers). | CLI-012, APT-022 |
| 12 | context/website-reviews-widget.md (`branches.google_review_url`) | One Google review link per branch drives the review page button. | No UI field sets it (DB column only); the Google button only appears if set by SQL. | REV-009 |
| 13 | context/booking-public-page.md (Files table) | `app/(public)/[slug]/index.tsx` renders `BookingFlow`. | `/[slug]` is now the website; booking is `app/(public)/[slug]/book.tsx`. | BKP-* |
| 14 | context/clients.md (Known limits) and context/invoices.md (Known limits) | Client profile still shows an invoice placeholder. | `ClientInvoicesSection` is live on the profile (their own changelogs say so). | CLI-011 |
| 15 | context/notifications.md (unsubscribe Edge Function line) | Email links `/unsubscribe#t=<token>`. | `process.ts` builds `/unsubscribe#token=<token>` (the page reads `token`; the POST body uses `t`). | NOT-010 |
| 16 | docs/manual-test-guide.md | Covers Phases 0-7 + 6; lists 3 owner accounts only. | Plans / super admin, roles UI, multi-branch, commission, advanced reports, add-ons, GDPR, account, web push, offline overlay are built and missing from that guide; dev accounts now include manager / receptionist / staff / super admin. | (whole checklist) |
| 17 | docs/feature-inventory.md §1 ('Offline mode … Not built') | No offline handling. | An offline overlay exists (`OfflineGate`), though no offline data (by design). | OFF-001 |
| 18 | CLAUDE.md §4 i18n (no hard-coded / untranslated user strings) | Every user string is translated. | Login shows the raw server `error.message` ('Invalid login credentials'); the header avatar shows a hard-coded 'W'. | AUTH-008, NAV-006 |
| 19 | src/features/billing (banner label vs action) | Banner action reads 'Contact us'. | Tapping it opens `/settings`, not a contact action (code-internal inconsistency). | PLAN-004 |
| 20 | context/notifications.md (quiet hours = SMS only) | Quiet hours affect SMS reminders / review requests only. | With SMS off at launch the Quiet hours block is still shown in Notification settings (it has no effect). | NOT-013 |

## Needs production build / real device

These cannot be proven on the dev web build (Expo dev server, dev Supabase project, no real devices):
- Service worker registration, update toast, cache behaviour (registered only in production web builds).
- Installed PWA (manifest, icons, standalone, iOS Add to Home Screen) and the iOS install hint.
- Web Push delivery on Android Chrome and iPhone installed PWA; Expo native push (no EAS projectId yet).
- Cloudflare Pages headers (`public/_headers`: X-Frame-Options / frame-ancestors, Referrer-Policy on token pages, HSTS) and rewrites (`public/_redirects`: pretty URLs, deep refresh).
- Supabase dashboard settings: Custom Access Token hook (suspended-login block), custom SMTP + redirect URLs for auth emails, Vault `outbox_worker_url`, CORS `PUBLIC_SITE_ORIGINS`, `PUBLIC_SITE_URL`.
- Real inbox delivery to arbitrary customers (needs a verified Resend domain).
- Native Android / iOS: hardware back, keyboard, safe areas, secure storage, image / document pickers (new native build), share sheet, deep links, offline overlay on native.

| ID | Case | Priority |
|---|---|---|
| [INV-015](launch-test-checklist/inv.md) | Native share (no PDF) | P1 |
| [PWA-002](launch-test-checklist/pwa.md) | iOS manual install hint | P2 |
| [PROD-001](launch-test-checklist/prod.md) | Service worker registers and caches the shell | P1 |
| [PROD-002](launch-test-checklist/prod.md) | Update toast | P1 |
| [PROD-003](launch-test-checklist/prod.md) | Manifest and install (Android Chrome) | P1 |
| [PROD-004](launch-test-checklist/prod.md) | Installed PWA on iPhone (Add to Home Screen) | P1 |
| [PROD-005](launch-test-checklist/prod.md) | Web push on Android Chrome (installed PWA) | P0 |
| [PROD-006](launch-test-checklist/prod.md) | Web push on iPhone installed PWA | P0 |
| [PROD-007](launch-test-checklist/prod.md) | Native (Expo) push | P1 |
| [PROD-008](launch-test-checklist/prod.md) | Security headers on the host | P0 |
| [PROD-009](launch-test-checklist/prod.md) | Pretty URLs and deep refresh | P1 |
| [PROD-010](launch-test-checklist/prod.md) | Custom Access Token hook enabled | P0 |
| [PROD-011](launch-test-checklist/prod.md) | Auth emails from the real domain | P0 |
| [PROD-012](launch-test-checklist/prod.md) | Customer emails to real inboxes | P0 |
| [PROD-013](launch-test-checklist/prod.md) | CORS allow-list on the real domain | P0 |
| [PROD-014](launch-test-checklist/prod.md) | Rate-limit client IP behind the real host | P1 |
| [PROD-015](launch-test-checklist/prod.md) | Dev routes stripped | P1 |
| [PROD-016](launch-test-checklist/prod.md) | Android native: hardware back everywhere | P1 |
| [PROD-017](launch-test-checklist/prod.md) | Android/iOS keyboard and safe areas | P1 |
| [PROD-018](launch-test-checklist/prod.md) | Native pickers and sharing | P1 |
| [PROD-019](launch-test-checklist/prod.md) | Native deep links | P1 |
| [PROD-020](launch-test-checklist/prod.md) | Offline overlay on native | P1 |
| [PROD-021](launch-test-checklist/prod.md) | Cron worker reaches the production function | P0 |
| [PROD-022](launch-test-checklist/prod.md) | Super admin TOTP on production | P1 |
