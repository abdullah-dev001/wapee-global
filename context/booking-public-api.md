# Booking public API (Edge Functions)

Status: deployed, rate-limited, verified end-to-end · Phase: 3 · Last updated: 2026-10-04

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

| Endpoint | JWT | Takes | Returns |
|---|---|---|---|
| `POST /functions/v1/get_slots` | no | slug, service_id, from/to local dates, optional branch_id and staff_id | timezone, branch name, currency, settings, slots, **and a `start_token`** |
| `POST /functions/v1/create_booking` | no | slug, service_id, starts_at, client {...}, answers[], **start_token**, honeypot | the confirmation fields **plus the raw manage token, once** |
| `POST /functions/v1/manage_booking` | no | `action` = get / cancel / reschedule, **token**, (+reason, or starts_at & staff_id) | the manage-page view, or the new time |
| `POST /functions/v1/resend_manage_link` | **YES** | appointment_id | a NEW raw manage token, once; the old one is revoked |

`manage_booking` is one function for three actions because all three share the
token handling, the rate-limit keying, the "every token failure looks identical"
rule and the response mapping. Three functions would be three copies that drift.

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
- **Rate limiting is LIVE** on every endpoint (see below).

HTTP mapping: 400 bad_request / invalid_* / missing_answer / too_fast,
404 not_bookable / invalid_token, 409 slot_unavailable / cancel_window_passed /
not_cancellable, 429 rate_limited (**with `Retry-After`**), 500 server_error.

## Rate limiting and bot protection (step 7)

The windows live in `rate_limit_rules` and are tunable without a deploy. The
decision is made by `check_rate_limit()` in the database, because an Edge Function
instance is ephemeral and horizontally scaled.

| Endpoint | Per IP | Per phone | Per business |
|---|---|---|---|
| `get_slots` | 60 / min | — | — |
| `create_booking` | 10 / hour | **5 / day** | **30 / hour** and **200 / day** |
| `get_booking` | 60 / hour | — | — |
| `cancel_booking` | 20 / hour | — | — |
| `reschedule_booking` | 20 / hour | — | — |

Both business caps exist because the daily one bounds the total damage but not its
shape: 200 bookings in four minutes and 200 over a working day are the same number
and very different events. The hourly cap turns a flood into something slow enough
to notice. `check_rate_limit()` evaluates rules shortest-window-first, so the
retry hint comes from whichever window actually filled.

Properties that matter:

- **A BLOCKED attempt is recorded too**, so a sustained attack stays blocked
  rather than oscillating around the limit.
- **The limiter FAILS CLOSED.** If the database is unreachable or the salt is
  missing, the request is refused. An unthrottled public write endpoint is worse
  than a brief outage.
- **The IP is never stored raw** — only `sha256(salt || ip)`, salt in an Edge
  secret, and the code throws rather than defaulting to a constant.
- The 429 carries an honest `Retry-After` (when the oldest attempt in the window
  expires), so a well-behaved client does not retry in a tight loop.
- The `scope` that blocked is logged but **never returned**: "you hit the
  per-phone cap" would confirm we know the phone.

### Bot protection: no CAPTCHA, no dependency

- **An HMAC-signed start token**, issued by `get_slots`, bound to the slug:
  `<issued_at_ms>.<slug>.<nonce>.<hmac>`. The issue time is signed by us, so a bot
  can neither backdate nor mint one. It enforces a **minimum 3 seconds** on the
  form and a **30-minute** ceiling.
- **A honeypot field** (`company_website`), hidden with CSS. Any value means a
  bot. **The UI must hide it with `position:absolute;left:-9999px`, NOT
  `type="hidden"` or `display:none`** (better bots skip both), plus
  `autocomplete="off"` and `tabindex="-1"`.
- A tripped honeypot returns a **generic** `bad_request`; only a genuinely-too-fast
  submission gets `too_fast`, because the page can recover from that one.
- **Turnstile has a documented seam** (`TURNSTILE_ENABLED` in `_shared/config.ts`)
  and is deliberately off: a CAPTCHA costs every honest customer something.

### The client IP: which header, and why — MEASURED

**`cf-connecting-ip`.** Verified against the deployed function on 2026-10-04 with
a real client address of `154.208.43.55`:

```
x-forwarded-for  = 154.208.43.55,154.208.43.55, 13.248.117.77
cf-connecting-ip = 154.208.43.55
```

- **The LAST `x-forwarded-for` entry is a PROXY, not the client.** Across five
  consecutive calls it was `13.248.117.77`, `13.248.117.73`, `99.82.173.50`,
  `99.83.104.106` — rotating AWS edge addresses — while `cf-connecting-ip` stayed
  constant. **An earlier version of `clientIp()` keyed on that last entry**, which
  would have put every caller on the planet into a handful of shared buckets: one
  busy business would have rate-limited everybody. Caught only by measuring.
- **A client-supplied `X-Forwarded-For` never arrives** — the platform replaces
  the header. Sending `1.2.3.4` and `1.2.3.4, 5.6.7.8` changed nothing.
- **`cf-connecting-ip` cannot be spoofed**: a request carrying it is rejected by
  Cloudflare with `403 error code: 1000` before reaching us. Stronger than
  parsing carefully.
- Verified end to end: three different spoofed `X-Forwarded-For` values produced
  **one** `ip_hash` bucket.

Fallbacks are `x-real-ip` then the **FIRST** `x-forwarded-for` entry — first,
because on this platform the real client leads the list. **If this is ever ported
off Supabase/Cloudflare, re-measure before trusting any of it:** the correct
header is a property of the deployment, not of HTTP.


## Files

| Path | Purpose |
|---|---|
| supabase/functions/get_slots/index.ts | slots endpoint |
| supabase/functions/create_booking/index.ts | booking endpoint; generates the manage token |
| supabase/functions/_shared/supabase.ts | service-role client + `resolveBranch(slug)` |
| supabase/functions/_shared/response.ts | code mapping, one response shape, safe logging |
| supabase/functions/_shared/cors.ts | origin allow-list |
| supabase/functions/_shared/rateLimit.ts | `clientIp()` (cf-connecting-ip) + `checkRateLimit()` |
| supabase/functions/_shared/config.ts | THE one place the bot-protection constants and secret names live |
| supabase/functions/_shared/crypto.ts | salted sha256, HMAC, timing-safe compare, CSPRNG token |
| supabase/functions/_shared/startToken.ts | issue/verify the signed start token; honeypot check |
| supabase/functions/manage_booking/index.ts | guest get / cancel / reschedule |
| supabase/functions/resend_manage_link/index.ts | dashboard resend; **keeps JWT verification** |
| supabase/config.toml | `[functions.*] verify_jwt = false`, with the reasoning |

## Deploy

```sh
supabase functions deploy get_slots --no-verify-jwt
supabase functions deploy create_booking --no-verify-jwt
supabase functions deploy manage_booking --no-verify-jwt
supabase functions deploy resend_manage_link          # NO flag: JWT stays on
```

`verify_jwt = false` is also pinned in `supabase/config.toml`, so a deploy
without the flag cannot silently re-enable it.

Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. **`PUBLIC_IP_HASH_SALT` and `PUBLIC_FORM_HMAC_KEY` are REQUIRED** —
the code throws rather than falling back, because a constant salt would make every
IP hash guessable. Set (2026-10-04) with:

```sh
supabase secrets set PUBLIC_IP_HASH_SALT="$(openssl rand -hex 32)"
supabase secrets set PUBLIC_FORM_HMAC_KEY="$(openssl rand -hex 32)"
```

Rotating the salt resets every rate-limit window; rotating the HMAC key makes a
customer mid-booking reload the form once. `PUBLIC_SITE_ORIGINS` sets the CORS
allow-list, `PUBLIC_SITE_URL` the base for the manage link.

**`resend_manage_link` does NOT use the service role.** It forwards the caller's
Authorization header so the `can(appointments.edit)` check inside the RPC sees the
real user — the service role would bypass it and let any signed-in user reissue a
link for any business's appointment.

## Verified (2026-10-04, live project, anonymous caller)

Everything below was run with curl against the DEPLOYED functions using only the
publishable key — i.e. exactly what a stranger can do.

**get_slots / create_booking**
- 16 slots over a day with BST applied correctly; a 4-part `start_token` bound to
  the slug.
- A missing required answer → `400 {missing_answer, field_id}`; a valid booking →
  `201` with the raw token once; the same slot again → `409`; an unknown slug →
  `404 not_bookable`; malformed bodies → `400`.
- A returning phone and a new phone produced **byte-identical response keys**; the
  existing client's name and email were not overwritten; the raw token appears
  nowhere in the database (only its sha256).

**Bot protection**
- `get_slots` → `create_booking` immediately → **`400 too_fast`**; the same token
  after 4 s → **`201`**.
- No start token → `400`; **tampered HMAC** → `400`; **backdated timestamp** →
  `400`; **token from another slug** → `400`.
- Honeypot filled → **generic `400 bad_request`** (no tuning hint); identical
  request with it empty → `201`.

**Rate limiting**
- The per-IP hourly cap fired on its own during testing: **`429` with
  `Retry-After: 3224`**, and the attempts table showed **3 recorded `blocked`
  rows** alongside the allowed ones.
- Three different spoofed `X-Forwarded-For` values → **one** `ip_hash` bucket.

**manage_booking**
- `get` returned status, service, staff, branch, business, timezone, local time,
  `can_cancel`/`can_reschedule` and the cutoff — and **first name only**; no phone,
  no full name, no ids.
- Every well-formed wrong token → `404 invalid_token`, identical for each.
- `reschedule` moved the booking and the **same token kept working** with the new
  time; an out-of-hours reschedule → `409` and the booking was **still confirmed at
  its original time**.
- `cancel` → `200`; replaying it → `404 invalid_token`; reading with it → `404`.

**resend_manage_link**
- With an owner JWT → `200` and a new 64-char token; the **old token then returned
  `404`** and the new one worked.
- With only the anon key → `404 not_bookable` (anon has no EXECUTE; the 500 this
  first produced was fixed so it reports "not allowed" rather than "something
  broke").
- With no Authorization header → `400`. For another business's appointment →
  `404`.

**Anon is still sealed out:** `get_booking`, `cancel_booking`,
`reschedule_booking`, `check_rate_limit` and `resolve_manage_token` all →
**404** over REST (not even visible); `public_request_attempts`,
`rate_limit_rules` and `booking_manage_tokens` → **401**.

A temporary `tmp-debug-headers` function was deployed to measure the IP headers and
has been **deleted from the repo and un-deployed** (confirmed: 404, no references).

## Known limits / TODO

- **Leaked-password protection cannot be enabled: the org is on the FREE plan**
  and Supabase gates it to Pro and above (confirmed in their docs and via the
  Management API, 2026-10-04). It is an auth-wide setting, not a booking one, and
  is recorded in `_handoff.md` as a pre-launch item.
- **CORS still defaults to placeholder domains** because no domain is bought.
  `PUBLIC_SITE_ORIGINS` must be set before a real site calls these.
- **The honeypot's HTML requirements are not implemented** — there is no UI yet.
  Whoever builds the form must hide `company_website` with
  `position:absolute;left:-9999px`, not `type="hidden"`/`display:none`.
- **Nothing sends the manage link.** Email/SMS is Phase 6; the token only reaches
  the confirmation screen and the dashboard. Seams are marked in both functions.
- **The bot protection stops naive automation, not a determined attacker.** One
  that calls `get_slots`, waits 3 s and books is within the rules — the per-IP,
  per-phone and per-business caps are what bound that, and 200 junk bookings a day
  on one calendar is still possible inside them.
- **No automated test runs against the DEPLOYED functions.** The verification
  above was by hand with curl. Worth a script when CI exists.
- `manage_booking` rejects a <32-char token at the schema (`400 bad_request`)
  rather than reaching `invalid_token`. Harmless — no real token is that short —
  but it is a second shape for "bad token" and worth knowing.

## Changelog

- 2026-10-04: Rate limiting and bot protection live; `manage_booking` and
  `resend_manage_link` deployed; **`clientIp()` corrected to `cf-connecting-ip`
  after measuring that the last `x-forwarded-for` entry is a rotating proxy**;
  anon-key call to `resend_manage_link` now reports 404 instead of 500.
- 2026-10-03: `get_slots` and `create_booking` deployed and verified end-to-end.
