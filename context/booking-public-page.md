# Public booking page
Status: done (Phase 3 step 5) · Phase: 3 · Last updated: 2026-10-04

## What it does
The customer-facing flow at `wapee.online/<slug>`: pick a service, pick a person
(if the branch offers that), pick a date and time, fill in the booking form,
get a confirmation with a guest manage link. No account, no RLS-backed client —
every byte comes from three public Edge Functions.

## Business rules
- The flow is service → staff (skipped entirely when `staff_choice` is
  `hidden`) → slot → form → confirmation (doc §6.1/§6.2).
- **Every availability rule — buffer, minimum notice, booking window,
  capacity — lives ONLY in the slot engine.** This page never re-derives any
  of them; it renders exactly what `get_slots`/`create_booking` return
  (CLAUDE.md §6, the rule added this session after the settings-preview work).
- Staff offered in step 2 are filtered to who actually performs the chosen
  service (`service_staff` pairs from `get_booking_page`), not the branch's
  whole team.
- The booking form's fixed fields follow doc §6.1 (name/phone required, email
  required only when `require_client_email` is on, notes optional); custom
  fields shown are filtered to those that apply to the chosen service
  (`appliesToAllServices || serviceIds.includes(serviceId)`), mirroring the
  server-side check in `create_booking`.
- **Phone is always sent as real E.164** (`PhoneInput` + `src/config/e164.ts`),
  not a raw national number — `normalise_phone_e164()` server-side is a
  fallback, not the primary path.
- **The honeypot field (`company_website`) is hidden off-screen**
  (`position:absolute;left:-9999px`), never `display:none`/`type="hidden"`,
  with `tabIndex={-1}` and `autoComplete="off"` — a better bot skips the other
  two hiding methods.
- **The start_token from the most recent `get_slots` response is sent with
  `create_booking`.** A `too_fast` response triggers one automatic retry
  (wait ~1.2s, resubmit with the same answers) rather than failing the
  customer for being fast with autofill.
- A `slot_unavailable` response resets the flow back to the slot step and
  re-fetches, **keeping everything the customer already typed** in the form
  (answers are held in `BookingFlow`'s own state, not re-entered).
- **The manage link's token lives in the URL FRAGMENT**
  (`/<slug>/manage#token=...`), never the query string, so it is never sent to
  a server or written to an access log (user decision, 2026-10-04). Shown with
  a copy button and a "save this link, it's shown once" note — the server only
  ever stores the token's hash.
- Android/iOS/mobile-web hardware back and the in-app back button step
  backward through the flow (service ← staff ← slot ← form) via the same
  `useOverlayDismiss` hook overlays use, rather than leaving the page; only
  fields that stop being valid are cleared (`resetFrom` in `flowState.ts`).
- Page title, meta description and `noindex` are set via `expo-router/head` on
  web only (CLAUDE.md §7.1: full website SEO is Phase 7; this is a booking
  flow, not a landing page).

## Files
| Path | Purpose |
|---|---|
| app/(public)/[slug]/index.tsx | the route; thin, reads `slug` and renders `BookingFlow` |
| src/features/booking-public/components/BookingFlow.tsx | orchestrator: step state, data fetching, error-to-action mapping |
| src/features/booking-public/components/steps/ServiceStep.tsx | step 1, wraps `ServiceList` |
| src/features/booking-public/components/steps/StaffStep.tsx | step 2, filters staff by `service_staff` pairs, wraps `StaffChoice` |
| src/features/booking-public/components/steps/SlotStep.tsx | step 3: `Calendar` + `SlotGrid`, backed by `useSlots` |
| src/features/booking-public/components/steps/FormStep.tsx | step 4: react-hook-form + zod, `PhoneInput`, dynamic custom fields, `HoneypotField` |
| src/features/booking-public/components/steps/ConfirmationStep.tsx | step 5: status, summary, manage link with copy button |
| src/features/booking-public/components/HoneypotField.tsx | the off-screen honeypot input |
| src/features/booking-public/flowState.ts | pure step state machine (19 tests) |
| src/features/booking-public/errorHandling.ts | maps a `PublicApiError` code to a UI action (13 tests) |
| src/features/booking-public/schemas/bookingForm.schema.ts | zod schema built dynamically per service's custom fields |
| src/features/booking-public/botProtection.ts | honeypot field name + min-form-seconds, mirroring the Edge Function |
| src/features/booking-public/api/useBookingPage.ts | `get_booking_page` query (staleTime: static) |
| src/features/booking-public/api/useSlots.ts | `get_slots` query (staleTime: live) |
| src/features/booking-public/api/useCreateBooking.ts | `create_booking` mutation (no retry) |
| src/features/booking-public/api/client.ts | `callPublicFunction()`: wraps `supabase.functions.invoke`, maps failures to `PublicApiError` |
| src/components/shared/PhoneInput.tsx | new shared composite: country-code picker + national number, reports E.164 |
| src/config/dialCodes.ts | 42-country dial-code table, **kept in step with** `create_booking`'s SQL fallback table |
| src/config/e164.ts | pure `toE164`/`fromE164` (7 tests) |

## Database
No new tables. One new function this step added:
- `get_booking_page_catalogue(p_branch_id) → jsonb` — services, staff,
  service↔staff pairs, published form fields. `service_role` only. See
  `booking-public-api.md` and `_database.md`.

`resolveBranch()` (shared Edge Function helper) now also returns
`require_client_email` and `confirmation`.

## Data & caching
- `useBookingPage`: `staleTimes.static` — a business's catalogue does not
  change between two page loads minutes apart.
- `useSlots`: `staleTimes.live` — availability goes stale the moment anyone
  else books; always re-fetched per date range, never assumed fresh across
  steps.
- `useCreateBooking`: a mutation with `retry: false` — a double-submit must
  never silently become two bookings.
- No realtime: a customer only ever looks at one branch for a few minutes.

## Permissions & gating
None — this is the anonymous public surface. No permission check applies;
`get_booking_page` itself decides "not available" via `branch_is_bookable()`.

## UI
Mobile-first single column; desktop centers the flow in a 560px column
(`PageContainer maxWidth`) rather than stretching it. Each step shows a
back button (except on `service`) and a step title. Loading = skeletons;
`not_bookable` = one generic `EmptyState` that reveals nothing about why;
a load failure = `ErrorState` with retry; a `rate_limited` response blocks
just the form step with a calm message, no retry loop.

## i18n
`common.json`, `bookingPublic.*` namespace (shared with the step-4 preview),
extended this step with: `bookingPublic.steps.*`, `bookingPublic.form.submit`,
`bookingPublic.form.errors.*`, `bookingPublic.confirmation.*`,
`bookingPublic.errors.*`, `bookingPublic.notAvailable*`,
`bookingPublic.timezoneNote`, `bookingPublic.slotsError*`, plus a new
top-level `phoneInput.*` group for `PhoneInput`.

## Known limits / TODO
- **The guest manage page (step 6) is now built** — see `context/booking-manage.md`.
  The confirmation screen's `/<slug>/manage#token=...` link now resolves to a
  real page.
- **No PhoneInput validation beyond E.164 shape.** It is a country-code picker
  plus a free-text national number; a determined user can type garbage digits
  that pass the `^\+[1-9][0-9]{1,14}$` check but are not a real number. Full
  per-country validation was out of scope (doc doesn't ask for it; `PhoneInput`
  was explicitly called out as not-yet-built before this session).
- **`dialCodes.ts` (42 countries) must be kept in step with** the dialling-code
  table inside `create_booking`'s SQL — they are deliberately the same list,
  duplicated because one lives in TypeScript and one in PL/pgSQL. Adding a
  country to one without the other means `PhoneInput` and the server's
  fallback normaliser can disagree.
- **Not visually verified in a browser this session** — no browser/computer-use
  tool was available in this environment. Verified instead: `npx tsc --noEmit`,
  `eslint`, prettier, 197 unit tests (30 new), the web bundle builds and serves
  200 with no server-side error, and the full backend chain (`get_booking_page`,
  `get_slots`, `create_booking`, `manage_booking` cancel) via
  `npm run smoke:public` against seeded test data in Nova Hair Studio. **Open
  the app yourself** (`npm run web`, then `/nova-hair-studio`) to click through
  the real flow before calling this done end-to-end — an Android code review
  (below) found and fixed a step-back bug that only a real click-through would
  have caught by eye.
- **Android not run** (no emulator). A written Android code review found one
  real bug, now fixed: `BookingFlow`'s `goBack` called `resetFrom(state, step)`
  with the step being LEFT rather than the step being returned TO, so the
  Back button and Android hardware back did nothing on every step (and
  hardware back was swallowed, leaving the user stuck). Fixed to
  `resetFrom(state, prev)`, with 4 new regression tests exercising the exact
  sequence. Also fixed from that review: a dirty booking form now confirms
  before a back-navigation discards it (`Dialog`, CLAUDE.md §4's "unsaved
  form → confirm before leaving"); `Select`/`PhoneInput` dismiss the keyboard
  before opening their sheet (it could otherwise cover up to 70% of the
  sheet); `Drawer`'s `KeyboardAwareScrollView` now measures the pinned
  footer's real height instead of guessing 16px, so a focused input near the
  bottom is not covered by the risen footer; confirmation summary rows and the
  step title now wrap/shrink instead of overflowing at large font sizes or
  320px width; the copy-link button handles a clipboard failure instead of an
  unhandled rejection.
- Test data left in the dev database: Nova Hair Studio now has branch hours
  (Mon–Fri 9–5 UTC-naive, actually America/New_York), one service
  ("Haircut (test)", $30), and one staff member ("Alex (test)") so the slug is
  bookable for manual testing. Remove when real Nova Hair Studio data exists.
- The smoke test's "instant submission is refused" / "same slot refused with
  409" checks failed this run — both are the pre-existing documented traps
  (`_handoff.md`: network latency isn't a reliable "instant"; a second
  `create_booking` burst inside an hour hits the per-IP 10/hour cap). Not a
  regression: confirmed via `public_request_attempts` that the cap, not a bug,
  caused it.

## Changelog
- 2026-10-04: Built. Route, `BookingFlow` orchestrator, 5 step components,
  `PhoneInput` + `e164.ts`/`dialCodes.ts`, `HoneypotField`, the step state
  machine and error-action mapping (pure, tested), the dynamic zod form schema,
  and the `get_booking_page`/`useSlots`/`useCreateBooking` API hooks. 30 new
  unit tests (197 total). Backend verified via `npm run smoke:public` against
  seeded test data. Android code review found and fixed a step-back bug (see
  Known limits) plus unsaved-form confirm, keyboard-before-sheet, Drawer
  footer-height, and text-overflow fixes.
