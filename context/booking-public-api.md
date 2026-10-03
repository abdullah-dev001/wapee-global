# Booking public API (Edge Functions)

Status: deployed, working end-to-end · Phase: 3 · Last updated: 2026-10-03

## What it does

The only path from the internet to the booking data. `anon` has no table
privileges and no policy on any booking table, and the booking RPCs are granted
to `service_role` alone, so the public page cannot touch the database directly —
these two functions are it.

Verified end-to-end against the live project as an anonymous caller (see
"Verified" below). The booking **page** itself is step 5's UI and is not built.

## Edge Functions (the public surface)

Both are deployed with **`verify_jwt = false`**, pinned in `supabase/config.toml`
so a later deploy cannot silently turn verification on and break the page. The
customer has no account.

| Endpoint | Takes | Returns |
|---|---|---|
| `POST /functions/v1/get_slots` | slug, service_id, from/to local dates, optional branch_id and staff_id | timezone, branch name, currency, the settings the page needs, and slots |
| `POST /functions/v1/create_booking` | slug, service_id, starts_at, client {name, phone, email?, notes?}, answers[] | the confirmation fields **plus the raw manage token, once** |

Rules they both follow:

- **The slug is the only business identifier a caller may send.** The branch is
  always re-derived from it (`resolveBranch`), so a `business_id` can never be
  forged. A caller may name a `branch_id`, but it must belong to that slug.
- **`resolveBranch` returns null — indistinguishably — for** no such slug, a
  soft-deleted business, an inactive one, a lapsed trial, booking switched off,
  or a branch from another business. All become `not_bookable` (404), so probing
  slugs reveals nothing.
- **Internal codes are mapped to a small public set** in `_shared/response.ts`.
  An unmapped code becomes `server_error` rather than being forwarded. The client
  gets codes, never a database string, so the app can translate them (CLAUDE.md §8).
- **Responses are mapped field by field**, never spread, so a column added to a
  RPC's result cannot leak to the public page by default.
- **A slot never carries a resource id or a seat count**, and an unavailable slot
  carries nothing about who booked it.
- **Staff names only when the branch offers a staff choice.**
- **The manage token is generated in the Edge Function** with
  `crypto.getRandomValues` (32 bytes), so the raw value exists in one response
  and is never written to the database or a log.
- **CORS uses an origin allow-list, not `*`** (`PUBLIC_SITE_ORIGINS`), so a
  random site cannot script a booking flow with a visitor's network.
- **`checkRateLimit()` is already awaited at the top of both handlers** and
  currently returns allowed. Step 7 fills in one function body.

HTTP mapping: 400 bad_request / invalid_* / missing_answer, 404 not_bookable,
409 slot_unavailable (the world moved — refresh the slots), 429 rate_limited,
500 server_error.


## Files

| Path | Purpose |
|---|---|
| supabase/functions/get_slots/index.ts | slots endpoint |
| supabase/functions/create_booking/index.ts | booking endpoint; generates the manage token |
| supabase/functions/_shared/supabase.ts | service-role client + `resolveBranch(slug)` |
| supabase/functions/_shared/response.ts | code mapping, one response shape, safe logging |
| supabase/functions/_shared/cors.ts | origin allow-list |
| supabase/functions/_shared/rateLimit.ts | **step-7 seam**, already called |
| supabase/config.toml | `[functions.*] verify_jwt = false`, with the reasoning |

## Deploy

```sh
supabase functions deploy get_slots --no-verify-jwt
supabase functions deploy create_booking --no-verify-jwt
```

`verify_jwt = false` is also pinned in `supabase/config.toml`, so a deploy
without the flag cannot silently re-enable it.

Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. `PUBLIC_SITE_ORIGINS` (comma-separated) sets the CORS allow-list;
without it the placeholder domains from `src/config/brand.ts` plus localhost are
used.

## Verified (2026-10-03, live project, anonymous caller)

- `get_slots` returned 16 slots over two days with BST applied correctly
  (09:00 local = 08:00Z) and the branch's settings.
- A missing required answer → `400 {code: missing_answer, field_id}`.
- A valid booking → `201` with the confirmation fields and the raw token once.
- The same slot again → `409 slot_unavailable`.
- An unknown slug → `404 not_bookable`.
- Malformed bodies (missing fields, bad slug, non-uuid) → `400 bad_request`.
- **A returning phone and a new phone produced byte-identical response keys**,
  and no `client_id` in either.
- In the database afterwards: the existing client's name and email were **not**
  overwritten, 2 client rows for 3 bookings, and the raw token appears **nowhere**
  (only its sha256).
- `anon` calling `create_booking` / `get_free_slots` / `pick_staff_for_slot`
  directly → **404** (not even visible); the booking tables → **401**.

## Known limits / TODO

- **Rate limiting is not implemented** (step 7). The seam is called but always
  allows. Until then these endpoints are unthrottled — the main reason not to
  point a real domain at them yet.
- **No `get_booking` / `cancel_booking` / `reschedule_booking`** (step 6).
- **The manage link is returned but nothing sends it.** Email/SMS is Phase 6; for
  now the token only reaches the confirmation screen.
- CORS defaults to placeholder domains because no domain is bought yet.
- No automated test runs against the deployed functions; the verification above
  was done by hand with curl. Worth a script when CI exists.

## Changelog

- 2026-10-03: `get_slots` and `create_booking` deployed and verified end-to-end.
