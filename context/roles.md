# Roles & permissions
Status: **database done, app side not started** · Phase: 1 · Last updated: 2026-10-02

## What it does
Who may do what, per business and per branch. The database half is built and
tested; the app half (`usePermission`, `useFeature`, nav gating, the invite
flow) is the next task.

## Business rules
- Permission = `area.action` + scope (**own / branch / all**), product doc §9.
- A member holds a role **per branch**; `branch_id = null` means every branch.
- Four system roles, seeded and undeletable: Owner (46 perms, `all`), Manager (41, `branch`), Receptionist (20, `branch`), Staff (10, `own`).
- Custom roles (Phase 9) carry a `business_id`; system roles have `business_id IS NULL` and cannot be edited by tenants.
- **Nobody may grant a permission they do not hold.** The only exemption is the founding Owner — the first role assignment in a brand-new business — because the signing-up user holds nothing at that moment.
- A business always keeps at least one active Owner.
- Enforced in three places (CLAUDE.md §7): RLS, Edge Function / RPC, and the UI. Hiding a button is never the boundary.

## Database (built)
| Object | Purpose |
|---|---|
| `permissions` | 46-row catalogue, `min_plan` and `addon` for Phase 8 gating |
| `roles`, `role_permissions` | Role definitions and their grants with scope |
| `member_role_assignments` | member × role × branch |
| `has_permission(business, branch, perm)` | Scope-aware check |
| `can(business, branch, perm)` | `business_is_active()` AND `has_permission()` — use this for operational policies |
| `enforce_role_assignment_guard` | Escalation guard + founding-Owner exemption |
| `enforce_last_owner` | Blocks removing the final Owner |

Tests: `supabase/tests/02_role_assignment_guard.sql` (9 assertions, all verified
against the live database).

## Not built yet — this is the next task
1. `usePermission('invoices.discount')` and `useFeature('commission')` hooks, reading the signed-in member's grants once per session and caching them in TanStack Query.
2. Wire both into `src/config/navigation.ts`: each `NavItem` already declares `permission` and `feature`, but **nothing reads them yet** — every item is visible to everyone.
3. Invite flow: `users.invite`, hashed token, accept screen.
4. Trial lock screen: `AuthGate` needs an inactive-business branch.

## Permissions & gating
`min_plan` and `addon` are stored but **not enforced**; plan gating lands in
Phase 8. Treat `useFeature` as a stub that always returns true until then.

## i18n
Role names are seeded in English in the database. Translating them needs a
`roles.<key>` namespace in the app rather than reading `roles.name`.

## Known limits / TODO
- No UI for assigning roles, no members list, no invite screen.
- Custom roles are schema-ready but have no screens (Phase 9).
- Super admin 2FA deferred to Phase 8 with the admin screens (agreed).

## Changelog
- 2026-10-02: Database half complete (catalogue, roles, grants, guards, tests). App half not started.
