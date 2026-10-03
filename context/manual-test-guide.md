# Manual test guide — iOS simulator (Phases 0–2 + Phase 3 backend)

Last updated: 2026-10-03. For the current build state see `context/_handoff.md`.

This is a **by-hand** test guide — click through the app in the iOS simulator,
then check the booking backend directly with curl. No code changes are made by
following this guide.

---

## 1. Start the app

```sh
npm run ios      # first time, or after adding a native module (e.g. expo-clipboard)
# or, if already built once:
npx expo start --port 8092 --non-interactive
```

Picks the iOS Simulator automatically (or use the one already open).

## 2. Dev account to sign in with

Use one of the three real, confirmed accounts already in the database (from
`context/_handoff.md` — "4 users and 3 businesses remain, no test users left"):

| Email | Business | Branch timezone |
|---|---|---|
| `wapee.owner.1790890259@gmail.com` | Nova Hair Studio (`nova-hair-studio`) | America/New_York |
| `wapee.br.1790909857@gmail.com` | Buenos Clinic (`buenos-clinic`) | America/New_York |
| `wapee.br2.1790911062@gmail.com` | Rosario Clinic 19481 (`rosario-clinic-19481`) | America/New_York |

**You need the password** — ask whoever created these accounts, or use "Forgot
password" on `/login` (the reset email only delivers if that address is a
Supabase **team member** on this project — see `context/auth.md`). If you'd
rather not chase a password, create a fresh account instead:
1. Go to `/signup`, sign up with any real email you can read.
2. Confirm it manually in SQL (the built-in sender won't deliver to a
   non-team address):
   `update auth.users set email_confirmed_at = now() where email = '...';`
3. Sign in — you'll land in the onboarding wizard to create a business.

All three existing businesses currently have **zero services and zero staff**
(checked live, 2026-10-03), so whichever account you use, you'll want to add
at least one service as part of the walkthrough below anyway.

## 3. Routes that exist today

| Route | Screen | State |
|---|---|---|
| `/login`, `/signup`, `/verify`, `/forgot-password`, `/reset-password` | Auth | real |
| `/onboarding` | Business creation wizard | real |
| `/accept-invite` | Accept a team invite | real |
| `/today` | Dashboard | **placeholder** ("Coming soon") |
| `/calendar` | Calendar | **placeholder** |
| `/clients` | Clients | **placeholder** |
| `/services` | Services (catalogue) | real |
| `/staff` | Staff | real |
| `/schedule` | Working hours / branch hours / time off / holidays / rooms | real |
| `/members` | Team list + invite | real |
| `/invoices` | Invoices | **placeholder** |
| `/reports` | Reports | **placeholder** |
| `/reviews` | Reviews | **placeholder** |
| `/settings` | Settings home | real |
| `/settings/booking` | Booking settings + live customer preview | real |
| `/more` | More menu (mobile) | real |
| `/(public)/[slug]` | Public business booking page | **not built** (Phase 3 UI, next up) |
| `/(portal)/portal` | Client portal | placeholder/add-on, not in scope yet |
| `/(admin)/admin` | Super admin | placeholder, not in scope yet |
| `/_gallery` | **Dev-only** component gallery — every UI primitive on one screen | real, dev builds only |

`/today`, `/calendar`, `/clients`, `/invoices`, `/reports`, `/reviews` all
render the shared `ComingSoonScreen` — a real screen shell with a "coming
soon" message, not broken, not yet built.

## 4. Dev component gallery

Open `http://localhost:8092/_gallery` in the simulator (or type `_gallery`
into the Expo dev menu's URL bar). Only works in a dev build (`__DEV__`); in
production it redirects to `/`. Shows every `src/components/ui` primitive —
Button variants, Input, Card, Badge, Drawer, Tabs, SegmentedControl,
Collapsible, NumberStepper, etc. — useful for checking the design system in
isolation, no login needed.

## 5. Things to click, and what should happen

1. **Sign in** with one of the accounts above (or sign up fresh).
   *Expected:* lands on `/today` with the bottom tab bar visible (mobile
   width in the simulator), "Coming soon" message shown.
2. **Tap each bottom tab**: Today, Calendar, Clients, then open **More**.
   *Expected:* Today/Calendar/Clients show "Coming soon"; More lists
   Services, Staff, Schedule, Members, Invoices, Reports, Reviews, Settings,
   and a sign-out row. Tapping a placeholder destination (Invoices/Reports/
   Reviews) from More also shows "Coming soon", not a crash.
3. **Services → add a service.** Tap the `+` button, fill in name + a
   per-branch price, save.
   *Expected:* new service appears in the list immediately (optimistic/
   query invalidation), no full-screen spinner, a skeleton while it loads.
   `SearchInput` at the top filters server-side after a short pause.
4. **Staff → add a staff member.** Create one, assign the service you just
   added and the one branch.
   *Expected:* staff member appears in list; service/branch assignment
   saved (reopen the staff profile to confirm it stuck).
5. **Schedule → set working hours** for the staff member you created (a
   normal weekday, e.g. 09:00–17:00).
   *Expected:* saves without error; reopening Schedule shows the same hours
   (proves the delete-then-insert RPC committed, per the trap in
   `_handoff.md`: schedule writes must go through `replace_staff_working_hours`,
   not direct table writes).
6. **Settings → Booking.** Turn booking on for the branch, check the **live
   customer preview** panel updates as you change settings (e.g. slot
   interval, people-per-slot).
   *Expected:* preview reflects your changes without a page reload; saving
   does not clear the service/staff you created in steps 3–4.
7. **Members → Invite someone.** Enter an email, pick a role and branch,
   send the invite.
   *Expected:* one-time invite link is generated and copyable (needs the
   `expo-clipboard` native rebuild — if copy silently does nothing, rebuild
   with `npm run ios` first). Reopening Members shows the pending invite.
8. **Rotate the simulator to a tablet-sized device** (or resize the web
   window to ≥768px) — e.g. iPad simulator.
   *Expected:* bottom tab bar disappears, a left sidebar with the same nav
   items appears instead; same screens render, just the frame changed.
9. **Background the app, then foreground it** (Home button / swipe up and
   back in) while on a form you've half-filled (e.g. mid-way through adding
   a service).
   *Expected:* no crash; whatever you'd expect from an Expo dev build
   resuming (session stays valid — no forced re-login).
10. **Sign out from More**, then try to open `/services` directly by typing
    the URL (web) or re-launching deep-linked.
    *Expected:* redirected to `/login` — `RouteGuard` blocks it, it doesn't
    just render empty.

## 6. Booking backend — curl against the deployed functions

The public booking **page** doesn't exist yet, but all 4 Edge Functions are
live. This proves the backend works end-to-end without any UI.

**You need a service_id first** — none of the 3 businesses currently has
one, so either use the service you created in step 3 above, or create one
quickly via SQL (read-only check first, then ask before writing — services
belong in the app, this is just to unblock testing):

```sql
-- in the Supabase SQL editor, or ask Claude to run it read-only first
select id, name from public.services where business_id = '3a1523ac-7ffa-43e1-9405-b0d156bcac5c';
```

Once you have a `service_id`, run:

```sh
SUPA_URL="https://rfuovquhultjydtswtqf.supabase.co"
ANON_KEY="sb_publishable_ihNIrkze-4tDcGMtl-ymGA_chIdKUdg"
SLUG="nova-hair-studio"
SERVICE_ID="<paste the service id>"

# 1) get_slots — ask for tomorrow's and the day after's slots
curl -s -X POST "$SUPA_URL/functions/v1/get_slots" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"$SLUG\",\"service_id\":\"$SERVICE_ID\",\"from\":\"$(date -v+1d +%F)\",\"to\":\"$(date -v+2d +%F)\"}" \
  | tee /tmp/slots.json | python3 -m json.tool
```

*Expected:* `200` with `timezone`, `branch` name, `currency`, a `slots` array,
and a `start_token` (4 dot-separated parts). If `slots` is empty, the branch
has no working hours set for that staff/service on those dates — go set them
in Schedule (step 5 above) and retry.

```sh
# 2) create_booking — book the first slot, using the start_token from step 1
START_TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/slots.json'))['start_token'])")
STARTS_AT=$(python3 -c "import json;print(json.load(open('/tmp/slots.json'))['slots'][0]['starts_at'])")

curl -s -X POST "$SUPA_URL/functions/v1/create_booking" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\":\"$SLUG\",
    \"service_id\":\"$SERVICE_ID\",
    \"starts_at\":\"$STARTS_AT\",
    \"start_token\":\"$START_TOKEN\",
    \"company_website\":\"\",
    \"client\":{\"first_name\":\"Test\",\"last_name\":\"Guest\",\"phone\":\"+15551234567\",\"email\":\"test.guest@example.com\"},
    \"answers\":[]
  }" | python3 -m json.tool
```

*Expected:* `201` with the confirmation details **plus a raw manage token** —
copy it, it's shown once and never stored in plaintext. Booking the exact
same slot again with a new `get_slots`/`start_token` pair should return
`409 slot_unavailable`.

> Real-world note from `context/booking-public-api.md`: `create_booking`
> right after `get_slots` (same second) returns `400 too_fast` — the start
> token enforces a 3-second minimum. Wait a few seconds between the two
> calls above if you hit that.

**manage_booking** (optional, to see the guest-side cancel/reschedule):

```sh
TOKEN="<the raw manage token from create_booking>"

curl -s -X POST "$SUPA_URL/functions/v1/manage_booking" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"action\":\"get\",\"token\":\"$TOKEN\"}" | python3 -m json.tool
```

*Expected:* status, service, staff/branch/business names, local time,
`can_cancel`/`can_reschedule`, first name only — no phone, no surname, no ids.

## 7. Which Supabase tables to open to see the result

In the Supabase dashboard (project `rfuovquhultjydtswtqf`, Table Editor) or
via `execute_sql` (read-only):

| Table | What to look for |
|---|---|
| `clients` | a new row for `test.guest@example.com` / `+15551234567` |
| `appointments` | the new appointment, `status = 'confirmed'`, correct `starts_at` (UTC) |
| `appointment_answers` | empty here (no custom fields were sent) |
| `booking_manage_tokens` | one row with a `token_hash` — **never the raw token** |
| `public_request_attempts` | rows for each curl call, keyed by hashed IP, `outcome = allowed`/`blocked` |
| `rate_limit_rules` | the limits in force (60/min on get_slots, 10/hour + 5/day on create_booking, etc.) |

Confirm the slot is now blocked: re-run the same `get_slots` call — the booked
slot should no longer appear in the `slots` array.

## 8. What is NOT testable yet

- **The public booking page itself** (`(public)/[slug]`) — not built. The
  curl commands above are the only way to exercise `get_slots`/
  `create_booking` right now; there is no UI to click through.
- **The guest manage page** (view/cancel/reschedule from a link) — backend
  (`manage_booking`) is verified by curl only, no screen.
- **Today, Calendar, Clients, Invoices, Reports, Reviews** — all show
  "Coming soon"; there is nothing behind them to test yet.
- **Android** — no emulator on this machine. Every UI change gets a written
  code review instead of a real run (CLAUDE.md §4); not something you can
  click through in this guide.
- **Push notifications** — not built (later phase).
- **Email/SMS delivery for the manage link** — Phase 6; the token currently
  only surfaces in the `create_booking` response and the dashboard, nothing
  is actually emailed or texted.
- **Billing/plans** (`/billing`) — route doesn't exist yet; trial lock and
  banner point at `/settings` as a placeholder destination.
- **Members: changing a role, removing a member, revoking/resending an
  invite** — known gaps, not built (`context/members.md`).
- **`supabase/tests/*.sql` pgTAP suite** — can't run locally, no Docker. The
  curl checks above substitute for the public-API half of it; the SQL
  assertions were run once through the Supabase connector, not as a
  repeatable suite you can invoke.
