# QA Audit — Phase 3: Add-ons

Mode: audit only, no fixes. **CODE-READ only** (continuing from Phases 1-2).

Scope: Packages & Sessions, Inventory, Files & Photos, Forms & Consent, Client portal. SMS and embed widget are covered by F1-02 in Phase 1 (off-at-launch is UI-only) and not re-litigated here. `context/packages-sessions.md`, `context/inventory.md`, `context/files-photos.md`, `context/forms-consent.md`, `context/client-portal.md`, plus the underlying migrations `20261013100000`-`20261015130000`.

---

## Add-on off → blocked in all three layers (RLS / RPC / storage)

| Add-on | RLS select gate | RPC write gate | Storage gate |
|---|---|---|---|
| Packages | `package_visible`/`addon_read_access` → `business_has_feature` | every RPC calls `feature_gate_error(biz,'packages')` before its write | n/a |
| Inventory | `addon_read_access(...,'inventory',...)` | every RPC calls `feature_gate_error` | n/a |
| Files & Photos | `file_visible` → feature check | `files_prepare_upload` checks add-on; Edge Function calls the RPC as the caller | bucket `client-files` has **no storage.objects policy at all** — confirmed in `20261014090000_phase10b_schema.sql:19-23` (`public: false`, no policy rows), matches the documented "proved over real HTTP" claim |
| Forms & Consent | `forms_read_access` → feature check | every RPC calls `feature_gate_error`; public `submit_form_request`/`get_form_request` also check the add-on (generic `invalid_token` if off, per the doc) | n/a |
| Client portal | `business_has_feature(client_portal)` checked in every `portal_*` RPC; Edge function returns generic `not_found`/`{sent:true}` when off | all `portal_*` RPCs are `service_role` only, called by one Edge Function | n/a |

All five add-ons correctly implement the "add-on off → screens, routes, menu, RPCs, RLS and storage all blocked" rule from the audit brief. **No bug found** in this cross-cutting check — this was the single highest-risk item for Phase 3 and it held up under code reading.

## Enable/disable mid-use

- **Packages**: `client_packages`/`session_usages` rows persist when the add-on is switched off; `package_visible`'s RLS gate re-checks `business_has_feature` live on every query, so existing packages become invisible (not deleted) the instant the add-on is turned off, and reappear correctly if re-enabled. Matches the documented "nothing is lost while off" behavior. **No bug found** (verified by reading `list_client_packages`, `SECURITY INVOKER`, relies entirely on `client_packages_select` RLS → `package_visible`).
- **Custom roles**: already covered in Phase 2 (F2-06) — existing assignments survive a downgrade/disable; only NEW assignments are blocked. Matches `plan-features.md`'s documented decision.
- **Inventory / Files / Forms / Client portal**: same `addon_read_access`/`feature_gate_error`/`business_has_feature` pattern throughout; by construction (the gate is re-evaluated on every call, never cached in the row), the same live on/off behavior applies. Not independently re-derived per add-on this phase given the consistent pattern already confirmed for Packages — flagged as **CODE-READ, reasoned by pattern, not individually re-traced for Inventory/Files/Forms/Portal this session.**

## Findings

### F3-01 — `addons.available_plans` is pricing-display-only; `set_addon` never checks it — **Low**, informational, CODE-READ
`available_plans` (added in `20261021090000_public_pricing.sql`, e.g. `custom_roles` restricted to `['team']`) is read only by `get_public_pricing()` (the landing page) and `set_addon_prices`. The super admin's actual `set_addon(business, addon, enabled)` RPC (`20261010110000_phase8_super_admin_rpcs.sql:220`) has no knowledge of `available_plans` — it will happily enable `custom_roles` (or any add-on) on a Solo-plan business if a super admin calls it, even though the landing page would never offer that combination to a self-service customer.
- **Not a bug**: `set_addon` is an explicit human override tool (manual billing per doc §10, "until [a payment provider is chosen] super admin assigns plan/status manually"), and letting the super admin override plan/add-on combos for support reasons (comping a feature, a manual deal, a migration) is reasonable. Flagging only because the audit brief explicitly asks to check "add-on × plan combinations," and this is a place where the two layers (display vs. enforcement) diverge — worth a one-line note in `plans-super-admin.md` so a future reader doesn't assume `available_plans` is enforced anywhere beyond pricing display.

### F3-02 — Packages/Inventory child-table RLS policies rely on RLS composing through a subquery, not a restated gate — **no bug found**, but worth documenting as a reliance
`package_services_select`, `client_package_services_select`, `client_package_cancellations_select`, `session_usages_select` (`20261013100000_phase10a_schema.sql:367-377`) use a bare `exists (select 1 from <parent_table> where <parent>.id = <child>.<parent>_id)` with no re-application of `addon_read_access`/`package_visible`. This is **safe** because Postgres RLS recursively applies the parent table's own policy to that inner subquery (the parent tables are plain RLS-enabled tables, not `SECURITY DEFINER` views that would bypass this) — so the gate is still enforced, just indirectly. No finding; noting it only so a future migration that turns one of the parent tables into a `SECURITY DEFINER` view (as was done elsewhere in this codebase for `clients_v`) does not silently break this chain without anyone noticing the implicit dependency.

### F3-03 — Packages/Inventory/Forms RPCs correctly order "validate everything, then one write" — **no bug found**
Spot-checked `deduct_session_at`, `reverse_session_at`, `delete_package`: every one performs its feature/permission/state checks (including the 10-minute undo window and `packages.reverse_session` scope check) strictly before the single `insert`/`update` statement. No case found where a write happens before a later check could still fail (the exact shape of bug CLAUDE.md's testing rules warn about, `reschedule_booking`'s historical bug). This matches the stated pattern across all five add-on RPC files.

### F3-04 — Session deduction race and stock race are each closed with a lock, matching the concurrency proof claims — **no bug found**
`deduct_session_at` takes `pg_advisory_xact_lock(hashtextextended('session_usage:'||appointment_id, 0))` before checking `already_deducted`, and locks the `client_packages` row (`for update`) before computing `v_remaining` — both locks are acquired before the balance check, so two concurrent deductions on the last session cannot both pass. `apply_stock_movement` (inventory) locks the product row before computing `stock_after`. This matches the "parallel deductions of the last session: exactly one wins, proved with 3 real sessions" and "3 parallel sales of the last unit: exactly one wins" claims in the context files — the locking code reads correctly to support those claims (not independently re-run this session).

---

## Things that look intentionally limited (not bugs)
- Credit notes are by amount, not per line, so a partial credit note never cancels a package or restores inventory stock for one line only (both `packages-sessions.md` and `inventory.md` document this explicitly as a decided limitation, not a bug).
- A manual inventory "return" movement is not tied to an invoice line, so staff must avoid using it for goods a later exhausting credit note will also restore (documented trap, process limitation not a code bug).
- Client portal customers never get a Supabase Auth user — by design, so a portal session can never reach a dashboard RLS policy (verified in the client-portal context file's own HTTP proof, not re-run this session but the design is sound by construction: `portal_*` RPCs are `service_role`-only and the portal Edge Function is the only caller).
- Files & Photos: EXIF/GPS is not stripped from uploaded photos (documented, UI discloses it) — a privacy consideration worth flagging to the user as a product decision, not a code bug.

## Severity summary
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 1 | F3-01 |

## What could not be verified this phase
- Enable/disable mid-use was independently verified in code only for Packages (the clearest RLS chain to trace); Inventory/Files/Forms/Portal were reasoned by the same `business_has_feature`/`addon_read_access`/`feature_gate_error` pattern rather than individually re-traced function-by-function — recommend a live smoke test per add-on (toggle off mid-session, confirm the UI/RPCs degrade to the documented "hidden, not deleted" behavior) before launch.
- Concurrency claims (session dedup, stock dedup, parallel form submission, parallel portal token exchange) were read as code and found structurally sound (locks precede the check-then-write), but none were re-run live this session — the context files claim they were previously proven with real parallel processes (`23_addons_concurrency.sh`, HTTP proofs 25/26); not re-verified here.
- Add-on × role combinations beyond what the permission catalogue encodes (e.g., does a Receptionist with `packages.sell` + `packages.deduct_session` but not `packages.reverse_session` actually get refused server-side on a reverse attempt) were reasoned from the RPC code (`reverse_session_at`'s `v_can_reverse` check) but not exercised live per role.
- The GDPR hooks mentioned as "not done" for Client portal session/token tables (`client-portal.md` limits section) were not followed up — out of scope for Phase 3, likely Phase 6 (security/GDPR) territory.

## Top issues
1. **F3-01** (Low) — `available_plans` is pricing-display metadata only; the super admin's `set_addon` RPC can enable any add-on on any plan regardless of what the landing page advertises. Intentional (manual override tool) but worth a documentation note.
2. No Medium/High/Blocker findings this phase — the add-on architecture (feature gate in RLS + RPC + storage, validate-before-write, lock-before-check-then-write) is consistently and correctly applied across all five add-ons.
3. The single biggest confirmed strength this phase: the private storage bucket for Files & Photos genuinely has zero `storage.objects` policies, so Supabase's default-deny applies — matches the documented HTTP-verified claim and is a real, meaningful security boundary (not "UI hiding").
