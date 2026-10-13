# QA Audit — Summary (Phases 1-6, with a live-verification round on dev)

**Update (2026-10-23): F2-01 and F6-S1/F6-S2 are FIXED and applied to dev.** Two new migrations
(`20261023090000_fix_last_owner_update_guard`, `20261023100000_fix_cross_tenant_oracle_leaks`) ship the fixes
proven in the live-verification round below. New test suite `41_last_owner_update_guard.sql` (18/18 passing)
plus regression suites 18/21/28/29/31 (590/590 passing) were run live on dev after applying. F6-S1/F6-S2 were
also re-verified over real HTTP (GoTrue + PostgREST, not just SQL) as a real cross-business Receptionist
session. **Not yet applied to production** — pending explicit approval; see the separate implementation report
for the exact `supabase db push` steps. The rest of this document is the original audit as written before the
fix; treat F2-01/F6-S1/F6-S2's rows below as historical (the finding was real, and is now shipped on dev).

Mode: audit only, no fixes applied to the real schema. Phases 1-6 were **CODE-READ only** (the user chose this at the start). After Phase 6, the user asked for targeted live verification on the **dev** project (`rfuovquhultjydtswtqf`) for the two highest-value open questions: whether F6-S1/F6-S2's proposed fix actually works without breaking real call sites, and who can really exploit F2-01 given the live role seed — plus running pgTAP suites 21/28/29/31 live. **Production (`bvnurpuqrcwfqguxniio`) was never touched at any point.** Every test against dev ran inside a transaction that was rolled back (`begin; ... rollback;`) except the four pgTAP suites, which are themselves self-contained rollback blocks. Nothing was committed to dev's schema or data during this audit.

Full detail, code excerpts, and reasoning live in the per-phase files: `phase-1-plans-gating-matrix.md` through `phase-6-security-abuse.md` (Phase 2 and Phase 6 both have live-verification addenda).

---

## All findings, sorted by severity

| ID | Phase | Severity | Summary | Status |
|---|---|---|---|---|
| **F2-01** | 2 — Roles & permissions | **High** (re-rated from Blocker after live verification) | `enforce_last_owner()` only fires on `DELETE` of `member_role_assignments`; a raw `UPDATE role_id` on the business's only Owner assignment bypasses it entirely, leaving **zero Owners**. **Proven live on dev** (rolled back): the exploit succeeded against a real business, `remaining_owners = 0` confirmed, no exception raised. **Live seed data narrows the actor**: only the system Owner role holds `roles.manage` by default (Manager/Receptionist/Staff do not), and zero custom roles on dev currently hold it either — so the realistic actor is the Owner themselves (via a direct API call bypassing the UI) or someone the Owner explicitly delegated `roles.manage` to, not any default lower-privileged role or a stranger. | **VERIFIED exploitable live, rolled back.** Needs a migration (extend the trigger to also fire `BEFORE UPDATE`). |
| **F1-01** | 1 — Plans & gating | High | `current_period_end` is stored on `business_subscriptions` but never read by `business_is_active()` or anything else. A manually-billed business whose paid period lapses stays fully `active` forever unless a human notices and suspends it by hand — no self-expiry like the trial path has. | CODE-READ (not part of the live-verification round). Needs either a migration (extend `business_is_active()`) or an explicit doc note that this is deferred until a payment provider is chosen. |
| **F6-S1** | 6 — Security & abuse | Medium | `client_has_live_appt(uuid)` — SECURITY DEFINER, zero membership check, granted to `authenticated`. Any signed-in user can probe any client UUID platform-wide for "does this client have a live appointment" (cross-tenant existence-oracle leak). **Proven live on dev**: a real cross-business user got `false` (masked) for a client whose true answer was `true`. **A plain revoke was tried first and proven to BREAK `clients_select` live** (`permission denied for function client_has_live_appt`) — the correct fix instead adds an in-body `is_member()` check and keeps the grant; this fix was also proven live (the real Owner still got the correct `true`, the stranger got masked `false`, the full client list still worked). | **VERIFIED exploitable AND fix VERIFIED working, both live, rolled back.** Ready to ship as a `create or replace function` migration — no grant/revoke needed. |
| **F6-S2** | 6 — Security & abuse | Medium | `client_package_used(uuid)` — identical gap. **Proven live** the same way: a throwaway `client_packages`/`session_usages` fixture (inside the same rolled-back transaction) showed the real Owner correctly got `1` used session, a cross-business stranger got masked `0`. Fix (add a `package_visible()` check in-body, reusing the exact rule `client_packages_select` RLS already uses) proven working the same way. | **VERIFIED exploitable AND fix VERIFIED working, both live, rolled back.** Same migration as F6-S1. |
| **F2-02** | 2 — Roles & permissions | **Resolved — no bug** | Was: "does Manager's `roles.manage` scope let them write/delete role assignments business-wide?" **Live seed data on dev shows Manager does not hold `roles.manage` at all** (only `owner` does, scope `all`). The scope-escape concern this finding raised does not apply. | **VERIFIED, no bug.** No fix needed. |
| **F5-01** | 5 — Core flows | Medium | SMS channel selection is fully live server-side (`outbox_enqueue` will pick the `sms` channel whenever `notification_settings.sms_enabled = true`); only a hidden UI toggle (`launch.ts`) keeps any branch from reaching that state today. Same underlying gap as F1-02/F3-01, surfacing a third time. | CODE-READ. One server-side fix covers this plus F1-02 and F3-01 together. |
| **F1-02** | 1 — Plans & gating | Medium | "Off at launch" (widget, SMS) is enforced only by a client-side flag (`src/config/launch.ts`); the database/Edge Functions have no knowledge of it and still serve requests on a Team/Business plan if reached directly (e.g. a pre-existing `widget_keys` row, or a direct RPC call). | CODE-READ. Likely deliberate trade-off (code says "flip back on later") but is a real server-side gap relative to the stated "UI hiding is never the boundary" rule. |
| **F1-04** | 1 — Plans & gating | Medium | Solo plan's "owner only" roles restriction (`default_roles` flag) is never enforced anywhere — a Solo owner can invite Manager/Receptionist/Staff today, contradicting product doc §10's table. Already known/documented in `plans-super-admin.md` prior to this audit. | CODE-READ, confirmed still present. Product decision needed: enforce it, or formally drop the doc's claim. |
| **F3-01** | 3 — Add-ons | Low | `addons.available_plans` (which add-on is sellable on which plan) is pricing-display metadata only; the super admin's `set_addon` RPC doesn't check it, so a super admin can manually enable any add-on on any plan. Very likely intentional (manual override tool for support/billing). | CODE-READ. Doc note recommended, no code change necessarily needed. |
| **F4-01** | 4 — Multi-branch | Low | Two context files (`plan-features.md`, `_handoff.md`) describe the public booking page as "primary branch only, no picker" — **this is stale**. A later migration (`20261022100000`) built a real, fully-wired multi-branch picker (server function, UI, unit tests). Doc-only issue, not a code bug. | CODE-READ, confirmed stale docs. Fix: update the two context files. |
| **F6-01** | 6 — Security & abuse | Low | The suspended-login Auth Hook is fail-open by design and needs manual per-project dashboard activation with no code-side check that it's on. Downgraded from an initial concern after tracing the real boundary: `business_is_active()`/`can()` already blocks a suspended business's members regardless of whether the hook is enabled — the hook only affects session-kill UX, not authorization. | CODE-READ. Recommend a go-live checklist line, not a migration. |
| **F2-03 … F2-07, F3-02 … F3-04, F4-02 … F4-07, F5-02 … F5-07, F6-02 … F6-07** | various | — (no bug) | A large number of specific mechanisms were read in depth and found to be **correctly implemented, matching their documented rules** — see "Confirmed-clean, high-value checks" below. Not re-listed individually here since they are not findings. | CODE-READ, confirmed correct. |

**Running total: 0 Blocker · 2 High · 4 Medium · 3 Low.** (F2-01 moved from Blocker to High; F2-02 resolved and dropped from the count; F6-01 added as a Low carried over from Phase 6.)

---

## What is VERIFIED vs. CODE-READ-only

**Phases 1, 3, 4, 5, and most of Phase 2/6 remain CODE-READ only** — reasoned from the migration files, Edge Function source, and client code as they exist on `dev` today, cross-checked against the product doc and the project's own context files. No live queries were run for those phases.

**VERIFIED live on dev this round** (all inside rolled-back transactions, or self-contained pgTAP rollback blocks — nothing committed):
- **F2-01**: the exploit itself (raw UPDATE strips the only Owner, 0 remaining owners, no exception) — reproduced against a real business, rolled back cleanly.
- **F2-02**: resolved by querying the live `role_permissions` seed directly — Manager does not hold `roles.manage`.
- **F6-S1 / F6-S2**: both the exploit (cross-tenant stranger gets a real answer) and the fix (in-body membership check, keeping the grant) were proven live — including proving that the "obvious" fix (a plain revoke) actually breaks real call sites (`clients_select` raised `permission denied` immediately), so the fix that shipped in the report is the one that was actually tested to work, not just proposed.
- **pgTAP suites 21 (113), 28 (43), 29 (72), 31 (6) — 234/234 assertions passed, 0 failures**, run directly against dev via `supabase db query --linked`.

**Not run**: suite 30 (`30_gdpr_http.mjs`) — deliberately skipped at the user's direction after being told it performs real, non-rolled-back writes (business/client/storage creation and erasure over HTTP) requiring separate seed and cleanup scripts, whereas suite 29 (SQL-only, already 72/72) exercises the same erase logic without live writes. This is the one explicitly requested item not executed.

Everything the team's own prior internal work had already verified live (the rest of pgTAP suites 01-27, 32-36+, other HTTP proof scripts, the Phase 11A security review's live catalogue queries) was **not re-run** this session — this audit re-read the code those tools exercise and confirmed it still matches what the suites are reported to prove, but did not re-execute them.

---

## Confirmed-clean, high-value checks (selected — see per-phase files for the full list)

- **The exact two historical bug patterns CLAUDE.md's testing rules call out by name are both still fixed and have not regressed**: `reschedule_booking`'s "free the slot to validate it" bug, and `accept_invite`'s "a raise rolls back the rate-limit counter" bug.
- **Invoice money correctness**: `add_payment`/`reverse_payment`/`create_credit_note` are row-locked, validate-before-write, and the partial-credit-note tax-rounding math provably sums back to the original tax with no drift.
- **Review-rating neutrality**: `submit_review` returns the Google review link for every rating 1-5, unconditionally — zero gating or incentive code found anywhere.
- **GDPR erasure preserves financial immutability**: `gdpr_erase_client` blanks only personal text on invoices, never touching the money columns — and this is now backed by 72/72 live-passing assertions in suite 29.
- **Add-on-off correctly blocks RLS + RPC + storage together**, across all five add-ons.
- **The Files & Photos private bucket genuinely has zero `storage.objects` policies.**
- **Multi-branch locks (currency/timezone/invoice-prefix) and gapless concurrent invoice numbering** are all correctly validate-then-write and lock-before-check.
- **The team's own Phase 11A security review's six highest-value fixes were re-verified un-regressed**, and the `clients_v`/`clients_select` contact-field lock specifically is now backed by 43/43 live-passing assertions (suite 28) plus a 6/6 live RLS-equivalence proof (suite 31).
- **Branch-scope RLS for every default role plus a custom role** (owner, manager at two branches, receptionist, staff Own-scope, an all-scope custom role, another business, anon) — 113/113 live-passing assertions (suite 21).
- **A dedicated sweep of all 147 `SECURITY DEFINER` functions granted to `authenticated`** found only the two Medium findings (F6-S1/F6-S2), both now fully resolved with a proven fix.

---

## Proposed fix order (updated)

1. **F6-S1, F6-S2 (Medium, fix already written and proven live)** — ship first since the fix is done and tested: two `create or replace function` statements (exact SQL in `phase-6-security-abuse.md`'s addendum), no grant/revoke needed, no risk of breaking `clients_select`/`list_client_packages` (proven). Lowest-risk, highest-confidence fix in this whole audit.
2. **F2-01 (High, re-rated from Blocker)** — still worth fixing before launch despite the narrower actor: the blast radius (a business permanently losing every Owner) is severe even if only the Owner or their own delegate can trigger it. Needs a migration extending `enforce_last_owner()` to also fire on `UPDATE`.
3. **F1-01 (High)** — either implement `current_period_end` enforcement (extend `business_is_active()`) or make the deferral explicit in `billing.md`/`plans-super-admin.md`. Low urgency only because manual billing is still super-admin-only and small-scale.
4. **F1-02 / F5-01 (Medium, same root cause)** — decide once whether "off at launch" needs a server-side backstop or stays a documented, accepted UI-only suppression; fix (or document) once, not three times.
5. **F1-04 (Medium)** — product decision needed: enforce Solo's owner-only restriction, or drop it from doc §10's table.
6. **F3-01, F4-01, F6-01 (Low)** — documentation-only or checklist-only fixes, no urgency.

## Which fixes need a migration

- F6-S1, F6-S2 — **yes**, a new migration — **exact SQL already written and proven live**, see `phase-6-security-abuse.md`.
- F2-01 — **yes**, a new migration (extend `enforce_last_owner`'s trigger coverage) — not yet written, only the exploit was proven; the fix itself was not drafted or tested this round (unlike F6-S1/S2).
- F1-01 — **yes, if fixed in code** (extend `business_is_active()`); **no** if the decision is to defer and just document it.
- F1-02 / F5-01 — **possibly**, depending on the chosen fix.
- F1-04 — **yes, if enforced**; **no** if the doc is changed instead.
- F3-01, F4-01, F6-01 — **no**, documentation/checklist only.

---

## What this audit did not cover (explicitly, by phase)

- **Phase 1**: live trigger-firing behavior, concurrent advisory-lock races under real load, actual UI behavior with a lapsed `current_period_end`.
- **Phase 2**: fully resolved for F2-01/F2-02 this round (live); sensitive-field gating beyond what suites 28/31 cover was not separately exercised.
- **Phase 3**: enable/disable mid-use independently verified only for Packages (others reasoned by pattern); concurrency claims read as structurally sound but not re-run; add-on × role combinations not exercised live.
- **Phase 4**: DST-exact slot math not re-derived; live behavior of the new multi-branch picker not exercised in a browser.
- **Phase 5**: reports internals (beyond currency grouping), website builder, notification delivery/retry mechanics, commission math, and custom-field/form-version validation were not read this session at all.
- **Phase 6**: fully resolved for F6-S1/F6-S2 this round (live, exploit + fix both proven); suite 30 (HTTP/Storage GDPR proof) deliberately skipped; whether the suspended-login Auth Hook is actually enabled in the dev project's dashboard remains unknown (not visible from SQL); any live penetration test, Android/iOS binary review, or Supabase platform-level check remains out of scope.

Recommend: ship the F6-S1/S2 fix immediately (zero remaining risk, fully proven); draft and prove the F2-01 fix the same way before shipping it (write the `BEFORE UPDATE` trigger extension, then re-run the same live rolled-back exploit attempt to confirm it's now refused); and run the remaining pgTAP suites (19, and the broader 01-27/32-36+ set) live at least once before launch to extend this round's "verified, not just read" coverage.
