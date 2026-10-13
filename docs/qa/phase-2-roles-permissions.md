# QA Audit — Phase 2: Roles and permissions

Mode: audit only, no fixes. **CODE-READ only** (continuing the user's choice from Phase 1 — no live DB/RLS queries, no test users per role this session).

Scope covered: `docs/Wapee_Product_Overview_v2.md` §9, `src/config/permissions.ts`, `src/lib/permissions/can.ts`, `supabase/migrations/20261001184500_members_assignments_audit_helpers.sql`, `20261001190000_phase1_rls_policies.sql`, `20261002094000_fix_role_guard_allow_first_owner.sql`, `20261011090000_phase9_custom_roles.sql`, `20261011160000_phase9_grant_can_grant_at.sql`, `20261012090000_phase9b_branch_scope.sql`, `20261016100000/110000_phase11a_gdpr_*.sql`, `context/roles.md`, `context/plan-features.md`.

---

## Findings

### F2-01 — Last-Owner protection can be bypassed by a direct UPDATE of `member_role_assignments` — **Blocker**, CODE-READ
`enforce_last_owner()` (`supabase/migrations/20261001190000_phase1_rls_policies.sql:211`, redefined in `20261016100000`/`20261016110000` for the GDPR-erase exemption) is wired as:
```sql
create trigger member_role_assignments_last_owner
  before delete on public.member_role_assignments
  for each row execute function public.enforce_last_owner();
```
**Only `BEFORE DELETE`.** But `member_role_assignments` is **not RPC-only** — RLS grants `authenticated` full `for all` access gated solely by `can(business, null, 'roles.manage')`:
```sql
create policy member_role_assignments_write
  on public.member_role_assignments for all to authenticated
  using (exists (select 1 from public.business_members m where m.id = member_id and public.can(m.business_id, null, 'roles.manage')))
  with check (same);
```
(`20261001190000_phase1_rls_policies.sql:130-139`, `grant select, insert, update, delete ... to authenticated` at line 141 — unchanged since Phase 1, still true after Phase 9's custom-roles work.)

- **Failure scenario**: a sole Owner's business has one `member_role_assignments` row linking them to the system Owner role. Any member holding `roles.manage` — which on a default seed is Owner and Manager, or any custom role with that permission — can run, via `supabase-js`/PostgREST directly (not through `assign_member_role`/`remove_member_role`, which correctly go through INSERT+DELETE and are properly guarded):
  ```sql
  update member_role_assignments set role_id = '<manager-role-id>' where id = '<the-only-owner-assignment>';
  ```
  This is an `UPDATE`, so:
  1. `member_role_assignments_guard` (`BEFORE INSERT OR UPDATE`, `enforce_role_assignment_guard`) fires — but it only checks escalation ("can the caller grant the *new* role"), never last-owner.
  2. `member_role_assignments_last_owner` (`BEFORE DELETE` only) **never fires**, because this is an UPDATE, not a DELETE.
  3. Nothing in the RPCs is touched because the business logic happened via raw PostgREST, not `assign_member_role`/`remove_member_role`.
  - Result: the business now has **zero active Owners**. Billing (`settings.billing`, Owner-only per doc §9) becomes permanently unreachable by anyone — no one can ever regain Owner through the UI (every "assign a role" path itself requires `roles.manage`/escalation checks that no longer include an Owner to re-grant it from). Recovery would need a super admin or hand SQL.
  - A Manager with `roles.manage` (default seed, per doc §9 table "Roles and invites: Yes/Invite staff" for Owner/Manager — Manager's `roles.manage` scope is `branch`, worth re-checking live whether `can()` at `branch` scope still satisfies the RLS `using`/`with check`, which passes `branchId: null` — see F2-02) could trigger this against the Owner's own `all`-scope assignment, since the RLS check is business-level `can(...,'roles.manage')` and does not special-case the target row's role.
- The write **is still audit-logged** (`AFTER INSERT OR UPDATE OR DELETE` on the same table, `audit_role_assignment()` → `role.assignment_changed`), so the event is traceable after the fact — but nothing prevents it from happening.
- **Recommendation**: extend `enforce_last_owner()`'s trigger to also fire `BEFORE UPDATE OF role_id, branch_id` (or `BEFORE UPDATE` generally) so an UPDATE that would remove the business's last active Owner assignment is refused the same way a DELETE is. The function body already computes `v_owner_count` generically from `old`/`new`; it would need the UPDATE case to check against the *old* role being an Owner row and reject if the new role is not (mirroring the existing DELETE logic, which already uses `coalesce(old.member_id, new.member_id)`).

### F2-02 — Needs live verification: does a Manager's `branch`-scope `roles.manage` satisfy the business-wide RLS check on `member_role_assignments`? — **High**, UNVERIFIED
Doc §9 shows Manager's "Roles and invites" as "Invite staff" (narrower than Owner's "Yes"), suggesting Manager should not have full `roles.manage`. But the RLS policy on `member_role_assignments` only calls `public.can(m.business_id, null, 'roles.manage')` — i.e. "does the caller hold `roles.manage` **anywhere** in the business" (branch param is `null` = "anywhere" per `has_permission`'s scope rules) — not scoped to the specific branch of the target assignment.
- If Manager's seed actually holds `roles.manage` at `branch` scope (need to confirm against the live seed — the doc's "Invite staff" wording for Manager might map to `users.invite` only, not `roles.manage`), then this RLS check would still pass for a Manager with `roles.manage` at even one branch, letting them write/delete role assignments for members at OTHER branches or for branch-less (all-branch) assignments like the Owner's — a potential Branch-scope escape.
- **Could not verify this phase** (code-read only): would need to inspect the actual seeded `role_permissions` rows for the Manager system role to confirm whether `roles.manage` is seeded for Manager at all, and at what scope. `context/roles.md` states Manager has "39 permissions, branch" scope but doesn't enumerate which permissions. Flagging for Phase 2 live-testing follow-up.

### F2-03 — Escalation guard (`can_grant_at`) correctly scope- and branch-aware — **no bug found**
`enforce_role_assignment_guard()` (Phase 9 version, `20261011090000_phase9_custom_roles.sql:246`) correctly: refuses a role from another business, refuses a deleted role, refuses an unknown branch, exempts the founding-Owner bootstrap case (zero existing assignments) and the super admin/service-role case, gates custom roles behind the `custom_roles` feature on INSERT, and checks every `role_permissions` row of the role being assigned against `can_grant_at` (scope- and branch-aware, not just permission-name matching as the original Phase 1 guard was). This matches doc §9's "nobody grants a permission they lack" rule precisely, including the branch nuance ("one person Manager at branch A, Staff at branch B" from the audit brief) — `can_grant_at`'s branch-covering logic (`rp.scope = 'all' or a.branch_id is null or a.branch_id = p_branch_id`) is correct.

### F2-04 — `settings.billing` cannot be granted to a custom role, enforced both at definition and clone time — **no bug found**
`enforce_role_permission_guard()` raises `billing_owner_only` (`23514`) on any attempt to insert `settings.billing` into `role_permissions` for a non-system role. `context/plan-features.md` confirms clones are also stripped and reported. Matches doc §9 "only Owner manages billing" exactly.

### F2-05 — Default roles are correctly immutable — **no bug found**
`enforce_role_guard()` refuses any UPDATE/DELETE on a system role (`business_id is null or is_system`) from an authenticated caller, and refuses hard-deleting a custom role outside `delete_custom_role` (which uses a session flag `wapee.role_rpc` to permit its own internal soft-delete). Matches doc §9 "Default roles cannot be deleted."

### F2-06 — Custom roles need the `custom_roles` feature in three places, correctly — **no bug found**
Verified three independent enforcement points: (1) `roles_enforce_custom_roles_feature` trigger on `roles` INSERT (Phase 8, blocks creating the role at all if the feature is off); (2) `enforce_role_assignment_guard`'s explicit `business_has_feature(...,'custom_roles')` check on assigning a custom role (INSERT only — so an existing assignment survives a downgrade, matching the documented decision "existing assignments keep working after a downgrade"); (3) `roles_gate()` used by every role-management RPC (`create_custom_role`, `update_custom_role`, etc.) via `feature_gate_error`. This triple coverage matches the product doc's "enforced in three places: RLS, Edge Function/RPC, UI" principle, specifically for this one feature flag.

### F2-07 — Audit logging of role changes is comprehensive, including the raw-write escalation path — **no bug found** (see F2-01 for the enforcement gap it reveals)
`audit_role_assignment()` fires `AFTER INSERT OR UPDATE OR DELETE` unconditionally (not RPC-gated), so even the raw-UPDATE vector in F2-01 produces a `role.assignment_changed` audit row with full before/after role name, key, and branch. Good defense-in-depth for detection, even though prevention is missing.

---

## Things not yet checked this phase (deferred to live-role testing or later phases)
- Actual RLS behavior per role against every table (requires test users per role — explicitly deferred by the user's "code-read only" choice).
- Whether a role assigned at branch A for a Manager actually fails to read/write branch B data (the branch-scope RLS rework from Phase 9B, `20261012090000_phase9b_branch_scope.sql`, is referenced in context files as tested by `21_branch_scope.sql`, but was not re-run this session).
- Sensitive client fields (`clients.view_sensitive`) — spot-checked the gating call sites (F found no bug), but not exercised live per role.
- Custom roles × role add-on combinations beyond what's covered above (deferred to Phase 3, which explicitly covers add-on × role).

## Things that look intentionally limited (not bugs)
- Custom-role assignments made before a downgrade are not retroactively revoked (`plan-features.md`'s documented decision) — intentional.
- `has_permission()`/`can_grant_at()`/`can_define_at()` were never redefined to join `roles.deleted_at` directly — safe in practice only because every write path that could create a dangling reference (`delete_custom_role`) already cleans up `member_role_assignments` in the same transaction, and the INSERT/UPDATE guard explicitly checks `role_deleted`. Not a finding, but worth noting as a single point of reliance (if a future migration ever modifies `roles.deleted_at` directly without going through `delete_custom_role`, dangling permission grants could resurrect silently since `has_permission` doesn't defend against it independently).

## Severity summary
| Severity | Count | IDs |
|---|---|---|
| Blocker | 1 | F2-01 |
| High | 1 | F2-02 (unverified, needs live check) |
| Medium | 0 | — |
| Low | 0 | — |

## What could not be verified this phase
Code-read only, as in Phase 1:
- F2-02 (Manager's actual seeded `roles.manage` scope) needs the live seed data or a grep of the seed migration's Manager `role_permissions` rows — not done this session (time-boxed to the highest-value finding, F2-01).
- Whether `21_branch_scope.sql` / the custom-roles suite (`19_phase9_plan_features.sql`, 543 assertions per context files) still pass was not re-run.
- No actual attempt was made to execute the F2-01 raw-UPDATE against a live database (would require a test business + test owner/manager — deferred per the user's code-read-only choice this session).

## Top 5 issues
1. **F2-01** (Blocker) — Last-Owner protection trigger only fires on DELETE; a direct UPDATE of `member_role_assignments.role_id` via RLS-permitted write (not RPC) can silently remove a business's only Owner, with no code path to prevent it (only to audit-log it after the fact).
2. **F2-02** (High, unverified) — Need to confirm live whether Manager's `roles.manage` scope lets them write/delete assignments business-wide via the RLS policy (which checks "anywhere" rather than per-target-branch) — possible branch-scope escape, pending seed-data confirmation.
3. No other findings reached Medium or above — the escalation guard, billing-owner-only rule, default-role immutability, and feature-gating-in-three-places pattern are all correctly implemented and match the product doc precisely.
4. Audit logging is solid and would make F2-01 fully traceable after the fact, which helps triage but does not reduce its severity (prevention, not just detection, is the safety rule in doc §9).
5. Sensitive-field and per-table RLS-vs-role verification remains fully unverified live — recommend prioritizing live-role testing before launch given F2-01's severity.
