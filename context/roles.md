# Roles & permissions
Status: **database done · app gating done · invite flow + trial screen next** · Phase: 1 · Last updated: 2026-10-02

## What it does
Who may do what, per business and per branch. The database half is built and
tested. The app half now reads the member's permission set once per business and
uses it to hide and block navigation; `usePermission` / `useFeature` are available
to every feature.

## Business rules
- Permission = `area.action` + scope (**own / branch / all**), product doc §9.
- A member holds a role **per branch**; `branch_id = null` means every branch.
- Four system roles, seeded and undeletable: Owner (47 perms, `all`; `clients.erase` is Owner only), **Manager (39, `branch`)**, Receptionist (20, `branch`), Staff (10, `own`).
- Custom roles (Phase 9) carry a `business_id`; system roles have `business_id IS NULL` and cannot be edited by tenants.
- **Nobody may grant a permission they do not hold.** The only exemption is the founding Owner — the first role assignment in a brand-new business — because the signing-up user holds nothing at that moment.
- A business always keeps at least one active Owner.
- Enforced in three places (CLAUDE.md §7): RLS, Edge Function / RPC, and the UI. Hiding a button is never the boundary.
- **An inactive business (trial over) fails every check except `settings.business` and `settings.billing`**, so a locked-out owner can still reach billing (product doc decision 12, updated 2026-10-02). Mirrors the `businesses` RLS policies, which are deliberately not gated on `business_is_active()`. See [billing.md](billing.md).
- **A business with no plan (`plan is null`) is on trial and passes plan gating.** The super admin assigns a plan by hand (product doc §10), so null must not be read as the cheapest tier.
- **Phase 8A/8B:** plan/add-on gating is real in the DB and now read by the client through `my_features()` (`GrantSet.features`; the stub notes below are historical). See [plans-super-admin.md](plans-super-admin.md).
- **Super admin passes every check**, including on an inactive business.

## Files
| Path | Purpose |
|---|---|
| src/config/permissions.ts | The 47-permission catalogue mirroring the table: `PermissionKey` type, `minPlan`, `addon`, `PLAN_ORDER`, `planAtLeast()` |
| src/lib/permissions/can.ts | Pure logic: `hasPermission()`, `hasFeature()`, `can()`, `ALWAYS_ALLOWED_WHEN_INACTIVE` |
| src/lib/permissions/types.ts | `Grant`, `GrantSet`, `PermissionScope` |
| src/lib/permissions/useGrants.ts | `my_grants()` query, `useGrantSet()`, `isBusinessActive()`, `grantKeys` |
| src/lib/permissions/usePermission.ts | `usePermission()`, `useFeature()` |
| src/lib/permissions/useCurrentScope.ts | Zustand selection store, `useCurrentScope()`, `useMyProfile()` |
| src/lib/permissions/useVisibleNav.ts | `useVisibleNav()` (filtered nav + `isRouteAllowed`), `useFallbackRoute()` |
| src/features/auth/components/RouteGuard.tsx | Blocks a disallowed route, including a typed URL |
| src/config/navigation.ts | `NavItem.permission` is now typed `PermissionKey`; the old `feature` field is gone |

## Database
- RPC: **`my_grants(p_business_id)` → (permission, scope, branch_id)** — the caller's own grants for one business, in one round trip. `SECURITY DEFINER`, `STABLE`, `search_path = ''`, EXECUTE to `authenticated` only. **UI gating only; RLS stays the boundary.**
- Everything else as before: `has_permission()`, `can()`, `enforce_role_assignment_guard`, `enforce_last_owner`.
- Migrations: `20261002140000_my_grants.sql`.

## Data & caching
- `grantKeys.forBusiness(businessId)`, `staleTime` = `staticLong` (10 min). Product doc §9 wants the set cached per session; **a role change must invalidate this key.**
- `useMyProfile()` → `['profile','me',userId]`, `staleTime` static (5 min). Supplies `is_super_admin` and `default_business_id`.
- Business status/plan/trial come from `useMyBusinesses()` (`staleTime` list, 30 s), so a trial ending is noticed within 30 s and immediately on any refetch.
- The current business/branch is **client-only state in Zustand** (`useScopeSelection`), never server data. It initialises from `profiles.default_business_id`, else the first business, and the branch from `is_primary`. A stale selection (business left or deleted) resets to that default.

## Permissions & gating
- `usePermission(key, branchId?)` → `{ allowed, isPending, blockedByPlan, blockedByTrial }`. Default branch is `null` = "anywhere", which is what a menu item or route guard wants.
- `useFeature(key)` → plan/add-on only, for upgrade prompts.
- **Plan tiers are enforced for real** from `businesses.plan` (`commission.*` and `reports.view_advanced` need Team).
- **Add-ons are not enforced yet**: no `business_addons` table until Phase 8, so an add-on counts as switched ON. `can()`/`hasFeature()` already accept an `AddonState`, so Phase 8 only has to supply it.
- While the set is loading everything is denied, and the UI shows skeletons rather than an empty menu — nothing flashes into view and then vanishes.

## UI
- `Sidebar`, `BottomTabBar` and the mobile `More` screen all render only what `useVisibleNav()` returns; skeleton rows while pending.
- `/today` and `/more` carry no permission, so the bottom bar always has at least two tabs and can never collapse.
- **Every `(app)` screen is wrapped in `RouteGuard`**, which first applies the trial lock ([billing.md](billing.md)) and then renders a `Lock` empty state for a route the member may not open. It does not redirect, so the URL and the back button still behave.
- Every `Tabs.Screen` stays registered whatever the permissions — unregistering would make a direct URL 404 instead of being refused.
- Sign out in the sidebar and in More is now wired to `useSignOut()` (was a placeholder).

## i18n
Namespace `common`, keys `permissions.noAccess.*`. Role names are still seeded in
English in the database; translating them needs a `roles.<key>` namespace rather
than reading `roles.name`.

## Verification (2026-10-02)
`my_grants()` checked against the live database:
- Agrees with `has_permission()` for **all 46 original permissions** for an Owner (SQL cross-check, zero mismatches).
- Returns **0 rows** for a non-member and for `anon`.

The real `can()` / `hasFeature()` / `navItems` run against real grant rows pulled
from the database — **24 assertions, all passing**: per-role nav for Owner /
Receptionist / Staff, all three scope rules (branch match, branch mismatch,
"anywhere", `all` ignores branch, null branch covers any), inactive business
(blocks operational areas, allows settings + billing, nav collapses to
Today + Settings), plan tiers (solo/team/business/null), add-on on and off, super
admin, and the empty set denying everything.

Not run on a device: **no JS test runner is installed**, so these assertions were
executed from the scratchpad rather than committed as a suite — see TODO below.

## Known limits / TODO
- **No JS test runner in the repo** (jest/vitest is a new dependency → needs your OK). The permission logic is pure and deserves committed unit tests; today's run was scratchpad-only and is not repeatable in CI.
- **A role change must invalidate `grantKeys.forBusiness(id)`** (for the members UI task). Accepting an invite already does it; nothing else changes roles yet, so nothing else needs to. Any future change-role screen must, or the UI keeps showing the old permissions for up to 10 minutes.
- No business/branch switcher UI yet. The store supports it (`setBusiness`, `setBranch`); only the header control is missing.
- Add-on gating is a documented stub until Phase 8.

- Members list and invite flow are built (see [members.md](members.md)). Still missing: change a member's role, remove a member, revoke or resend an invite.
- Custom roles: backend done in Phase 9A (`context/plan-features.md`); screens are 9B.
- Super admin 2FA: enforced in Phase 8A as an `aal2` JWT check in every admin RPC; TOTP enrolment still needs enabling + UI (see plans-super-admin.md).

## Changelog
- 2026-10-23: **QA audit fix**: `enforce_last_owner` on `member_role_assignments` previously fired only on DELETE; a raw UPDATE of `role_id`/`member_id`/`branch_id` on a business's sole Owner assignment bypassed it entirely (RLS write, not RPC-only), proven live to leave zero active Owners. Now also fires on UPDATE; a companion trigger on `business_members` closes the same hole for a direct soft-delete/deactivate of the sole Owner's membership row. Ownership transfer, the founding-Owner bootstrap, and the GDPR/account-delete erase-flag exemption are all unaffected (18 new assertions, suite `41_last_owner_update_guard.sql`; see `_database.md`). Only the system Owner role holds `roles.manage` by default (confirmed live) — Manager/Receptionist/Staff cannot reach this at all.
- 2026-10-07: Phase 11A: new permission `clients.erase` (47th; Owner only, `all` scope; Manager / Receptionist / Staff unchanged at 39 / 20 / 12). Label `roles.perm.clients_erase`.
- 2026-10-07: Phase 10B: Staff seed gains `files.upload` at own scope (`20261014090000`); `forms.manage` stays Owner/Manager; signing a form needs `appointments.edit`; the matrix hides `files.*` / `forms.*` while their add-on is off.
- 2026-10-07: Phase 10A: Staff seed gains `packages.deduct_session` at own scope (migration `20261013100000`); the permission matrix HIDES add-on permissions (`packages.*`, `inventory.*`, files, forms, portal) while their add-on is off (values in the draft are kept). Nav items Packages (`packages.sell`) and Inventory (`inventory.view`).
- 2026-10-07: Phase 9B: roles screen, scope-aware invite picker, branch-scope RLS fixes. See plan-features-ui.md.
- 2026-10-06: Phase 9A: custom role RPCs, scope+branch-aware escalation guard, billing owner-only, audit triggers, `permissions_version`.
- 2026-10-02: Invite flow added (see members.md); the escalation guard was verified to block a Manager inviting an Owner.
- 2026-10-02: App gating built — `my_grants()` RPC, `can()`, `usePermission`, `useFeature`, current-scope store, `useVisibleNav`, `RouteGuard` on every `(app)` screen, sign out wired. Nav `feature` field dropped in favour of the catalogue's `minPlan`/`addon`.
- 2026-10-02: Database half complete (catalogue, roles, grants, guards, tests). App half not started.
- 2026-10-09: the permission matrix hides `sms.send` / `sms.buy_credits` while `launch.sms` is off (`isLaunchHidden` in `rolesLogic.ts`, tested). Stored values stay in the role untouched.
