# Branches (locations)
Status: done (Phase 9 backend/UI) + Feature 11 audit · Phase: 9 · Last updated: 2026-10-16

## What it does
A business's physical locations. Solo/Team have exactly one (edited at `/settings/location`); Business can have several (`/settings/branches`, behind the `multi_branch` feature). Each branch owns its own country, currency, timezone, tax settings, invoice prefix, opening hours, holidays/closures, and rooms/resources.

## Business rules
- **Multi-branch is Business-plan only**, gated by `settings.business` + feature `multi_branch` (`branch_admin_gate`). Solo/Team get `LocationScreen` instead of `BranchesScreen` — same edit form, no list/add/archive/restore/make-main.
- **"Each extra branch billed" is a documented product claim with NO real metering** (`plans.priced_per_branch` is a display-only flag on the public pricing page; confirmed again this round — `docs/business-flows.md` already flags this DISPLAY-ONLY, not a bug to fix).
- **Locks**: currency (`currency_locked` once invoiced, `currency_in_use` with any appointment/service price), invoice prefix (`prefix_locked` after the first invoice number; a prefix once used by ANY branch, even archived, is retired forever — `prefix_taken`/`enforce_branch_prefix_retired`), timezone (`timezone_in_use` with a future pending/confirmed appointment).
- **Archive refused** (`branch_archive_blockers`, hard refusal): the primary branch, the last live branch, a future pending/confirmed appointment, an open draft invoice, or a website using it.
- **Restore refused**: a name collision with a live branch, the staff cap exceeded by the branch's own staff, the branch-count limit (plan downgrade since archiving), a retired prefix collision.
- `update_branch` validates every field BEFORE the one `UPDATE` (CLAUDE.md testing rule); currency/timezone/prefix changes are each individually re-checked even mid-patch.
- Branch opening hours and staff hours both forbid overnight shifts (`end_minute > start_minute`); a business open past midnight needs two rows (one per day), same convention as staff hours.
- Resources (rooms/chairs/bays) ARE live and consumed by the slot engine once `booking_settings.use_resources` is on — not a "Phase 3, not built" stub any more. A resource double-booking exclusion constraint exists (`appointments_no_resource_double_booking`).

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261011110000_phase9_multi_branch.sql | `create_branch`/`update_branch`/`archive_branch`/`restore_branch`/`set_primary_branch`/`list_my_branches`/`get_combined_overview`, locks, `branch_archive_blockers`, `branch_admin_gate` |
| supabase/migrations/20261024140000_branch_appointment_conflicts.sql | NEW: `branch_hours_conflicts`, `branch_closure_conflicts` (warn-before-save) |
| supabase/migrations/20261024150000_archive_resource.sql | NEW: `resource_archive_blockers`, `archive_resource` RPC |
| app/(app)/settings/branches.tsx | Route: `RequirePermission('settings.business')` + `RequireFeature('multi_branch')` |
| app/(app)/settings/location.tsx | Route: `RequirePermission('settings.business')` only (Solo/Team) |
| src/features/branches/api/useBranches.ts | `useMyBranches`, `useBranchAdmin`, `useCreateBranch`, `useUpdateBranch`, `useArchiveBranch`/`useRestoreBranch`/`useSetPrimaryBranch`, `useCombinedOverview` |
| src/features/branches/branchLogic.ts (+ test) | Pure rules: patch building, prefix/percent parsing, `BRANCH_ERROR_KEYS`/`branchErrorKey` |
| src/features/branches/components/BranchesScreen.tsx | Locations list + Overview tab (Business plan, multi-branch) |
| src/features/branches/components/LocationScreen.tsx | Single-location summary + edit (Solo/Team) |
| src/features/branches/components/BranchFormDrawer.tsx | Create/edit form shared by both screens |
| src/features/branches/components/BranchSwitcher.tsx | Header/More switcher, shown only with >1 live branch |
| supabase/tests/21_branch_scope.sql | Branch-scope RLS across staff/services/clients (113 assertions) |
| supabase/tests/05_catalogue_and_schedule.sql | +4 assertions this round for `branch_hours_conflicts`/`branch_closure_conflicts` |

Rooms/resources (create, capacity, archive, UI) live in `schedule.md` with the rest of the branch's schedule — same screen (`/schedule` rooms tab), same audit round as Feature 10's staff/schedule fixes.

## Permissions & gating
`settings.business` (Owner-only by seed; a custom role CAN hold it at Branch scope — proven live this round). Branch-scoped RLS: `UPDATE` needs the permission AT THAT BRANCH; `INSERT`/archive/restore/primary need it at All scope (`can_grant_at(..., 'branch')`). `branches` SELECT is business-wide for every member (a known, accepted limit — Branch-scope holders see other branches' settings read-only within their own business; never cross-business).

## Verification (2026-10-16, Feature 11 audit)
Full trace of branch create/edit/archive/restore/primary, the locks, opening hours/closures/rooms, and RLS. Verified LIVE against dev inside rolled-back transactions; no data left behind.

**Confirmed correct, no bug:**
- `update_branch`'s validate-everything-then-one-write shape; every lock (`currency_locked`/`currency_in_use`, `timezone_in_use`, `prefix_locked`/`prefix_taken`) fires exactly as documented.
- `archive_branch`/`restore_branch`/`set_primary_branch`'s refusal set.
- The resource double-booking exclusion constraint and capacity-aware slot engine query.
- The dashboard booking RPC never checks branch OR staff hours (staff may book outside hours; only collision/capacity block it) — by design, proven already in Feature 10, re-confirmed for branch hours specifically.
- `CreateAppointmentForm`'s out-of-hours warning correctly reads branch hours when no staff is picked yet, staff hours once one is — advisory only, matches the engine.
- **Branch-level RLS proven live with a real custom role**: a role holding `settings.business` at Branch B could update Branch B (1 row affected) but not Branch A (0 rows, silently filtered by RLS as expected for an UPDATE) — real impersonation via `set_config('request.jwt.claims', ...)`, a throwaway business, rolled back.
- "Each extra branch billed" has no real metering (`plans.priced_per_branch` display-only) — already documented in `docs/business-flows.md`, confirmed still true, not a bug.

**Two real bugs found and fixed, matching this task's explicit "warn with a count, never silently orphan" ask** (same decided pattern as Feature 10's staff/time-off fix — nothing is deleted, so these warn rather than refuse):
1. Saving reduced branch opening hours had zero awareness of existing future appointments (ANY staff member at that branch — a bigger blast radius than a single staff member's own hours). New `branch_hours_conflicts` (migration `20261024140000`), wired into `BranchHoursEditor` with a confirm dialog. Proven live: hours excluding a real fixture appointment's time count 1 conflict; hours including it count 0.
2. Adding a holiday/closure had the same gap. New `branch_closure_conflicts` (same migration), wired into `ClosuresList`'s closure-add flow. Proven live: a closure covering the appointment's day counts 1 conflict; a different day counts 0.

**One real bug found and fixed, matching "archive with future appointments"** (the third item in this task's list, same class as `archive_branch`/`archive_staff` — a hard refusal, since archiving actually removes something): archiving a resource was a bare `update resources set deleted_at = now()`, no RPC, no check — and `use_resources` is genuinely reachable/toggleable in Booking Settings today, so a future appointment can carry a real `resource_id`. New `resource_archive_blockers` + `archive_resource` RPC (migration `20261024150000`), same shape as `archive_staff`. Proven live: a resource with a future confirmed appointment assigned to it refuses with `{code:'future_appointments', count:1}`; `not_found`/`forbidden` also proven.

**Two instances of the recurring raw-error-text bug** (same pattern fixed in Features 9/10): `useBranchAdmin`'s list query discarded the Postgrest error's `.code` before throwing; `BranchesScreen` and `LocationScreen` both showed `branches.error.message` (raw server text) instead of going through the existing `branchErrorKey()` mapper — every mutation already used it correctly, only the two list-load error states were missed. Fixed in both.

Suites 05 (27/27, +4), 12 (153/153), 16 (419/419), 18 (367/367), 21 (113/113), 37 (57/57) all re-verified, unaffected or improved. `npm run check:migrations` 159/159 from empty (was 157). 3 new unit tests (`resourceArchiveErrorKey`); 851/851 full suite, tsc/lint clean. Not applied to prod.

## Known limits / TODO
- `branches` SELECT shows every branch's settings (tax number, prefix) to every member of the business, not just All-scope holders — a known, accepted limit (not a cross-tenant leak), documented in `plan-features.md`.
- No per-branch metered billing for extra locations exists; the pricing page's "each extra branch billed" claim is display-only.
- `report_windows`/`get_basic_report` skip archived branches (documented elsewhere, unrelated to this round).
- A booking made out-of-branch-hours or out-of-staff-hours from the dashboard is correctly allowed (by design) but the Calendar's "closed" shading can make it look wrong at a glance; Feature 10 already addressed the visibility half of this for staff (an inactive staff member's appointment still gets a column) — the same shading-vs-booking distinction applies to branch-hours changes too, not a new bug.

## Changelog
- 2026-10-16: Feature 11 audit — see "Verification" above. New file (branches had no dedicated context file before; content was split across `plan-features.md`/`schedule.md`).
- 2026-10-11: Phase 9A/9B: multi-branch backend (create/update/archive/restore/primary, locks, combined overview), branch-scope RLS fixes (suite 21).
- 2026-10-22: Business location screen (`/settings/location`) for Solo/Team, sharing `BranchFormDrawer`; suite `40_single_branch_edit.sql`.
