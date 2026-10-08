# Feature inventory

Compiled 2026-10-08 on branch `dev`, as a production-readiness audit. Docs only: no code or migration changed.

## How to read this (evidence level, stated plainly)

**Verified by me in this audit (ran or listed it myself):**
- `npm run typecheck` clean, `npm run lint` clean (0 warnings), `npm test` = **590 unit tests in 47 files, all pass**.
- `expo export --platform web` completes (to a scratch folder; `dist/` in the repo is a stale 1 Oct build and was not used).
- `supabase migration list` against the linked dev project: **130 local = 130 remote, no drift**.
- File existence: every route in `app/`, all 16 Edge Functions in `supabase/functions/`, all SQL suites in `supabase/tests/`, `public/manifest.json`, `public/sw.js`, `public/widget.js`, `.github/workflows/ci.yml`. There is **no `eas.json`**, no EAS `projectId` in `app.config.ts`, no `android/` folder.
- Web Push is **not built**: `src/lib/push/pushRegistration.ts` says "Web push (VAPID) is a seam, not built", and no Edge Function mentions VAPID.
- Polar: the word does not appear anywhere in the repo or docs.

**Only read from context files (NOT re-run by me):** every SQL suite result, every HTTP proof, every "clicked in browser / simulator" claim, every assertion count, and every performance number. Where a row says "SQL 14" it means the context file says suite 14 covers it; I did not re-run suite 14.

**Test-method key:** `SQL nn` = SQL suite `supabase/tests/nn_*` · `UT` = vitest unit test · `HTTP` = script or curl against the deployed functions · `WEB` = clicked or screenshotted in a browser by a previous session (per context file) · `SIM` = iOS simulator screenshot / deep link · `CODE` = written code review only · `NONE` = never run or clicked.
**Android has never been run. A real iOS device has never been used (simulator only).**

Rows are `| feature | status | where | tested |`. Status is exactly `Built`, `Partial` or `Not built`.

---

## 1. Foundation and platform
| Feature | Status | Where | Tested |
|---|---|---|---|
| Expo SDK 57 app, Expo Router, one codebase for web/iOS/Android | Built | `app/`, `app.config.ts` | web export builds (verified); SIM; Android NONE |
| Responsive shell: bottom tabs (<768), sidebar (768-1023), sidebar+header (>=1024) | Built | `src/components/layout/` | WEB 375/768/1280; SIM |
| Safe areas, keyboard-aware Screen/Drawer, Android back (`useOverlayDismiss`) | Built | `src/components/layout`, `ui/Drawer` | CODE for Android; SIM; hardware Back NONE |
| Theme tokens, 13+ UI primitives, DM Sans, lucide icons | Built | `src/lib/theme`, `src/components/ui` | WEB |
| Shared composites: MoneyInput, SearchInput, TimePicker, DayHoursRow, DateRangePicker, Calendar, PhoneInput, DataTable, StatusBadge, Avatar, MonthStepper, SignaturePad | Built | `src/components/shared` | UT for logic; WEB for most |
| i18n (English base), typed keys, plurals | Built | `src/lib/i18n`, `common.json` | UT |
| Other languages | Not built | only `en` | none |
| RTL engine (start/end, directional chevrons) | Partial | code is RTL-ready | RTL NONE (never viewed) |
| `lib/money` (minor units, per-currency exponent, non-ASCII digits) | Built | `src/lib/money` | UT |
| `lib/time` (zoned/UTC, DST-safe, branch "today") | Built | `src/lib/time` | UT; SQL 06 for DST |
| TanStack Query layer: key factories, staleTimes, cache clear on logout | Built | `src/lib/query` | UT; WEB |
| Supabase client, SecureStore (native) / localStorage (web) auth storage | Built | `src/lib/supabase` | WEB; SIM |
| Brand config (only place for the name) | Built | `src/config/brand.ts` | n/a. Values are placeholders (see below) |
| Final brand, domain, bundle id, support email | Not built | `brand.ts`: `app.wapee.com`, `wapee.site`, `com.wapee.app`, `support@wapee.com` are placeholders | n/a |
| PWA manifest generated from brand | Built | `scripts/generate-web-manifest.mjs`, `public/manifest.json` | file exists (verified); install flow NONE on a real phone |
| Service worker (shell + static only, update toast) | Built | `public/sw.js`, `src/lib/pwa/registerServiceWorker.ts` | WEB; production-only registration NONE |
| PWA install hint (iOS "Add to Home Screen" text) | Built | `src/lib/pwa` | WEB |
| PWA icons incl. maskable, apple-touch | Partial | `public/icons/` | placeholder artwork |
| Offline mode / offline data | Not built | SW caches shell only (by design) | n/a |
| Dev gallery route stripped from production build | Built | `scripts/strip-dev-routes.mjs` | used by `npm run build:web`; I exported without it so `_gallery.html` was in my scratch build |
| Print stylesheet (invoice, report) | Built | `app/+html.tsx` | WEB (Chromium print emulation) |
| Settings hub screen | Built | `/settings` | WEB; has a known dev-only icon-prop warning that shows as an error toast in the dev build |
| More screen (mobile menu) | Built | `/more` | WEB; SIM |
| `app/(portal)/portal` route | Removed 2026-10-09 | was a `PlaceholderScreen`; the real portal is `/<slug>/portal` | done |
| Unit-test suite | Built | 47 files / 590 tests | **run by me: pass** |
| CI workflow | Partial | `.github/workflows/ci.yml` written, **never run** | NONE |
| `npm run smoke:public` (40 checks) | Built | `scripts/smoke-public.mjs` | HTTP; spends the 10/hour per-IP budget |

## 2. Auth
| Feature | Status | Where | Tested |
|---|---|---|---|
| Sign up (email + password, 8-72 chars) | Built | `/signup` | WEB, SIM; REST |
| Email verification screen + resend | Built | `/verify` | WEB. Real delivery needs custom SMTP (see go-live plan) |
| Sign in | Built | `/login` | WEB, SIM |
| Forgot password (always reports success) | Built | `/forgot-password` | WEB |
| Reset password from email link | Built | `/reset-password` | WEB |
| Show/hide password field | Built | `PasswordField` | WEB |
| Route guard (signed out -> login, unverified -> verify) | Built | `AuthGate` | WEB; UT |
| Sign out clears query cache and push token | Built | `useSignOut` | WEB |
| Session persistence | Built | `SessionProvider` | WEB, SIM |
| Social login | Not built | doc lists as future | n/a |
| Custom auth email templates (branded) | Not built | Supabase default templates | n/a |
| Custom SMTP for auth mail | Not built | hosted dashboard setting, not done | NONE |
| Leaked-password protection | Not built | Pro-plan only | n/a |
| Account (user) deletion | Not built | business erase exists; the sign-in account is never deleted | n/a. Store policy risk |
| Change email / change password inside the app | Not built | no screen found in context | n/a |
| Super admin 2FA (TOTP enrol + verify, forced at sign-in) | Built | `/admin/2fa` | WEB (verify path with computed TOTP); enrol-by-QR clicked: NONE |

## 3. Onboarding
| Feature | Status | Where | Tested |
|---|---|---|---|
| Two-step wizard: name/slug/industry, then first location | Built | `/onboarding` | WEB |
| Live slug availability, slug suggestion from name | Built | `is_slug_available` | WEB; SQL |
| Reserved slugs list (app routes) | Built | table `reserved_slugs` + `src/config/reservedSlugs.ts` | SQL |
| 280 countries / 162 currencies / 418 timezones, pre-fill table | Built | `localeData.generated.ts` | UT; WEB |
| `create_business_with_owner` RPC (business + branch + owner + audit, atomic) | Built | RPC | SQL 01-03; WEB |
| 14-day trial starts with Business-level features | Built | RPC | SQL 18 |
| Invoice prefix suggestion | Built | `suggest_invoice_prefix` | SQL |
| One business per self-serve signup | Built | RPC rule | SQL |
| Industry presets (starter fields, terminology, template) | Partial | table + super-admin editor exist; content is empty, "defined by owner outside development" | SQL 18 for the editor |
| Business switcher for people in several businesses | Not built | store supports it, no UI (location switcher exists, business switcher does not) | n/a |

## 4. Roles, permissions, members
| Feature | Status | Where | Tested |
|---|---|---|---|
| Permission catalogue (47 keys, area.action + scope own/branch/all) | Built | `src/config/permissions.ts`, table | SQL 01, 28; UT |
| 4 system roles (Owner 47, Manager 39, Receptionist 20, Staff 12) | Built | seed | SQL 01, 07, 21 |
| `can()`, `has_permission()`, scope-aware helpers | Built | DB | SQL 01, 21, 31 |
| `usePermission`, `useFeature`, `my_grants` | Built | `src/lib/permissions` | UT (24 assertions) |
| Nav and route gating (`RouteGuard`) | Built | `useVisibleNav` | UT; WEB |
| Escalation guard (cannot grant what you lack) | Built | trigger | SQL 02, 19; REST |
| Last Owner protection | Built | trigger | SQL |
| Custom roles: create, edit, clone, delete (with replacement) | Built | `/settings/roles`, RPCs | SQL 19; WEB (create/view/delete dialog); edit with changed scope and delete-with-replacement NONE |
| Role permission matrix UI (scope per permission) | Built | `RoleEditor` | WEB |
| Permission cache refresh (`permissions_version` poll) | Built | `my_permissions_version` | SQL 19 |
| Team list with names | Built | `/members` | WEB |
| Invite member (role + branch, one-time 7-day link, copy button) | Built | `invite_member` | REST 21 checks; WEB |
| Invite by email (sent mail) | Not built | no outbox event for invites; link is copied by hand | n/a |
| Accept invite screen (3 cases) | Built | `/accept-invite` | REST; WEB |
| Accept-invite rate limit (10/hour per token) | Built | RPC | REST |
| Manage drawer: add/change/remove role per location | Built | `/members` | SQL 19; remove/change NONE in UI |
| Remove member, cancel invite, resend invite (new link) | Built | RPCs `remove_member`, `revoke_invite` | SQL; WEB (cancel invite only) |
| Members list pagination | Not built | unpaginated list | n/a |
| Staff profile <-> invite link ("give this person app access") | Not built | use Team > invite | n/a |
| Suite 04 (invite flow) | Partial | file exists, repaired in 9B | SQL 04 runs via runner |

## 5. Plans, billing, trial lock
| Feature | Status | Where | Tested |
|---|---|---|---|
| Trial lock screen (inactive business) | Built | `ActiveBusinessGate` | UT; DB checked; screen appearance WEB unconfirmed in first context, later phases saw it |
| Allowed routes when inactive (Settings, billing, More) | Built | `inactiveRoutes.ts` | UT |
| Trial banner (last 3 days, Owner only) | Built | `TrialBanner` | UT |
| Plans solo/team/business, caps, features | Built | tables, `my_features` | SQL 18 |
| Staff cap per location, branch limit | Built | triggers | SQL 18 |
| Add-ons on/off per business | Built | `business_addons` | SQL 18 |
| Downgrade over limits refused | Built | `assign_plan` | SQL 18 |
| `/settings/billing` (plan, status, usage, add-ons, Contact us) | Built | route | WEB |
| "Not included in your plan" calm state | Built | `RequireFeature` | WEB |
| Prices (plan and add-on) | Partial | placeholders 1500 / 3900 / 7900; editable by super admin | n/a |
| Online subscription payment (Polar) | Not built | nothing in repo | n/a |
| Billing history / invoices from Wapee to businesses | Not built | n/a | n/a |
| Upgrade prompts / plan picker | Not built | decided: calm text only | n/a |
| Solo "owner only" enforcement | Not built | known limit | n/a |
| Trial email reminders | Not built | banner only | n/a |

## 6. Super admin
| Feature | Status | Where | Tested |
|---|---|---|---|
| Admin flag (one account, set by SQL), aal2 required for all admin RPCs | Built | `admin_gate()` | SQL 18; HTTP |
| Businesses list (search, plan/status filter, keyset) | Built | `/admin` | SQL 18; WEB |
| Business detail (subscription, usage, add-ons, reviews) | Built | `/admin/business/[id]` | WEB |
| Assign plan / set status / extend trial dialogs | Built | RPCs | SQL 18; `extend_trial` refusal WEB; other dialogs' submit NONE |
| Add-on toggle | Built | `set_addon` | SQL 18; WEB toggle NONE |
| Add SMS credits, set SMS rates | Built | `admin_add_sms_credits` | SQL 17/18; dialogs NONE |
| Platform screen: plan/add-on prices, SMS rates, industry presets | Built | `/admin/platform` | WEB view; submits NONE |
| Support view (read-only, audited) | Built | `support_view_business` | SQL 18 |
| Remove a review (with reason) | Built | `remove_review` | SQL 18; UI submit NONE |
| Audit of every admin call | Built | `audit_logs` | SQL 18 |
| Super admin account created in production | Not built | manual SQL + TOTP enrol, per go-live plan | n/a |
| Dashboard screen for customer portal sessions | Not built | n/a | n/a |

## 7. Catalogue (services)
| Feature | Status | Where | Tested |
|---|---|---|---|
| Service create/edit/soft-delete (duration 5-1440, buffer, active, online) | Built | `/services` | REST; SQL 05; WEB |
| Per-branch price (integer minor units), per-branch on/off | Built | `service_branches` | SQL 05; REST |
| Staff assignment per service | Built | `service_staff` | REST |
| Server-side search (trigram, debounced 300 ms) | Built | `useServices` | REST |
| Unique name per business (case-insensitive) | Built | constraint | SQL 05 |
| Categories (create via hook, list grouping) | Partial | no screen to rename/delete a category | n/a |
| Resources (rooms/chairs): list, create, delete | Partial | `/schedule` Rooms tab; capacity always 1, no service-linking UI | WEB; capacity>1 only by SQL 06/08 |
| Atomic save (service + prices + staff in one transaction) | Partial | 3 sequential writes | n/a |
| Services list pagination | Not built | loads all | n/a |

## 8. Staff and schedule
| Feature | Status | Where | Tested |
|---|---|---|---|
| Staff profile create/edit/soft-delete, optional login, "No app access" badge | Built | `/staff` | REST; SQL 05, 21; WEB |
| Branch + service assignment | Built | `StaffForm` | REST |
| Staff cap enforcement message | Built | `planErrors.ts` | SQL 18 |
| Weekly hours per staff per branch (split shifts, no overlap, no overnight) | Built | `replace_staff_working_hours` | SQL 05; REST |
| Breaks per staff | Built | `replace_staff_breaks` | SQL 05 |
| Time off (whole days, overlap refused) | Built | `/schedule` Time off tab | SQL 05; REST |
| Half-day / hourly time off | Not built | whole days only | n/a |
| Time-off approval workflow | Not built | deliberate | n/a |
| Branch opening hours | Built | `replace_branch_hours` | SQL 05; WEB |
| Holidays / closures (date ranges) | Built | `/schedule` Holidays tab | SQL 05 |
| Overnight shifts | Not built | known limit | n/a |
| Own-scope staff edit only own hours | Built | RLS + RPC | SQL 05 |
| Staff avatar / photo | Not built | n/a | n/a |
| Staff reordering | Not built | n/a | n/a |
| "My profile" screen for staff | Not built | n/a | n/a |

## 9. Booking settings and form
| Feature | Status | Where | Tested |
|---|---|---|---|
| Per-branch settings (staff choice, slot display, confirmation, prices, interval, buffer, notice, window, cancel rule + cutoff, rooms, people per slot) | Built | `/settings/booking` | SQL 06-08; WEB; UT |
| Save only changed keys (`save_booking_settings`) | Built | RPC | SQL 08 |
| Guard: lower people-per-slot blocked by future bookings | Built | RPC | SQL 08 |
| `branch_is_bookable` warnings with fix routes | Built | RPC + UI | SQL 08; UT |
| Booking link card (gated on bookable) | Built | `BookingLinkCard` | WEB |
| Live customer preview (sample times, real catalogue) | Built | `BookingPreview` | WEB; UT |
| Custom fields: 5 types, required, sensitive (escalate only), per-service, reorder, archive | Built | `CustomFieldEditor` | SQL 06, 07; WEB |
| Immutable form versions (digest dedupe) | Built | `ensure_form_version` | SQL 06 |
| `require_client_email` toggle | Built | RPC | SQL 08 |
| Per-branch booking form | Not built | per business by design | n/a |
| Per-service people-per-slot | Not built | per branch by design | n/a |
| Atomic custom-field save | Partial | field row and services are separate writes | n/a |

## 10. Booking engine and public API
| Feature | Status | Where | Tested |
|---|---|---|---|
| Slot engine `get_free_slots` (hours, breaks, time off, closures, buffer, notice, window, interval, resources, seats, DST) | Built | DB function | SQL 06 (London spring/fall, NY, Karachi) |
| "Any staff" least-loaded rule | Built | `pick_staff_for_slot` | SQL 06 |
| `create_booking` (one transaction, never raises, snapshot answers) | Built | RPC | SQL 08; HTTP |
| No double-booking (exclusion constraints staff + resource) | Built | constraints | SQL 06, 07, 09; true parallel proof only for invoices/commission/add-ons, not for group capacity (advisory lock, argued not raced) |
| Group capacity / resource capacity > 1 (counted under advisory lock) | Built | `create_booking` | SQL 09 arithmetic; no true parallel test |
| Phone normalisation fallback (42-country table) | Built | `normalise_phone_e164` | SQL 08 |
| Edge `get_booking_page` | Built | deployed | HTTP; smoke |
| Edge `get_slots` (issues HMAC start token) | Built | deployed | HTTP; smoke |
| Edge `create_booking` | Built | deployed | HTTP; smoke |
| Edge `manage_booking` (get/cancel/reschedule/get_slots) | Built | deployed | HTTP |
| Edge `resend_manage_link` (JWT) | Built | deployed | HTTP |
| Rate limits per IP/phone/business, fail closed, blocked attempts counted | Built | `rate_limit_rules` | SQL 10; HTTP |
| Bot protection: start token (3 s min, 30 min max), honeypot | Built | `_shared/startToken.ts` | HTTP |
| CAPTCHA | Not built | seam only, off by design | n/a |
| CORS allow-list | Partial | code done; `PUBLIC_SITE_ORIGINS` unset, falls back to placeholder domains | HTTP only with placeholders |
| Real client IP via `cf-connecting-ip` | Built | `rateLimit.ts` | measured on deployed function; re-measure if hosting changes |
| Smoke test against deployed endpoints | Built | `npm run smoke:public` | HTTP |

## 11. Public booking page and guest manage page
| Feature | Status | Where | Tested |
|---|---|---|---|
| Flow: service -> staff -> slot -> form -> confirmation | Built | `/<slug>/book` | UT 30; SIM; web click-through NONE recorded for the original build (later WEB checks of widget iframe) |
| Staff step skipped when hidden; staff filtered by service | Built | `StaffStep` | UT |
| Calendar + slot grid | Built | `SlotStep` | UT; SIM |
| Dynamic form (custom fields per service), PhoneInput E.164 | Built | `FormStep` | UT |
| Honeypot field hidden off-screen | Built | `HoneypotField` | HTTP |
| `too_fast` auto-retry, `slot_unavailable` returns to slot step keeping answers | Built | `BookingFlow` | UT |
| Back / Android back through steps; dirty-form confirm | Built | `goBack` | UT; CODE |
| Confirmation with manage link (token in URL fragment, copy button) | Built | `ConfirmationStep` | SIM |
| Generic "not available" page (no enumeration) | Built | `EmptyState` | HTTP |
| Guest manage page: view (first name only) | Built | `/<slug>/manage` | HTTP; SIM |
| Cancel with confirm dialog (window rule) | Built | `ManageView` | HTTP; dialog click NONE |
| Reschedule (same staff) with confirm dialog | Built | `RescheduleView` | HTTP; dialog click NONE |
| Reschedule with "any staff" fallback | Not built | known limit | n/a |
| Locations picker on public page (multi-branch) | Not built | primary branch only | n/a |
| Marketing/SEO per booking page | Partial | noindex, title/meta on web only | n/a |

## 12. Dashboard appointments
| Feature | Status | Where | Tested |
|---|---|---|---|
| `create_appointment` (dashboard, walk-in, own-scope forced staff) | Built | RPC | SQL 12 |
| `update_appointment` (reschedule / notes) | Built | RPC | SQL 12 |
| `cancel_appointment`, `mark_no_show`, `mark_completed`, `approve_appointment` | Built | RPCs | SQL 12 |
| `reopen_appointment` (Owner/Manager only, not invoiced) | Built | RPC | SQL 12 |
| Status transition table (cancelled is final) | Built | `appointment_status_transitions` | SQL 12 |
| `list_appointments` (keyset, filters, search, client) | Built | RPC | SQL 12, 13; perf measured |
| `get_calendar_appointments` | Built | RPC | SQL 12 |
| Fresh data on Today / Calendar (no Realtime) | Built | `useLiveRefetchInterval`, Calendar Refresh button | 30 s poll while focused |
| Calendar Day / Week / List | Built | `/calendar` | SIM (Day view screenshot); WEB; create/edit/cancel dialogs NONE recorded |
| One column per staff, shading from real hours/breaks/time off, now-line | Built | `StaffColumnsGrid`, `useDayShading` | UT; SIM |
| Create drawer (client search/new, service, staff, time, walk-in, out-of-hours warning) | Built | `CreateAppointmentForm` | UT; click NONE recorded |
| Detail drawer with permission-filtered actions and confirm dialogs | Built | `AppointmentDetailDrawer` | CODE; click NONE recorded |
| Pending-approval badge (tab + header) | Built | `usePendingApprovalCount` | SIM |
| Drag and drop | Not built | out of scope by decision | n/a |
| Today screen (counts, next highlight, quick actions) | Built | `/today` | SIM (empty state); day with real data NONE |
| Appointment messages block (send status) | Built | `AppointmentMessages` | WEB |

## 13. Clients
| Feature | Status | Where | Tested |
|---|---|---|---|
| Client list (search, keyset pagination, archived toggle, cards/table) | Built | `/clients` | SQL 13, 28, 31; SIM |
| Create/edit with duplicate-phone detection | Built | `ClientForm` | SQL 13; click NONE |
| Archive/unarchive with confirm | Built | profile | click NONE |
| Client profile (contact, notes, upcoming, history, invoices) | Built | `/clients/[id]` | WEB (later phases) |
| Contact lock: phone/email/notes behind `clients.view_contact` (DB column grants + `clients_v`) | Built | migrations 11A/11B | SQL 28, 31; HTTP 30 |
| Own-scope staff see only their clients | Built | RLS | SQL 07, 13, 21 |
| Sensitive answers behind `clients.view_sensitive` | Built | RLS | SQL 07 |
| Import / bulk upload of clients | Not built | n/a | n/a |
| Client tags, birthdays, custom client fields | Not built | n/a | n/a |

## 14. Invoices and reports
| Feature | Status | Where | Tested |
|---|---|---|---|
| Draft create/update/discard | Built | RPCs | SQL 14 (312) |
| Issue invoice, gapless per-branch number, tax snapshot | Built | `issue_invoice` | SQL 14; real 3-session concurrency 15 |
| Line items from service / free text / completed appointment | Built | editor | SQL 14; WEB |
| Discounts (permission + reason) | Built | RPC | SQL 14 |
| Payments cash/card/bank, overpayment refused | Built | `add_payment` | SQL 14 |
| Reverse payment (refund path, new row) | Built | RPC | SQL 14 |
| Credit notes (by net amount, own series) | Built | RPC | SQL 14 |
| Currency lock once invoiced | Built | trigger | SQL 14 |
| Immutability for all roles | Built | triggers | SQL 14 |
| Invoice list with filters, payment-state filter (side table) | Built | `list_invoices` | SQL 14, 32; perf 48 ms |
| Invoice drawer (view/edit/issue/pay/reverse/credit) | Built | `/invoices` | WEB |
| Printable invoice (web print), share text (native) | Built | `/invoice-print/[id]` | WEB print; native text only |
| PDF on native | Not built | needs expo-print (new dependency, ask) | n/a |
| Per-line credit notes | Not built | by amount only | n/a |
| Free (zero total) invoices | Not built | refused | n/a |
| Email invoice to client | Not built | n/a | n/a |
| Basic reports today / this month (revenue per currency, counts, top services) | Built | `/reports`, `get_basic_report` | SQL 14; WEB |
| Reports CSV / PDF (basic) | Not built | only advanced reports export | n/a |

## 15. Notifications
| Feature | Status | Where | Tested |
|---|---|---|---|
| Outbox in same transaction as the action | Built | `message_outbox`, trigger | SQL 17 (304) |
| Channel rule (email, else SMS if enabled, never both; walk-ins none) | Built | enqueue | SQL 17 |
| Email: booking confirmed | Built | `send_outbox` template | SQL; real send to owner address only |
| Email: pending received | Built | template | SQL; never delivered for real |
| Email: reminder (branch wall-clock hours before) | Built | cron + template | SQL (3 timezones); real send to owner address |
| Email: rescheduled | Built | template | SQL; never delivered for real |
| Email: cancelled | Built | template | SQL; never delivered for real |
| Email: manage link (resend) | Built | template | SQL; never delivered for real |
| Email: review request | Built | template | real send to owner address |
| Email: portal sign-in link | Built | template | one real send to owner address |
| Email: form signing link | Built | template | SQL only; **no real send** |
| Email: low-stock alert to staff user | Built | `lowStock.ts` | unit/SQL; **no real send** |
| Email: scheduled report summary | Built | `report.ts` | one real send to owner address |
| Email: team invite | Not built | link is copied | n/a |
| Rescheduled/cancelled emails carry a manage link | Not built | known limit | n/a |
| SMS (Twilio), credits, segments, per-country rates, quiet hours | Partial | code + SQL done; **no Twilio secrets, never sent** | SQL 17 only |
| SMS purchase by customers | Not built | credits added by super admin | n/a |
| Push to business users (Expo): new booking, pending, cancel, reminder, low stock | Partial | code done | **never delivered** (no EAS projectId, no device) |
| Web Push (VAPID) for PWA | Not built | seam only | n/a |
| Per-event push preferences | Built | `push_preferences` | SQL 17; WEB |
| Reminders cron (5 min), worker cron (1 min), maintenance (hourly) | Built | pg_cron | live on dev project; SQL 17 |
| Retries 1/4/16/64 min then dead; idempotency keys; stale-lock handling | Built | `outbox_*` | SQL 17; unit 31 |
| Daily caps (500 email / 200 SMS / 100 push), per-recipient cap | Built | `messaging_limits` | SQL 17 |
| Unsubscribe (signed token, POST only, same answer always) | Built | `unsubscribe` + `/unsubscribe` | HTTP; WEB |
| Message preview in settings | Built | `message_preview` | HTTP; WEB |
| Settings: notifications, SMS credits, messages log, my notifications | Built | `/settings/*` | WEB 375/1440 |
| Bounce / complaint / delivery-receipt webhooks | Not built | n/a | n/a |
| Email languages other than English | Not built | n/a | n/a |
| Log retention job for `messages` | Not built | outbox purges at 30 days only | n/a |

## 16. Reviews, website, widget
| Feature | Status | Where | Tested |
|---|---|---|---|
| Review request created on completion, link shown once | Built | `mark_completed` | SQL 16; WEB |
| Re-issue review link | Built | `reissue_review_request` | SQL 16; click NONE |
| Public review page (stars, comment, same Google link for all ratings) | Built | `/<slug>/review` | HTTP; WEB |
| Reviews screen: filters, reply, feature on website (max 12) | Built | `/reviews` | SQL 16; WEB |
| Staff see only own reviews | Built | RLS | SQL 16 |
| Super-admin takedown of a review | Built | `remove_review` | SQL 18 |
| Public website: 7 sections, show/hide/reorder, theme, SEO, JSON-LD | Built | `/<slug>`, `/website` | WEB 375/1440; SIM |
| Website editor, live preview, publish/unpublish | Built | `/website` | WEB |
| Image upload to `website-assets` (60-file cap) | Built | editor | REST; picking an image in UI NONE |
| Contact section: address, hours, WhatsApp/social | Built | contact form | WEB |
| Static SEO per business (server-rendered tags) | Partial | tags set client-side only | n/a |
| Widget key, allowed domains (max 10), rotate, snippet | Built | `/website` Widget tab | SQL 16; WEB |
| `public/widget.js` loader + `validate_widget` verify | Built | file, Edge | local HTML page test |
| **`frame-ancestors` header on `/<slug>/book`** | Not built | needs the web host; Edge cannot serve HTML | NONE. **Launch blocker** |
| Plan gate for widget (Team+) | Built | `embed_widget` | SQL 18; WEB |
| WordPress plugin | Not built | later by decision | n/a |
| Custom domain + SSL | Not built | out of scope | n/a |

## 17. Add-ons
| Feature | Status | Where | Tested |
|---|---|---|---|
| Packages: definitions (sessions, bonus, price, expiry, services) | Built | `/packages` | SQL 22; WEB |
| Package sold as invoice line at issue (snapshot) | Built | `issue_invoice` | SQL 22 |
| Deduct session (appointment drawer), balance on client | Built | `deduct_session` | SQL 22; 3-session race (23) |
| Undo within 10 min (creator) / reverse (permission, reason) | Built | RPCs | SQL 22 |
| Credit note cancels unused packages | Built | `create_credit_note` | SQL 22 |
| Packages report in advanced reports | Not built | doc 8.3 | n/a |
| Package badge on Today/Calendar rows | Not built | n/a | n/a |
| Inventory: products, SKU, unit, threshold, opening stock | Built | `/inventory` | SQL 22; WEB |
| Stock movements immutable; drop at issue; restore on exhausting credit note | Built | triggers | SQL 22; race (23) |
| Negative-stock switch per branch | Built | `set_inventory_settings` | SQL 22 |
| Low-stock badge, push, email | Partial | built; push and email never delivered for real | SQL 22 |
| Barcode, suppliers, transfers | Not built | n/a | n/a |
| Files & Photos: private bucket, signed URLs only, byte-sniffed types, 10 MB | Built | `client_files` Edge, `files` | SQL 24; HTTP 25 (42 checks) |
| Photo consent per client, upload refused without it | Built | `set_photo_consent` | SQL 24 |
| Client and appointment Files tab | Built | `ClientFilesSection` | WEB; upload from device NONE |
| PDF upload on native | Partial | `expo-document-picker` added, **needs native rebuild**, not run | NONE |
| Thumbnails, virus scan | Not built | n/a | n/a |
| Forms: builder, versions, services attach, never blocks booking | Built | `/settings/forms` | SQL 24 (144); WEB |
| Sign on device (signature pad) or by link | Built | `SignFormDrawer`, `/<slug>/sign` | HTTP 25 incl. parallel submit |
| Signed copies immutable, void as new row, sensitive redaction | Built | RPCs | SQL 24 |
| Form signing email | Partial | queued/templated; no real send | SQL |
| PDF of a signed form | Not built | n/a | n/a |
| Client portal: email-link sign-in (own sessions), bookings, packages, invoices, photos, forms list | Built | `/<slug>/portal`, `portal` Edge | SQL 26 (108); HTTP 26 (53); screenshots 375/1440 |
| Portal book / cancel / reschedule | Built | via public engines | HTTP; final button clicks NONE |
| Portal "My data" requests | Built | `PortalData` | HTTP; erasure button NONE |
| Dashboard view of portal sessions / sign-out-everywhere | Not built | n/a | n/a |
| Clinic bundle pricing | Not built | doc "untested" | n/a |

## 18. Plan features
| Feature | Status | Where | Tested |
|---|---|---|---|
| Commission rules (percent/flat/none, per staff and per service, versioned) | Built | `/commission` | SQL 19 (543); WEB (percent) |
| Commission earned on full payment, reversed proportionally | Built | `commission_sync` | SQL 19; race (20) |
| My earnings / Team report | Built | `/commission` | WEB |
| Flat and "no commission" rule UI | Built | form | NONE (not clicked) |
| Multi-branch: create/edit/archive/restore/make main | Built | `/settings/branches` | SQL 19, 21; WEB (create/archive); restore/make-main NONE |
| Combined overview (per currency) | Built | Overview tab | SQL 19; WEB |
| Location switcher (header, More) | Built | `BranchSwitcher` | WEB; mobile switcher only in More |
| Branch-scope RLS across staff/services/clients/audit | Built | migrations 9B | SQL 21, 31 |
| Public site/booking for non-primary branches | Not built | primary only | n/a |
| Advanced reports: revenue, staff, services, clients, appointments, branches | Built | `/settings/advanced-reports` | SQL 19; WEB |
| Week / month / custom range with previous-period deltas | Built | UI | WEB; custom range NONE |
| CSV export (web download, native share text) | Built | `saveTextFile` | WEB read; native NONE |
| Print view / save as PDF (web) | Built | `/report-print` | WEB |
| Scheduled weekly/monthly report email | Partial | cron + template done; schedule toggles NONE in UI; one real send | SQL 19 |
| Real PDF / attachment on native | Not built | needs expo-print | n/a |

## 19. GDPR and data rights
| Feature | Status | Where | Tested |
|---|---|---|---|
| Export one client (JSON, audited) | Built | `gdpr_export_client` | SQL 29 (72); HTTP 30; download button NONE |
| Erase one client (anonymise, financial rows kept) | Built | `gdpr_erase_client`, `gdpr` Edge | SQL 29; HTTP 30 (28); WEB (dialog) |
| Typed-name erase dialog with blocked reasons | Built | `EraseClientDialog` | WEB |
| Data requests screen (open/done/declined) | Built | `/settings/data-requests` | WEB list + decline dialog; "Run export/erase", decline confirm NONE |
| Business erase (Owner, typed name, storage first) | Built | `/settings/delete-business` | SQL 29; WEB screens |
| Portal data requests | Built | see 17 | HTTP |
| Legal texts: privacy policy, terms, DPA | Not built | owner task | n/a |
| User account deletion | Not built | see Auth | n/a |
| Retention policy / job | Not built | owner carries duty | n/a |

## 20. Edge Functions (16) and secrets
| Function | Status | JWT | Tested |
|---|---|---|---|
| `get_booking_page`, `get_slots`, `create_booking`, `manage_booking` | Built | false | HTTP, smoke |
| `get_website`, `get_review_request`, `submit_review`, `validate_widget` | Built | false | HTTP |
| `sign_form`, `portal`, `unsubscribe` | Built | false | HTTP |
| `send_outbox` (cron worker, `x-worker-token`) | Built | false | HTTP/dev cron |
| `resend_manage_link`, `message_preview`, `client_files`, `gdpr` | Built | true | HTTP |
| `send-push` single sender (docs/reference/push.md) | Partial | exists inside `send_outbox`, no web push | see above |
| Polar webhook / checkout function | Not built | n/a | n/a |

## 21. Database and operations
| Feature | Status | Where | Tested |
|---|---|---|---|
| 130 migrations, 85 tables all RLS on, anon has no table grants | Built | `supabase/migrations` | list matches (verified); advisors per doc |
| SQL suites 01-32 (+ concurrency scripts 15, 20, 23, HTTP scripts 25, 26, 30) | Built | `supabase/tests` | last green run recorded 2026-10-07; **not re-run in this audit** |
| Advisors clean except accepted items | Built | per security review | read only |
| Backups, PITR | Not built | free plan | n/a |
| Monitoring / alerts / uptime checks | Not built | n/a | n/a |
| Error reporting service | Not built | needs a dependency decision | n/a |
| Seed data for production | Built | none by design | n/a |
| Production Supabase project | Not built | only the dev project `rfuovquhultjydtswtqf` exists | n/a |
| Web hosting | Not built | none chosen | n/a |
| EAS config, store builds | Not built | no `eas.json`, no `projectId` | n/a |

## 22. Deliberately out of scope (not counted below)
Online payments/deposits (customer to business), waitlist, custom domain + SSL, drag-and-drop calendar, recurring and multi-service bookings, staff-specific price/duration, marketing email campaigns, dark mode, WordPress plugin, memberships/gift cards/loyalty, calendar sync, marketplace, HIPAA claims.

---

## Totals

| Status | Rows |
|---|---|
| Built | 235 |
| Partial | 21 |
| Not built | 69 |
| **All rows** | **325** |

Rows group related small items (one row can be a screen with its buttons), so this is a count of table rows, not of every button. Out-of-scope items (section 22) are not counted.

## Everything Partial or Not built


**1. Foundation and platform**

- **Not built**: Other languages (only `en`; none)
- **Partial**: RTL engine (start/end, directional chevrons) (code is RTL-ready; RTL NONE (never viewed))
- **Not built**: Final brand, domain, bundle id, support email (`brand.ts`: `app.wapee.com`, `wapee.site`, `com.wapee.app`, `support@wapee.com` are placeholders; n/a)
- **Partial**: PWA icons incl. maskable, apple-touch (`public/icons/`; placeholder artwork)
- **Not built**: Offline mode / offline data (SW caches shell only (by design); n/a)
- **Partial**: `app/(portal)/portal` route (still a `PlaceholderScreen`; the real portal is `/<slug>/portal`; stale route, harmless, remove)
- **Partial**: CI workflow (`.github/workflows/ci.yml` written, **never run**; NONE)

**2. Auth**

- **Not built**: Social login (doc lists as future; n/a)
- **Not built**: Custom auth email templates (branded) (Supabase default templates; n/a)
- **Not built**: Custom SMTP for auth mail (hosted dashboard setting, not done; NONE)
- **Not built**: Leaked-password protection (Pro-plan only; n/a)
- **Not built**: Account (user) deletion (business erase exists; the sign-in account is never deleted; n/a. Store policy risk)
- **Not built**: Change email / change password inside the app (no screen found in context; n/a)

**3. Onboarding**

- **Partial**: Industry presets (starter fields, terminology, template) (table + super-admin editor exist; content is empty, "defined by owner outside development"; SQL 18 for the editor)
- **Not built**: Business switcher for people in several businesses (store supports it, no UI (location switcher exists, business switcher does not); n/a)

**4. Roles, permissions, members**

- **Not built**: Invite by email (sent mail) (no outbox event for invites; link is copied by hand; n/a)
- **Not built**: Members list pagination (unpaginated list; n/a)
- **Not built**: Staff profile <-> invite link ("give this person app access") (use Team > invite; n/a)
- **Partial**: Suite 04 (invite flow) (file exists, repaired in 9B; SQL 04 runs via runner)

**5. Plans, billing, trial lock**

- **Partial**: Prices (plan and add-on) (placeholders 1500 / 3900 / 7900; editable by super admin; n/a)
- **Not built**: Online subscription payment (Polar) (nothing in repo; n/a)
- **Not built**: Billing history / invoices from Wapee to businesses (n/a; n/a)
- **Not built**: Upgrade prompts / plan picker (decided: calm text only; n/a)
- **Not built**: Solo "owner only" enforcement (known limit; n/a)
- **Not built**: Trial email reminders (banner only; n/a)

**6. Super admin**

- **Not built**: Super admin account created in production (manual SQL + TOTP enrol, per go-live plan; n/a)
- **Not built**: Dashboard screen for customer portal sessions (n/a; n/a)

**7. Catalogue (services)**

- **Partial**: Categories (create via hook, list grouping) (no screen to rename/delete a category; n/a)
- **Partial**: Resources (rooms/chairs): list, create, delete (`/schedule` Rooms tab; capacity always 1, no service-linking UI; WEB; capacity>1 only by SQL 06/08)
- **Partial**: Atomic save (service + prices + staff in one transaction) (3 sequential writes; n/a)
- **Not built**: Services list pagination (loads all; n/a)

**8. Staff and schedule**

- **Not built**: Half-day / hourly time off (whole days only; n/a)
- **Not built**: Time-off approval workflow (deliberate; n/a)
- **Not built**: Overnight shifts (known limit; n/a)
- **Not built**: Staff avatar / photo (n/a; n/a)
- **Not built**: Staff reordering (n/a; n/a)
- **Not built**: "My profile" screen for staff (n/a; n/a)

**9. Booking settings and form**

- **Not built**: Per-branch booking form (per business by design; n/a)
- **Not built**: Per-service people-per-slot (per branch by design; n/a)
- **Partial**: Atomic custom-field save (field row and services are separate writes; n/a)

**10. Booking engine and public API**

- **Not built**: CAPTCHA (seam only, off by design; n/a)
- **Partial**: CORS allow-list (code done; `PUBLIC_SITE_ORIGINS` unset, falls back to placeholder domains; HTTP only with placeholders)

**11. Public booking page and guest manage page**

- **Not built**: Reschedule with "any staff" fallback (known limit; n/a)
- **Not built**: Locations picker on public page (multi-branch) (primary branch only; n/a)
- **Partial**: Marketing/SEO per booking page (noindex, title/meta on web only; n/a)

**12. Dashboard appointments**

- **Not built**: Drag and drop (out of scope by decision; n/a)

**13. Clients**

- **Not built**: Import / bulk upload of clients (n/a; n/a)
- **Not built**: Client tags, birthdays, custom client fields (n/a; n/a)

**14. Invoices and reports**

- **Not built**: PDF on native (needs expo-print (new dependency, ask); n/a)
- **Not built**: Per-line credit notes (by amount only; n/a)
- **Not built**: Free (zero total) invoices (refused; n/a)
- **Not built**: Email invoice to client (n/a; n/a)
- **Not built**: Reports CSV / PDF (basic) (only advanced reports export; n/a)

**15. Notifications**

- **Not built**: Email: team invite (link is copied; n/a)
- **Not built**: Rescheduled/cancelled emails carry a manage link (known limit; n/a)
- **Partial**: SMS (Twilio), credits, segments, per-country rates, quiet hours (code + SQL done; **no Twilio secrets, never sent**; SQL 17 only)
- **Not built**: SMS purchase by customers (credits added by super admin; n/a)
- **Partial**: Push to business users (Expo): new booking, pending, cancel, reminder, low stock (code done; **never delivered** (no EAS projectId, no device))
- **Not built**: Web Push (VAPID) for PWA (seam only; n/a)
- **Not built**: Bounce / complaint / delivery-receipt webhooks (n/a; n/a)
- **Not built**: Email languages other than English (n/a; n/a)
- **Not built**: Log retention job for `messages` (outbox purges at 30 days only; n/a)

**16. Reviews, website, widget**

- **Partial**: Static SEO per business (server-rendered tags) (tags set client-side only; n/a)
- **Not built**: **`frame-ancestors` header on `/<slug>/book`** (needs the web host; Edge cannot serve HTML; NONE. **Launch blocker**)
- **Not built**: WordPress plugin (later by decision; n/a)
- **Not built**: Custom domain + SSL (out of scope; n/a)

**17. Add-ons**

- **Not built**: Packages report in advanced reports (doc 8.3; n/a)
- **Not built**: Package badge on Today/Calendar rows (n/a; n/a)
- **Partial**: Low-stock badge, push, email (built; push and email never delivered for real; SQL 22)
- **Not built**: Barcode, suppliers, transfers (n/a; n/a)
- **Partial**: PDF upload on native (`expo-document-picker` added, **needs native rebuild**, not run; NONE)
- **Not built**: Thumbnails, virus scan (n/a; n/a)
- **Partial**: Form signing email (queued/templated; no real send; SQL)
- **Not built**: PDF of a signed form (n/a; n/a)
- **Not built**: Dashboard view of portal sessions / sign-out-everywhere (n/a; n/a)
- **Not built**: Clinic bundle pricing (doc "untested"; n/a)

**18. Plan features**

- **Not built**: Public site/booking for non-primary branches (primary only; n/a)
- **Partial**: Scheduled weekly/monthly report email (cron + template done; schedule toggles NONE in UI; one real send; SQL 19)
- **Not built**: Real PDF / attachment on native (needs expo-print; n/a)

**19. GDPR and data rights**

- **Not built**: Legal texts: privacy policy, terms, DPA (owner task; n/a)
- **Not built**: User account deletion (see Auth; n/a)
- **Not built**: Retention policy / job (owner carries duty; n/a)

**20. Edge Functions (16) and secrets**

- **Partial**: `send-push` single sender (docs/reference/push.md) (exists inside `send_outbox`, no web push; see above)
- **Not built**: Polar webhook / checkout function (n/a; n/a)

**21. Database and operations**

- **Not built**: Backups, PITR (free plan; n/a)
- **Not built**: Monitoring / alerts / uptime checks (n/a; n/a)
- **Not built**: Error reporting service (needs a dependency decision; n/a)
- **Not built**: Production Supabase project (only the dev project `rfuovquhultjydtswtqf` exists; n/a)
- **Not built**: Web hosting (none chosen; n/a)
- **Not built**: EAS config, store builds (no `eas.json`, no `projectId`; n/a)
