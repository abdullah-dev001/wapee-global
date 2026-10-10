# How Wapee works today: business flows, checked against the code

Checked on 2026-10-10 against branch `dev` (commit `cf9b101`) and the dev database. Every step cites
the file that does it. Planning docs were NOT used as evidence.

**Status words**
- **WORKS**: built and enforced (database, RPC or Edge Function), and the screen exists.
- **PARTIAL**: works in part, or only with a manual step / SQL, or for some plans only.
- **MISSING**: not built.
- **DISPLAY-ONLY**: shown in the app, admin or landing page, but nothing enforces or performs it.

Short names used below:
- `M/x` = `supabase/migrations/x.sql`
- `F/x` = `supabase/functions/x`
- "permission set" = the four system roles as stored in the dev database (`role_permissions`): Owner 47
  permissions (all scope), Manager 39 (branch scope), Receptionist 20 (branch), Staff 12 (own).

---

## 1. Solo business (owner is also the only staff member)

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Owner signs up with email + password, must confirm the email before anything else | `app/(auth)/signup.tsx`, `src/features/auth/components/AuthGate.tsx` (unverified -> `/verify`, verified with no business -> `/onboarding`) | WORKS |
| 2 | Onboarding: business name, address (slug), industry, then first location name, country, currency, time zone | `app/(auth)/onboarding.tsx` | WORKS |
| 3 | One transaction creates the business, the first branch (owns country / currency / time zone, invoice prefix), the Owner membership and a 14-day trial | `create_business_with_owner` in `M/20261002120000_branch_owns_locale_and_tax` | WORKS |
| 4 | A subscription row (`trialing`) and default booking settings (online booking ON, 24 h cancel cut-off) are created by triggers | `businesses_create_subscription` in `M/20261010090000_phase8_plans_schema`; `create_default_booking_settings` in `M/20261003090000_booking_settings_and_form` | WORKS |
| 5 | The owner is NOT automatically a bookable staff member: they must add themselves under Staff | `src/features/staff/api/useStaff.ts` (nothing creates a staff profile at signup) | PARTIAL (not explained in the UI) |
| 6 | The owner's own staff profile cannot be linked to their login (no screen sets `staff_profiles.member_id`) | `src/features/staff/components/StaffForm.tsx`, `invite_member` in `M/20261002162000_fix_invite_member_ambiguous_column` | MISSING (harmless for an Owner, who sees everything anyway) |
| 7 | Solo cap: 1 active bookable staff profile per location | trigger `staff_branches_enforce_cap` in `M/20261010100000_phase8_feature_gating` | WORKS (after the trial; the trial is Business-level, no cap) |
| 8 | "Owner only" on Solo: other people can still be invited as Manager / Receptionist / Staff (logins are not capped, only staff profiles) | `invite_member` (no plan check) | DISPLAY-ONLY (the Solo limit is about profiles, not logins) |
| 9 | Edit branch address, phone, tax rate, time zone after onboarding: only on the Locations screen, which shows only when the plan has `multi_branch` (Business, or during the trial) | `app/(app)/settings/index.tsx` (`useFeatureFlag('multi_branch')`), `update_branch` in `M/20261011110000_phase9_multi_branch` (the RPC itself is not plan-gated) | PARTIAL: once on Solo, no screen to set tax rate / address; invoices then use tax 0 (`src/features/invoices/components/InvoiceEditor.tsx` reads the branch rate) |

**Typical day (Solo):**
1. Morning: the owner opens `/today` and sees the day's bookings (refreshes every 30 s while open).
2. A client books 15:00 on `/<slug>/book`; the client gets a confirmation email if they gave an email.
3. The owner gets a push notification (web push if they enabled it; NOT on the native apps yet, see case 7).
4. After the visit the owner marks it completed; a review request email goes out (if enabled and the client has an email).
5. The owner creates an invoice and records a cash payment.

---

## 2. Team business (owner + staff with their own logins)

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Owner invites a person by email with a role and (optionally) a branch; the app shows a one-time link to copy | `src/features/members/components/InviteMemberForm.tsx`, `invite_member` RPC | PARTIAL: the link is NOT emailed, the owner must send it themselves |
| 2 | The invited person opens the link, signs up / signs in, accepts | `app/(auth)/accept-invite.tsx`, `accept_invite` (`M/20261002163000_fix_invite_rate_limit`) | WORKS |
| 3 | Manage members: change role, remove, revoke invite | `src/features/members/components/MemberManageDrawer.tsx`, `M/20261012110000_phase9b_member_admin` | WORKS |
| 4 | **Owner** (47 permissions, all branches): everything incl. billing view, business settings, roles, website, client erase | permission set | WORKS |
| 5 | **Manager** (39, branch scope): appointments (create / edit / cancel / approve), calendar for all staff, clients incl. contact + sensitive + export, invoices incl. discounts and credit notes, reports incl. revenue + advanced, services, staff + schedules, booking settings, reviews, inventory, packages, files, forms, invite users. NOT: billing, business settings, roles, website edit/publish, client erase, commission rules | permission set | WORKS |
| 6 | **Receptionist** (20, branch scope): appointments (create / edit / cancel / approve), calendar all staff, clients (view, create, edit, contact), invoices create/view, packages sell/deduct, files, inventory view, reviews view, staff view. NOT: reports, services, schedules, settings, discounts / credit notes | permission set | WORKS |
| 7 | **Staff** (12, OWN scope): own appointments (view / create / edit, not cancel), own clients (no phone/email: `clients.view_contact` is missing), own commission, own schedule, files, package deduction | permission set; own scope via `is_own_staff_profile()` in `M/20261002180000_catalogue` | **PARTIAL / BLOCKED**: "own" means the staff profile whose `member_id` is the user's membership, and NO screen or RPC ever sets `member_id` (on dev: 1 of 3 profiles linked, by SQL). A new Staff login therefore sees no appointments and cannot be assigned bookings as "theirs" |
| 8 | Custom roles (Business, or Team add-on) | `M/20261011090000_phase9_custom_roles`, `app/(app)/settings/roles.tsx` | WORKS (gated) |
| 9 | Team cap: 5 bookable staff profiles per location | `staff_branches_enforce_cap` | WORKS (profiles only; logins unlimited) |
| 10 | "Ready-made team roles" as a Team+ feature (`default_roles` flag) | the flag is read only by `src/features/plans/featureLogic.ts` and the landing page; no SQL check | DISPLAY-ONLY (Solo also gets the roles) |
| 11 | Staff commission (Team+) | `M/20261011100000_phase9_commission` (`feature_gate_error(...,'commission')`), `app/(app)/commission.tsx` | WORKS |

**Typical day (Team):**
1. The receptionist opens the Calendar and books a walk-in for Sam at 11:00.
2. Sam (Staff role) signs in on their phone... and sees an empty Today, because their login is not linked to their staff profile (gap 2).
3. A client books online with Sam; managers/receptionists with `appointments.view` get a push.
4. The manager approves a pending booking and checks the day's revenue report.
5. The owner looks at commission for the month (Team+).

---

## 3. Single-branch business with several services and staff

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Create services (name, duration, buffer, category, online-bookable) with a price for the branch | `src/features/services/api/useServices.ts` (writes `services` + `service_branches` price + `service_staff`) | WORKS (several separate writes, not one transaction) |
| 2 | Create staff (name, contact, online-bookable), pick branches and services | `src/features/staff/api/useStaff.ts` (`staff_profiles` + `staff_branches` + `service_staff`) | WORKS (not one transaction) |
| 3 | Branch opening hours | `replace_branch_hours` via `src/features/schedule/api/useBranchSchedule.ts` | WORKS |
| 4 | Each staff member's working hours, breaks, time off; holidays / closures; rooms | `src/features/schedule/api/useSchedule.ts` (`replace_staff_working_hours` and friends) | WORKS |
| 5 | Staff list shows a "no working hours" badge, the staff form a warning + button | `src/features/staff/components/StaffList.tsx`, `StaffForm.tsx` | WORKS |
| 6 | Slots = branch hours AND staff hours, minus breaks, time off, holidays, existing bookings, buffer, minimum notice, booking window, capacity | `get_free_slots` in `M/20261003150000_slots_include_booked` | WORKS |
| 7 | No double booking: exclusion constraints on staff + time and resource + time; group/resource capacity under an advisory lock | `create_booking` (`M/20261003160000_create_booking` and later fixes) | WORKS |
| 8 | Client chooses staff or "any" (setting `staff_choice`) | `src/features/booking-public/components/StaffChoice.tsx` | WORKS |

**Typical day:** the owner adds a new "Beard trim" service and ticks two staff; it appears on the booking
page at once. A client picks "any staff"; the engine offers times when at least one of them is free in both
branch and staff hours. The receptionist moves a booking by 30 minutes; the client gets a "rescheduled" email.

---

## 4. Multi-branch business

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Add / edit / archive / restore a location, set primary | `create_branch`, `update_branch`, `archive_branch`, `restore_branch`, `set_primary_branch` in `M/20261011110000_phase9_multi_branch` (+ fix `M/20261011150000_phase9_create_branch_fix`); screen `src/features/branches/components/BranchesScreen.tsx` | WORKS (Business plan or trial) |
| 2 | Branch limit by plan (Solo 1, Team 1, Business unlimited) | trigger `branches_enforce_limit` in `M/20261010100000_phase8_feature_gating`; `branch_admin_gate` = `multi_branch` feature | WORKS |
| 3 | Per-branch hours, per-branch service price and on/off, per-branch currency / time zone / tax / invoice series | `branch_hours`, `service_branches`, `branches` columns | WORKS |
| 4 | Staff in several branches, with hours per branch | `staff_branches`, `staff_working_hours.branch_id` | WORKS |
| 5 | Branch switcher in the header and on Today; combined overview across branches | `src/features/branches/components/BranchSwitcher.tsx`, `src/components/layout/Header.tsx`, `get_combined_overview` | WORKS |
| 6 | Compare branches report | `M/20261011120000_phase9_advanced_reports` (`branch_comparison`) | WORKS |
| 7 | **Client chooses a branch on the booking page** | `src/features/booking-public/api/useBookingPage.ts` sends only `{ slug }`; `resolveBranch` in `F/_shared/supabase.ts` then picks the PRIMARY branch | **MISSING**: every online booking goes to the primary branch; other branches cannot be booked online. The booking link card also gives one link per business (`src/features/booking-settings/components/BookingLinkCard.tsx`) |
| 8 | "Each extra location billed the same" (Business price per location) | stored as `plans.priced_per_branch`; no billing code | DISPLAY-ONLY |

**Typical day:** the owner switches the header to "Downtown", checks its Today list, then looks at the
combined overview. A client who wants "Uptown" opens the booking link... and can only book Downtown (the
primary branch), so the receptionist books Uptown clients by phone.

---

## 5. Plans, trial and billing

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Signup starts a **14-day trial** (constant `v_trial_days = 14`) | `create_business_with_owner` | WORKS |
| 2 | During the trial: Business-level features and EVERY add-on on, no caps | `business_has_feature` / `business_plan_limits` in `M/20261010100000_phase8_feature_gating` (trialing -> plan `business`, add-ons true) | WORKS |
| 3 | Trial end: no cron; the business is simply "inactive" once `trial_ends_at` passes | `business_is_active` in `M/20261001184500_members_assignments_audit_helpers` | WORKS |
| 4 | Inactive = every permission check fails (data locked), the app shows a lock screen except Settings / Billing; public booking page and website disappear | `perm_branch_ids` etc. in `M/20261016130000_phase11a_rls_perf` (require an active business); `src/features/billing/components/ActiveBusinessGate.tsx`, `TrialEndedScreen.tsx`; `resolveBranch` | WORKS |
| 5 | Trial warning banner in the last 3 days (`TRIAL_WARNING_DAYS = 3`), Owner only (`settings.billing`) | `src/features/billing/components/TrialBanner.tsx`, `trialCountdown.ts`, `useTrialBannerVisible.ts` | WORKS |
| 6 | Plan caps that exist: staff profiles per location (Solo 1, Team 5), locations (Solo 1, Team 1). No caps on bookings, clients, logins, services | `plans.staff_cap`, `plans.max_branches`; triggers in `M/20261010100000` | WORKS (what exists); there is NO booking limit |
| 7 | Plan features enforced in SQL: `commission`, `advanced_reports`, `branch_comparison`, `multi_branch`, `custom_roles`, `embed_widget`, add-ons. NOT enforced: `default_roles`. Always on: core, website, reviews, booking link | grep of each key in `supabase/migrations` | WORKS except `default_roles` (DISPLAY-ONLY) |
| 8 | Downgrade refused when over the new plan's limits | `assign_plan` / `set_business_status` in `M/20261010110000_phase8_super_admin_rpcs` (`over_limit`) | WORKS |
| 9 | Owner's billing screen: plan, status, trial end / period end, staff usage vs cap, add-ons on/off, "Contact us" email | `src/features/plans/components/BillingScreen.tsx` | WORKS (read-only; no buying) |
| 10 | Payment, card, invoices for the subscription, self-serve upgrade / downgrade / cancel | none (Polar not integrated) | **MISSING** (manual billing only) |
| 11 | Manual billing: super admin assigns a plan (+ optional period end), sets status, extends the trial | `assign_plan`, `set_business_status`, `extend_trial` in `M/20261010110000`; `src/features/admin/components/BusinessDetailScreen.tsx` | WORKS |
| 12 | Paid period end (`current_period_end`) | stored by `assign_plan`; nothing reads it to deactivate | DISPLAY-ONLY: an "active" business stays active forever until the super admin changes it |
| 13 | Monthly vs yearly price | stored in `plans` / `addons`, shown on the landing page | DISPLAY-ONLY (no billing) |
| 14 | Suspension by super admin: business inactive, its users cannot sign in (Auth hook), their sessions are revoked | `set_business_status('suspended')`, `custom_access_token_hook` in `M/20261020110000_suspended_login_block` | PARTIAL: the Auth hook must be switched on by hand in the Supabase dashboard (Auth > Hooks); without it only the app's own check signs them out |

**Typical day:** a trial ends at midnight. Next morning the owner sees the "trial ended" lock screen and the
booking page shows "not found" to clients. The owner emails support; the super admin assigns "Team", the
business is active again within a minute (no refresh needed beyond focus). Nobody is charged by the system.

---

## 6. Add-ons

| Add-on | Price source | Gate | Status |
|---|---|---|---|
| Packages & Sessions | `addons` table | `feature_gate_error(...,'packages')` in every module RPC (`M/20261013110000_phase10a_package_and_inventory_rpcs`) + `my_features()` hides UI | WORKS |
| Inventory | `addons` | same (`inventory`) | WORKS |
| Files & Photos | `addons` | same (`files_photos`, `M/20261014100000_phase10b_files_rpcs`); private bucket, signed URLs | WORKS |
| Forms & Consent | `addons` | same (`forms_consent`, `M/20261014110000_phase10b_forms_rpcs`) | WORKS |
| Client portal | `addons` | same (`client_portal`); `M/20261015100000_phase10c_portal_rpcs` | WORKS (proven over HTTP; UI buttons not all clicked) |
| Custom roles | `addons` (Team only; included in Business) | trigger `roles_enforce_custom_roles_feature` | WORKS; but "Team only" (`addons.available_plans`) is display-only: the super admin could switch it on for Solo and nothing refuses |
| Embed widget | plan feature (Team+), not an add-on | `widget_feature_enabled()`; `src/config/launch.ts` `widget: false` hides the tab | OFF at launch (code exists) |
| SMS + credits | per-business credits ledger, admin rates | `src/config/launch.ts` `sms: false`; `notification_settings.sms_enabled` default false | OFF at launch (Twilio untested) |

How an owner gets an add-on today:
1. The owner sees add-ons on/off on the billing screen (`BillingScreen.tsx`) and presses "Contact us". There is **no buy button**. MISSING (self-serve).
2. The super admin switches it on in the business detail (`set_addon`, `src/features/admin/components/BusinessDetailScreen.tsx`). WORKS.
3. The price is not charged anywhere. DISPLAY-ONLY.
4. When an add-on is switched off, its menus, screens and permission rows disappear and its RPCs refuse with `feature_unavailable`. The data stays in the database, hidden. WORKS.

**Typical day:** an owner on Team wants client photos. They email support. The super admin turns on
"Files & Photos". The Files tab appears on client profiles at the next refresh. Billing for it is done by hand.

---

## 7. Client (customer) side

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Client opens `https://wapee.online/<slug>/book` (or the website `/<slug>` "Book" button when the website is published) | `app/(public)/[slug]/book.tsx`, `F/get_booking_page`, `F/get_website` | WORKS |
| 2 | Business must be active, booking enabled and the branch bookable; otherwise a neutral "not available" page | `resolveBranch` (`F/_shared/supabase.ts`), `branch_is_bookable` in `M/20261020120000_branch_bookable_staff_hours` | WORKS |
| 3 | Branch choice | only the primary branch (see case 4) | **MISSING** |
| 4 | Pick service -> staff (or any) -> date and time -> form | `src/features/booking-public/components/BookingFlow.tsx`, `F/get_slots` | WORKS |
| 5 | Form: name + phone required (phone is the client identity), email optional by default (`require_client_email` default false), custom questions | `M/20261005100000_require_client_email`, form builder | WORKS |
| 6 | Bot protection: honeypot, too-fast check, per-IP rate limits | `src/features/booking-public/botProtection.ts`, `M/20261004090000_public_request_attempts` (per-IP limits) | WORKS |
| 7 | Booking is created in one transaction; returning clients matched by phone; no account needed | `create_booking` (`F/create_booking`, `M/20261003160000_create_booking`) | WORKS |
| 8 | Confirmation screen shows the manage link (`/<slug>/manage#token=...`) | `BookingFlow.tsx` | WORKS |
| 9 | Confirmation / pending / rescheduled / cancelled emails to the client | trigger `notify_appointment_change` in `M/20261008110000_phase6_enqueue_and_hooks`; `F/send_outbox` (Resend) every minute (`cron outbox-worker`) | PARTIAL: only when the client gave an email; real delivery needs a verified Resend domain in production (dev sender delivers only to the Resend account owner) |
| 10 | Reminder (default 24 h before, quiet hours 21:00-08:00) | `enqueue_due_reminders` every 5 min (`M/20261008130000_phase6_reminders_and_cron`), `notification_settings` defaults | PARTIAL (email only, same delivery caveat) |
| 11 | Manage link: view, cancel (default cut-off 24 h), reschedule to a free slot | `app/(public)/[slug]/manage.tsx`, `src/features/booking-manage/*`, `F/manage_booking`, `M/20261004100000_guest_manage_rpcs` | WORKS |
| 12 | Business side: push to users with `appointments.view` for that branch/staff (`push_recipient_users`), new booking appears in Calendar / Today (30 s refresh while open, or on focus) | `notify_appointment_change`; `useLiveRefetchInterval` | PARTIAL: web push WORKS (VAPID); native app push MISSING (no EAS `projectId` in `app.config.ts`); Staff-role users without a linked profile get nothing for "their" bookings |
| 13 | Approval mode (`confirmation = approval`): booking is `pending`, staff get "pending approval", approve -> client gets the confirmation | `notify_appointment_change`, `approve_appointment` (`M/20261004043134_phase4_status_rpcs`) | WORKS |
| 14 | No-show: staff mark it manually (`mark_no_show`); nothing automatic | `M/20261004043134_phase4_status_rpcs` | WORKS (manual only) |
| 15 | Walk-in / phone booking by staff (`create_appointment`, source walk_in or dashboard); walk-ins send no messages; staff may book outside hours but never double-book | `M/20261004042940_phase4_appointment_rpcs`; Calendar create drawer | WORKS |
| 16 | Review request after "completed" (email with a review link) | `mark_completed` + review request seams in `M/20261008110000` | PARTIAL (needs the client's email + delivery) |

**Typical day (client):** Maria opens the link from Instagram, picks "Haircut", "any staff", Thursday 10:30,
types her name and phone (skips email), and sees the confirmation with a manage link she should bookmark.
Because she left no email she gets no reminder. Wednesday she uses the manage link to move to 11:00. The
salon's receptionist sees the change on the Calendar within 30 seconds.

---

## 8. Owner onboarding to the FIRST bookable slot

Exact order that works today (each item is required by `branch_is_bookable` or `get_free_slots`):

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Sign up, confirm email | `signup.tsx`, `/verify`, `AuthGate.tsx` | WORKS |
| 2 | Onboarding: business name, slug, industry, branch, country, currency, time zone | `onboarding.tsx` -> lands on `/today` | WORKS |
| 3 | Booking settings already exist with online booking ON | trigger `create_default_booking_settings` | WORKS (automatic) |
| 4 | Set branch opening hours (Schedule > branch hours) | `replace_branch_hours` | WORKS (manual; required: `no_branch_hours`) |
| 5 | Create at least one service: active, online-bookable, enabled with a price for this branch | `useServices.ts` | WORKS (required: `no_bookable_service`) |
| 6 | Create at least one staff member (the owner too, on Solo): active, online-bookable, assigned to this branch | `useStaff.ts` | WORKS (required: `no_bookable_staff`) |
| 7 | Link service and staff (the staff member performs the service) | service or staff form | WORKS (required: `no_staffed_service`) |
| 8 | Give that staff member working hours at this branch | Schedule > staff hours | WORKS (required: `no_staff_hours`) |
| 9 | (Optional) business address / tax rate: only via Locations (trial / Business) | `BranchesScreen.tsx` | PARTIAL (see case 1) |
| 10 | (Optional) website: build + publish so `/<slug>` shows | `app/(app)/website.tsx` | WORKS |
| 11 | Share `/<slug>/book` (copy from Settings > Booking; the card shows the link only when bookable) | `BookingLinkCard.tsx` | WORKS |

What the UI tells the owner:
- **Settings > Booking** lists every unmet reason with a "fix" button (`src/features/booking-settings/components/BookingWarnings.tsx`, `bookingWarnings.ts`). WORKS.
- The staff list shows a "no working hours" badge. WORKS.
- **After onboarding the owner lands on an empty Today** ("No appointments. Nothing booked for this day yet."; `TodayScreen.tsx`). There is **no setup checklist** on Today or anywhere visible by default; the owner must find Settings > Booking. MISSING.

**Typical day (first setup):** sign up, confirm email, onboarding (2 steps), add hours, add "Haircut 30 min
at 25", add yourself as staff, tick Haircut, add your working hours, open Settings > Booking: no warnings,
copy the link. About 10-15 minutes if you know the order; without a checklist most people will miss step 8.

---

## 9. Super admin

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Access: platform flag on the profile (set by SQL) + TOTP 2FA (every admin RPC needs `aal2`) | `admin_gate()`, `src/features/admin/components/AdminAccessGate.tsx`, `TwoFactorScreen.tsx` | WORKS (flag is set by hand in SQL) |
| 2 | Businesses list (search, plan / status filters) and detail (plan, usage, add-ons, SMS balance) | `list_businesses`, `get_business_detail`; `BusinessesScreen.tsx`, `BusinessDetailScreen.tsx` | WORKS |
| 3 | Assign plan, set status (active / inactive / suspended), extend trial, add-ons on/off, SMS credits | `M/20261010110000_phase8_super_admin_rpcs`, `AdminActionDialogs.tsx` | WORKS (audited) |
| 4 | Platform settings: plan + add-on prices (monthly, yearly, per location, add-on availability), SMS rates, industry presets | `set_plan_prices`, `set_addon_prices` (`M/20261021090000_public_pricing`), `PlatformScreen.tsx`, `PricesEditor.tsx` | WORKS (prices are only displayed; nothing charges them) |
| 5 | Support view (read-only, logged), remove a review with a reason | `support_view_business`, `remove_review`; `SupportViewSection.tsx`, `AdminReviewsSection.tsx` | WORKS |
| 6 | Manual billing record (who paid what, when) | only free-text notes on assign / status | PARTIAL (no payment ledger) |

**Typical day (super admin):** sign in with TOTP, filter "trial ended", email two owners, assign Team to one
who paid by bank transfer (note "paid 2026-10-10"), turn on Inventory for another, check a reported review
and remove it with a reason.

---

## Setup prerequisites for slots

A time appears on `/<slug>/book` only if ALL of these hold (`branch_is_bookable`, `resolveBranch`, `get_free_slots`):

| Requirement | Default after signup | Reason code |
|---|---|---|
| Business active (status active, or trialing before `trial_ends_at`) | yes (trial) | page "not available" |
| The branch is the PRIMARY branch (public page cannot pick another) | the onboarding branch | n/a (gap) |
| Booking settings: online booking enabled | yes | `booking_disabled` |
| Branch opening hours for that weekday | **none** | `no_branch_hours` |
| A service: active, online-bookable, enabled at the branch (with price) | **none** | `no_bookable_service` |
| A staff member: active, online-bookable, assigned to the branch | **none** | `no_bookable_staff` |
| That staff member performs that service | **none** | `no_staffed_service` |
| That staff member has working hours at that branch (overlapping branch hours) | **none** | `no_staff_hours` |
| The time is not a holiday / closure, not in staff time off or break, not already booked (or capacity left) | n/a | (no slot) |
| The time is after minimum notice (default 1 h) and within the booking window | settings | (no slot) |

---

## Gaps / confusing points / launch blockers (most severe first)

1. **Online booking cannot choose a branch** (multi-branch): every online booking goes to the primary branch (`useBookingPage.ts` sends only the slug). Blocks the multi-location promise.
2. **Staff-role logins are never linked to their staff profile** (`staff_profiles.member_id` has no UI/RPC). A Staff user sees no own appointments, gets no pushes for their bookings, and "own" data rules do not work. Blocks the Team plan's main use.
3. **No payments**: subscriptions, yearly billing, per-location billing and add-on charges are all manual; `current_period_end` is never enforced, so unpaid businesses stay active until the super admin acts. Polar is not integrated.
4. **Email delivery is not production-ready**: needs a verified Resend domain (dev sender only reaches the account owner) and custom SMTP for auth emails. Clients without an email get no confirmation, reminder or review request (SMS is off).
5. **Native app push does not work** (no EAS `projectId`). Web push works.
6. **No setup checklist** after onboarding: the owner lands on an empty Today; the 5 required setup steps after onboarding (hours, service, staff, link them, staff hours) are only explained under Settings > Booking.
7. **Solo / Team cannot edit branch address, phone, tax rate or time zone after the trial** (Locations screen is Business-only). Invoices then carry tax 0; website contact data cannot be fixed.
8. **Invites are not emailed**; the owner must copy and send the link.
9. **Owner is not a staff member by default**: Solo owners must add themselves as staff, and that is not explained.
10. **Auth hook for suspension is a manual dashboard switch** (otherwise suspended users can still sign in until the app signs them out).
11. **Plan limits are on staff profiles, not logins**: Solo can invite any number of Manager / Receptionist users.
12. `default_roles` ("Ready-made team roles", Team+) and add-on `available_plans` are display-only.
13. Service and staff saves are several separate writes (a failure halfway can leave a half-saved service or staff member).

---

## Landing / pricing promises that are DISPLAY-ONLY or MISSING

Compared with `src/features/landing/i18n/en.json` and `get_public_pricing()` (plans + add-ons):

| Promise (where) | Reality | Suggested fix |
|---|---|---|
| "Run several locations from one account on Business" (feature card) / "Multiple locations" (Business card) | Locations work in the dashboard, but clients can only book the primary branch online | Build branch choice on the booking page, or say "manage several locations" without implying online booking per location |
| "Give each person the access they need" (roles card) | Staff-role logins cannot be linked to their profile | Build the link, or avoid promising per-staff logins |
| Business "$79 / month per location", "each extra location billed the same", "Billed $X per year" | No billing; manual | Keep, but billing must be done by hand until Polar; make sure invoices match |
| FAQ "Can I cancel anytime? ... keep access until the end of the period you paid for" | No self-serve cancel; period end not enforced | Say "contact us to cancel" until billing exists |
| FAQ "Can I change plans later? Yes" | Only via support (super admin) | Add "just ask us" |
| Add-ons table prices, "Billed per business" | Enabled only by the super admin, never charged automatically | Fine for a manual launch; no "buy" wording |
| Compare table: Solo "–" for "Ready-made team roles" | Solo actually gets them (not enforced) | Remove the row or enforce |
| "Install it like an app ... push notifications keep everyone in the loop" | Web push works; native app push does not | OK for the PWA; do not promise store apps |
| "Booking emails" / FAQ "a link to cancel or reschedule" | Works only with a verified email domain, and only if the client gives an email | Set up Resend domain before launch; consider making email required |
| "Each location has its own currency, time zone and tax settings" (FAQ) | True in data, but Solo/Team cannot edit them after the trial | Open the branch edit form for single-branch plans |
| Hero note "Set up in minutes" | 5 required setup steps after onboarding, no checklist | Add a checklist, or soften the line |
