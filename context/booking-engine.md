# Booking engine (slots, clients, appointments)

Status: done (Phase 3 scope) · Phase: 3 · Last updated: 2026-10-04

## What it does

The data and the maths behind booking: clients, appointments, custom-field
answers, guest manage tokens, the **no-double-booking guarantee in Postgres**,
and `get_free_slots()` — one function that turns branch hours, staff hours,
breaks, time off, existing bookings, buffer, notice, window, interval, resources
and people-per-slot into a list of bookable slots, correct across DST.

**Phase 3 is complete end-to-end**: five deployed Edge Functions
(`get_booking_page`, `get_slots`, `create_booking`, `manage_booking`,
`resend_manage_link`) are the public surface; `create_booking` and
`reschedule_booking` are SECURITY DEFINER RPCs doing their whole write in one
transaction; settings UI, the public booking page, and the guest manage page
are all built. Rate limiting and bot protection (step 7) are live.

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
- **A pending booking still gets a manage token**, so a customer can withdraw a
  request they are waiting on.
- **Resource capacity now works.** `resource_is_exclusive` (generated from
  `resource_capacity_at_booking <= 1`) drives the resource exclusion constraint,
  so a capacity-2 room genuinely holds two bookings while capacity-1 stays a hard
  DB guarantee. `resource_capacity_at_booking` is a snapshot and defaults to 1,
  i.e. to the stricter behaviour.
- **`create_booking` returns a structured result and NEVER raises** for an
  expected failure: `{ok:true,...}` or `{ok:false, code, field_id?}`. A RAISE
  would roll back step 7's rate-limit counter — the exact bug `accept_invite`
  had. A genuinely unexpected error still raises, loudly.
- **Answers are validated against the form SNAPSHOT**, not the live fields, so a
  field edited mid-booking cannot change the verdict. Type rules: `number` must
  match `^-?[0-9]+(\.[0-9]+)?$`, `yes_no` must be true/false (stored
  lowercase), a `dropdown` value must be one of the snapshot's options.
- **An answer for a field that does not apply to the chosen service is
  REJECTED**, not silently dropped: it means the client and server disagree
  about the form.
- **A booking made with `staff_choice = 'hidden'` ignores any staff_id sent**,
  rather than honouring a tampered or stale request.
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
| supabase/migrations/20261003150000_slots_include_booked.sql | `include_booked` + the `available` flag (doc §6.2 all_greyed) |
| supabase/migrations/20261003160000_create_booking.sql | the booking RPC |
| supabase/migrations/20261003170000_save_booking_settings.sql | settings RPC + the people_per_slot guard + `branch_is_bookable()` |
| supabase/migrations/20261003180000_fix_resource_capacity.sql | fix: a capacity > 1 resource was unusable |
| supabase/migrations/20261003190000_fix_booking_answers_and_capacity.sql | fix: answer normalisation was discarded; capacity not snapshotted |
| supabase/migrations/20261003140000_form_version_cascade_fix.sql | fix: immutability trigger blocked deleting a business |
| supabase/migrations/20261003210000_form_version_trigger_cascade_fix.sql | fix: the cascade tried to CREATE a form version |
| supabase/functions/get_slots/index.ts | public slots endpoint (zod, slug → business) |
| supabase/functions/create_booking/index.ts | public booking endpoint; generates the manage token |
| supabase/functions/_shared/supabase.ts | service-role client + `resolveBranch(slug)` |
| supabase/functions/_shared/response.ts | RPC code → public reason mapping; one response shape |
| supabase/functions/_shared/cors.ts | origin allow-list (not `*`) |
| supabase/functions/_shared/rateLimit.ts | **the step-7 seam**, already called by both endpoints |
| supabase/tests/08_create_booking.sql | 126 assertions |
| supabase/tests/09_booking_concurrency.sql | 14 assertions: lock keys, constraint, counted checks |

No app code yet (no UI).

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
- **`create_booking(branch, service, starts_at, staff, name, phone, email,
  notes, answers, manage_token) → jsonb`** — the whole write in one transaction.
  `service_role` only. Order of operations: branch/business/settings → service →
  client details → window and notice → answers against the snapshot → **advisory
  lock** → staff → **re-check through `get_free_slots` itself** → group count →
  resource count → client upsert → appointment → answers → manage token.
  Re-checking by *calling the engine* rather than repeating its SQL is what keeps
  the two from ever disagreeing about what "free" means.
  Codes: `business_inactive`, `booking_disabled`, `unknown_service`,
  `service_unavailable`, `invalid_phone`, `invalid_name`, `slot_unavailable`,
  `slot_taken`, `outside_window`, `too_soon`, `no_staff`, `staff_unavailable`,
  `no_resource`, `missing_answer`, `invalid_answer`, `unknown_field`,
  `too_many_answers`.
- **`save_booking_settings(branch, settings jsonb) → jsonb`** — only the keys
  present change. **SECURITY INVOKER** (like the Phase 2 schedule RPCs), so RLS
  stays the boundary; the explicit `can()` check only turns a silent zero-row
  update into a clear `forbidden`. Blocks a `people_per_slot` DOWNGRADE when a
  **future** slot already holds more bookings than the new limit, returning the
  offending slot (`local_date`, `local_minute`, `booked`, `new_limit`,
  `service_name`, `staff_name`) so the UI can explain rather than dead-end.
  Never rewrites existing appointments. `authenticated` may call it.
- **`branch_is_bookable(branch) → jsonb`** — `{bookable, reasons[]}` with every
  unmet requirement (`booking_disabled`, `no_branch_hours`,
  `no_bookable_service`, `no_bookable_staff`, `no_staffed_service`). The settings
  screen, the website block and the public page all use it so they agree.

Type: `free_slot` = (starts_at, ends_at, local_date, local_minute, staff_id,
resource_id, seats_left).

## Public API

The five deployed Edge Functions are the only way in from the internet. They
have their own file: **[booking-public-api.md](booking-public-api.md)**.

## Timezone and DST

The one expression that matters:

```sql
((local_date::timestamp + make_interval(mins => m)) at time zone branch_tz)
```

The date loop runs over **local dates in the branch timezone**, never UTC days,
so "Tuesday" means Tuesday where the shop is.

| Case | Behaviour | Verified by |
|---|---|---|
| Spring forward (London 2027-03-28) | The missing local hour is mapped forward; no slot duplicated. The two 09:00 slots on 27 and 28 March are **23 h** apart. | test 06 |
| Fall back (London 2027-10-31) | The repeated local hour resolves to the **SECOND (standard-time)** occurrence: 01:00 local = 01:00Z (GMT), not 00:00Z (BST). Offered **once**, not twice. The two 09:00 slots on 30/31 Oct are **25 h** apart; a branch open 00:00–06:00 yields 6 distinct instants, not 7. | test 06 |
| No DST (Asia/Karachi) | Same offset in June and January. | test 06 |

Offering a repeated hour twice would let two customers book "01:30" and arrive an
hour apart, so once is the honest answer.

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

**Step 5**: `(public)/[slug]` — service → staff → slot → form → confirmation.
See `booking-public-page.md`. It reuses the shared **`Calendar`** month grid
(via `minDate`/`maxDate`); no separate `TimeSlotPicker` was needed since
`SlotGrid` (built in step 4) already covers it. **Step 6**: `(public)/[slug]/manage`
— view/cancel/reschedule by token, reusing the SAME `Calendar`/`SlotGrid`. See
`booking-manage.md`.

## i18n

Namespace not created yet (`booking`).

## Known limits / TODO

- **Group capacity and resource capacity > 1 are a WEAKER guarantee than 1:1.**
  An exclusion constraint cannot express "at most N overlap", so both rely on a
  counted check inside `create_booking` under
  `pg_advisory_xact_lock(hash(branch:service), hash(starts_at))`. 1:1 bookings —
  the default and the overwhelming majority — ARE a hard DB guarantee.
- **The races are not proved by a true parallel test.** `supabase/tests/09`
  proves the lock keys, the constraint, and the counted arithmetic at every seat
  count, which together imply correctness under serialisation; it cannot execute
  two concurrent backends. There is no service-role key on this machine and no DB
  password for psql, and **`dblink` was tried and rejected**: on this project
  `dblink_connect(text)` is executable by `anon`/`authenticated` and is owned by a
  superuser role, so `postgres` cannot revoke it — installing it would have handed
  the API roles a connection primitive that could not be locked down. **Needs CI
  with a real connection string.**
- **No overnight shifts** (inherited from Phase 2: `end_minute > start_minute`).
  A branch open past midnight needs two rows on consecutive days.
- **A branch with no `branch_hours` rows has NO slots**, silently. `branch_is_bookable()`
  now reports that as `no_branch_hours`, and the settings UI must show the warning
  and not present the booking link as active (user decision, 2026-10-03).
- `appointments.staff_id` is nullable in the schema but the booking RPC always
  resolves one. It stays nullable for a future "no particular staff" business.
- **`normalise_phone_e164` has a 42-country dialling-code table inside
  `create_booking`.** It covers the launch markets but is not exhaustive; a
  national-format number from a country not in the list falls back to "prepend
  nothing", which usually fails validation and returns `invalid_phone`. The real
  fix is the client-side `PhoneInput` always sending E.164 (step 5), which makes
  the table a fallback rather than the primary path.
- **`buffer_minutes` lives on both `booking_settings` (branch default) and
  `services`.** The engine and the RPC agree (service value when > 0, else the
  branch default), but the settings UI must state this plainly or an owner will
  be surprised.

## Changelog

- 2026-10-04: Guest manage page built (Phase 3 step 6, the last piece of
  Phase 3). See `booking-manage.md` for the UI; `booking-public-api.md` for
  the new `get_booking_reschedule_slots` function and `manage_booking`'s
  `get_slots` action this step needed.
- 2026-10-04: Public booking page built (Phase 3 step 5). See
  `booking-public-page.md` for the UI; `booking-public-api.md` for the new
  `get_booking_page` endpoint this step needed.
- 2026-10-03: `create_booking` RPC (one transaction, service_role only) +
  `save_booking_settings` with the people_per_slot downgrade guard +
  `branch_is_bookable()`. 126 assertions.
- 2026-10-03: `include_booked` + the `available` flag, for doc §6.2 `all_greyed`.
- 2026-10-03: **Fixed: a resource with `capacity` > 1 was unusable** — the
  exclusion constraint had no notion of capacity, so the engine offered a slot the
  constraint then refused. Now driven by a generated `resource_is_exclusive`.
- 2026-10-03: **Fixed: `create_booking` discarded answer normalisation** (a
  yes_no "TRUE" was stored unchanged) and did not snapshot the resource capacity.
- 2026-10-03: **Fixed two cascade bugs** that made a business undeletable: the
  form-version immutability trigger refused the cascade, and `touch_form_version`
  tried to create a version for a business already gone.
- 2026-10-03: Slot engine (`get_free_slots`, `pick_staff_for_slot`, `free_slot`
  type), service_role-only. 93 assertions incl. DST in three zones.
- 2026-10-03: clients, appointments, answers, manage tokens; 2 exclusion
  constraints; `has_permission_at_branch_scope` for Own-scope narrowing;
  54 RLS assertions.
- 2026-10-03: Fixed `get_free_slots` assigning the `slot_interval` enum into an
  integer (every call failed 22P02 until then).
