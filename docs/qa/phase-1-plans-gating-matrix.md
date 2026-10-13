# QA Audit — Phase 1: Plans and gating matrix

Mode: audit only, no fixes. **CODE-READ only** (no live DB/RLS queries this phase — user chose code-read-only for Phase 1; live-role testing deferred to a later phase if the user sets up test accounts). All findings below are CODE-READ unless marked otherwise.

Scope covered: `docs/Wapee_Product_Overview_v2.md` §10, `supabase/migrations/20261010090000_phase8_plans_schema.sql`, `20261010100000_phase8_feature_gating.sql`, `20261010110000_phase8_super_admin_rpcs.sql`, `20261010120000_phase8a_super_admin_requires_aal2.sql`, `20261010130000_phase8b_admin_reviews_and_plan_usage.sql`, `src/features/plans/`, `src/lib/permissions/can.ts`, `context/plans-super-admin.md`, `context/billing.md`, `context/plan-features.md`, `context/plan-features-ui.md`.

---

## Feature × plan matrix: doc §10 vs SQL vs UI

| Feature | Doc §10 | SQL (`plans.features` seed) | UI (`featureLogic.ts` / gating) | Match? |
|---|---|---|---|---|
| Staff per location | Solo 1 / Team 5 / Business ∞ | `staff_cap` 1/5/null, enforced by triggers on `staff_branches`/`staff_profiles` | `staffCap` surfaced in `my_plan_usage`, billing screen | ✅ |
| Core/reviews/website/booking link | All plans | `core/website/reviews/booking_link: true` all three | gated via `my_features` | ✅ |
| Default roles | Owner-only on Solo | `default_roles: false` (Solo) / `true` (Team/Business) | flag exists, **not enforced anywhere** (confirmed in code, see F1-04) | ⚠️ documented gap |
| Staff commission | No/Yes/Yes | `commission` false/true/true | gated | ✅ |
| Embed widget | No/Yes/Yes | `embed_widget` false/true/true | gated by feature AND separately hidden entirely by `src/config/launch.ts` (`widget:false`) regardless of plan | ✅ plan logic; see F1-02 for the launch-flag caveat |
| Advanced reports (+branch comparison on Business) | No/Yes/Yes(+cmp) | `advanced_reports` false/true/true; `branch_comparison` false/false/true | gated | ✅ |
| Custom roles | No / paid add-on / included | Solo: no row in `business_addons` matters (plan false, not an addon-eligible override) / Team: `custom_roles` addon-gated / Business: `custom_roles: true` in plan features | `roles.manage` gated via `custom_roles` feature; roles trigger `roles_enforce_custom_roles_feature` | ✅ |
| Multi-branch | No/No/Yes | `multi_branch` false/false/true | `branches_enforce_limit` trigger + UI `RequireFeature` | ✅ |
| File storage | Unlimited all plans | no cap in schema | n/a | ✅ (not a gating concern) |

---

## Findings

### F1-01 — `current_period_end` is stored but never enforced (no expiry lock) — **High**, CODE-READ
A subscription can be `assign_plan`'d with a `current_period_end` in the future. Nothing — no trigger, no cron, no RPC — ever compares `now()` to `current_period_end`. `business_is_active()` (`supabase/migrations/20261001184500_members_assignments_audit_helpers.sql:112`) only checks `status = 'active'` or (`status = 'trialing' and trial_ends_at > now()`); `current_period_end` never appears in that function or anywhere else except as a stored/displayed value (`src/features/plans/api/useBilling.ts:34`, `src/features/admin/api/useAdmin.ts:206`).
- **Failure scenario**: super admin assigns a 1-month plan with `current_period_end` one month out (manual billing collection, per doc §10: "until [a payment provider is chosen] super admin assigns plan/status manually"). If the business is never manually renewed or suspended by a human, it stays fully `active` — and billed-as-active in every UI surface — indefinitely past its period end, because nothing reads that column to lock it. The trial path (`trial_ends_at`) correctly self-expires with no cron; the paid-period path does not.
- This is consistent with "no cron job" by design for trials, but `current_period_end` is a different column with no self-expiry logic at all — it is effectively decorative today.
- **Recommendation**: either (a) add a cron/trigger-based check mirroring the trial pattern (`business_is_active` should also fail when `status='active' and current_period_end is not null and current_period_end < now()`), or (b) if this is deliberately deferred until the payment provider is chosen (doc §16, open/deferred decision), say so explicitly in `plans-super-admin.md`/`billing.md` so it is not mistaken for an oversight. Currently neither context file mentions this limitation.

### F1-02 — "Off at launch" (`src/config/launch.ts`) is a client-only suppression, not a server boundary — **Medium**, CODE-READ
`launch.widget = false` and `launch.sms = false` hide the Widget tab and SMS screens/toggles in the UI (`WebsiteEditorScreen.tsx`, `NotificationSettingsScreen.tsx`, `sms-credits.tsx`, etc.) but the database has no knowledge of this flag. The real server gate for the widget is still the Phase 8 plan feature `embed_widget` (Team/Business) via `widget_feature_enabled()`/`validate_widget_origin()`; for SMS it is `sms.send`/`sms.buy_credits` permissions plus `sms_ledger_post`. Both remain fully callable server-side on a Team/Business plan.
- **Failure scenario**: a Team/Business business owner who already has a `widget_keys` row (created before the launch flag was set, or via direct API call bypassing the hidden UI) can still have their booking page embedded elsewhere; a crafted `embed=...` request to `validate_widget_origin` succeeds. Similarly, any code path that still calls `sms_ledger_post` (e.g. a future notification flow, or a manual RPC call) is not blocked.
- This matches CLAUDE.md's own rule ("UI hiding is never the boundary") and the file's own doc comment ("Code, edge functions, `public/widget.js` and DB stay") — so this looks like a **deliberate, acknowledged trade-off**, not an oversight, but it is still a server-side gap relative to the stated security posture. Flagging because the audit brief explicitly asks about "SMS (off at launch), embed widget (off at launch)" being blocked.
- **Recommendation**: low urgency since nothing in the current UI exposes a path to create a `widget_keys` row or call these RPCs while `launch.ts` is false (needs confirmation in Phase 3, which covers add-ons in depth) — but if any test harness, seed script, or future UI regression re-exposes the button, there is no DB-side backstop today.

### F1-03 — Staff cap counts profiles, not logins/invites — **intentional, documented** — Low (informational)
`invite_member()` (`supabase/migrations/20261002160000_invite_flow.sql:48`) has no relationship to `staff_profiles`/`staff_branches` and no cap check at all. A Solo business (plan cap = 1 staff *profile* per branch) can invite unlimited `business_members` (logins) with any role (Manager, Receptionist, Staff) as long as the inviter holds `users.invite`. The staff cap triggers (`staff_branches_enforce_cap`, `staff_profiles_enforce_cap`, `20261010100000_phase8_feature_gating.sql:137-184`) only fire on `staff_profiles`/`staff_branches` writes.
- This is an explicit product decision, confirmed in `context/_handoff.md` ("doc §10 counts staff, not seats") and `context/plan-features.md` line 5. Not a bug — listed here only because the audit brief explicitly asked to check "staff caps (profiles vs logins)" and to flag anything intentionally limited.
- One real soft spot: doc §10's table literally says "Staff per location: 1" for Solo with no caveat about logins vs profiles — a reader of the doc alone (not the context files) would reasonably expect a Solo business to be capped at 1 total person with access. Worth a one-line clarification in the product doc itself so it doesn't look like a doc/code mismatch to a future reader.

### F1-04 — Solo "owner only" (`default_roles: false`) is a flag nothing enforces — **documented known gap**, Medium
Confirmed by code search: `default_roles` appears only in `plans.features` seed data, `featureLogic.ts` (`FEATURE_KEYS` list), and test files that explicitly assert it is **not** advertised as a plan difference on the landing page (`pricingModel.test.ts:169`, "default_roles: it is a flag nothing enforces"). No RLS policy, trigger, or UI gate reads this key to actually restrict role assignment to Owner-only on Solo.
- **Failure scenario**: a Solo-plan owner can invite a Manager, Receptionist, or Staff member and assign any default role — `invite_member` only checks `users.invite`, not the `default_roles` feature flag. This contradicts doc §10's row "Default roles: Owner only" for Solo.
- Already self-documented as a known limitation in `context/plans-super-admin.md` ("Solo 'owner only' is not enforced (a Solo business can still invite members; only the 1-staff cap applies)") — so this is **CONFIRMED present in code**, not a new discovery, but it is a real doc-vs-code mismatch worth carrying into the fix-order summary since it is customer-facing product behavior, not just an internal flag.

### F1-05 — `assign_plan`/`set_business_status('active')` limit checks are correct but only checked at the moment of the call — **no bug found**, informational
`plan_limit_violations()` is correctly re-checked both on `assign_plan` (any plan) and on `set_business_status('active')` (uses the current plan). Downgrade-over-limit is correctly refused with itemized `staff_over_cap`/`branches_over` detail, and nothing is written when violated (verified: the `update` statement is textually after the violation check and the `if` returns early). This matches doc intent exactly. No finding.

### F1-06 — Trial-as-Business-with-everything-on is correctly implemented — **no bug found**
`business_has_feature()` correctly treats `status = 'trialing'` as plan `business` or any add-on key during trial (`v_plan := case when v_s.status = 'trialing' then 'business' ...`, and the add-on branch: `return v_s.status = 'trialing' or exists(...)`). Matches `plan-features.md`'s stated decision. No finding.

---

## Things that look intentionally limited (not bugs)
- `default_roles` flag unenforced (F1-04) — intentional per context files, but still a product-doc mismatch.
- Staff cap = profiles, not logins (F1-03) — intentional per context files.
- "Off at launch" widget/SMS = UI-only (F1-02) — intentional per `launch.ts`'s own comment, DB/Edge Functions deliberately untouched so the feature can be flipped back on later.
- `list_businesses` search is name/slug only, no owner email (per `plans-super-admin.md` "Known limits") — out of scope for this phase's findings, already documented.

## Severity summary
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 1 | F1-01 |
| Medium | 2 | F1-02, F1-04 |
| Low | 1 | F1-03 |

## What could not be verified this phase
Everything above is **CODE-READ only** — per the user's explicit choice at the start of this audit, no live Supabase queries, no test users per role, no actual trigger-firing tests were run. In particular, not verified live:
- Whether `staff_cap_reached` / `branch_limit_reached` / `feature_unavailable` actually raise correctly end-to-end against real data (code reads correctly, but pgTAP suite 18 — said to be 341/356 green per `plan-features-ui.md` changelog — was not re-run this session).
- Whether `my_features()`'s RLS/membership check actually blocks a non-member from reading another business's plan (reads correctly in code: `is_member(p_business_id) or is_super_admin()` gate).
- Whether the advisory-lock-based cap checks (`pg_advisory_xact_lock`) actually prevent a real concurrent double-insert race (code pattern looks correct and mirrors the invoice-numbering lock pattern used elsewhere, but not load-tested this session).
- current_period_end real-world behavior (F1-01) was reasoned from the code alone — no business was actually created with a lapsed period to observe the UI's behavior live.

## Top 5 issues
1. **F1-01** (High) — `current_period_end` has no enforcement anywhere; a manually-billed business never auto-locks when its period lapses.
2. **F1-04** (Medium) — Solo "owner only" default-roles restriction is a dead flag; a Solo owner can invite Manager/Receptionist/Staff today, contradicting doc §10.
3. **F1-02** (Medium) — Widget/SMS "off at launch" is UI-only; DB/Edge Functions still serve requests on Team/Business plans if reached directly.
4. **F1-03** (Low, informational) — Staff cap counts profiles not logins; matches internal decision but not obvious from doc §10 alone.
5. No Blocker-severity issues found in Phase 1's scope (plans/gating schema and RPCs look well-guarded: validate-before-write pattern followed correctly, `admin_gate()` checked first in every admin RPC, limit violations correctly block both assign and reactivate paths).
