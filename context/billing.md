# Billing & trial lock
Status: trial lock done · plans/subscriptions are Phase 8 · Phase: 1 · Last updated: 2026-10-02

## What it does
When a business becomes inactive — the 14-day trial ran out, or a super admin
suspended it — the app locks. Every operational screen is replaced by a "your
trial has ended" screen; Settings and billing stay reachable so the owner can get
a plan assigned. A super admin is unaffected and can work inside the business.

## Business rules
- **Trial ends → the business is inactive** (product doc §10, decision 12). `trial_ends_at` is compared to `now()` at query time, so access stops the second it passes — **no cron job**.
- **Settings and billing stay reachable.** An owner who cannot open their own billing can never fix the lock. Allowed routes: `/settings`, `/billing`, `/more` (on mobile More is the only route to Settings).
- **A super admin is never locked out** — they are the ones who assign the plan.
- **Nothing is deleted.** The lock hides data, it does not remove it; the screen says so explicitly.
- No plan self-service: there is no checkout. The locked screen offers "Contact us" (mailto) and Sign out, until Phase 8.
- Same screen for `suspended` as for an expired trial, with different wording.

### Doc history
Decision 12 originally read "no access to anything until a plan is assigned",
which taken literally also locked Settings and left an owner unable to pay. The
user confirmed the intent, and **the product doc was updated on 2026-10-02** —
decision 12, §5 and §10 now all state that Settings, Billing and the mobile More
menu stay reachable, nothing is deleted, and super admin is unaffected. Code and
doc agree; there is no outstanding deviation.

## Files
| Path | Purpose |
|---|---|
| src/features/billing/components/ActiveBusinessGate.tsx | Decides lock vs render; used inside `RouteGuard` |
| src/features/billing/components/TrialEndedScreen.tsx | The lock screen (contact + sign out) |
| src/features/billing/inactiveRoutes.ts | `ROUTES_ALLOWED_WHEN_INACTIVE`, `isRouteAllowedWhenInactive()` — split out so it is unit-testable |
| src/features/billing/components/TrialBanner.tsx | "Trial ends in N days" bar, in `AppShell` for all breakpoints |
| src/features/billing/trialCountdown.ts | `trialCountdown()`, `TRIAL_WARNING_DAYS` — the countdown arithmetic, unit tested |
| src/features/billing/useTrialBannerVisible.ts | One visibility rule, shared by the banner and the shell |
| src/components/layout/ConsumedInsets.tsx | Lets the shell tell `Screen` the top inset is already taken |
| src/features/billing/inactiveRoutes.test.ts | 5 tests pinning the allowed-route list |
| src/features/auth/components/RouteGuard.tsx | Now `ActiveBusinessGate` → `PermissionGuard` |
| src/config/brand.ts | `supportEmail` (PLACEHOLDER) |

## Database
Nothing new. The boundary already existed:
- `business_is_active(business_id)` — status `active`, or `trialing` with `trial_ends_at > now()`.
- `can(business, branch, perm)` = `business_is_active()` AND `has_permission()`, used by every operational policy.
- `businesses` RLS is **deliberately not** gated on `business_is_active()`, so settings and billing keep working.
- A tenant cannot change its own `plan`, `status` or trial dates (`enforce_business_guard`).

## Data & caching
`isActive` comes from `useGrantSet()`, which reads status and `trial_ends_at` via
`useMyBusinesses()` (staleTime 30 s). So a trial expiring while the app is open
locks it within 30 seconds, and immediately on any refetch. The client mirror is
`isBusinessActive()` in `lib/permissions/useGrants.ts`.

## Permissions & gating
`can()` already refuses every permission except `settings.business` and
`settings.billing` when the business is inactive
(`ALWAYS_ALLOWED_WHEN_INACTIVE` in `lib/permissions/can.ts`). The gate is the
screen-level half of the same rule.

## UI
- One centred card (max 416px), warning-tinted lock icon, two buttons.
- `Screen edges={['top']}` because it renders inside the bottom tabs.
- While the grant set loads the gate renders through rather than flashing a lock screen.

## Trial banner
- Shows in the **last 3 days** of a trial (`TRIAL_WARNING_DAYS`), and only to
  someone holding **`settings.billing`** — Owner-only in practice (doc §9), since
  nagging a receptionist about billing they cannot reach is noise.
- Warning tint normally; **error tint on the last day**.
- Tapping it goes to `/settings` (there is no `/billing` route yet).
- Days are counted in whole days from the exact instant, so 30 hours left reads
  "ends tomorrow" and anything under 24 hours reads "ends today". That errs
  towards warning sooner.
- Lives in `AppShell`, so one copy covers mobile, tablet and desktop.
- **Inset handling:** on mobile the banner is the topmost bar (there is no
  `Header`), so it carries `insets.top` itself. Every tab screen also passes
  `edges={['top']}`, which would double the gap, so `AppShell` wraps its children
  in `ConsumedInsetsProvider top` and `Screen` skips its own top padding while the
  banner is up. On tablet/desktop the `Header` already consumed the inset.

## i18n
Namespace `common`, keys `billing.locked.*` and `billing.trialBanner.*`.

## Verification (2026-10-02)
Verified against the live database by expiring a real test business's trial, as
its owner over the REST API — 4 checks, all passing:
- the `businesses` row is still readable (so Settings/billing work)
- a `branches` write is refused (0 rows) because `can(settings.business)` now fails
- `my_grants()` still returns all 46 Owner grants, so the UI can render Settings
- `invite_member()` is refused, since `can()` includes `business_is_active()`

Route rules covered by 5 unit tests and the countdown by 7 more (every boundary:
4 days, exactly 3, 30 hours, 23 hours, already over, not-on-trial, malformed
input). The SQL equivalent of the countdown was cross-checked against the live
database and agrees. The whole suite is 34 tests. The trial-lock
branch of `can()` is covered by the permission tests (operational blocked,
settings/billing allowed, nav collapses to Today + Settings).
The test business's trial was restored afterwards.

**Not verified in a browser**: no browser automation was available in this
session, so the lock screen's appearance is unconfirmed. The logic, routes and
bundle are verified.

## Phase 8A (backend) update
Plans, subscriptions, trial rules, the super admin lifecycle RPCs (`assign_plan`, `set_business_status`, `extend_trial`) and the "locked until a plan is assigned" behaviour are now real database objects: see [plans-super-admin.md](plans-super-admin.md). A trial behaves as Business-level; an expired one is inactive with every feature off. Still no `/billing` UI.

## Phase 8B (UI)
`/settings/billing` exists now (Owner, `settings.billing`): plan, status, trial/period end, staff usage, add-ons, Contact us. The trial banner still points at `/settings`. See [plans-super-admin.md](plans-super-admin.md).

## Known limits / TODO
- No `/billing` route exists yet — it is in the allowed list ready for Phase 8. Today the owner reaches Settings only.
- `brand.supportEmail` is `support@wapee.com`, a **placeholder** like the domains.
- No plan self-service, no checkout, no invoice history (Phase 8, super admin assigns plans by hand).

## Changelog
- 2026-10-02: Product doc decision 12 / §5 / §10 updated to match what is built (Settings + Billing + More stay reachable).
- 2026-10-02: Trial banner added (last 3 days, Owner only, stronger on the last day) with `ConsumedInsets` so the mobile inset is not applied twice.
- 2026-10-02: Trial lock built: `ActiveBusinessGate`, `TrialEndedScreen`, allowed-route list + tests, `RouteGuard` now checks active-business before permission.
