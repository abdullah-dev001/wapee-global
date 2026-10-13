# QA Audit — Phase 4: Multi-branch and locale

Mode: audit only, no fixes. **CODE-READ only** (continuing from Phases 1-3).

Scope: `supabase/migrations/20261011110000_phase9_multi_branch.sql`, `20261022100000_public_multi_branch.sql`, invoice numbering (`20261006100000`), `supabase/functions/_shared/branchChoice.ts`, `supabase/functions/_shared/outbox/templates.ts`, `src/features/booking-public/`, `context/plan-features.md`.

---

## Findings

### F4-01 — Two context files describe the public booking page as primary-branch-only; this is now out of date — **Low** (documentation staleness, not a code bug), CODE-READ
`context/plan-features.md` ("Known limits — still true, decided to leave"): *"the public website and the public booking page use the PRIMARY branch only (no location picker; `get_booking_page` accepts a `branch_id` but nothing links to it)"*, and `context/_handoff.md`'s Phase 9B summary repeats the same claim.

This is **no longer accurate**. Migration `20261022100000_public_multi_branch.sql` (dated after both of those files' "last updated" stamps) added:
- `get_bookable_branches(business)` — lists every branch passing `branch_is_bookable()`, primary first.
- `chooseBranch()` (`supabase/functions/_shared/branchChoice.ts`) — resolves a `?branch=<id-or-invoice-prefix-code>` link to one branch, or returns a `choose` result with every bookable branch when there's no reference and more than one branch qualifies.
- A real UI picker: `BookingPageData.needsBranch: true` (`src/features/booking-public/types.ts:94`) is handled explicitly in `BookingFlow.tsx:249` (not a stub — rendered, mapped by `bookingPageMapper.ts`, and unit-tested in `bookingPageMapper.test.ts`).
- `portal_create_booking` also gained `p_branch_id` (optional; null still defaults to primary) so the client portal's "book a visit" can target a non-primary branch too.
- `?branch=` short codes reuse the branch's invoice prefix (already unique per business, frozen after first invoice) rather than exposing raw branch ids in links, and an unresolvable reference degrades silently to the normal "no reference" behavior (never leaks which branch ids exist).

This is a genuine, already-built feature — not a finding against the code. Flagging only because **two context files actively mislead a future reader** (human or AI) into thinking this doesn't exist, which risks wasted rebuilding effort or a mistaken "known limitation" being cited in a customer conversation. **Recommend**: update `plan-features.md`'s "Known limits" bullet and `_handoff.md`'s stale Phase 9B line in the same commit as any future touch to this area, per CLAUDE.md §4's context-file rule.

### F4-02 — Per-branch invoice numbering is gapless and race-proof — **no bug found**
`issue_invoice` (`20261006100000_phase5_invoice_draft_and_issue_rpcs.sql:476`) locks the branch row with `for no key update` before reading `invoice_next_no`, serializing concurrent issuers on that branch while still allowing other branches to issue in parallel (a weaker lock than `for update` that still blocks writers but not unrelated readers). All validation (currency match, item count, zero-total) happens before the lock is used to allocate the number, and the actual write (counter bump + invoice row) happens once, last. Matches the "real 3-session concurrent-issue test" claim in `invoices.md` structurally; not independently re-run this session.

### F4-03 — Branch INSERT/UPDATE escalation hole from Phase 1 was correctly found and fixed in Phase 9 — **no bug found, confirmed fix**
The multi-branch migration's own header documents a real bug it fixed: branch UPDATE previously used `can(business, NULL, 'settings.business')` (business-wide, any branch), so a holder of `settings.business` at only ONE branch could edit every branch's settings. Now `branches_update_settings` checks `can(business_id, id, 'settings.business')` (that specific branch), and `branches_insert_settings` requires the permission for **every** branch (`can_grant_at(...,'branch')`) before allowing a new branch to be created. Verified this is the current, live policy (no later migration reverted it). Good catch by the team; no outstanding issue.

### F4-04 — Currency/timezone/prefix locks in `update_branch` are correctly validate-before-write and cover the right triggers — **no bug found**
Re-verified against doc §11's stated rules: currency locks once the branch has ANY invoice (`currency_locked`) or appointments/service prices (`currency_in_use`) even pre-invoice; timezone locks only while there are upcoming (`pending`/`confirmed`, not yet ended) appointments, correctly allowing a timezone fix for a branch with only past appointments; invoice prefix locks after the first number is actually issued (`invoice_next_no > 1`), and a retired (archived, used) prefix can never be reused business-wide, including by a different branch (`enforce_branch_prefix_retired` fires on `invoice_prefix` change or un-archiving, not just insert). All of `update_branch`'s checks run before its single `update` statement (the function's own comment: "All validation done. ONE update.").

### F4-05 — Combined/branch-comparison reports never add different currencies — **no bug found**
`get_combined_overview`'s `totals_by_currency` groups strictly by `m.currency` before summing any monetary column; the per-branch rows list each branch's own currency individually. No code path sums `invoiced_minor` etc. across a mixed-currency set. Matches doc §11's explicit rule ("Reports never add different currencies (group by currency)").

### F4-06 — Solo/Team cannot create extra branches, enforced redundantly at two layers — **no bug found**
`create_branch` is gated by `branch_admin_gate()` → `feature_gate_error(business, 'multi_branch')` (RPC layer, returns a clean `{ok:false,code:'feature_unavailable'}` before any write), AND the Phase 8 `branches_enforce_limit` trigger independently re-checks `max_branches` on every INSERT regardless of caller (DB layer, raises `branch_limit_reached` even for a direct insert bypassing the RPC). Two independent backstops for the same rule — correctly defense-in-depth, matching the "enforced in three places" principle (here: RPC + trigger; UI would be the third, not audited this phase).

### F4-07 — Per-branch emails correctly omit the location name/address on a single-branch business — **no bug found**
`outbox_job`'s `branch_count` (count of live branches) flows into `templates.ts`'s `multiLocation = branch_count > 1 && branch_name`, which gates whether the rendered email mentions the branch name/address at all. A single-branch business's confirmation emails stay location-agnostic (no needless "at Main branch" noise); a multi-branch business's emails correctly disambiguate. Matches doc §11 ("per-branch emails").

---

## Things not yet checked this phase (deferred to live testing)
- DST-exact slot math for a branch in a DST-observing timezone was not independently re-derived from the slot engine this phase (relies on `lib/time`'s `zonedToUtc`/`utcToZoned`, already covered structurally in earlier phase context notes; not re-read this session).
- "Today" in branch timezone for Today/Calendar screens — not re-checked this phase (covered functionally in Phase 4/5 app-build context notes from the project history, not re-verified here).
- Live behavior of the new `?branch=` picker in a real multi-branch business (reasoned entirely from code + unit tests; no browser/HTTP run this session).
- Per-branch staff/prices/rooms isolation — covered functionally by Phase 9B's branch-scope RLS work (`21_branch_scope.sql`, referenced in Phase 2's audit as well) but not re-run live this phase.

## Severity summary
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 1 | F4-01 (documentation staleness) |

## Top issues
1. **F4-01** (Low, docs only) — `plan-features.md` and `_handoff.md` both describe the public booking page as primary-branch-only with no picker; a real multi-branch picker (server function, UI, unit tests) was added later and the context files were never updated. Recommend fixing the doc text; no code change needed.
2. No other findings this phase — multi-branch locking (currency/timezone/prefix), gapless invoice numbering under concurrency, currency-safe combined reporting, the two-layer Solo/Team branch-limit enforcement, and per-branch email content all check out correctly against doc §11 and the audit brief's specific asks.
3. This was the cleanest phase of the audit so far by finding count — the multi-branch backend appears to have had careful, deliberate design (the migration's own header calls out a real escalation bug it fixed from Phase 1, which is a good sign of the team's own review discipline on this area).
