# GDPR: export, erase, contact lock
Status: done (backend + client-profile UI; no screen for data requests or business erase yet)   ·   Phase: 11A   ·   Last updated: 2026-10-07

## What it does
- **Export** one client as JSON (`clients.export`, audited). **Erase** one client's personal data (`clients.erase`, Owner by default): the row stays, anonymised; every financial row is kept. **Business erase** (Owner, typed name). **Portal seam**: a signed-in customer can ask for an export / erasure; staff act on the request.
- Separately, phone and email are a **database** boundary (`clients.view_contact`): not granted on the table, returned only by `clients_v`.

## Business rules (decided with the product owner)
- Erase blanks: client name / phone / email / notes (row archived + `erased_at`, phone becomes `+10000000000`), appointment notes + cancellation reasons, custom-field answers, invoice `bill_to_name` + `notes`, signed-form answers / signer name / drawn signature / ip hash, review comment + owner reply + first name (un-featured), message recipient + error, outbox rows, portal sessions + sign-in links of that email, guest manage / form / review links (revoked), photos (Storage objects). **Kept untouched:** invoices, items, payments, credit notes (amounts, dates, numbers, currency), the appointments themselves, the photo-consent flag, who/when of every signed form, message suppression list (hash only).
- **Refused before any write** while the client has an upcoming live (pending / confirmed) appointment (`has_future_appointment`) or a draft invoice (`has_draft_invoice`). Wrong caller or unknown id: `not_found` (no enumeration).
- Idempotent: a second call changes nothing, writes no second audit row, and returns the storage objects still waiting. One transaction: any exception rolls everything back (tested with a trigger that fails half way).
- Rights keep working for a business whose trial lapsed (`gdpr_allowed` does not use `can()`).
- Business erase: Owner role only + exact business name; the `gdpr` function empties BOTH buckets under `<business_id>/` FIRST, then `gdpr_erase_business_commit` refuses if any object is left (`storage_not_clean`), writes one `erasure_log` row (ids + counts, no names), deletes the business through `enforce_last_owner` (flag `wapee.erase_business`, no trigger disabled). Members' auth accounts and profiles are NOT deleted (a person may belong to other businesses). Deleted data is not retained: the business owner carries any legal retention duty.
- Immutable tables (issued invoices, signed consents, reviews, portal rows) accept ONE exemption, only while the transaction-local flag `wapee.gdpr_erase` is on (set inside `gdpr_erase_client`, reset at the end): the personal text columns listed above. Everything else stays locked (tested). The flag cannot be set from the API (PostgREST exposes only `public`; `rpc/set_config` is 404).

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261016090000_phase11a_view_contact_lock.sql | column lock, `clients_v`, `contact_business_ids`, `client_phone/email`, `list_appointments` reads the view |
| supabase/migrations/20261016100000_phase11a_gdpr_schema.sql | `clients.erase`, `erased_at`, queue / log / requests tables, guard exemptions, export / erase / business-erase / portal-request RPCs |
| supabase/migrations/20261016110000_phase11a_gdpr_fixes.sql | `enforce_last_owner` cascade fix, request cap by email hash |
| supabase/functions/gdpr/index.ts | `erase_client`, `erase_business` (Storage API), verify_jwt true |
| supabase/functions/portal/index.ts | new action `request_data` (rate limit `portal_data_request`) |
| src/features/clients/api/useClientData.ts, deliverExport.ts | export (RPC) + erase (Edge) hooks; download (web) / share sheet (native) |
| src/features/clients/components/ClientProfileScreen.tsx | Export data / Erase personal data buttons, erased state |
| supabase/tests/28_view_contact.sql, 29_gdpr.sql, 30_gdpr_http.mjs (+ 30_seed / 30_cleanup) | per-role SQL suites, real-HTTP + real-Storage proof |

## Database
- Tables: `storage_cleanup_queue` (bucket objects to remove; no FK, outlives the business; no grants), `erasure_log` (no grants), `data_requests` (RLS select for `clients.export`; email forgotten on resolve; `email_hash` for the daily cap).
- RPC (authenticated): `gdpr_export_client(client)`, `gdpr_erase_client(client)`, `gdpr_business_erase_check(biz, name)`, `gdpr_erase_business_commit(biz, name)`, `list_data_requests(biz, status)`, `resolve_data_request(id, outcome)`. Service role only: `gdpr_storage_done(ids)`, `portal_create_data_request(session, kind)`.
- Contact: `clients_v` (security_invoker) + `client_phone(id)` / `client_email(id)` (permission + row visibility re-checked) + `contact_business_ids()`.
- Audit rows: `client.exported`, `client.erased`, `data_request.done|declined`, `portal.data_request`: ids and counts only.

## Data & caching
- Erase invalidates every query (it touches clients, appointments, invoices, files, reviews, messages). Clients reads use key family `clients`; read `clients_v`, never `clients` (the two columns are not granted).

## Permissions & gating
- `clients.export` (Owner, Manager), `clients.erase` (Owner; 47th permission), `clients.view_contact` (Owner, Manager, Receptionist). No plan / add-on gate.

## UI
- Client profile header: Export data (JSON file on web, share sheet on native), Erase personal data (confirm dialog, error messages per code). Erased clients show an "Erased" label and lose Edit / Archive.

## i18n
- `clients.data.*`, `clients.erasedBadge`, `roles.perm.clients_erase`.

## Known limits / TODO
- **No screen yet** for: the portal data requests list (`list_data_requests` / `resolve_data_request` exist), the portal customer buttons (the `request_data` action exists), business erase (`gdpr` function exists). Needs a UI task.
- `clients.notes` stays column-readable by `clients.view` holders (UI hides it): product decision (docs/security-review.md L3).
- Free text typed by staff on payment reversals / credit-note reasons is kept with the financial record.
- Other clients sharing the erased client's email lose their portal sessions too (sessions are per email + business).
- Not click-tested in a browser or simulator (HTTP + SQL + code review only). Android / iOS not run.

## Changelog
- 2026-10-07: Phase 11A: contact lock (view `clients_v`), export / erase / business erase / portal request seam, `clients.erase`, `gdpr` Edge Function; suites 28 / 29 / 30.
