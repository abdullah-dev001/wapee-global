# Inventory (add-on `inventory`)
Status: **backend + UI done (Phase 10A)** · Last updated: 2026-10-07 · Suite `supabase/tests/22_packages_inventory.sql` · Real parallel proof `23_addons_concurrency.sh`

## What it does
Products with unit, SKU, price, stock and a low-stock alert level. Sold as invoice lines; stock drops when the invoice is ISSUED; every change is an immutable `stock_movements` row. A dashboard badge and a push + email alert warn when stock falls to the alert level.

## Decided with the user (2026-10-07)
- **Issue deducts, a credit note that exhausts the invoice net restores every product line** (movement `return` linked to the credit note and the line). A PARTIAL credit note restores nothing (credit notes are by amount, not per line): staff add a manual `return` movement. Restoring is once per line.
- **Negative stock refused by default.** Per-branch switch `inventory_settings.allow_negative_stock` (`set_inventory_settings`, `inventory.adjust`): when on, a sale/adjustment may take stock below zero and the movement records the negative `stock_after`.
- **Branch-owned products** (price in the branch currency, stock per branch).
- Permissions: `inventory.view` (screen + log; Owner, Manager, Receptionist) and `inventory.adjust` (create/edit/delete products, stock movements, settings; Owner, Manager). Staff have neither.

## Data (RLS select-only; writes only through DEFINER RPCs)
`products` (`stock_qty` changes ONLY through a movement: guard trigger, flag `wapee.stock`), `stock_movements` (kind purchase | adjustment | sale | return, signed `quantity`, `stock_after`, reason, invoice/item/credit-note links; immutable; one `sale` per invoice line, one automatic `return` per (line, credit note)), `inventory_settings`. Whole-number quantities only (no fractions of a unit).
Trigger `apply_stock_movement` locks the product row, refuses below zero unless allowed (backstop `insufficient_stock`), records `stock_after`, and raises the low-stock alert on the CROSSING (from above the level to at/below it, on a decrease only; not repeated until restocked above and fallen again).

## RPCs (`{ok,code}`; validate everything, then ONE write; add-on off => `feature_unavailable`)
`save_product(branch, id?, name, sku, unit, price_minor, low_stock_threshold, is_active, opening_stock)` (opening stock = an `adjustment` "Opening stock"), `delete_product` (soft; history kept), `adjust_stock(product, kind purchase|adjustment|return, quantity, reason?)` (adjustment/return need a reason; a sale cannot be typed in), `set_inventory_settings`, `low_stock_count(business, branch?)` (INVOKER: 0 when the add-on is off).
- `issue_invoice`: product lines are locked in id order AFTER the branch row (issuers queue on the branch first, so no deadlock), summed per product, checked against stock BEFORE any write; the whole issue is refused with `insufficient_stock` (+ `product_id`, `stock`, `requested`) and nothing changes (also the package on the same invoice stays unsold). 3 parallel sales of the last unit: exactly one wins.
- Audit: `product.created|updated|deleted`, `inventory.stock_moved`, `inventory.settings_changed` (sales/returns are covered by the invoice audit rows).

## Low-stock alert (migration `20261013130000`)
`enqueue_low_stock` writes, in the SAME transaction as the movement, one email (`low_stock`, addressed to a USER like `report_summary`) and one push (`staff_low_stock`) per active member holding `inventory.adjust` at Branch/All scope for the branch. `outbox_guard` re-checks at send time (add-on still on, recipient still holds the permission, product still low) and skips as `stale`. Edge: `_shared/outbox/lowStock.ts` renders the email (English, product escaped), `templates.ts` the push; `send_outbox` redeployed 2026-10-07. **Nothing was delivered for real** (no real email/push was sent this round; the render and queue paths are unit/SQL tested). There is no per-user switch for this push (push preferences have no `low_stock` column).
The in-app badge (`LowStockBadge`) is shown to `inventory.view` holders on Today and in the tablet/desktop header while at least one active product is at/below its level.

## UI
`/inventory` (nav, `inventory.view` + feature `inventory`): list (search name/SKU, "Low stock only", status badge in stock / low / out, pages of 20), stock-rules card (switch), product drawer with the stock panel (movement form, immutable history), edit + delete. The invoice editor has "Add product" (hidden unless the add-on is on). Pure rules: `inventoryLogic.ts` (tested). Keys: `products`, `stock-movements`, `inventory-settings`, `low-stock-count`.

## Limits / not done
- No barcode scanning, suppliers, purchase orders or per-product reports; no stock transfer between branches.
- Partial credit notes do not restore stock (by decision).
- A manual "return" is not tied to an invoice line, so a later exhausting credit note would restore that line again: staff should not use manual returns for goods that a credit note will also restore.

## Changelog
- 2026-10-07: Phase 10A built (migrations `20261013100000`..`140000`, suite 22 = 198 assertions, concurrency script 23, Edge alert + 5 unit tests, UI).
