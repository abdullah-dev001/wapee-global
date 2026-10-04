# Dashboard appointments (backend)
Status: backend done (Phase 4 part A) · no UI yet · Phase: 4 · Last updated: 2026-10-05

## What it does
The authenticated, permission-checked write and read path for appointments
from the dashboard: book, walk-in, reschedule, cancel, no-show, complete,
approve, list (paginated, filtered, searched), and a calendar-range query.
This is **backend only** — no screens. The public guest-facing path
(`create_booking`, `manage_booking`) is untouched and unrelated; this is the
staff-facing path, callable by `authenticated` through `can()`/scope checks.

## Business rules
- **Staff may book/reschedule OUTSIDE working hours and ignoring minimum
  notice / the booking window** (doc §6.2: "staff can book out of hours in
  dashboard"), but can **never** double-book a staff member, violate resource
  capacity, or violate `people_per_slot` — those three are DB guarantees/
  counted checks and apply unconditionally to every write path, public or
  dashboard.
- **`get_free_slots()` is NOT reused here** — it cannot be. Its branch/staff
  hours joins are structural (no row exists outside hours, with or without
  any flag), so it cannot express "ignore hours". A shared helper,
  `check_appointment_collision()`, runs the SAME exclusion-aware overlap
  query `reschedule_booking` already uses (staff double-booking, group
  capacity, resource capacity), skipping the hours/notice/window EXISTENCE
  checks entirely. The DB exclusion constraint is still the hard backstop
  either way.
- **Status transitions are defined in ONE place**:
  `appointment_status_transitions` (a table) +
  `is_allowed_appointment_transition(from, to)`. Allowed:
  `pending→confirmed` (approve), `pending→cancelled`, `confirmed→cancelled`,
  `confirmed→completed`, `confirmed→no_show`. **`cancelled`/`completed`/
  `no_show` are PERMANENTLY TERMINAL — no reopen, ever** (agreed with the
  user 2026-10-05). A mistake is fixed by creating a new appointment, never
  by reopening a finished one — same posture as credit notes/reversal rows
  for money. `update_appointment` also refuses ANY edit (even just a note) on
  a terminal row.
- **Staff may create/edit appointments for THEMSELVES at Own scope**
  (`appointments.create`/`.edit` are Own-scope for the Staff role, doc §9).
  Booking or rescheading someone else's appointment needs Branch/All scope.
  `appointments.cancel` and `appointments.approve` are **not** granted to
  Staff at all (doc §9), so a Staff member cannot cancel or approve anything,
  including their own.
- **Walk-in is just `booking_source = 'walk_in'`** on an otherwise normal
  appointment (agreed with the user 2026-10-05) — no special fields, no
  different validation. It exists for reporting/filtering later.
- **Validate everything, mutate once** (CLAUDE.md §10a) in every write RPC.
  `update_appointment`'s collision check excludes its own row
  (`p_exclude_appointment_id`), the same fix `reschedule_booking` needed
  after its original bug (freeing the slot before validating, so every
  failure path left the booking cancelled). None of the six RPCs here ever
  mutates before every check has passed.
- **These RPCs raise freely on a genuinely unexpected error** (unlike the
  public RPCs) — there is no rate-limit counter here to roll back. An
  EXPECTED failure (forbidden, invalid_transition, slot_unavailable) is
  still `{ok:false,code}`, never a raised Postgres error, so the UI has one
  shape to translate everywhere.
- **The Phase 5 invoice seam**: `appointments.invoice_id`, nullable, no FK
  yet (decided with the user 2026-10-05 — Phase 5 adds the FK once
  `invoices` exists). A completed appointment is never automatically
  unlocked or reopened to attach an invoice; Phase 5 writes the column
  directly.

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261005110000_phase4_appointments_schema.sql | `invoice_id`, `appointment_status_transitions` table + `is_allowed_appointment_transition()`, Realtime publication |
| supabase/migrations/20261005120000_phase4_appointment_rpcs.sql | `check_appointment_collision()` (shared helper), `create_appointment` |
| supabase/migrations/20261005130000_phase4_update_appointment.sql | `update_appointment` (notes-only edit or full reschedule) |
| supabase/migrations/20261005140000_phase4_status_rpcs.sql | `cancel_appointment`, `mark_no_show`, `mark_completed`, `approve_appointment` |
| supabase/migrations/20261005150000_phase4_read_rpcs.sql | `list_appointments` (keyset pagination), `get_calendar_appointments` |
| supabase/tests/12_dashboard_appointments.sql | 103 assertions |

No app code yet — no hooks, no screens. Next session builds those against
this exact RPC surface.

## Database

### Why SECURITY DEFINER, not INVOKER (the write RPCs)
`create_appointment`, `update_appointment`, `cancel_appointment`,
`mark_no_show`, `mark_completed`, `approve_appointment` are all **DEFINER**
with an explicit `can()` + `has_permission_at_branch_scope()`/
`is_own_staff_profile()` check as the actual boundary — same posture as
`resend_manage_link`, for the same two reasons:
1. They write `audit_logs` via `write_audit_log()`, which is DEFINER-only
   with EXECUTE **revoked from `authenticated` entirely** — an INVOKER
   function cannot reach it.
2. The collision check must see every OTHER appointment at that instant
   regardless of the caller's own row-level grants (an Own-scope Staff
   member's RLS visibility does not cover the row they would collide with).

`list_appointments` and `get_calendar_appointments` are **INVOKER** — pure
reads, and RLS's existing Own/Branch/All scoping on `appointments_select`
(verified in `supabase/tests/07`) is already the correct boundary; there is
no reason to bypass it here, and bypassing it would mean re-deriving the
scope rule instead of trusting the one the policies already enforce.
`check_appointment_collision` is INVOKER too (`service_role`-only EXECUTE,
called from inside the DEFINER functions, same pattern as `get_free_slots`
being callable from `create_booking` despite its own grant).

### Functions
- **`check_appointment_collision(branch, service, staff, starts_at, ends_at,
  buffer, people_per_slot, use_resources, exclude_appointment_id?) → text`** —
  the shared collision-only check. Returns `null` | `slot_unavailable` |
  `slot_taken` | `no_resource`. `service_role` only.
- **`create_appointment(branch, service, starts_at, staff?, client_id?,
  client_name?, client_phone?, client_email?, client_notes?,
  internal_notes?, source default 'dashboard', auto_confirm default true) →
  jsonb`** — dashboard booking/walk-in. Exactly one of `client_id` /
  `client_name`+`client_phone` should be given. `staff = null` uses the SAME
  least-loaded "Any staff" rule as `create_booking`
  (`pick_staff_for_slot`). Codes: `forbidden`, `not_found`, `unknown_service`,
  `service_unavailable`, `unknown_client`, `invalid_name`, `invalid_phone`,
  `invalid_email`, `staff_unavailable`, `no_staff`, `slot_unavailable`,
  `slot_taken`, `no_resource`.
- **`update_appointment(appointment_id, starts_at?, staff_id?,
  client_notes?, internal_notes?, clear_client_notes default false,
  clear_internal_notes default false) → jsonb`** — `null` on a field means
  "leave unchanged"; the two `clear_*` flags exist because `null` already
  means that. Same-time-and-staff is a notes-only edit (skips the whole
  collision path). Codes additionally include `not_editable` (terminal row).
- **`cancel_appointment(appointment_id, reason?)`**,
  **`mark_no_show(appointment_id)`**, **`mark_completed(appointment_id)`**,
  **`approve_appointment(appointment_id)`** — one status change each, all
  gated by `is_allowed_appointment_transition()`. Code `invalid_transition`
  on any disallowed change (including every terminal-row attempt).
- **`is_allowed_appointment_transition(from, to) → boolean`** — reads
  `appointment_status_transitions`, the one place the rule lives. `select`
  granted to `authenticated` AND `anon` (read-only reference data, same
  posture as `permissions`), so the UI can know which buttons apply without
  a round trip through an RPC.
- **`list_appointments(business_id, branch_id?, staff_id?, status?,
  service_id?, from_date?, to_date?, search?, limit default 20,
  cursor_starts_at?, cursor_id?) → jsonb`** — keyset pagination on
  `(starts_at desc, id desc)`, fixed sort (keeps the cursor shape simple).
  `search` matches `clients.full_name`/`phone_e164` via the existing trgm
  index, case-insensitive substring — debounce/min-length is the CALLER's
  job (CLAUDE.md §6), this just runs the query. Returns
  `{rows: [...], next_cursor: {starts_at, id} | null}`.
- **`get_calendar_appointments(business_id, branch_id, from_date, to_date,
  staff_ids?) → jsonb`** — day boundaries computed in the **branch's own
  timezone**, not UTC (`p_from_date::timestamp at time zone v_tz` — the same
  "naive local timestamp + zone" pattern the slot engine uses). Cancelled
  appointments are excluded. Returns `{timezone, rows: [...]}`.

### Realtime
`appointments` is in the `supabase_realtime` publication (added in
`20261005110000`). Supabase's `postgres_changes` applies the subscriber's
own RLS policies to each change event for an authenticated client, so
**`appointments_select` (Own/Branch/All) is the only access boundary** —
nothing extra was built. The next session's UI should subscribe with:

```ts
supabase
  .channel('appointments-changes')
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'appointments',
    filter: `business_id=eq.${businessId}`,
  }, handler)
  .subscribe();
```

A Staff member (Own scope) will still only ever RECEIVE events for rows RLS
lets them see, regardless of the `filter` — the filter narrows the Postgres
WAL subscription for efficiency, RLS is what actually decides visibility.
Invalidate/refetch `list_appointments`/`get_calendar_appointments` on an
event rather than trying to patch the cache from the payload (CLAUDE.md §6:
"Realtime updates/invalidates the cache; it never replaces the query").

### Migrations
See Files above, in order. `appointments.invoice_id` has no FK yet
(Phase 5 adds `appointments_invoice_id_fkey references invoices(id)`).

## Data & caching
Not wired yet — no app code. When built: `list_appointments` is `live`/
`liveShort` staleTime (CLAUDE.md §6: "today/calendar" class of data) plus
the Realtime invalidation above; `get_calendar_appointments` the same.

## Permissions & gating
`appointments.view`/`.create`/`.edit`/`.cancel`/`.approve`, each Own/Branch/
All per doc §9's matrix (Staff: Own on view/create/edit only; Receptionist/
Manager/Owner: Branch/All on all five). No plan or add-on gate — appointments
are core.

## UI
Not built. Next session's scope.

## i18n
Not wired yet.

## Known limits / TODO
- **No UI yet** — this session was backend-only by design (user's scope).
- **`list_appointments`'s search is a plain `ilike`**, not the dedicated
  trgm-backed search pattern some other lists might want tuned further; it
  reuses the existing `clients_name_trgm_idx` as-is.
- **No bulk operations** (e.g. cancel a whole day) — one appointment per
  call, matching every other write RPC in the project.
- **True concurrent-backend proof is still out of reach on this machine**
  (no service-role key, no DB password, `dblink` rejected — see
  `context/booking-engine.md`). The collision-check tests here prove the
  same three things `09_booking_concurrency.sql` proves for the public path:
  correct lock keys, the exclusion constraint as backstop, and
  correct-at-every-count arithmetic under the lock.

## Changelog
- 2026-10-05: Built. Schema (`invoice_id` seam, status-transition table),
  `check_appointment_collision` shared helper, `create_appointment`,
  `update_appointment`, the four status RPCs, `list_appointments`,
  `get_calendar_appointments`, Realtime publication. 103 SQL assertions.
  Backend only — no app code.
