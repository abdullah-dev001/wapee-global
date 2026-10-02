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

### Deviation from the product doc, agreed with the user
Product doc decision 12 and §6 say an ended trial means **"no access to anything
until a plan is assigned"**. Taken literally that locks Settings too, which would
leave an owner unable to reach billing and unable to pay. The user's instruction
for this task was explicit: *"settings/billing stay reachable, everything else is
blocked"*. That is what is built, and it matches the `businesses` RLS policies,
which were already written ungated on `business_is_active()`. **The doc wording
should be updated** so code and doc agree (CLAUDE.md asks that they never disagree
silently).

## Files
| Path | Purpose |
|---|---|
| src/features/billing/components/ActiveBusinessGate.tsx | Decides lock vs render; used inside `RouteGuard` |
| src/features/billing/components/TrialEndedScreen.tsx | The lock screen (contact + sign out) |
| src/features/billing/inactiveRoutes.ts | `ROUTES_ALLOWED_WHEN_INACTIVE`, `isRouteAllowedWhenInactive()` — split out so it is unit-testable |
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

## i18n
Namespace `common`, keys `billing.locked.*`. `billing.trialBanner.*` keys are
added but **not used yet** — see TODO.

## Verification (2026-10-02)
Verified against the live database by expiring a real test business's trial, as
its owner over the REST API — 4 checks, all passing:
- the `businesses` row is still readable (so Settings/billing work)
- a `branches` write is refused (0 rows) because `can(settings.business)` now fails
- `my_grants()` still returns all 46 Owner grants, so the UI can render Settings
- `invite_member()` is refused, since `can()` includes `business_is_active()`

Route rules covered by 5 unit tests; the whole suite is 25 tests. The trial-lock
branch of `can()` is covered by the permission tests (operational blocked,
settings/billing allowed, nav collapses to Today + Settings).
The test business's trial was restored afterwards.

**Not verified in a browser**: no browser automation was available in this
session, so the lock screen's appearance is unconfirmed. The logic, routes and
bundle are verified.

## Known limits / TODO
- **No "trial ends in N days" banner yet.** The i18n keys exist (`billing.trialBanner.*`) but nothing renders them, so the lock arrives with no warning. Worth adding before real users.
- No `/billing` route exists yet — it is in the allowed list ready for Phase 8. Today the owner reaches Settings only.
- `brand.supportEmail` is `support@wapee.com`, a **placeholder** like the domains.
- No plan self-service, no checkout, no invoice history (Phase 8, super admin assigns plans by hand).
- The product doc wording needs the update described above.

## Changelog
- 2026-10-02: Trial lock built: `ActiveBusinessGate`, `TrialEndedScreen`, allowed-route list + tests, `RouteGuard` now checks active-business before permission.
