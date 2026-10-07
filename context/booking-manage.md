# Guest manage page
Status: done (Phase 3 step 6) · Phase: 3 · Last updated: 2026-10-04

## What it does
The last piece of Phase 3: `(public)/[slug]/manage`, the page a guest opens
from the confirmation screen's manage link (or a future resend email/SMS) to
view, cancel or reschedule their own booking — no account, token only.

## Business rules
- The token comes from the URL **fragment** (`#token=...`), never the query
  string. It is read once, kept in memory only (never
  localStorage/sessionStorage, never logged), and stripped from the visible
  address bar on web via `history.replaceState`. `referrer: no-referrer` and
  `noindex` on the route.
- Invalid, expired, revoked and replayed tokens all show the SAME generic
  "This link is not valid or has expired" page — no hints (CLAUDE.md §13;
  mirrors `manage_booking`'s own `invalid_token` code).
- View: business/branch name, service, staff, LOCAL time in the BRANCH
  timezone (zone name shown), status, **first name only** — nothing else.
- Cancel only shown when the server's `can_cancel` says so; confirm dialog
  first. If the window has passed, no button — a plain explanation instead.
- Reschedule only shown when `can_reschedule`. **Same staff member as today**
  — no staff-reselection step (not asked for; the RPC itself falls back to
  "any staff" only if the original staff member can no longer do it).
- **Every availability rule still lives only in the slot engine.** This page
  never re-derives buffer/notice/window/capacity — same rule as the public
  booking page (CLAUDE.md §6).
- 429 shows a calm message, no retry loop. Network/server error shows a retry
  button. `too_fast`/honeypot do not apply here (no start token on this
  surface — a guest arriving from a link has no prior `get_slots` call; the
  token itself is the protection, same reasoning as `manage_booking`'s own
  doc comment).

## The backend gap this step closed
`get_slots` needs `slug` + `service_id`, but the manage page only ever has a
**token** — `get_booking` deliberately returns `service_name`/`staff_name`
(strings, for privacy), never ids. There was no way to get reschedule slots
without either leaking ids to a guest or adding a new surface. Added:
- **`get_booking_reschedule_slots(token, from_date?, to_date?)`** (SQL,
  `service_role` only) — resolves the token to the appointment's OWN
  branch/service/staff **server-side** (mirrors `reschedule_booking`'s own
  lookup) and calls `get_free_slots` with those. No id ever leaves it.
- **`manage_booking`'s new `action: 'get_slots'`** — calls the above, shares
  the `get_booking` rate-limit bucket (same cost class as reading the booking
  itself).

## Files
| Path | Purpose |
|---|---|
| app/(public)/[slug]/manage.tsx | the route; `noindex`/`no-referrer`, thin |
| src/features/booking-manage/components/BookingManage.tsx | orchestrator: token resolution, view/reschedule mode, error-to-UI mapping |
| src/features/booking-manage/components/ManageView.tsx | view + cancel (confirm dialog) |
| src/features/booking-manage/components/RescheduleView.tsx | date/slot picker (reuses `Calendar` + `SlotGrid`) + confirm dialog |
| src/features/booking-manage/useTokenFromUrl.ts | reads the fragment (web: sync + strip; native: `expo-linking` deep link) |
| src/features/booking-manage/tokenFragment.ts | pure fragment parsing (tested) |
| src/features/booking-manage/types.ts | view models (`ManageBookingView`, `RescheduleResult`, `ManageSlot`) |
| src/features/booking-manage/api/useManageBooking.ts | `get` query, `live` staleTime |
| src/features/booking-manage/api/useCancelBooking.ts | `cancel` mutation, no retry |
| src/features/booking-manage/api/useManageSlots.ts | `get_slots` query (reschedule screen) |
| src/features/booking-manage/api/useRescheduleBooking.ts | `reschedule` mutation, no retry |
| supabase/migrations/20261004110000_guest_manage_reschedule_slots.sql | `get_booking_reschedule_slots` |
| supabase/functions/manage_booking/index.ts | extended with the `get_slots` action |

Reused unchanged from `booking-public`: `callPublicFunction`, `PublicApiError`,
`actionFor` (extended — see below), `Calendar`, `SlotGrid`.

## Database
No new tables. One new function (see "backend gap" above):
`get_booking_reschedule_slots(p_token, p_from_date, p_to_date) → jsonb`,
`service_role` only, same posture as `get_free_slots`/`pick_staff_for_slot`.

`manage_booking` (existing Edge Function) gained one action; no change to
`get_booking`/`cancel_booking`/`reschedule_booking` RPCs.

## Data & caching
- `useManageBooking`: `staleTimes.live`, `retry: false` — the token is the
  query key's identity (no business/branch scope exists for an anonymous
  guest, so this does NOT use `createQueryKeys`, deliberately).
- `useManageSlots`: `staleTimes.live`, keyed by `[token, fromDate, toDate]`.
- `useCancelBooking` / `useRescheduleBooking`: mutations, `retry: false` — a
  double-submit must never silently double-act.

## Permissions & gating
None — anonymous public surface, same as the rest of Phase 3's guest flows.

## UI
Single column, centered on desktop (480px). Loading = skeleton. The SAME
`EmptyState` renders for `invalid_token` and `not_bookable` so a guest can't
tell "bad token" from "business inactive" apart. Android/web back (and
Escape) step from the reschedule screen back to the view screen via
`useOverlayDismiss`, rather than falling through to the Stack's default pop
and leaving the page — this is NOT a separate route, just internal state, so
without this wiring hardware back would have exited the manage page entirely
(caught in this session's own review, same bug class as the public booking
flow's documented `goBack` trap).

## i18n
New `bookingManage.*` keys in `common.json` (status labels, cancel/reschedule
confirm dialogs, error copy). Reuses `bookingPublic.form.*` and
`bookingPublic.timezoneNote` for the summary rows and timezone note.

## Known limits / TODO
- **Reschedule keeps the SAME staff member, with no staff-reselection step.**
  If the booking is "Any staff" and that particular staff member is busy at
  the new time, the guest sees no slots for that day even though a different
  staff member might be free — the reschedule screen never re-runs the "Any
  staff" assignment, it only asks "is MY current staff free then". A guest
  in that situation has to try other days/times or contact the business;
  there is no way in this UI to fall back to "any available person" for a
  reschedule. (`reschedule_booking` itself would fall back to a different
  staff member if the ORIGINAL one can no longer perform the service at all,
  but that is a capability check, not an availability one — it does not help
  here.)
- **`PublicErrorCode` extended**: `invalid_token`, `cancel_window_passed`,
  `not_cancellable` added to `booking-public/types.ts`'s union and `client.ts`'s
  `KNOWN_CODES` — they already existed in the Edge Function's own
  `_shared/response.ts` but the app-side shared type had never needed them
  before this page. `errorHandling.ts`'s `actionFor` gained `invalid_link` and
  `not_allowed` outcomes.
- **Not visually verified by clicking every interaction** — verified: the view
  screen and the reschedule screen's calendar+slots render correctly on the
  iOS simulator (deep link, real backend data, first-name-only privacy
  visible, Reschedule button navigates correctly) via screenshots this
  session. The reschedule confirm dialog and cancel confirm dialog were
  **not** clicked through in the simulator — AppleScript-driven taps kept
  hitting wrapper accessibility groups instead of the pressable itself, and
  after several attempts this was dropped in favour of the already-complete
  backend verification (curl end-to-end: get → get_slots → reschedule → get
  → cancel → get, all correct; 106 SQL assertions; 34/37 smoke checks, 2
  failures being the documented pre-existing per-IP `create_booking` cap, not
  a regression). **Click through the reschedule confirm and cancel confirm
  dialogs yourself** before calling this fully done end-to-end.
- Android not run (no emulator) — reviewed in code only (see Changelog).
- Same `dialCodes.ts`/42-country caveat does not apply here (no phone input
  on this page).

## Changelog
- 2026-10-04: Built. Route, `BookingManage` orchestrator, `ManageView`,
  `RescheduleView`, fragment-token reading (web + native deep link),
  `get_booking_reschedule_slots` (new migration) + `manage_booking`'s new
  `get_slots` action to close the "reschedule needs slots but only has a
  token" gap without leaking ids. Extended `PublicErrorCode`/`actionFor` for
  `invalid_token`/`cancel_window_passed`/`not_cancellable`. 15 new unit tests
  (212 total). 106 SQL assertions (`supabase/tests/11_guest_manage_link.sql`,
  +15 for the new function). Verified end-to-end over HTTP and on the iOS
  simulator. Android review found and fixed one real bug: the reschedule
  sub-view had no hardware-back handler, so Android back would have exited
  the manage page instead of returning to the view screen — fixed with
  `useOverlayDismiss`.
- 2026-10-07: Phase 10C: the client portal borrows the manage engine through a short-lived token; it steps the booking's own live token aside for the transaction and restores exactly that one (`portal_mint/revoke_manage_token`).
