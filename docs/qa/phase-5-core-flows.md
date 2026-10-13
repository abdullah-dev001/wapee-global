# QA Audit — Phase 5: Core business flows end to end

Mode: audit only, no fixes. **CODE-READ only** (continuing from Phases 1-4).

Phase 5 is the broadest phase (13 flows). Given code-read-only mode, this pass prioritized the highest-risk sub-flows in depth (invites/auth, booking collision engine, invoices/money, GDPR, review integrity, SMS channel selection) and spot-checked the rest. Areas not reached in depth are listed explicitly at the end — **this phase is not exhaustive** and should not be read as a clean bill of health for sub-flows not mentioned.

---

## Findings

### F5-01 — SMS channel selection is live in the backend even though the UI is "off at launch" — **reinforces F1-02/F3-01**, Medium, CODE-READ
`outbox_enqueue()` (`20261008110000_phase6_enqueue_and_hooks.sql:17`) correctly implements the documented channel rule ("a client with an email gets EMAIL ONLY; SMS only when there is no email AND the branch has SMS switched on. Never both") — this part is correct, no bug. But `notification_settings.sms_enabled` defaults to `false` and the **only** UI path that could set it true is the hidden `sms-credits.tsx` screen (`launch.sms = false`). Confirmed: nothing else writes `sms_enabled`. So today, no branch can actually reach the `sms` channel through the current build — but the enforcement boundary is still "a UI toggle happens to be hidden," not "the database refuses it." If a future screen, test fixture, or direct RPC/SQL call ever sets `sms_enabled = true` on a branch (e.g. a support script, a seed, a migration default change), SMS sending would silently start working with no DB-side check that the feature is meant to be off. This is the same underlying gap as F1-02/F3-01 (launch-flag suppression is UI-only), observed again from a different angle (notification channel selection rather than the settings screen itself). Not re-filed as a new independent issue — cross-referencing to avoid double-counting severity, but worth fixing once (e.g. add a server-side `launch`-equivalent check, or simply leave `sms_enabled` ungranted to any write path) rather than three times.

### F5-02 — `accept_invite`'s rate-limit-survives-rollback fix is correctly implemented — **no bug found**
Re-verified the exact pattern CLAUDE.md's testing rules call out by name (the `accept_invite` trap: "a public RPC behind a rate limiter must return `{ok:false,code}`, never raise"). The current `accept_invite` (`20261002163000_fix_invite_rate_limit.sql`) returns `null` for every guessable-token failure path (unknown/expired/wrong-account/already-member) so the attempt-counter INSERT survives, and raises only for "not signed in" (nothing counted yet) and the throttle cap itself (already at max, nothing lost). Matches the documented fix exactly; this is the kind of bug the rule exists to prevent, and it's correctly fixed here.

### F5-03 — `reschedule_booking` and dashboard `update_appointment` both correctly avoid "mutate to make a query come out right" — **no bug found**
Both were re-read end to end. Neither frees the old slot before validating the new one (the historical `reschedule_booking` bug CLAUDE.md's testing rules cite by name); both use `a.id <> v_id` / `p_exclude_appointment_id` to exclude the appointment's own row from its own collision check instead, validate everything before the single `UPDATE`, and catch `exclusion_violation` as a last-resort backstop around that one write. This is exactly the pattern CLAUDE.md §5 prescribes. No regression found.

### F5-04 — Invoice money RPCs (`add_payment`, `reverse_payment`, `create_credit_note`) are correctly row-locked, validate-before-write, and tax-rounding-safe — **no bug found**
All three lock the invoice row with `for update` (or the branch row with `for no key update` for numbering) before computing balances, so concurrent payment/credit-note attempts on the same invoice correctly serialize rather than both passing a stale balance check. `create_credit_note`'s partial-credit tax math takes the floor of `(net * rate + 5000) / 10000` for a partial amount but switches to the exact remaining tax when the credit exhausts the remaining net — this is the correct way to guarantee partial credits plus one final credit always sum back to the original tax with no rounding drift left over or short. `add_payment` correctly refuses backdating a payment before the invoice's `issued_at` and refuses any payment that would exceed the current balance. `invoice_payments`/`credit_notes` both carry `before insert or update or delete` immutability guard triggers.

### F5-05 — Reviews have no rating-based gating or incentive mechanism anywhere in the code — **no bug found, matches doc §13/audit brief exactly**
Confirmed by reading `submit_review` end to end: it validates `p_rating between 1 and 5` and stores the review, then **unconditionally** returns the branch's Google review link ("THE compliance rule: the branch's Google link, returned for EVERY rating" — the migration's own comment). No code path branches on `rating` before deciding what to show the reviewer, and no incentive/discount/reward mechanism exists anywhere in the reviews schema or RPCs. This directly satisfies the audit brief's explicit check ("no review gating, no incentives").

### F5-06 — GDPR client erasure correctly preserves financial immutability while blanking personal data — **no bug found**
`gdpr_erase_client` (`20261016100000_phase11a_gdpr_schema.sql:380`) validates everything first (no future appointments, no draft invoices) before a single transactional block of updates; on invoices it blanks only `bill_to_name`/`notes`, never touching `total_minor`/`net_minor`/`tax_minor`/`number`/`status` — financial records remain fully intact and auditable, satisfying "financial records are immutable" even under a GDPR erasure. Files are queued for storage deletion via `storage_cleanup_queue` rather than deleted inline (correct, since `storage.objects` cannot be deleted from SQL per the project's own documented trap). Idempotent: a second call on an already-erased client returns `{ok:true, already_erased:true}` rather than re-running or erroring.

### F5-07 — `reopen_appointment` is a deliberate, separately-gated exception to "terminal, no reopen, ever" — **no bug found, matches documented decision**
The `appointment_status_transitions` table's comment ("cancelled/completed/no_show are terminal... no reopen, ever") is technically imprecise given `reopen_appointment` exists as a literal role-key check (`r.key in ('owner','manager')`) bypassing that table entirely, gated additionally on `invoice_id is null`. This is not a contradiction in the code — it's an intentional, explicitly-decided secondary path (confirmed in `_handoff.md`'s Phase 4 closure notes as an explicit user decision) — but the SQL comment reads as an absolute rule when it is not quite one. Very minor; not worth a severity rating on its own (informational only), but flagging since a future reader of just the SQL comment (without the context file) could be misled about whether reopening is truly impossible.

---

## Spot-checked, no issues found (lighter pass than the findings above)
- **Invite flow**: email-bound (re-checked `accept_invite`'s exact-match email check), 7-day expiry, single-use token (cleared on accept). Staff-profile linking to an invite was not independently re-traced this phase (covered functionally by `staff-and-schedule` migration notes from project history).
- **Booking engine**: custom fields, form versioning, slot calculation DST-safety — not independently re-derived this phase; relied on the extensive exclusion-constraint and collision-function reading already done for `create_booking`/`reschedule_booking`/`update_appointment`, which collectively demonstrate the engine's collision logic is sound. The 5-field-type custom field validation itself was not re-read.
- **Calendar actions**: create/reschedule/cancel/approve/no-show/walk-in — the status-transition table and `reopen_appointment` were read in depth (F5-07); `cancel_appointment`/`mark_no_show`/`approve_appointment` were not individually re-read line-by-line this phase (their shared `is_allowed_appointment_transition()` gate was verified correct).
- **Commission**: `commission_sync`'s trigger wiring and rule-resolution signature were skimmed, not fully re-derived; Phase 1's reading of `plan-features.md`'s documented commission rules (base = line net, tax excluded, percent half-up, proportional credit-note reversal) was not independently re-verified against the SQL this phase.
- **Reports (basic/advanced)**: not re-read this phase; relied on Phase 4's confirmation that `get_combined_overview`'s currency grouping is correct, which is the one cross-cutting risk the audit brief calls out for reports specifically.
- **Website builder and public pages**: not re-read this phase beyond what Phase 1/4 already covered (widget gating, booking-page branch picker).
- **Notifications**: outbox channel selection (email vs SMS vs push) read in depth (F5-01); the Resend/Twilio Edge Function send paths, retry/backoff, and push delivery were not re-read this phase.

## Things that look intentionally limited (not bugs)
- `reopen_appointment` bypassing the transition table (F5-07) — intentional, documented decision.
- SMS being fully wired in the backend but unreachable via the current UI (F5-01) — intentional per `launch.ts`'s stated purpose (flip back on later), just worth a server-side backstop given it's the third time this pattern surfaces (F1-02, F3-01, F5-01).

## Severity summary
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 0 | — |
| Medium | 1 | F5-01 (cross-references F1-02/F3-01; not double-counted in the running total) |
| Low | 1 | F5-07 (informational / doc-wording only) |

## What could not be verified this phase
Given the breadth of Phase 5 and the code-read-only constraint, large parts of this phase were spot-checked rather than exhaustively read:
- Custom field validation (5 types), form versioning correctness, and DST-exact slot generation were not independently re-derived from the slot-engine source this phase.
- Commission rule resolution and proportional credit-note reversal math were not re-verified against the SQL (relied on Phase 1's reading of the context file's documented rules).
- Basic/advanced reports' actual SQL (beyond the combined-overview currency grouping already checked in Phase 4) was not read this phase.
- Website builder, public page rendering, and the notification Edge Function send/retry paths were not read this phase.
- None of the above were flagged as findings — they are simply **unaudited this session**, not confirmed clean. Recommend a dedicated follow-up pass if the fix-order summary (Phase 7) needs higher confidence on these specific sub-areas.

## Top issues
1. **F5-01** (Medium) — SMS channel selection is fully functional server-side; only a UI toggle (not a DB rule) keeps it from being reachable today. Recommend a single server-side fix covering this, F1-02, and F3-01 together rather than three patches.
2. **F5-07** (Low, informational) — `reopen_appointment`'s existence slightly contradicts the absolute wording of a SQL comment on `appointment_status_transitions`; no code bug, just a doc-precision nit.
3. Every money-handling RPC re-read this phase (`add_payment`, `reverse_payment`, `create_credit_note`, `reschedule_booking`, `update_appointment`) correctly follows the "validate everything, then one write" discipline CLAUDE.md's testing rules mandate, including the two specific historical bug patterns (freeing a slot to validate; rate-limit-defeating raises) the project's own documentation calls out by name — both are confirmed fixed and have not regressed.
4. GDPR erasure and review-rating-neutrality both independently confirmed correct and matching the product doc precisely — two areas with real compliance/legal weight that held up under direct code reading.
5. Significant remaining surface (reports internals, website builder, notification delivery mechanics, commission math, custom field validation) is unaudited this session — flagged explicitly above rather than silently assumed clean.
