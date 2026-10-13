# QA Audit — Phase 2: Roles and permissions

Mode: audit only, no fixes. **CODE-READ only** (continuing the user's choice from Phase 1 — no live DB/RLS queries, no test users per role this session).

Scope covered: `docs/Wapee_Product_Overview_v2.md` §9, `src/config/permissions.ts`, `src/lib/permissions/can.ts`, `supabase/migrations/20261001184500_members_assignments_audit_helpers.sql`, `20261001190000_phase1_rls_policies.sql`, `20261002094000_fix_role_guard_allow_first_owner.sql`, `20261011090000_phase9_custom_roles.sql`, `20261011160000_phase9_grant_can_grant_at.sql`, `20261012090000_phase9b_branch_scope.sql`, `20261016100000/110000_phase11a_gdpr_*.sql`, `context/roles.md`, `context/plan-features.md`.

---

## Findings

### F2-01 — Last-Owner protection can be bypassed by a direct UPDATE of `member_role_assignments` — **re-rated Blocker → High after live verification on dev; see addendum below** — CODE-READ, then VERIFIED
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

### F2-02 — RESOLVED, no bug — VERIFIED live against dev's seed data
Queried `role_permissions` live on dev (`rfuovquhultjydtswtqf`) for every permission named `roles.manage` across every system role:
```
roles.manage: ONLY 'owner' (scope 'all'). Manager, Receptionist, Staff: none hold it.
```
Manager's seed does **not** include `roles.manage` at any scope — doc §9's table is accurate as written ("Roles and invites: Owner Yes, Manager Invite staff" — i.e. `users.invite` only). The RLS-scope-escape concern this finding raised does not apply: there is no default role below Owner that could reach the `member_role_assignments_write` policy at all, regardless of the `branch`-vs-`all` scope question. Also confirmed: **zero custom roles on dev currently hold `roles.manage`** either, so the live exploit surface for F2-01 (below) is Owner-only today, not "any Manager."

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

## Live-verification addendum (dev project, rolled back, nothing committed)

**F2-01 was proven exploitable, live, on dev**, inside a transaction that was rolled back immediately after (confirmed clean afterward: Nova Hair Studio shows 1 remaining owner, the test assignment's `role_id` is back to the Owner role). The test impersonated the real Owner of a real business (Nova Hair Studio) via `set_config('request.jwt.claims', ...)` + `set local role authenticated`, then ran:
```sql
update member_role_assignments set role_id = '<manager-role-id>' where id = '<the-owner's-own-sole-owner-assignment>';
```
This succeeded with no exception. A follow-up query in the same transaction confirmed `remaining_owners = 0` for that business immediately after.

**Live seed data resolves who can actually do this** (see F2-02 above): only `owner` holds `roles.manage` by default, and zero custom roles on dev currently hold it either. So the real actor is:
- the Owner themselves (via a direct API call bypassing the UI, which only exposes the properly-guarded `assign_member_role`/`remove_member_role` RPCs), or
- someone the Owner has explicitly handed `roles.manage` to via a custom role — a real, available path (nothing blocks `roles.manage` from being included in a custom role; only `settings.billing` is specially locked) but not exercised by any business on dev today.

**This is not a stranger-escalation path** — a default Manager/Receptionist/Staff cannot reach `member_role_assignments_write`'s RLS check at all, confirmed by the live seed. **Severity re-rated: Blocker → High.** The blast radius if triggered is still severe (a business can permanently lose every Owner, with billing unreachable by anyone short of a super admin or hand SQL), which is why this stays High rather than Medium — but it requires an already-privileged actor (the Owner or their own delegate) rather than any signed-in stranger or even a default lower-privileged role. The fix recommendation is unchanged: extend `enforce_last_owner()` to also fire `BEFORE UPDATE`.

---

## Things not yet checked this phase (deferred to live-role testing or later phases)
- Actual RLS behavior per role against every table (requires test users per role — explicitly deferred by the user's "code-read only" choice).
- Whether a role assigned at branch A for a Manager actually fails to read/write branch B data (the branch-scope RLS rework from Phase 9B, `20261012090000_phase9b_branch_scope.sql`, is referenced in context files as tested by `21_branch_scope.sql`, but was not re-run this session).
- Sensitive client fields (`clients.view_sensitive`) — spot-checked the gating call sites (F found no bug), but not exercised live per role.
- Custom roles × role add-on combinations beyond what's covered above (deferred to Phase 3, which explicitly covers add-on × role).

## Things that look intentionally limited (not bugs)
- Custom-role assignments made before a downgrade are not retroactively revoked (`plan-features.md`'s documented decision) — intentional.
- `has_permission()`/`can_grant_at()`/`can_define_at()` were never redefined to join `roles.deleted_at` directly — safe in practice only because every write path that could create a dangling reference (`delete_custom_role`) already cleans up `member_role_assignments` in the same transaction, and the INSERT/UPDATE guard explicitly checks `role_deleted`. Not a finding, but worth noting as a single point of reliance (if a future migration ever modifies `roles.deleted_at` directly without going through `delete_custom_role`, dangling permission grants could resurrect silently since `has_permission` doesn't defend against it independently).

## Severity summary (updated after live verification)
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 1 | F2-01 (re-rated from Blocker after live seed data showed the actor must already hold `roles.manage`, which only Owner has by default) |
| Medium | 0 | — |
| Low | 0 | — |

F2-02 is resolved (no bug — see above), not carried forward as a finding.

## What was verified live this round
- F2-02: the live `role_permissions` seed data, queried directly on dev — Manager does not hold `roles.manage`.
- F2-01: the raw-UPDATE exploit itself, run inside a rolled-back transaction against a real business (Nova Hair Studio) on dev, impersonating its real Owner — succeeded, left 0 remaining owners, rolled back cleanly with no lasting effect.
- Suites `21_branch_scope.sql` (113/113), `28_view_contact.sql` (43/43), `29_gdpr.sql` (72/72), `31_rls_equivalence.sql` (6/6) all run live on dev this round — 234/234, 0 failures (see Phase 6's addendum for the full breakdown; these suites span branch-scope RLS for every default role, which bears on this phase's "per-branch role assignment" checks).

## What could not be verified this round
- `19_phase9_plan_features.sql` (543 assertions, the dedicated custom-roles suite) was not run live this round — the four suites above were the ones specifically requested.
- Sensitive-field RLS-vs-role verification beyond what suites 28/31 cover.

## Top 5 issues
1. **F2-01** (High, re-rated from Blocker) — Last-Owner protection trigger only fires on DELETE; a direct UPDATE of `member_role_assignments.role_id` succeeds live on dev with 0 remaining owners as the result, proven in a rolled-back transaction. The realistic actor, per live seed data, is the Owner themselves or a delegate they explicitly granted `roles.manage` — not any Manager/Receptionist/Staff by default. Fix: extend `enforce_last_owner()` to also fire on UPDATE.
2. **F2-02** (resolved, no bug) — live seed data confirms Manager does not hold `roles.manage`, closing the scope-escape concern this finding raised.
3. No other findings reached Medium or above — the escalation guard, billing-owner-only rule, default-role immutability, and feature-gating-in-three-places pattern are all correctly implemented and match the product doc precisely, now reinforced by 234 live-passing pgTAP assertions.
4. Audit logging is solid and would make F2-01 fully traceable after the fact, which helps triage but does not reduce its severity (prevention, not just detection, is the safety rule in doc §9).
5. The four requested pgTAP suites (21, 28, 29, 31) all pass live with zero failures — real evidence for the per-role RLS matrix this phase's original "code-read only" scope could not provide.
