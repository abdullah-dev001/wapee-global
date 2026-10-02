# Booking engine (slots, clients, appointments)

Status: DB + slot engine done (no UI, no Edge Functions yet) · Phase: 3 · Last updated: 2026-10-03

## What it does

The data and the maths behind booking: clients, appointments, custom-field
answers, guest manage tokens, the **no-double-booking guarantee in Postgres**,
and `get_free_slots()` — one function that turns branch hours, staff hours,
breaks, time off, existing bookings, buffer, notice, window, interval, resources
and people-per-slot into a list of bookable slots, correct across DST.

Steps 4–7 of Phase 3 (settings UI, public booking page, guest manage link, rate
limiting) are **not built**. There are no Edge Functions yet.

## Business rules

- **A client belongs to the BUSINESS, not the branch**, identified by
  `phone_e164`, unique per business among live rows. One person who visits two
  branches is one client with one history (doc §6.3).
- **A repeat booking attaches to the existing client and never overwrites it.**
  Only empty fields may be filled; the owner's correction of a name must survive
  the customer's next typo. The booking RPC must also **never reveal whether the
  phone already existed** (same response either way).
- Phone is normalised server-side by `normalise_phone_e164()`. It is
  best-effort (strips punctuation, `00` → `+`, national `0` → dialling code) and
  **not a libphonenumber replacement**: real per-country validation belongs to
  `PhoneInput` and the Edge Function's zod schema.
- **Times are `timestamptz` (UTC); all slot maths happens in the branch
  timezone.** `duration_minutes`, `buffer_minutes` and `price_minor` are
  **snapshots** on the appointment, because this booking's length and quoted
  price are historical facts.
- **`pending` HOLDS the slot** (confirmation = owner approves), so two customers
  cannot both be waiting on the same time. Only `cancelled` and `no_show`
  release it.
- **No double-booking is a DB guarantee** for exclusive rows: two GiST
  exclusion constraints (staff + tstzrange, resource + tstzrange), predicate
  `status not in ('cancelled','no_show') and deleted_at is null and is_exclusive`.
- **`is_exclusive`** is set true when `people_per_slot` was 1 at booking time,
  so a group class is not refused by the constraint.
- **The constraints use the real `starts_at`/`ends_at`, not start..end+buffer.**
  The buffer is a scheduling courtesy, not a physical conflict: the slot engine
  hides buffered slots and the booking RPC re-checks it, but a receptionist
  deliberately overriding a buffer in Phase 4 must not be blocked by a
  constraint.
- **"Any staff" rule:** the free eligible staff member with the **fewest
  appointments that LOCAL day at that branch**; ties broken by `sort_order`,
  then by `id`. Deterministic, so a test can assert it.
  (`pick_staff_for_slot()`.)
- Appointments are **soft-deleted or cancelled, never removed** — there is no
  DELETE policy for anyone.
- **Guest manage tokens:** ≥128-bit random, only the **sha256 hash** stored,
  scoped to one appointment, expiring at the appointment end, revoked on cancel
  or when a resend issues a replacement. One live token per appointment
  (partial unique index).

## Files

| Path | Purpose |
|---|---|
| supabase/migrations/20261003100000_clients_and_appointments.sql | clients, appointments, answers, manage tokens, exclusion constraints, RLS, `has_permission_at_branch_scope` |
| supabase/migrations/20261003110000_slot_engine.sql | `free_slot` type, `get_free_slots()`, `pick_staff_for_slot()` |
| supabase/migrations/20261003112000_fix_slot_interval_cast.sql | fix: the slot_interval enum was assigned into an integer |
| supabase/migrations/20261003113000_revoke_anon_table_grants.sql | took anon's table privileges away project-wide |
| supabase/tests/06_booking_form_and_slot_engine.sql | 93 assertions: slots, DST, constraints, form versions |
| supabase/tests/07_booking_rls_per_role.sql | 54 assertions: RLS per role incl. anon |

No app code yet.

## Database

Tables:

- `clients` → business_id, full_name, **phone_e164**, email, notes,
  first_branch_id, source
- `appointments` → business_id, branch_id, client_id, service_id, staff_id,
  resource_id, **starts_at/ends_at**, duration_minutes, buffer_minutes, status,
  source, client_notes, internal_notes, **form_version_id**, **is_exclusive**,
  price_minor, cancelled_at, cancelled_by_guest, cancellation_reason
- `appointment_field_values` → business_id, appointment_id, custom_field_id,
  form_version_id, value text, **is_sensitive** (unique on appointment+field)
- `booking_manage_tokens` → business_id, appointment_id, **token_hash**,
  expires_at, revoked_at, last_used_at

Enums: `appointment_status` (pending/confirmed/completed/cancelled/no_show —
full set created now, Phase 3 uses pending→confirmed→cancelled),
`booking_source` (online/dashboard/walk_in/portal).

RLS:

| Table | Read | Write |
|---|---|---|
| `clients` | `clients.view`; **Own scope = only clients the caller has an appointment with** | create `clients.create`, edit `clients.edit`. No DELETE policy. |
| `appointments` | `appointments.view`; Own scope = only the caller's own | `appointments.create` / `.edit`, same Own narrowing. **No DELETE policy.** |
| `appointment_field_values` | can see the appointment **AND** (not sensitive **OR** `clients.view_sensitive`) | create/edit with the appointment's permission |
| `booking_manage_tokens` | `appointments.view` on the appointment | **nobody** — RPC only |

`anon` has no grant and no policy on any of them.

Functions:

- **`get_free_slots(branch, service, staff=null, from_date=null, to_date=null,
  ignore_notice=false) → setof free_slot`** — the engine. `SECURITY DEFINER`,
  `STABLE`, **EXECUTE granted to `service_role` only** (revoked from public,
  anon and authenticated). Takes no caller identity and does **no permission
  check**, deliberately: it is pure availability maths called from the
  `get_slots` Edge Function, and Phase 4's dashboard will reuse it through a
  permission-checked wrapper so the two surfaces cannot drift.
- **`pick_staff_for_slot(branch, service, starts_at, ends_at) → uuid`** — the
  "Any staff" rule. `service_role` only.
- `normalise_phone_e164(input, default_dial_code) → text` — `authenticated` keeps
  EXECUTE (the dashboard's own client form needs the same normalisation); anon
  does not.
- `has_permission_at_branch_scope(business, branch, perm) → boolean` — "do you
  hold this at branch or all scope (NOT own)?". `has_permission()` deliberately
  ignores `own`, so this is the other half that lets a policy separate "sees the
  whole branch" from "sees only their own rows".

Type: `free_slot` = (starts_at, ends_at, local_date, local_minute, staff_id,
resource_id, seats_left).

## Timezone and DST

The one expression that matters:

```sql
((local_date::timestamp + make_interval(mins => m)) at time zone branch_tz)
```

The date loop runs over **local dates in the branch timezone**, never UTC days,
so "Tuesday" means Tuesday where the shop is.

- **Spring forward** (London 2027-03-28 01:00→02:00): the missing local hour is
  mapped forward by Postgres rather than failing. No slot is duplicated, and the
  day simply has one hour less of real time. *Verified: the two 09:00 slots on
  27 and 28 March are **23 hours** apart.*
- **Fall back** (London 2027-10-31 02:00→01:00): the repeated local hour is
  resolved by Postgres to the **SECOND (standard-time) occurrence** — `01:00`
  local = `01:00Z` (GMT), not `00:00Z` (BST). Either way the hour is offered
  **once, not twice**, which is the honest answer: offering it twice would let
  two customers book "01:30" and arrive an hour apart. *Verified: the two 09:00
  slots on 30 and 31 October are **25 hours** apart; a branch open 00:00–06:00
  on the fall-back day yields 6 distinct instants, not 7.*
- **Asia/Karachi has no DST** and is verified to keep the same offset in June
  and January.

## Data & caching

Not wired yet. When built: slots are `staleTimes.live` / `liveShort` (0–15 s) —
availability goes stale the moment anyone books. The public page will call the
`get_slots` Edge Function, never the DB directly.

## Permissions & gating

- `appointments.view` / `.create` / `.edit`, `clients.view` / `.create` /
  `.edit`, `clients.view_sensitive` for sensitive answers.
- **Own scope matters for both clients and appointments** — see the RLS table.
- Public booking needs no permission: it goes through Edge Functions with the
  service role, which resolve the business from the slug.
- No plan or add-on gate: booking is core.

## UI

Not built. Step 5 of Phase 3: `(public)/[slug]` — service → staff → slot → form
→ confirmation. It reuses the shared **`Calendar`** month grid (via
`disabledDates`) and will need a new `TimeSlotPicker`.

## i18n

Namespace not created yet (`booking`).

## Known limits / TODO

- **No Edge Functions yet.** `get_slots` and `create_booking` are step 5. Until
  they exist, nothing can reach the engine: it is `service_role`-only on
  purpose.
- **Group capacity (`people_per_slot` > 1) is a WEAKER guarantee than 1:1.**
  The exclusion constraint cannot express "at most N", so the booking RPC must
  do a counted check under `pg_advisory_xact_lock(branch, service, staff,
  starts_at)`. That lock does not exist yet — it lands with `create_booking`.
  Documented in `_database.md`.
- **A resource with `capacity` > 1 is not covered by the exclusion constraint**
  either (one row per booking would block the second customer). The engine
  counts concurrent use correctly; the booking RPC must re-check it under the
  same lock.
- **No overnight shifts** (inherited from Phase 2: `end_minute > start_minute`).
  A branch open past midnight needs two rows on consecutive days.
- **A branch with no `branch_hours` rows has NO slots**, silently (the Phase 2
  rule is "a weekday with no row is closed"). The settings/onboarding UI must
  tell the owner to set opening hours — otherwise the booking page looks broken.
  **Decided this session: return nothing, no reason code.**
- `appointments.staff_id` is nullable in the schema but the booking RPC always
  resolves one. It stays nullable for a future "no particular staff" business.
- The slot engine does not yet expose `slot_display = 'all_greyed'` (doc §6.2
  offers "all slots with booked ones greyed"). It returns only free slots; the
  greyed variant needs a second query or a flag. **Step 5 decision.**

## Changelog

- 2026-10-03: Slot engine (`get_free_slots`, `pick_staff_for_slot`, `free_slot`
  type), service_role-only. 93 assertions incl. DST in three zones.
- 2026-10-03: clients, appointments, answers, manage tokens; 2 exclusion
  constraints; `has_permission_at_branch_scope` for Own-scope narrowing;
  54 RLS assertions.
- 2026-10-03: Fixed `get_free_slots` assigning the `slot_interval` enum into an
  integer (every call failed 22P02 until then).
