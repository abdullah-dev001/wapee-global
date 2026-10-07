# Performance review — Phase 11A

Date: 2026-10-07 · Project: dev (Supabase, Postgres 17, small shared instance).

## Method
One throwaway business (`p11perf`) seeded directly on the dev project: **50,000 appointments** (25 staff, 8 services, 5,000 clients, Jan 2025 to Dec 2026), **20,000 issued invoices** with items, **16,000 payments**, **60,000 messages**. No real business was queried. Each query was run as the business's Owner with RLS on (`set local role authenticated` + JWT claims), through the real RPCs / the same SQL the app hooks send. Time = median of 3 runs after one warm-up, in-database (no network). `> 25 s` means the run was cut off by the harness, so the true time is longer. Seed and fixtures were deleted by recorded ids afterwards (the 3 original businesses and 4 users were untouched).

## Result (before -> after RLS rewrite -> after indexes)
| query | before | after policies + view | after indexes |
|---|---|---|---|
| calendar day, 1 staff | 19 ms | 13 ms | 12 ms |
| list_appointments page 1 | > 25 s | 716 ms | 653 ms |
| list_appointments, status filter | > 25 s | 166 ms | 125 ms |
| list_appointments, date range | 10.2 s | 135 ms | 100 ms |
| list_appointments, search name | > 25 s | 833 ms | 732 ms |
| list_appointments, one client | 15.6 s | 68 ms | 68 ms |
| list_invoices page 1 | 67 ms | 61 ms | 48 ms |
| list_invoices, search number | 138 ms | 138 ms | 128 ms |
| list_invoices, search client name | 137 ms | 141 ms | 127 ms |
| list_invoices, payment=pending | 4.0 s | 4.2 s | 3.7 s |
| list_invoices, date range | 28 ms | 37 ms | 28 ms |
| basic report | 175 ms | 187 ms | 174 ms |
| clients list page 1 (view) | 14.7 s | 17 ms | 16 ms |
| clients list page 40 (keyset) | 3.3 s | 6 ms | 5 ms |
| clients search name "garc" | 37.1 s | 28 ms | 26 ms |
| clients search phone "7700123" | 36.6 s | 30 ms | 27 ms |
| client picker search "chen" | 33.8 s | 34 ms | 31 ms |
| messages log page 1 | 3 ms | 2 ms | 2 ms |
| messages log, channel+status filter | 7 ms | 6 ms | 5 ms |
| messages log, page 200 (cursor) | 4 ms | 3 ms | 3 ms |
| calendar week (all staff) | 827 ms | 77 ms | 79 ms |
| advanced: branches (year) | 110 ms | 127 ms | 116 ms |
| advanced: revenue (month) | 64 ms | 67 ms | 64 ms |
| advanced: appointments (year) | 90 ms | 104 ms | 110 ms |
| advanced: clients (year) | 150 ms | 180 ms | 153 ms |
| advanced: services (year) | 134 ms | 142 ms | 134 ms |
| advanced: staff (year) | 230 ms | 236 ms | 224 ms |

## What was wrong
Every RLS policy of the big tables called `can(business_id, branch_id, ...)` (business-active check + permission lookup) and then `has_permission_at_branch_scope(...)` and `is_super_admin()` **for every row it looked at**, about 1 ms per row. A list that has to sort before it can LIMIT (list_appointments, the client list, the phone / name search) therefore cost 1 ms x all matching rows: 10 s for one month, over 25 s for a page. The client phone helper added in the first version of the contact lock was worse (about 5 ms per call).

## What changed (migrations `20261016130000` to `…180000`)
- Policies test membership of **STABLE set functions** computed once per statement (`perm_branch_ids`, `perm_business_ids`, `perm_cover_business_ids`, `member_business_ids`, `own_staff_ids`, `scoped_client_ids`, `own_client_ids`) instead of calling `can()` per row. Same rule, proved equal for 12 tables x 10 kinds of caller (suite 31, 120+ comparisons, incl. an inactive business, a branch-scoped manager, own-scope staff, a super admin at aal1 / aal2). The suite caught a real difference in the first rewrite (a sub-select inside a policy runs with the caller's RLS; the old DEFINER helper did not).
- `clients_v` (contact lock) became a security-barrier definer view that carries the visibility rule, and `list_appointments` reads names from `clients` and the phone from the view only for the page rows. Suite 31 keeps `clients_v` equal to `clients` per caller.
- 3 indexes: `appointments(business_id, starts_at desc, id desc)`, `messages(business_id, id desc)`, `clients(business_id, full_name, id)`.

## EXPLAIN (after)
List-appointments inner query as the Owner, 50k appointments: `Index Scan using appointments_business_starts_idx` returns the first 21 rows, the policy filter is one hashed set plus an `InitPlan` for super admin (executed once), clients joined through a Memoize node (5 index probes for 21 rows). Clients search uses `clients_name_trgm_idx` / the visible-set filter; messages log reads `messages_business_id_desc_idx` in order.

## Still slow / not done
- ~~`list_invoices` with the payment filter~~ fixed in Phase 11B, see below.
- `list_appointments` page 1 still takes about 650 ms although its inner plan is an index scan; the rest is inside the function (window + aggregation + the phone look-up). Under 1 s, so left.
- The reports (`get_basic_report` 175 ms, `get_advanced_report` 65-230 ms) scan the year of data per call; fine at this size, re-measure above 200k appointments per business.
- Unused-index advisor notices (37) are data-volume noise on a mostly empty project; none dropped.
- Numbers are from the dev instance on one run day; production hardware will differ. Not measured: network, Realtime, the app's rendering.

## Phase 11B: `list_invoices` payment filter
Measured on a second throwaway business with 20,000 issued invoices and 16,000 payments (deleted by recorded id afterwards).

| query | before | after |
|---|---|---|
| list_invoices, payment = pending | 4.0 s | 48 ms |
| list_invoices page 1 | 58 ms | 69 ms |
| list_invoices, search number | 151 ms | 147 ms |
| list_invoices, search client name | 131 ms | 147 ms |
| list_invoices, date range | 28 ms | 30 ms |

Cause: the filter computed `invoice_money()` for all 20,000 invoices. Fix (`20261017100000`): a side table `invoice_payment_state(invoice_id, business_id, payment_status)` kept in step by AFTER triggers on `invoices`, `invoice_payments` and `credit_notes` (a side table because issued invoices are immutable), backfilled once; `list_invoices` filters on it and calls `invoice_money()` for the page rows only. `invoice_money()` stays the single definition. Suite 32 (17 checks): the state equals `invoice_money()` after draft, issue, part payment, a refused overpayment, full payment, reversal, partial and full credit notes, the filter returns exactly the matching invoices, no drift, the table is closed to API roles, and a business delete still works.
