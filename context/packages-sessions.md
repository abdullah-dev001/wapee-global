# Packages & Sessions (add-on `packages`)
Status: **backend + UI done (Phase 10A)** · Last updated: 2026-10-07 · Suite `supabase/tests/22_packages_inventory.sql` · Real parallel proof `23_addons_concurrency.sh`

## What it does
A business defines packages (N sessions, optional bonus, price, optional expiry, services allowed), sells them to a client as an **invoice line**, and deducts one session per visit from the appointment drawer. Balance shows on the client profile and in the appointment drawer. Public/guest pages are untouched.

## Decided with the user (2026-10-07)
- **Sold at ISSUE.** `issue_invoice` creates one `client_package` per package line (needs the invoice's client: `client_required_for_package`; line quantity must be 1: `package_quantity`). The row is a SNAPSHOT (name, sessions, bonus, price paid = the line NET after discount, currency, services, expiry); later edits of the definition never change it. Sessions are usable even if the invoice is unpaid.
- **Expiry** = the start of the local day after (sold local date + `expiry_days`), in the BRANCH timezone: a 30-day package sold on 1 June is usable through 1 July inclusive. Deduction at or after `expires_at` is refused (`expired`).
- **Credit note**: the credit that EXHAUSTS the invoice net cancels its packages ONLY if no session is in use (`package_sessions_used` otherwise, nothing changes); cancellation is a NEW row (`client_package_cancellations`). A partial credit cancels nothing.
- **Branch-owned** definitions (currency = the branch's); a client package can be used at any branch of the business.
- Permissions (doc §9): `packages.sell`, `packages.deduct_session`, `packages.reverse_session`. **Staff got `packages.deduct_session` at OWN scope** (their own appointments only; migration `20261013100000`). Receptionist: sell + deduct. Manager/Owner: all three. Package definitions are managed with `services.manage`.

## Data (all RLS select-only; every write is a DEFINER RPC; records immutable)
`packages` (+`package_services`), `client_packages` (+`client_package_services`, `client_package_cancellations`), `session_usages` (`kind` deduct | reversal, `reverses_usage_id` unique: a usage is reversed once). Triggers refuse UPDATE/DELETE on the ledgers (released when the business itself is deleted) and `session_usages_backstop` refuses a deduction past the balance or on a cancelled package even from a raw insert. `invoice_items` gained `package_id` / `product_id` (at most one of service/package/product per line).
Read gates: `addon_read_access`, `package_visible` (DEFINER; the add-on gate cannot be called by `authenticated` directly). Staff see the packages of clients they have an appointment with.

## RPCs (`{ok,code}`; validate everything, then ONE write; add-on off => `feature_unavailable`)
`save_package(branch, id?, name, description, sessions, bonus, price_minor, expiry_days, service_ids, is_active)`, `delete_package` (soft), `deduct_session(appointment, client_package)`, `reverse_session(usage, reason?)`, `list_client_packages(client, service?, usable_only)` (INVOKER: RLS decides). Internal clock-injectable `deduct_session_at` / `reverse_session_at` (no API grant) are what the boundary tests call.
- Deduct: appointment `confirmed`/`completed`; caller holds deduct at the branch, or at Own scope on their own appointment; package client = appointment client; service covered; not cancelled; not expired; one live deduction per appointment (advisory lock); balance > 0 under the package row lock (parallel deductions of the last session: exactly one wins, proved with 3 real sessions).
- Reverse: the CREATOR for 10 minutes (inclusive, no reason) or a `packages.reverse_session` holder any time (reason >= 3 chars). A reversal is a NEW row; the deduction stays. After a reversal the appointment can be deducted again.
- Audit: `package.created|updated|deleted|sold|cancelled|session_deducted|session_reversed`.

## UI
`/packages` (nav, `packages.sell` + feature `packages`): list (search, pages of 20), create/edit drawer (services toggles, bonus, expiry), delete dialog. `ClientPackagesSection` on the client profile (balance, state badge, expiry). `AppointmentPackageSection` in the appointment drawer (use a session, Undo within 10 min, Reverse with reason for reverse holders, history count). The invoice editor has "Add package" (hidden unless add-on on and `packages.sell`). Pure rules + error map: `packageLogic.ts` (tested). Keys: `packages`, `client-packages`, `session-usages`; invalidate with `keys.business(businessId)` (see _foundation.md trap).

## Limits / not done
- Packages report in advanced reports ("when on", doc §8.3) is not built.
- `get_calendar_appointments` has no package info: the Today/Calendar rows do not show a package badge, only the drawer.
- Credit notes are by amount, not per line, so a partial credit never cancels a package; to cancel one of several package lines the sessions of the others must be reversed first (full credit only).
- An inactive/deleted package already in a DRAFT is refused at issue (`unknown_package`).

## Changelog
- 2026-10-07: Phase 10A built (4 migrations `20261013100000`..`140000`, suite 22 = 198 assertions, concurrency script 23, unit tests, UI).
