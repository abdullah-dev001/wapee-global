# Wapee — feature inventory (for end-to-end testing)

Compiled 2026-11-03 on branch `dev` (`cba67b2`). Docs only: no code, migration or data was changed.

**How this was built.** Read `CLAUDE.md`, every `context/*.md`, `docs/business-flows.md`, `docs/security-review.md`,
`docs/go-live-plan.md`, `docs/pre-launch-checklist.md`, `docs/Wapee_Product_Overview_v2.md`, `src/config/launch.ts`.
Then confirmed against the real code: every file in `app/`, `src/config/navigation.ts`, `src/config/permissions.ts`,
`src/features/*`, `supabase/migrations/*` (174 files) and `supabase/functions/*` (20 functions). Read-only `SELECT`s on
the **DEV** project (`rfuovquhultjydtswtqf`) confirmed: 174 migrations applied (latest `20261027120000`), 90 public
tables (all with RLS on), 0 tables in `supabase_realtime`, 20 Edge Functions deployed, 6 pg_cron jobs, 4 seeded system
roles, 3 plans and 6 add-ons. The production project was not touched.

Status words used below: **Working** (built, wired end to end), **OFF at launch** (built, hidden by `src/config/launch.ts`),
**Partial** (built but a piece the product doc asks for is missing), **Missing** (product doc asks, code has nothing).
"Working" means *built*, not *tested by this plan*; results go in `results.md`.

---

## 1. Screens and routes

Gating key: **perm** = permission from the catalogue (`src/config/permissions.ts`); a screen is hidden from the menu by
`useVisibleNav()` and refused by `RouteGuard` (lock state, URL stays). **feature** = plan / add-on flag from `my_features()`.
Every `(app)` route is also locked when the business is inactive (trial over / period ended / suspended), except
`/settings`, `/settings/billing` and `/more`. RLS / RPCs are the real boundary in every case.

### 1.1 Public (no sign-in)
| # | Path | Who | What it does |
|---|---|---|---|
| P1 | `/` | anyone | Static pre-rendered landing (hero, features, live prices from `get_public_pricing()`, FAQ). Signed-in visitors see an auth-aware header. Plan buttons → `/signup?plan=&interval=`. |
| P2 | `/privacy`, `/terms`, `/refund` | anyone | Static legal pages built by `scripts/build-landing.mjs` (Pakistan law, Polar as reseller). |
| P3 | `/<slug>` | anyone | Single-page business website (published only; Hero, About, Services, Gallery, Testimonials, FAQs, Contact; SEO + LocalBusiness JSON-LD). |
| P4 | `/<slug>/book` (`?branch=<id or code>`) | anyone | Booking flow: location (2+ bookable branches) → service → staff (per setting) → slot → form (custom fields, honeypot) → confirmation with manage link (shown once). Embed gate when framed. |
| P5 | `/<slug>/manage#token=` | guest with link | View booking (first name only), cancel (within window), reschedule (same staff). |
| P6 | `/<slug>/review#token=` | guest with link | 1-5 stars + comment; same thanks + same Google button for every rating. |
| P7 | `/<slug>/sign#token=` | guest with link | Sign an intake/consent form (signature pad). Add-on Forms & Consent. |
| P8 | `/<slug>/portal` (`#token=`) | customer | Passwordless client portal: bookings, packages, invoices, photos, forms, My data; book/cancel/reschedule. Add-on Client portal. |
| P9 | `/unsubscribe#t=` | email recipient | Confirm page; only the button POSTs (reminder / review emails only). |
| P10 | `/delete-account` | anyone | Static explanation of account deletion (store requirement). |
| P11 | `/invoice-print/[id]` | signed-in, `invoices.view` (RPC) | Print view, no shell. |
| P12 | `/report-print` | signed-in, advanced reports perms (RPC) | Print view of one advanced-report section. |

### 1.2 Auth `(auth)`
| # | Path | What it does |
|---|---|---|
| A1 | `/signup` | Email + password (8-72), carries `?plan=&interval=` intent. Google button only when `EXPO_PUBLIC_GOOGLE_SIGNIN=1` (web/PWA, not installed iOS PWA). |
| A2 | `/verify` | Wait for email confirmation, resend. |
| A3 | `/login` | Sign in; suspended business → "account disabled" (Auth hook). |
| A4 | `/forgot-password` | Always reports success (no enumeration). |
| A5 | `/reset-password` | Set new password from recovery link (recovery session outranks other gates). |
| A6 | `/onboarding` | 2 steps: business name, slug, industry, optional team size; first location country/currency/timezone. Starts 14-day trial, makes Owner. |
| A7 | `/accept-invite` | **Retired** link page: explains "sign in with that email", strips `?token`. |
| A8 | `/auth/callback` | Google OAuth return (refuses super admin accounts). |

### 1.3 Business app `(app)` — main navigation (`src/config/navigation.ts`)
| # | Path | Menu perm | Plan / add-on | What it does |
|---|---|---|---|---|
| B1 | `/today` | none | all | Today's appointments (branch tz), counts, quick approve/complete/no-show, setup checklist (`settings.booking`), mobile branch switcher. 30 s refetch while visible. |
| B2 | `/calendar` | `appointments.view` | all | Day / Week (7-day strip + day grid) / List; one column per staff; create, detail drawer, reschedule form, cancel, no-show, complete, approve, reopen, walk-in; refresh button; 30 s refetch. |
| B3 | `/clients`, `/clients/[id]` | `clients.view` | all | List (server search, keyset, archived toggle), create/edit, profile (contact gated by `clients.view_contact`, notes, upcoming, history, booking answers, invoices, packages, files, forms, Export data, Erase). |
| B4 | `/services` | `services.manage` | all | Services (duration, per-branch price, staff, online-bookable), Categories drawer, archive/restore. |
| B5 | `/staff` | `staff.view` | all (cap per plan) | Staff profiles, branches, services, App login link, "Add me as staff", archive (refused with future appts), per-person week editor. |
| B6 | `/members` | `staff.view` | all | Team list; Add person by email (`users.invite`), manage drawer (roles per location, remove, resend, cancel pending). |
| B7 | `/schedule` | `staff.view` | all | Tabs: opening hours, time off, holidays, rooms (resources). Conflict warnings with counts. |
| B8 | `/invoices` | `invoices.view` | all | List + filters, editor (draft → issue), payments, credit notes, reverse payment, print. |
| B9 | `/reports` | `reports.view_basic` | all | Basic reports: today / this month (revenue per currency, appointments, top services). |
| B10 | `/commission` | `commission.view_own` | Team+ | Earnings / Team report / Rules tabs. |
| B11 | `/packages` | `packages.sell` | add-on `packages` | Package definitions; sold through invoices. |
| B12 | `/inventory` | `inventory.view` | add-on `inventory` | Products, stock movements, low-stock, negative-stock switch. |
| B13 | `/reviews` | `reviews.view` | all | Keyset list, filters, reply, feature on website (max 12). |
| B14 | `/website` | `website.edit` | all | Website editor: sections, theme, SEO, preview, publish (`website.publish`, Owner). Widget tab only when `launch.widget`. |
| B15 | `/settings` | `settings.business` OR `settings.booking` | all | Settings hub; cards shown per permission / feature. |
| B16 | `/more` | none | all | Mobile menu (secondary nav items + sign out). |

### 1.4 Settings sub-routes (reached from the Settings hub only)
| # | Path | Guard in route file | What it does |
|---|---|---|---|
| S1 | `/settings/booking` | RouteGuard (read for all; edit `settings.booking`) | Booking settings per branch + Booking form builder (5 field types, sensitive flag, per-service), live preview, warnings, booking link card. |
| S2 | `/settings/location` | `settings.business` | Edit the current location (address, phone, tax %, tax number, timezone/currency with locks). Solo/Team path. |
| S3 | `/settings/branches` | `settings.business` + feature `multi_branch` | Locations: create (copy hours/prices), archive/restore, primary, combined view. |
| S4 | `/settings/notifications` | `settings.booking` | Reminders on/off + hours, review requests, quiet hours, message preview. SMS toggle hidden ("coming soon"). |
| S5 | `/settings/messages` | `settings.booking` | Message log (channel/status/branch filters, masked recipient). |
| S6 | `/settings/my-notifications` | RouteGuard only | Push for this device (web push VAPID; native needs EAS projectId) + per-event switches. |
| S7 | `/settings/sms-credits` | `sms.send` + `launch.sms` | **OFF**: redirects to `/settings`. |
| S8 | `/settings/roles` | `roles.manage` + feature `custom_roles` | Roles list, permission matrix, create/clone/edit/delete custom role. |
| S9 | `/settings/advanced-reports` | `reports.view_advanced` + feature `advanced_reports` | Revenue / staff / services / clients / appointments / branches sections, periods + compare, CSV, print, email schedule tab. |
| S10 | `/settings/forms` | `forms.manage` + feature `forms_consent` | Form templates (versioned). |
| S11 | `/settings/billing` | `settings.billing` | Plan, status, trial / period end, usage vs caps, add-ons, Contact us. Polar checkout section only when `EXPO_PUBLIC_BILLING_CHECKOUT=1` and web. |
| S12 | `/settings/data-requests` | `clients.export` | Portal data requests: export / erase / decline. |
| S13 | `/settings/delete-business` | `clients.erase` (DB insists on Owner role) | Erase whole business (typed name). |
| S14 | `/settings/account` | RouteGuard only | Change email / password, link to delete my account. |
| S15 | `/settings/delete-account` | RouteGuard only | Delete my account (refused for sole Owner). |

### 1.5 Super admin `(admin)` — platform flag + password sign-in within 12 h
| # | Path | What it does |
|---|---|---|
| X1 | `/admin` | Businesses list: server search (name, slug, owner email), plan/status filters, keyset 20. |
| X2 | `/admin/business/[id]` | Detail: subscription, usage, add-on toggles, assign plan, set status, extend trial, SMS credits, reviews + remove with reason, logged support view. |
| X3 | `/admin/platform` | Plan + add-on prices (monthly/yearly, per location, add-on plan availability), SMS rates, industry presets. |
| X4 | `/admin/sign-in-again` | Shown to a flagged account without a fresh password session (Google, magic link, >12 h). |

**Totals: 57 screens/routes** — 14 public (landing, 3 legal pages, 8 business/customer pages, 2 print views), 8 auth,
16 main app, 15 settings sub-routes, 4 admin. The dev-only `/_gallery` is stripped from production builds and not counted.

---

## 2. Features and add-ons vs the product doc

| Area | Feature | Status | Notes (code is the source) |
|---|---|---|---|
| Auth | Email + password signup, verify, login, reset, sign out clears cache | Working | `context/auth.md` |
| Auth | Continue with Google (web/PWA) | OFF at launch (env flag) | `launch.googleSignIn`; on in dev preview only |
| Auth | Suspended business blocks sign-in | Working (needs Auth hook switched ON per project) | Hook is fail-open; dashboard switch |
| Onboarding | Business + first location, 14-day trial, slug rules, reserved slugs | Working | |
| Onboarding | Industry presets (starter fields, terminology, template) | **Missing** | Only the industry key is stored; `industry_presets` table + admin editor exist, nothing applies them |
| Onboarding | Setup checklist on Today | Working | From `branch_is_bookable` |
| Team | Add person by email (pending membership, claim on verified sign-in, `member_added` email) | Working | Replaces invite links (doc §14 "add staff by email") |
| Team | Business switcher (one person in several businesses) | **Missing** | Joined but cannot open the 2nd business (user decision: later) |
| Roles | 4 system roles, scope Own/Branch/All, escalation guard, last-owner guard | Working | 47 / 39 / 20 / 12 permissions |
| Roles | Custom roles (create/clone/edit/delete, audit) | Working | Business included, Team add-on |
| Catalogue | Services, categories, per-branch price, staff link, online-bookable | Working | |
| Catalogue | Rooms/chairs/bays (resources) | **Partial** | List/create/archive + `use_resources` toggle exist; **no UI to link a service to a resource and no capacity editor** (SQL only) |
| Schedule | Staff hours, breaks, time off, branch hours, holidays, conflict warnings | Working | |
| Booking | Booking settings (all doc §6.2 values) per branch | Working | |
| Booking | Booking form: 5 field types, required, per-service, sensitive, versioning | Working | |
| Booking | Public booking page + location picker + slot engine (DST) + DB no-double-booking | Working | |
| Booking | Guest manage link: cancel / reschedule | Working | Reschedule keeps the same staff |
| Booking | Resend manage link from the dashboard | **Partial** | Edge Function `resend_manage_link` deployed; **no button in the app** |
| Booking | Embed widget | OFF at launch | `launch.widget`; `vercel.json` frame-ancestors 'self' on `/<slug>/book` |
| Calendar | Day / week / list, one column per staff, create/reschedule/cancel/walk-in/no-show/approve/reopen | Working | No drag and drop (by decision) |
| Calendar | Freshness | Working | 30 s refetch on Today/Calendar while visible; **no Realtime** (doc §4 matches; the test brief's "realtime update" = refetch) |
| Clients | List/search/profile/notes/history/answers, contact + sensitive gating | Working | |
| Clients | Export | **Partial** | Per-client JSON export (GDPR) only; no client-list CSV export |
| Money | Invoices: draft/issue, gapless per-branch numbers, tax snapshot, discount + reason, payments, credit notes, reversals, print | Working | Native print = text share |
| Money | Basic reports today/month | Working | |
| Money | Commission (rules, auto on full payment, reversal on credit) | Working | Team+ |
| Reports | Advanced reports, compare, CSV, print, scheduled email, branch comparison | Working | |
| Reports | Packages report ("when on", doc §8.3) | **Missing** | |
| Reports | PDF export | Partial | Browser print-to-PDF on web; no PDF on native |
| Notifications | Email outbox (Resend), reminders (cron), unsubscribe, message log, retry | Working (real delivery only to the Resend account owner until a domain is verified) | |
| Notifications | Web push (VAPID) | Working (not proven on a real phone) | |
| Notifications | Native push (Expo) | **Partial** | No EAS `projectId`; never issued a token |
| Notifications | SMS (Twilio, credits, segments) | OFF at launch | UI hidden only; server still honours `sms_enabled` (see §9 mismatches) |
| Reviews | Request on Completed, stars/comment, reply, testimonials (max 12), same Google link | Working | |
| Reviews | Set the Google review URL | **Missing (UI)** | `branches.google_review_url` exists; no screen writes it |
| Website | Sections, branding, SEO, publish, Book buttons, assets bucket | Working | |
| Multi-branch | Locations, per-branch tz/currency/tax, locks, archive, combined view, switcher | Working | Mobile switcher on Today only |
| Plans | Solo/Team/Business caps, trial = Business + all add-ons, expiry lock, period end lock | Working | |
| Plans | Solo = "Owner only" roles | **Missing (not enforced)** | `default_roles` flag is display data only |
| Billing | Super admin assigns plan by hand | Working | Doc §0 #18 |
| Billing | Polar self-service checkout / portal / webhook / reconcile | OFF at launch (env flag) | Built on dev; sandbox tested |
| Add-on | Packages & Sessions | Working | |
| Add-on | Inventory | Working | |
| Add-on | Files & Photos (consent, signed URLs, byte sniffing) | Working | PDF picker on native needs a rebuild |
| Add-on | Forms & Consent (signature, versioned, public link) | Working | |
| Add-on | Client portal | Working | No dashboard "customer sessions" screen |
| Privacy | GDPR export/erase per client, data requests, business erase | Working | |
| Account | Change email/password, delete my account | Working | **Receptionist / Staff have no menu path to it** (Settings hidden for them) |
| Super admin | List/detail/plan/status/trial/add-ons/prices/support view/remove review/audit | Working | |
| Super admin | 2FA (TOTP) | **Changed** | Password-only + 12-hour rule since `20261026130000` (founder decision 2026-10-23); doc §5/§13 still say 2FA |
| Platform | i18n English only; RTL-ready never viewed | Partial | Other languages not built (by doc: "one new file") |
| Platform | PWA manifest, service worker (shell only), install hint, update toast, offline screen | Working | |
| Platform | Native apps (Android/iOS) | Not shippable yet | No `eas.json`, never run on Android |

---

## 3. Background jobs (pg_cron on DEV, confirmed by `select * from cron.job`)
| Job | Schedule (UTC) | Calls | What it does |
|---|---|---|---|
| `outbox-worker` | every minute | `invoke_outbox_worker()` → pg_net → Edge `send_outbox` | Sends due email / SMS / push / admin alerts; only calls the worker when something is due. Needs Vault `outbox_worker_url`. |
| `outbox-reminders` | every 5 min | `enqueue_due_reminders()` | Queues `reminder` + `staff_reminder` at branch wall-clock `reminder_hours_before`. |
| `outbox-maintenance` | hourly :17 | `outbox_maintenance()` | Stale locks → retry, open rows > 48 h → dead `expired`, null sealed tokens after 48 h, purge sent rows > 30 days. |
| `report-schedules` | every 15 min | `enqueue_due_report_summaries()` | Weekly (Mon, local send hour) / monthly (1st) `report_summary` emails. |
| `cleanup_public_request_attempts` | daily 03:17 | `cleanup_public_request_attempts('7 days')` | Purges rate-limit / attempt rows. |
| `billing-reconcile` | daily 03:17 | `invoke_billing_reconcile()` → Edge `billing_reconcile` | Re-reads Polar subscriptions, cleans webhook events > 90 days. Skips without Polar secrets. |

Not cron but time-based (computed at query time): trial expiry (`trial_ends_at < now()`), paid period end
(`current_period_end`), Polar access windows (`access_until`), manage / review / form / portal token expiry,
pending member-add expiry (30 days). **No job**: `messages` log retention, review-request cleanup, pending file rows.

Queues: `message_outbox` (all customer / staff messages), `admin_signin_alerts`, `storage_cleanup_queue` (GDPR erase),
`billing_webhook_events`.

## 4. Edge Functions (20 deployed on DEV = 20 folders in repo)
| Function | JWT | Public? | Purpose | Rate limit (`rate_limit_rules`) |
|---|---|---|---|---|
| `get_booking_page` | no | yes | Booking page bootstrap (branches, services, staff, form) | 60/min/IP |
| `get_slots` | no | yes | Free slots + `start_token` | 60/min/IP |
| `create_booking` | no | yes | Book (honeypot, start token, too_fast) | 10/h/IP, 5/day/phone, 30/h + 120/day/business |
| `manage_booking` | no | yes | get / cancel / reschedule / get_slots by token | get 60/h/IP; cancel, reschedule 20/h/IP |
| `resend_manage_link` | yes | no | New manage token (old revoked) — **no app caller** | — |
| `get_website` | no | yes | Public website payload | 60/min/IP |
| `get_review_request` | no | yes | Review page read | 60/h/IP |
| `submit_review` | no | yes | Submit review | 10/h/IP |
| `validate_widget` | no | yes | Widget validate / verify / frame_policy | 120/min/IP |
| `sign_form` | no | yes | Read + submit form signing link | 60/h, 10/h per IP |
| `portal` | no | yes | Portal request_login / exchange / reads / writes / request_data | 10/h IP + 3/h email login; reads 1200/h; writes 60/h; data 5/h |
| `unsubscribe` | no | yes | POST suppress (signed token) | 30/min/IP |
| `send_outbox` | no (worker token) | no | Outbox worker (Resend, Twilio, Expo, Web Push, admin alerts) | daily caps per business / recipient |
| `message_preview` | yes | no | Render sample message (`settings.booking`) | — |
| `client_files` | yes | no | Upload prepare/finish, signed URLs, delete (Files add-on) | — |
| `gdpr` | yes | no | Client erase storage cleanup, business erase | — |
| `account` | yes | no | Delete my account (password re-check) | — |
| `billing` | yes | no | Polar checkout / portal / change plan / seats (Owner) | 60/h per business and per user |
| `polar_webhook` | no (signature) | Polar only | Standard Webhooks signature, dedupe, apply | — |
| `billing_reconcile` | no (worker token) | no | Nightly Polar reconcile | — |

---

## 5. Emails and push notifications

### 5.1 Outbox events (`supabase/functions/_shared/outbox/types.ts`)
Channel rule for **client** messages: client has email → email only; no email → SMS only if the branch has `sms_enabled`
(OFF at launch) → otherwise nothing (dashboard only). **Walk-ins (`source = walk_in`) send nothing.** Opt-out only for
`reminder` and `review_request`. Caps: 500 email / 200 SMS / 100 push per business per UTC day, 5 per recipient per 24 h.

| Event | To | Channel | Trigger (from `notify_appointment_change` and the RPCs) |
|---|---|---|---|
| `booking_confirmed` | client | email (SMS fallback) | INSERT with status confirmed (public auto-confirm OR dashboard create), and pending → confirmed (approve). Manage link only when made by `create_booking`. |
| `pending_received` | client | email | INSERT with status pending (confirmation = owner approves). |
| `reminder` | client | email | Cron, `reminder_hours_before` (1-72, default 24) on branch wall clock; skipped for cancelled/completed/no_show/pending/walk-in or slot chosen after reminder time. |
| `rescheduled` | client | email | `starts_at` changed while pending/confirmed (dashboard, manage link, portal). Staff-only change sends nothing. No manage link inside. |
| `cancelled` | client | email | Status → cancelled (any path). No manage link inside. |
| `manage_link` | client | email | `resend_manage_link` (no app button today). |
| `review_request` | client | email | Mark completed (first time only); `reissue_review_request`. |
| `form_request` | client | email | Send a signing link (Forms add-on). |
| `portal_login` | customer | email | Portal "email me a link". |
| `staff_new_booking` | members with `appointments.view` in scope (not the actor) | push | INSERT confirmed. |
| `staff_pending_approval` | members with `appointments.approve` | push | INSERT pending, or confirmed → pending. |
| `staff_cancelled` | members with `appointments.view` | push | Cancelled. |
| `staff_reminder` | the staff member | push | Cron with `reminder`. |
| `staff_low_stock` | inventory users | push | Stock crosses the low level (Inventory add-on). |
| `low_stock` | a user | email | Same crossing. |
| `report_summary` | members with `reports.view_advanced` at ALL scope (+ revenue only with `reports.view_revenue`) | email | Cron `report-schedules`. Payload purged after send. |
| `member_added` | the added email | email | `add_member_by_email` / resend. Link to `/login`, no token. |

### 5.2 Other emails
| Email | Sender | Trigger |
|---|---|---|
| Admin sign-in alert | `send_outbox` (`admin_signin_alerts`) | Every non-refresh super admin sign-in |
| Confirm signup, reset password, email change | Supabase Auth mailer (custom SMTP still to set up; built-in mailer rate-limits, 429 seen) | Auth flows |
| Polar receipts / portal | Polar | Self-service billing (flag OFF) |

---

## 6. Plan gating as actually enforced

Source: `public.plans.features` (DEV), `business_has_feature()` / `feature_gate_error()`, triggers, `my_features()`, `RequireFeature`.

| Item | Solo | Team | Business | Trial (until `trial_ends_at`) | Enforced in SQL | Enforced in UI |
|---|---|---|---|---|---|---|
| Staff per location | 1 | 5 | unlimited | unlimited | `staff_branches_enforce_cap`, `staff_profiles_enforce_cap` (`staff_cap_reached`) | staff form message |
| Locations | 1 | 1 | unlimited (`priced_per_branch`) | unlimited | `branches_enforce_limit`, `create_branch` gate `multi_branch` | `/settings/branches` RequireFeature; Solo/Team use `/settings/location` |
| core / website / reviews / booking_link | yes | yes | yes | yes | not gated | not gated |
| default_roles | **false** | true | true | true | **not enforced** (Solo can add Manager / Receptionist / Staff logins) | not shown on landing |
| commission | no | yes | yes | yes | commission RPCs + `commission_lines` `feature_off` | nav + RequireFeature |
| advanced_reports (+ schedules) | no | yes | yes | yes | `get_advanced_report`, report schedules | RequireFeature |
| branch_comparison | no | no | yes | yes | `get_advanced_report` section `branches` | section hidden |
| embed_widget | no | yes | yes | yes | `widget_feature_enabled()` in `validate_widget` | tab hidden by `launch.widget` for everyone |
| custom_roles | no | add-on (`available_plans {team}`) | included | yes | `roles_enforce_custom_roles_feature` trigger + RPCs; assignments keep working after downgrade | RequireFeature |
| Add-ons packages / inventory / files_photos / forms_consent / client_portal | add-on | add-on | add-on | all ON | `feature_gate_error` first line of every module RPC; Edge `portal`/`sign_form` answer generic not-found | nav, screens, blocks, matrix rows hidden |
| Inactive business (trial over, period ended, suspended) | — | — | — | — | `business_has_feature` false; `can()` false except `settings.business` / `settings.billing`; public pages `not_bookable` | lock screen except Settings / Billing / More |

Prices on DEV (USD minor, monthly / yearly): Solo 1500/15000, Team 3900/39000, Business 7900/79000 per location;
add-ons Packages 900, Inventory 900, Files & Photos 900, Forms & Consent 1200, Client portal 1200, Custom roles 1000 (Team only).
`set_addon` does **not** check `available_plans` (super admin can enable custom_roles on Solo).

---

## 7. Role permission matrix (seeded on DEV, `roles.business_id is null`)

Scope: **A** = all, **B** = branch, **O** = own, — = not held. Owner 47 · Manager 39 · Receptionist 20 · Staff 12.

| Permission | Owner | Manager | Receptionist | Staff | Plan / add-on |
|---|---|---|---|---|---|
| appointments.view | A | B | B | O | |
| appointments.create | A | B | B | O | |
| appointments.edit | A | B | B | O | |
| appointments.cancel | A | B | B | — | |
| appointments.approve | A | B | B | — | |
| calendar.view_all_staff | A | B | B | — | |
| clients.view | A | B | B | O | |
| clients.create | A | B | B | — | |
| clients.edit | A | B | B | — | |
| clients.view_contact | A | B | B | — | |
| clients.view_sensitive | A | B | — | O | |
| clients.export | A | B | — | — | |
| clients.erase | A | — | — | — | (not in doc §9) |
| services.manage | A | B | — | — | |
| staff.view | A | B | B | O | |
| staff.manage | A | B | — | — | |
| staff.manage_schedule | A | B | — | O | |
| invoices.view | A | B | B | — | |
| invoices.create | A | B | B | — | |
| invoices.discount | A | B | — | — | |
| invoices.credit_note | A | B | — | — | |
| reports.view_basic | A | B | — | — | |
| reports.view_revenue | A | B | — | — | |
| reports.view_advanced | A | B | — | — | Team+ |
| commission.view_own | A | B | — | O | Team+ |
| commission.view_all | A | B | — | — | Team+ |
| commission.manage_rules | A | — | — | — | Team+ |
| reviews.view | A | B | B | O | |
| reviews.reply | A | B | — | — | |
| reviews.feature_on_website | A | B | — | — | |
| website.edit | A | — | — | — | |
| website.publish | A | — | — | — | |
| settings.business | A | — | — | — | |
| settings.booking | A | B | — | — | |
| settings.billing | A | — | — | — | never in a custom role |
| roles.manage | A | — | — | — | |
| users.invite | A | B | — | — | |
| packages.sell | A | B | B | — | add-on |
| packages.deduct_session | A | B | B | O | add-on |
| packages.reverse_session | A | B | — | — | add-on |
| inventory.view | A | B | B | — | add-on |
| inventory.adjust | A | B | — | — | add-on |
| files.upload | A | B | B | O | add-on |
| files.view | A | B | B | O | add-on |
| forms.manage | A | B | — | — | add-on |
| sms.send | A | B | B | — | OFF at launch (hidden in matrix) |
| sms.buy_credits | A | — | — | — | OFF at launch |

Special rules not expressed as permissions: `reopen_appointment` = Owner or Manager role key only; `website.publish` /
`settings.business` Owner only; business erase needs the Owner **role**; signing a form needs `appointments.edit`;
super admin is a profile flag outside this system.

**Custom role**: none seeded. Created by an Owner (or `roles.manage` holder) from scratch or by cloning; cannot include
`settings.billing`; cannot grant a permission/scope the creator lacks (`can_define_at` / `can_grant_at`); default roles
are immutable; delete needs a replacement when in use; every change audited (`role.*`).

Matches product doc §9 matrix on every row; extras the doc does not list: Staff `files.*`, `packages.deduct_session`,
`commission.view_own`, `reviews.view`; Receptionist `sms.send`, `inventory.view`, `files.*`, `packages.sell/deduct`,
`reviews.view`; Owner-only `clients.erase`.

---

## 8. Test assets already in the repo (reuse, do not rewrite)
- **SQL suites** `supabase/tests/01-54` (pgTAP via `python3 supabase/tests/run_pgtap.py <file>` or `scripts/run-sql-suites.sh`), concurrency scripts `09`, `15`, `20`, `23`, HTTP scripts `25/26/30/33/38_*.mjs`.
- **Unit tests** `npm test` (vitest, ~920 tests).
- `npm run smoke:public` (spends the 10/h per-IP booking budget), `npm run check:migrations` (replay from empty), `npm run guide:check`.
- Earlier manual material: `docs/launch-test-checklist/*.md` (567 cases, 2026-10-09, partly stale), `docs/manual-test-guide.md`, `docs/qa/*` (audit + fix rounds).

## 9. Code vs doc mismatches found (listed, not fixed)
1. **Super admin 2FA**: product doc §5/§13 and `go-live-plan.md` §12-13 / `pre-launch-checklist.md` C4 say TOTP; code is password-only with a 12-hour rule (`20261026130000`, founder decision). `business-flows.md` §9 still says TOTP.
2. **Solo "Owner only" roles** (doc §10): not enforced; Solo can add any role (staff cap counts profiles, not logins).
3. **Invites**: doc §14 / brief F03 say invite + accept; code is "add by email" + automatic join on verified sign-in. `/accept-invite` is a retired page. `business-flows.md` gap 8 ("invites are not emailed") is stale: `member_added` email exists. Security review L7 (`invite_preview` anon) is stale: EXECUTE revoked.
4. **SMS and widget OFF at launch are UI-only**: `notification_settings.sms_enabled` can still be set through the API by a `settings.booking` holder and `outbox_enqueue` would pick SMS; widget RPCs / `validate_widget` still answer for Team+. Real blocks today: no Twilio secrets; `frame-ancestors 'self'` on `/book`.
5. **Resend manage link from dashboard** (doc §0 #3, §6.1): Edge Function exists, no app button.
6. **Google review link** (doc §6.4): no UI to set `branches.google_review_url`.
7. **Industry presets** (doc §3): not applied at signup; terminology not built.
8. **Packages report** (doc §8.3): missing.
9. **Rooms**: no service ↔ resource link UI or capacity editor (doc §6.2 "rooms/chairs/bays").
10. **Client export**: doc §9 `clients.export` used only for per-client GDPR JSON; no list export.
11. **Native push** (doc §6.3 push to business users): no EAS projectId → native push never works; web push only.
12. **Subscription collection** (doc §0 #18 "handled last"): Polar is built on dev behind `EXPO_PUBLIC_BILLING_CHECKOUT` (OFF); `business-flows.md` gap 3 says "Polar is not integrated" and "`current_period_end` never enforced" — both stale.
13. **Permission count**: doc §9 lists 46; code 47 (`clients.erase`). `context/roles.md` says Staff has 10, DB has 12.
14. **Public booking location picker**: `context/plan-features.md` and older handoff lines say "primary branch only"; code has a location picker (`BranchStep`, `20261022100000`).
15. **Account / My notifications for Receptionist and Staff**: only reachable through the Settings hub, which is hidden for them (no `settings.business`/`settings.booking`); account deletion is a store requirement.
16. **Trial status**: an expired trial keeps `status = 'trialing'` (lock is computed). DEV has two such businesses (Buenos Clinic, Rosario Clinic). Not a bug, but super-admin filters must show them as "trial ended".
17. `ROUTE_FEATURES['/settings/widget']` in `featureLogic.ts` points to a route that no longer exists (widget is a website-editor tab).
18. `docs/security-review.md` Edge Function table misses `account`, `billing`, `polar_webhook`, `billing_reconcile`.
