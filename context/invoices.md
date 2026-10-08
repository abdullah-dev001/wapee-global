# Invoices (backend + UI)
Status: backend done (5A) · UI done (5B) · Phase: 5 · Last updated: 2026-10-06

## What it does
Draft → issued invoices with gapless per-branch numbers, tax snapshot, manual
payments, credit notes, payment reversals (the refund path), a one-call print
payload, a paginated list, and basic reports (today / this month). Every write
is a SECURITY DEFINER RPC; the tables are read-only to the API.

## Business rules (decided with the user, 2026-10-05)
- **Number** `<branch prefix>-<6-digit seq>` (e.g. `MAI-000001`), assigned **at issue**, gapless per branch. Seq past 999999 just gets longer (no truncation). Prefix unique per business, locked after the first invoice (Phase 1 trigger).
- **Credit notes** have their OWN gapless series `<prefix>-CN-000001` per branch (`branches.credit_note_next_no`).
- **Counters** (`invoice_next_no`, `credit_note_next_no`) move only inside the RPCs (transaction-local flag `wapee.numbering`); a direct UPDATE — even by postgres — is refused. Issuers serialise on `select … for no key update` of the branch row (NO KEY UPDATE so FK checks that take KEY SHARE are not blocked). A failure after the number is taken rolls the counter back with it: **no gaps** (proved with a forced mid-issue exception).
- **Tax**: tax-EXCLUSIVE (total = net + tax). Rate (`tax_rate_bp`) and `tax_number` are copied from the branch onto the draft and **re-snapshotted at issue**; later branch changes never touch an issued invoice. Tax is computed once on the invoice net (after discounts), **half-up** (`floor((net*bp+5000)/10000)`, numeric).
- **Lines** store price at sale time: description, integer quantity (1–9999), `unit_price_minor`, `discount_minor` + reason. Source: a service (name + branch price prefilled) or free text; or prefilled from a COMPLETED appointment (`price_minor` snapshot). Discount > 0 needs `invoices.discount` AND a reason (≥3 chars) AND ≤ the line gross. Max 100 lines, price ≤ 1e11 minor units.
- **Draft** (editable, no number, can be discarded = soft delete) → **issued** (immutable). Issue needs ≥1 line and total > 0 (`no_items`, `zero_total`).
- **One live invoice per appointment** (partial unique index). `appointments.invoice_id` is set when the DRAFT is created (so `reopen_appointment` is blocked from then on) and cleared only by discarding a draft. **A fully credit-noted invoice stays linked — no re-invoicing** (user decision). `appointments.invoice_id` can be written only by the invoice RPCs (guard trigger, flag `wapee.invoice_link`).
- **Payments** (cash/card/bank_transfer) only on ISSUED invoices, never above the balance, `paid_at` between issue and now+5min. Append-only.
- **Refunds**: a credit note on a paid invoice leaves `refund_due`; staff clear it with `reverse_payment` — a NEW row, partial allowed, never above what that payment still holds, reason required, a reversal cannot be reversed. No auto-reversal (user decision).
- **Credit notes** are by pre-tax NET amount (full when `p_net_minor` is null). Tax follows the invoice's snapshotted rate; the credit that exhausts the remaining net takes the remaining tax exactly, so credits always add back to the invoice with no rounding drift. Not per line item (see Known limits).
- **Computed, never stored**: `paid = Σpayments − Σreversals`, `credited = Σcredit notes`, `net_due = total − credited`, `balance = max(net_due − paid, 0)`, `refund_due = max(paid − net_due, 0)`, `payment_status` = `credited` (net_due 0) / `pending` / `partial` / `paid` (`invoice_money()`).
- **Currency** = the branch's, copied onto every row. The branch currency is **locked** while the branch has any non-discarded invoice (payments/credit notes only exist on issued ones). A discarded draft does not lock.
- **Immutability**: issued invoices and their items, payments, credit notes refuse UPDATE/DELETE for every role (guard triggers). All four guards release the row when the BUSINESS is being deleted (cascade trap) — tested.
- **Audit log**: `invoice.issued`, `invoice.payment_added`, `invoice.payment_reversed`, `invoice.credit_note_created`, `invoice.draft_discarded`.

## Phase 10A: package and product lines
A line may sell a PACKAGE (`package_id`, quantity 1) or a PRODUCT (`product_id`) instead of a service (at most one source per line). The price is prefilled from the definition and editable like a service price; discounts follow the normal rules. At ISSUE (all checks before any write): package lines create `client_packages` (the invoice needs a client: `client_required_for_package`), product lines drop stock (`insufficient_stock` refuses the whole issue; unless the branch allows negative stock). The credit note that exhausts the invoice net cancels unused packages (`package_sessions_used` refuses it when sessions were used) and restores product lines; a partial credit does neither. Add-on off => `feature_unavailable` on a draft with those lines; a credit note still works with the add-on off. New codes: `unknown_package unknown_product package_quantity client_required_for_package insufficient_stock package_sessions_used feature_unavailable`. `get_invoice_print_data` items carry `package_id`/`product_id`. UI: "Add package" / "Add product" in the editor (hidden unless the add-on is on); issue/credit mutations invalidate packages, products, movements and the low-stock count. Detail: `packages-sessions.md`, `inventory.md`.

## Permissions (Branch/All scope; Own does not count; Staff holds none)
| Action | Permission | Roles that hold it |
|---|---|---|
| create/update/discard draft, issue, add_payment | `invoices.create` | Owner, Manager, Receptionist |
| any line discount | `invoices.discount` | Owner, Manager |
| create_credit_note, reverse_payment | `invoices.credit_note` | Owner, Manager |
| list, print data, direct table reads (RLS) | `invoices.view` | Owner, Manager, Receptionist |
| report counts / top services | `reports.view_basic` | Owner, Manager |
| report revenue | `reports.view_revenue` | Owner, Manager |
`add_payment` = `invoices.create` and `reverse_payment` = `invoices.credit_note` are MY choice (doc §9 has no payment permission): a receptionist takes money, only Owner/Manager undo it.

## Database
Tables (RLS on; SELECT policy only = `can()` + `has_permission_at_branch_scope()` on `invoices.view`; `authenticated` has SELECT only, `anon` nothing):
`invoices`, `invoice_items` (generated `line_net_minor`), `invoice_payments` (kind payment|reversal), `credit_notes`. Enums `invoice_status`, `invoice_payment_kind`, `invoice_payment_method`. FKs and filter columns indexed; trigram on `number`/`bill_to_name`.

RPCs (all DEFINER, `search_path=''`, explicit permission+scope check, validate-then-write, `{ok:false,code}` for expected failures, `authenticated` only):
- `create_invoice_draft(branch?, appointment?, client?, items?, notes?)` — codes: `not_found forbidden invalid_branch branch_mismatch not_completed already_invoiced client_mismatch unknown_client` + item codes (`invalid_items too_many_items unknown_service invalid_description invalid_quantity invalid_price invalid_discount discount_forbidden discount_reason_required discount_too_large`).
- `update_invoice_draft(invoice, items?, client?, clear_client, notes?, clear_notes)` — replaces all lines when `items` given; `not_draft`.
- `discard_invoice_draft(invoice)`, `issue_invoice(invoice)` (`not_draft no_items zero_total currency_changed`).
- `add_payment(invoice, method, amount_minor, paid_at?, note?)` — `not_issued invalid_method invalid_amount invalid_paid_at fully_credited overpayment`.
- `reverse_payment(payment, reason, amount_minor?)` — `not_a_payment reason_required invalid_amount`.
- `create_credit_note(invoice, reason, net_minor?)` — `not_issued reason_required fully_credited invalid_amount`.
- `list_invoices(business, branch?, status?, payment_status?, client?, from?, to?, search?, limit=20 (max 100), cursor_at?, cursor_id?)` → `{rows, next_cursor{at,id}}`, newest first on `coalesce(issued_at, created_at)`; dates in branch timezone; search ≥2 chars on number / bill-to / client name, `%`/`_` literal.
- `get_invoice_print_data(invoice)` → `{invoice(+computed money), items, payments, credit_notes, branch, business, client}`; client phone/email only with `clients.view_contact`. Works for drafts (preview).
- `get_basic_report(business, branch?)` → `{branches[{tz, today/month windows in UTC}], revenue{today,month: [per currency]}, appointments{today,month:{total, <status>:n}}, top_services{today,month:[…]}}`. Revenue per currency, NEVER summed across currencies: `invoiced_minor` (incl. tax), `credited_minor`, `tax_minor`, `net_revenue_minor` (ex tax, minus credit notes), `collected_minor` (payments − reversals by `paid_at`), `invoice_count`. Windows are per branch in its own timezone (local midnight/1st → UTC through `at time zone`, so DST days/months are right). Only ISSUED invoices count; credit notes count when issued. `revenue` is `null` without `reports.view_revenue`; counts/top services are `null` without `reports.view_basic` (checked per branch). Top services = completed appointments (revenue per currency from issued invoice lines when permitted; it does not net credit notes). The clock-injectable `report_basic_at(business, branch, as_of)` is INTERNAL (no API grant) and is what the DST tests call.
- Internal (no API grant): `invoice_access, normalise_invoice_items, invoice_totals, insert_invoice_items, invoice_money, report_windows, format_document_number`.

Migrations: `20261006130000_report_basic_at_internal` (removed the public `p_as_of`), `20261006090000_phase5_invoices_schema`, `…100000_phase5_invoice_draft_and_issue_rpcs`, `…110000_phase5_payment_and_credit_note_rpcs`, `…120000_phase5_invoice_read_and_report_rpcs`. Applied with `supabase db query --linked -f` + `supabase migration repair --status applied` so local filenames equal remote history exactly.

## Tests
- `supabase/tests/14_invoices.sql` — 312 assertions, all pass (rolled back).
- `supabase/tests/15_invoice_concurrency.sh` — 3 REAL parallel sessions (commits a fixture, deletes it after).

## UI (Phase 5B)
| Path | Purpose |
|---|---|
| app/(app)/invoices.tsx · reports.tsx | thin routes (RouteGuard) |
| app/invoice-print/[id].tsx | standalone print/share view (outside `(app)`: no sidebar/header, so `window.print()` prints only the invoice; AuthGate still requires sign-in, the RPC enforces `invoices.view`) |
| src/features/invoices/components/InvoicesScreen.tsx | list screen; URL params `search status payment from to clientId branch invoice` (`invoice=<id>` or `new` opens the drawer; browser back closes it) |
| InvoiceListView / InvoiceFilterBar / InvoiceStateBadge | mobile cards / desktop+tablet `DataTable`, skeleton/empty/error, filters (branch select only with >1 branch; defaults to the current branch, `?branch=all` widens; client filter = chip, set from the detail's "Show this client's invoices") |
| InvoiceDrawer / InvoiceDetailBody | ONE drawer for view → edit draft / issue / discard / add payment / reverse / credit note. Sub-forms REPLACE the content (no stacked overlay) so Escape/Android back step back first |
| InvoiceEditor / ClientPickerField / PaymentForm / ReasonAmountForm | RHF + zod forms (`schemas/invoice.schemas.ts`); editor previews totals with `computeDraftTotals` (server recalculates) |
| InvoiceDocument / InvoicePrintScreen | printable invoice from `get_invoice_print_data`; web = print stylesheet in `app/+html.tsx` (`@media print`, `[data-no-print]`) + `window.print()`; native = RN built-in `Share` of a plain-text summary (no PDF, no new dependency) |
| AppointmentInvoiceButton | "Create invoice"/"View invoice" on a COMPLETED appointment: Calendar detail drawer and Today rows |
| ReportsScreen | Today / This month; revenue block PER currency, appointment counts, top services (plain Views for bars, no chart library) |
| api/useInvoices.ts · useReport.ts · useAppointmentInvoices.ts · useBranchTax.ts | hooks; pure mapping in `api/mappers.ts`, `api/reportMapper.ts` (unit-tested) |
| invoiceLogic.ts (+ test) | totals preview, status+permission → actions, reversible/creditable amounts, report helpers |

- **Query keys**: `invoiceKeys` / `reportKeys` (business + branch scoped). Every invoice mutation invalidates `invoiceKeys.scope`; issue/payment/reverse/credit also `reportKeys.scope`; create-from-appointment and discard also `appointmentKeys.scope` (detail, Today, Calendar).
- **`get_calendar_appointments` has no `invoice_id`**, so Today/the appointment drawer ask the invoices table (`useAppointmentInvoices`, RLS-scoped). A caller without `invoices.view` sees no link; the create RPC still refuses a duplicate (`already_invoiced`).
- Nav: Invoices needs `invoices.view`, Reports `reports.view_basic` (Staff sees neither). Revenue cards need `reports.view_revenue` (server returns `revenue: null` otherwise).
- Error codes → `invoices.errors.<code>` messages; i18n blocks `invoices.*`, `reports.*`.
- A receptionist cannot save an edit to a draft that already carries a discount (server refuses discounts without `invoices.discount`); the editor says so and disables Save.

## Known limits / TODO
- Native print is text share only; a real PDF needs expo-print + expo-sharing (new native deps, rebuild): ask first.
- Client profile still shows its labelled invoice placeholder (not in 5B scope).
- Reports follow the current branch scope (null = all branches); there is no branch switcher UI yet, so all-branch multi-currency is only reachable for an all-branches scope (covered by SQL tests + unit tests, not by a screenshot).
- No per-line credit notes UI (backend is by amount).
- **Credit notes are not per line** (by net amount only).
- **Top-service revenue ignores credit notes.**
- **Free (total 0) invoices cannot be issued** (`zero_total`).
- `reverse_payment` has no per-day cut-off or Owner-only rule beyond `invoices.credit_note`.
- No `invoices` realtime (not needed; precise invalidation instead).
- Draft invoices are not audited on create (only discard), by choice.

## Changelog
- 2026-10-07: Phase 10A: package and product lines (see above).
- 2026-10-06: Phase 5B UI (Invoices, detail/editor drawer, payments/reversal/credit note, print/share, Reports, appointment invoice buttons). Removed public `p_as_of` (`report_basic_at` internal).
- 2026-10-06: Phase 5A backend built (schema, 10 RPCs, immutability, currency lock, reports). 310 SQL assertions + real concurrent-issue test.
- 2026-10-09: `ClientInvoicesSection` (client profile) reuses `useInvoiceList` with `clientId` and `InvoiceDrawer`.
