# Billing & trial lock
Status: trial lock done · plans/subscriptions are Phase 8 · audited live end-to-end · Phase: 1 · Last updated: 2026-10-14

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
| src/lib/permissions/businessActive.ts | `isBusinessActive()` — pure, unit-tested client mirror of SQL `business_is_active()`, now period-end aware |
| src/features/plans/components/BillingScreen.tsx | Owner billing screen: plan, status, trial/period end (past vs future wording), staff/location usage, add-ons, "Contact us" |

## Database
- `business_is_active(business_id)` — `active` (and, if `current_period_end` is set, still before it), or `trialing` with `trial_ends_at > now()`. A paid period that has ended, with an explicit end date, locks the business the same way an expired trial does; `current_period_end is null` (manual billing, no expiry) never locks anything (migration `20261014140132`, 2026-10-14).
- `current_period_end` is mirrored `business_subscriptions` → `businesses`, same pattern as `plan`/`status`/`trial_ends_at`/`plan_activated_at`. `set_business_status('active')` clears a STALE PAST period end on reactivation only (a real UI path independent of `assign_plan`), so reactivating never instantly re-locks; a future period end is left untouched.
- `can(business, branch, perm)` = `business_is_active()` AND `has_permission()`, used by every operational policy.
- `businesses` RLS is **deliberately not** gated on `business_is_active()`, so settings and billing keep working.
- A tenant cannot change its own `plan`, `status`, trial dates or `current_period_end` (`enforce_business_guard`).

## Data & caching
`isActive` comes from `useGrantSet()`, via the pure `isBusinessActive()` (now in its own file, `lib/permissions/businessActive.ts`, so it is unit-testable — same reason as `trialCountdown.ts`), which reads status, `trial_ends_at` AND `current_period_end` via
`useMyBusinesses()` (staleTime 30 s). So a trial or a paid period expiring while the app is open
locks it within 30 seconds, and immediately on any refetch.

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

## Polar subscription billing (in progress, DEV only)
Approved 2026-10-23: Polar (Merchant of Record) collects businesses' payments to Wapee, plans AND add-ons fully automatic; manual billing stays only as a super admin support override. Decisions: tax-exclusive prices; 7-day grace after a failed renewal; subscribing mid-trial keeps the remaining trial days; downgrade immediate + prorated only within limits; no purchase UI in the native apps; no Polar SDK (fetch + Web Crypto); Polar Starter fees.
- **Part 1 (done, `20261027100000`)**: `billing_products` (Polar product id -> plan/add-on + month/year; no prices), `billing_subscriptions` (last applied snapshot per Polar subscription; service_role only), `billing_webhook_events` (delivery-id dedupe, no payload, 90-day retention planned). `business_subscriptions.billing_source` (`manual` default | `polar`) + `polar_detached_at`; `business_addons.source` / `access_until` / `polar_detached_at`. `business_has_feature` honours a paid add-on's `access_until`; `business_plan_limits` gives a Polar Business plan `max_branches` = paid seats (`billing_paid_seats`, the earliest-created live plan subscription). Super admin: `set_billing_product`, `set_billing_source`; `assign_plan` / `set_addon` now DETACH from Polar (source manual + detach time; Polar subscriptions created before it never drive it again). Suite 52 (61).
- **Part 2 (done, `20261027110000`)**: `billing_apply_subscription(snapshot)` (service_role; validates shape, product mapping, interval, seats for per-location plans, business, then refuses `stale` when `modified_at` is not newer; upserts one row, audits `billing.subscription_updated`, then `billing_derive`). Access: active/trialing = period end + 7 days; cancel at period end = period end; past_due = first past-due time + 7 days (kept across later snapshots); ended/unpaid/paused = none. `billing_derive`: the primary subscription of a plan / add-on is the earliest-created live one (else the latest ended); detached ones ignored; an ended one never takes over a manual plan/add-on; suspended stays suspended; the period start is pulled below the access end when needed (table check end > start). `billing_followups`: revoke+refund duplicates (any second live plan; second live add-on of a key), revoke add-ons when no live plan, cancel add-ons when the plan is cancelled (and uncancel the ones WE cancelled when it is uncancelled), cancel an add-on the new plan does not allow or already includes. `billing_mark_followup`, `billing_begin_event` / `billing_finish_event` (a failed delivery stays open so Polar's retry reprocesses it; a processed one is skipped), `billing_record_refund` (audit). Suite 53 (77).
- Next: part 3 Edge Functions `polar_webhook`, `billing`, `billing_reconcile`, part 4 UI behind `EXPO_PUBLIC_BILLING_CHECKOUT`.

## Known limits / TODO
- No `/billing` route exists yet — it is in the allowed list ready for Phase 8. Today the owner reaches Settings only.
- `brand.supportEmail` is `support@wapee.online`, the real mailbox.
- No plan self-service, no checkout, no invoice history (Phase 8, super admin assigns plans by hand).

## Changelog
- 2026-10-23: Polar billing part 2 (apply, derive, follow-ups, event dedupe, refund audit), dev only.
- 2026-10-23: Polar billing part 1 (schema + super admin override), dev only. See "Polar subscription billing".
- 2026-10-16: Migrations renamed (content unchanged) so they sort after everything on prod: `20261014104921_list_businesses_search_owner_email` -> `20261024160000_…`, `20261014140132_enforce_current_period_end` -> `20261024160100_…`. Reason: `20261020110000_suspended_login_block` also defines `set_business_status`; in filename order it overwrote the period-end version on any from-empty replay. Proven: `check:migrations` 159/159 and the replayed `set_business_status` has both the stale-period fix and the session revoke. Dev's `schema_migrations` still records the old versions (repair pending the user's approval, see _handoff).
- 2026-10-14: **Features 7/8 audit, live against dev, two real bugs fixed.** (1) `current_period_end` was a documented-known gap: it existed on `business_subscriptions` but nothing ever read it, so a paid plan with an elapsed period stayed "active" forever. Fixed with the smallest safe change: mirrored into `businesses`, `business_is_active()` now locks a business whose `status = 'active'` AND whose `current_period_end` has passed — `null` (manual billing, no expiry) never locks anything, proven live end-to-end (assign a near-future period, wait for it to elapse, confirm `my_features().active` flips false and an operational read is refused while settings/billing stay reachable, confirm a super admin assigning a new plan immediately unlocks it). A second, subtler case found and fixed in the same migration: `set_business_status('active')` (the status dialog, independent of `assign_plan`) would otherwise instantly re-lock a business being reactivated if its `current_period_end` was already stale in the past — now clears a PAST period end on that one transition only; a future one is left untouched (confirmed with the user before applying). (2) `TrialEndedScreen`/`BillingScreen` both only had wording for "trial ended" or "suspended" — a business locked by an elapsed PAID period (a brand-new case created by fixing (1)) showed the misleading "Your 14-day trial is over" text; added a third `periodEnded`/`periodEndedPast` wording branch to both. Full live proof of the whole trial lifecycle (14-day start, Business-level/everything-on during trial, owner vs. staff grants during and after expiry, data never deleted, super-admin-assigns-plan-after-expiry immediately unlocks) and the Solo/Team/Business feature matrix vs. product doc §10 (staff cap, branch limit, every feature flag) found **no other bugs** — everything else matched exactly. The billing screen's period-end display and the admin detail screen's period-end display were already built in advance (read `business_subscriptions.current_period_end` directly, not through the new mirror) and needed no change. Migration `20261014140132_enforce_current_period_end.sql` — **older than `20261024100500`**, applies cleanly in filename order right after `phase10b_outbox_form_request` (20261014120000) with no dependency on anything from 20261013–20261024; `npm run check:migrations` confirms 154/154 from an empty database. New `heldRankAtBranch`-style pure module `lib/permissions/businessActive.ts` (split out of `useGrants.ts`, which pulled in React Native and could not be unit tested directly), 10 new tests. Suite 18 gained 1 new real bug fix of its own: a scalar subquery in the same expression as a volatile call (`pg_temp.adm(...)`) does not see that call's own write — the exact trap this suite set already documents elsewhere — caught while adding the new period-end assertions, fixed by splitting each into its own statement; 367/367 (was 356). Suites 19/21/41/42 unaffected, all green. 833/833 unit tests (10 new), tsc/lint clean. **Not applied to prod** — dev only, as instructed.
- 2026-10-02: Product doc decision 12 / §5 / §10 updated to match what is built (Settings + Billing + More stay reachable).
- 2026-10-02: Trial banner added (last 3 days, Owner only, stronger on the last day) with `ConsumedInsets` so the mobile inset is not applied twice.
- 2026-10-02: Trial lock built: `ActiveBusinessGate`, `TrialEndedScreen`, allowed-route list + tests, `RouteGuard` now checks active-business before permission.
