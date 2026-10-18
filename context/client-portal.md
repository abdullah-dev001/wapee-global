# Client portal (add-on `client_portal`)
Status: **backend + UI done (Phase 10C)** · Last updated: 2026-10-07 · Suite `supabase/tests/26_client_portal.sql` (108) · Real HTTP proof `26_portal_http.mjs` (53 checks; fixture `27_seed_portal.sql` / `27_cleanup_portal.sql`)

## What it does
Customers of a business sign in WITHOUT a password at `/<slug>/portal` and see their bookings (upcoming / past), packages, issued invoices (+ print on web), consented photos, signed forms (list only), and can book, cancel and reschedule with the SAME rules as the public page. No self-registration: only an email that already belongs to a client of the business gets a link.

## Decided with the user (2026-10-07)
- **Own sessions, no Supabase Auth user** for customers: they are never in `auth.users` / `business_members`, so a customer token can never reach a dashboard policy. A dashboard JWT is not a portal session either (proved over HTTP).
- **Linking:** ALL non-deleted clients of the business whose email equals the verified email (case-insensitive). The email is re-matched on EVERY call (an email change or a deleted client ends access at once). 14-day sessions, no phone OTP.
- **Shown:** own bookings (customer's own booking note yes, INTERNAL notes never), staff by display name only, packages (balance + usage, no internal reasons), ISSUED invoices only (+ payments, credit notes; no payment notes / reasons), photos only (needs add-on `files_photos` AND the client's photo consent; no PDFs), forms: title, date, signer, status only (no answers / signature).
- **Actions:** book (any linked client), cancel, reschedule: through the guest-manage engine (`cancel_booking`, `reschedule_booking`, `get_booking_reschedule_slots`) and `create_booking`, so the cut-off, minimum notice, window and capacity rules live in ONE place.
- Gating: `business_has_feature(client_portal)` in every RPC; the Edge function answers a generic `not_found` / `{sent:true}` when off. Tabs for packages / photos / forms appear only when those add-ons are on (`portal_overview.features`).

## Auth flow
1. `request_login` (Edge, honeypot `company_website`, limits: 10/h per IP, 3/h per email, plus a DB belt of 5 links/h per email): ALWAYS `{sent:true}` for a valid-looking email (unknown email / unknown business / add-on off: nothing stored, nothing sent, same answer and shape).
2. Email `portal_login` through the outbox (sealed token, `outbox_guard` drops an email whose link was used / revoked / expired: a NEWER link revokes older ones).
3. `/<slug>/portal#token=…` (fragment, stripped from the address bar by `useTokenFromUrl`) → `exchange` trades the single-use 15-minute link for a 14-day session (parallel exchanges: exactly one wins). Only sha256 hashes are stored (`portal_login_tokens`, `portal_sessions`; both RLS on with NO policy, service_role only; guards: tokens are kept, only used/revoked/expired).
4. The session token lives in `sessionStorage` (web) / secure store (native) (`portalSession.ts`); an `invalid_session` answer clears it.
`sign_out` ends it at once.

## Data / RPCs (all service_role only; called by the Edge function `portal`, `verify_jwt=false`)
`portal_info`, `portal_request_login`, `portal_exchange_token`, `portal_sign_out`, `portal_overview`, `portal_bookings`, `portal_packages`, `portal_invoices`, `portal_invoice`, `portal_photos`, `portal_photo_paths` (+ signed URLs, 300 s, minted by the function), `portal_forms`, `portal_reschedule_slots`, `portal_cancel_booking`, `portal_reschedule_booking`, `portal_create_booking`; internals `portal_ctx` (re-resolves the session every call), `portal_client_ids`, `portal_own_appointment`, `portal_mint/revoke_manage_token`, `portal_audit`. Audit: `portal.login`, `portal.signed_out`, `portal.booking_created/cancelled/rescheduled` (no actor, no email, no token in the rows).
**Manage-token coexistence (fixed in `…120000` / `…130000`):** an online booking already owns its one live guest manage token; the portal's borrowed token steps that one aside for the transaction and gives exactly that one back (not if the booking ended cancelled).

## UI
`src/features/portal/` (`portalLogic.ts` tested, `portalSession.ts`, `api/usePortal.ts`, `components/Portal*.tsx`), route `app/(public)/[slug]/portal.tsx` (noindex, no-referrer). Reuses `Calendar`, `SlotGrid`, `ServiceList`, `StaffChoice`, `useBookingPage`, `useSlots`, `HoneypotField`, `callPublicFunction` (knows `portal`, `invalid_session`, `needs_details`). Screenshots 375 + 1440 taken with a throwaway business (login, sent, invalid link, bookings, packages, invoices + detail, photos, forms, reschedule, book).

## Limits / not done
- Not clicked in a browser: cancel dialog, reschedule confirm, final "Book now" press, sign out button, print (all proven over HTTP / SQL, UI only reviewed in code). Android / iOS not run (`expo-secure-store` path is code-reviewed only).
- Photos are the full image (no thumbnails). Invoice print uses the browser print of the page (web only).
- A client whose email is stored with capital letters is mailed at that spelling (Resend's test sender refused a mixed-case copy of the owner's own address; real domains do not care).
- GDPR hooks for Phase 11: session / token tables keyed by email + business (delete on client erasure), audit rows hold no personal data.
- The dashboard has no "customer sessions" screen and no per-customer "sign out everywhere" button yet.

## Changelog

- 2026-10-18: F23: a portal cancel gives back a package session used for that appointment (through `cancel_booking`); the Packages tab shows it as "restored".

- 2026-10-18: F24 fix (QA run): Book a visit no longer shows every time twice (shared `SlotGrid` de-duplicates by start).

- 2026-10-18: F22 fix (QA run): Packages tab showed every session as left ("5 of 5") because `portal_packages` used `client_package_used()`, which is gated by `package_visible()` (needs a signed-in member) and so counted 0 in the portal. It now counts `session_usages` directly and returns the package's branch `timezone`; the tab shows usage times and the expiry date in branch time instead of UTC (`20261025130000`). Suite 26 had been failing on dev on exactly this ("after a deduction: 3 left" got 4) and is now 111/111 with a new timezone assertion.
- 2026-10-22: `portal_create_booking` takes an optional `p_branch_id` (null = primary; another business's or an archived branch is `not_bookable` before anything is written); the portal `book` action passes `branch_id`; `PortalBook` shows the same location picker when there are two or more.
- 2026-10-07: Phase 10C built (migrations `20261015090000`, `…100000`, `…110000`, `…120000`, `…130000`; Edge `portal`; outbox `portal_login`; UI; suite 26; HTTP proof 26).
- 2026-10-07: Phase 11B: tab **My data** (`PortalData`) with "Request a copy" / "Request erasure" (action `request_data`; creates a request row only; rate limit `portal_data_request`, 5 per customer per day in the database). See `gdpr.md`.
