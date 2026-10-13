# QA Audit — Summary (Phases 1-6)

Mode: audit only, no fixes applied. **CODE-READ only throughout** (the user chose code-read-only at the start; no live Supabase queries, no test users per role were run in any phase). Every finding below is CODE-READ unless marked VERIFIED. Full detail, code excerpts, and reasoning live in the per-phase files: `phase-1-plans-gating-matrix.md` through `phase-6-security-abuse.md`.

---

## All findings, sorted by severity

| ID | Phase | Severity | Summary | Status |
|---|---|---|---|---|
| **F2-01** | 2 — Roles & permissions | **Blocker** | `enforce_last_owner()` only fires on `DELETE` of `member_role_assignments`, but that table is directly writable (not RPC-only) via RLS gated solely on `roles.manage`. A raw `UPDATE role_id` on the business's only Owner assignment bypasses last-owner protection entirely, leaving the business with **zero Owners** and billing permanently unreachable. Audit-logged after the fact; nothing prevents it. | CODE-READ. Needs a migration (extend the trigger to also fire `BEFORE UPDATE`). |
| **F1-01** | 1 — Plans & gating | High | `current_period_end` is stored on `business_subscriptions` but never read by `business_is_active()` or anything else. A manually-billed business whose paid period lapses stays fully `active` forever unless a human notices and suspends it by hand — no self-expiry like the trial path has. | CODE-READ. Needs either a migration (extend `business_is_active()`) or an explicit doc note that this is deferred until a payment provider is chosen. |
| **F2-02** | 2 — Roles & permissions | High (unverified) | The RLS write policy on `member_role_assignments` checks `can(business, null, 'roles.manage')` — "anywhere in the business" — not scoped to the target assignment's branch. If Manager's seeded role actually holds `roles.manage` (vs. only `users.invite`), a branch-scoped Manager could write/delete role assignments business-wide. **Needs the live seed data to confirm** — not resolved by code reading alone. | UNVERIFIED — needs a look at the actual seeded Manager `role_permissions` rows, or a live test. |
| **F6-S1** | 6 — Security & abuse | Medium | `client_has_live_appt(uuid)` — SECURITY DEFINER, zero membership check, granted to `authenticated`. Any signed-in user can probe any client UUID platform-wide for "does this client have a live appointment" (cross-tenant existence-oracle leak). Same bug class the team already fixed once (M4, `business_is_active`/`suggest_invoice_prefix`) but never applied here. | CODE-READ, independently re-verified. Needs a migration (`revoke ... from authenticated`, leave `service_role` only). |
| **F6-S2** | 6 — Security & abuse | Medium | `client_package_used(uuid)` — identical gap: any signed-in user can read any client package's exact session-usage count by id, platform-wide. The migration's own author revoked `authenticated` at creation then re-granted it 275 lines later in the same file — apparent oversight while wiring up `list_client_packages` (which didn't need the standalone grant). | CODE-READ, independently re-verified. Same fix as F6-S1. |
| **F5-01** | 5 — Core flows | Medium | SMS channel selection is fully live server-side (`outbox_enqueue` will pick the `sms` channel whenever `notification_settings.sms_enabled = true`); only a hidden UI toggle (`launch.ts`) keeps any branch from reaching that state today. Same underlying gap as F1-02/F3-01, surfacing a third time. | CODE-READ. One server-side fix covers this plus F1-02 and F3-01 together. |
| **F1-02** | 1 — Plans & gating | Medium | "Off at launch" (widget, SMS) is enforced only by a client-side flag (`src/config/launch.ts`); the database/Edge Functions have no knowledge of it and still serve requests on a Team/Business plan if reached directly (e.g. a pre-existing `widget_keys` row, or a direct RPC call). | CODE-READ. Likely deliberate trade-off (code says "flip back on later") but is a real server-side gap relative to the stated "UI hiding is never the boundary" rule. |
| **F1-04** | 1 — Plans & gating | Medium | Solo plan's "owner only" roles restriction (`default_roles` flag) is never enforced anywhere — a Solo owner can invite Manager/Receptionist/Staff today, contradicting product doc §10's table. Already known/documented in `plans-super-admin.md` prior to this audit. | CODE-READ, confirmed still present. Product decision needed: enforce it, or formally drop the doc's claim. |
| **F3-01** | 3 — Add-ons | Low | `addons.available_plans` (which add-on is sellable on which plan) is pricing-display metadata only; the super admin's `set_addon` RPC doesn't check it, so a super admin can manually enable any add-on on any plan. Very likely intentional (manual override tool for support/billing). | CODE-READ. Doc note recommended, no code change necessarily needed. |
| **F4-01** | 4 — Multi-branch | Low | Two context files (`plan-features.md`, `_handoff.md`) describe the public booking page as "primary branch only, no picker" — **this is stale**. A later migration (`20261022100000`) built a real, fully-wired multi-branch picker (server function, UI, unit tests). Doc-only issue, not a code bug. | CODE-READ, confirmed stale docs. Fix: update the two context files. |
| **F2-03 … F2-07, F3-02 … F3-04, F4-02 … F4-07, F5-02 … F5-07, F6-01 … F6-07** | various | — (no bug) | A large number of specific mechanisms were read in depth and found to be **correctly implemented, matching their documented rules** — see "Confirmed-clean, high-value checks" below. Not re-listed individually here since they are not findings. | CODE-READ, confirmed correct. |

**Running total: 1 Blocker · 2 High (1 unverified) · 4 Medium · 2 Low.**

---

## What is VERIFIED vs. CODE-READ-only vs. UNVERIFIED

**Nothing in this audit is VERIFIED in the strict sense** (no live Supabase queries or test-user runs were performed in any phase — the user explicitly chose code-read-only at the start of Phase 1 and that held for the whole audit). Every finding and every "no bug found" conclusion above is **CODE-READ**: reasoned from the migration files, Edge Function source, and client code as they exist on `dev` today, cross-checked against the product doc and the project's own context files.

One item is flagged as **UNVERIFIED** rather than CODE-READ because the code alone cannot resolve it without the actual seed data:
- **F2-02** — needs the live `role_permissions` rows for the seeded Manager role to confirm whether the RLS escalation concern is real or moot.

Everything the team's own prior internal work had already verified live (pgTAP suites 01-36+, HTTP proof scripts, the Phase 11A security review's live catalogue queries) was **not re-run** this session — this audit re-read the code those tools exercise and confirmed it still matches what the suites are reported to prove, but did not re-execute any of them.

---

## Confirmed-clean, high-value checks (selected — see per-phase files for the full list)

These are not findings, but are worth naming because they were explicitly checked against known historical bug patterns or specific audit-brief asks, and held up:

- **The exact two historical bug patterns CLAUDE.md's testing rules call out by name are both still fixed and have not regressed**: `reschedule_booking`'s "free the slot to validate it" bug, and `accept_invite`'s "a raise rolls back the rate-limit counter" bug. Both re-read end to end in Phases 5/6.
- **Invoice money correctness**: `add_payment`/`reverse_payment`/`create_credit_note` are row-locked, validate-before-write, and the partial-credit-note tax-rounding math provably sums back to the original tax with no drift.
- **Review-rating neutrality**: `submit_review` returns the Google review link for every rating 1-5, unconditionally — zero gating or incentive code found anywhere, matching doc §13 and the audit brief's explicit ask exactly.
- **GDPR erasure preserves financial immutability**: `gdpr_erase_client` blanks only personal text on invoices, never touching the money columns.
- **Add-on-off correctly blocks RLS + RPC + storage together**, across all five add-ons (Packages, Inventory, Files & Photos, Forms & Consent, Client portal) — the single highest cross-cutting risk named in the Phase 3 brief, and it held.
- **The Files & Photos private bucket genuinely has zero `storage.objects` policies** — a real, meaningful boundary (not "UI hiding"), re-confirmed from the migration directly.
- **Multi-branch locks (currency/timezone/invoice-prefix) and gapless concurrent invoice numbering** are all correctly validate-then-write and lock-before-check.
- **The team's own Phase 11A security review's six highest-value fixes were re-verified un-regressed**: the `clients_v`/`clients_select` RLS-consistency fix, the anon-grant revocation for `is_slug_available`/`my_grants`, the public asset bucket's path-to-business binding, Edge Function `verify_jwt` trust boundaries, deleted-user cascade safety, and the `send_outbox` worker-token comparison.
- **A dedicated sweep of all 147 `SECURITY DEFINER` functions granted to `authenticated`** found only the two Medium findings above (F6-S1/F6-S2) — everything else (~145 functions) carries an inline or delegated authorization check.

---

## Proposed fix order

1. **F2-01 (Blocker)** — fix first, before anything else ships. This is the one finding that can put a business into an unrecoverable state (zero Owners). Needs a migration extending `enforce_last_owner()` to also fire on `UPDATE`.
2. **F6-S1, F6-S2 (Medium, but trivial to fix)** — one-line `revoke` migrations, same pattern already used for `business_is_active`/`suggest_invoice_prefix`. Low effort, closes a real cross-tenant information leak. Do these next since they're cheap and the pattern is proven.
3. **F2-02 (High, unverified)** — resolve by checking the live Manager role seed (a 5-minute lookup) before deciding whether this needs a code fix or is already moot. Do this early since it's cheap to resolve and currently sits at High severity only because it's unverified.
4. **F1-01 (High)** — either implement `current_period_end` enforcement (extend `business_is_active()`) or make the deferral explicit in `billing.md`/`plans-super-admin.md`. Low urgency only because manual billing is still super-admin-only and small-scale; becomes more urgent as the business count grows.
5. **F1-02 / F5-01 (Medium, same root cause)** — decide once whether "off at launch" needs a server-side backstop or stays a documented, accepted UI-only suppression; fix (or document) once, not three times.
6. **F1-04 (Medium)** — product decision needed: enforce Solo's owner-only restriction, or drop it from doc §10's table. Either is a small change; the risk is leaving the mismatch between doc and code unresolved.
7. **F3-01, F4-01 (Low)** — documentation-only fixes, no urgency, bundle into the next unrelated touch of those files.

## Which fixes need a migration

- F2-01 — **yes**, a new migration (extend `enforce_last_owner`'s trigger coverage).
- F6-S1, F6-S2 — **yes**, a new migration (revoke `authenticated` execute on both functions).
- F1-01 — **yes, if fixed in code** (extend `business_is_active()`); **no** if the decision is to defer and just document it.
- F1-02 / F5-01 — **possibly**, depending on the chosen fix (a server-side launch-flag check would need new code, likely not a schema migration).
- F1-04 — **yes, if enforced** (a new trigger/RPC check); **no** if the doc is changed instead.
- F2-02 — depends entirely on what the live seed data shows; could be a no-op or could need a role_permissions correction.
- F3-01, F4-01 — **no**, documentation only.

---

## What this audit did not cover (explicitly, by phase)

- **Phase 1**: live trigger-firing behavior, concurrent advisory-lock races under real load, actual UI behavior with a lapsed `current_period_end`.
- **Phase 2**: the actual seeded Manager permission set (F2-02's blocker), live branch-scope RLS re-run (suite 21), sensitive-field gating exercised per role live.
- **Phase 3**: enable/disable mid-use independently verified only for Packages (others reasoned by pattern); concurrency claims read as structurally sound but not re-run; add-on × role combinations not exercised live.
- **Phase 4**: DST-exact slot math not re-derived; live behavior of the new multi-branch picker not exercised in a browser.
- **Phase 5**: reports internals (beyond currency grouping), website builder, notification delivery/retry mechanics, commission math, and custom-field/form-version validation were not read this session at all.
- **Phase 6**: the full per-role × per-tenant-table RLS matrix (the audit brief's most exhaustive single ask) was spot-checked on several high-risk tables across the whole audit, not mechanically walked table-by-table; whether the suspended-login Auth Hook is actually enabled in the dev project's dashboard (not visible from code); any live penetration test, Android/iOS binary review, or Supabase platform-level check.

Recommend treating this audit as a strong first pass concentrated on money, authorization boundaries, and cross-tenant isolation (where it found real issues), and running the project's own existing pgTAP/HTTP suites live — plus the specific F2-02 seed-data lookup — as the fastest way to close the "unverified" gaps before launch.
