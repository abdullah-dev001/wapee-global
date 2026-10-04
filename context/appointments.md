# Dashboard appointments (backend)
Status: backend done · UI done, see [appointments-ui.md](appointments-ui.md) · Phase: 4 · Last updated: 2026-10-05

## What it does
The authenticated, permission-checked write and read path for appointments
from the dashboard: book, walk-in, reschedule, cancel, no-show, complete,
approve, reopen, list (paginated, filtered, searched), and a calendar-range
query. The public guest-facing path (`create_booking`, `manage_booking`) is
untouched and unrelated; this is the staff-facing path, callable by
`authenticated` through `can()`/scope checks. The UI built on top of this
(Calendar screen, Day/Week/List, drawers) is documented separately in
[appointments-ui.md](appointments-ui.md) to keep each file focused.

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
  `check_appointment_collision_v2()`, runs the SAME exclusion-aware overlap
  query `reschedule_booking` already uses (staff double-booking, group
  capacity, resource capacity), skipping the hours/notice/window EXISTENCE
  checks entirely. The DB exclusion constraint is still the hard backstop
  either way.
- **Status transitions are defined in ONE place**:
  `appointment_status_transitions` (a table) +
  `is_allowed_appointment_transition(from, to)`. Allowed:
  `pending→confirmed` (approve), `pending→cancelled`, `confirmed→cancelled`,
  `confirmed→completed`, `confirmed→no_show`, and **`no_show→confirmed` /
  `completed→confirmed`** (the reopen decision below). **`cancelled` is
  PERMANENTLY FINAL — no row, no path, ever.**
- **Reopen (decided with the user, 2026-10-05): `no_show`/`completed` may be
  moved back to `confirmed`, but ONLY by Owner or Manager, ONLY when
  `invoice_id is null`, and it is audit-logged.** `reopen_appointment()` is
  the only RPC that can do this. It checks the caller's **role key directly**
  (`r.key in ('owner','manager')`) rather than a permission — `appointments.edit`
  at Branch scope is ALSO Receptionist's (doc §9), and the user's decision
  explicitly excludes Receptionist, which no existing permission expresses.
  This is the first and only RPC in the project that checks a role name
  instead of a permission; it is a deliberate, narrow exception for
  reopening a finished record, not a pattern to copy elsewhere.
  **`approve_appointment` deliberately does NOT use
  `is_allowed_appointment_transition(status, 'confirmed')`** — that table
  also allows the reopen transitions, so a generic check would have made
  `approve_appointment` a side door into reopening a no_show/completed
  appointment without the Owner/Manager-only check or the `invoice_id`
  guard. (This exact gap was introduced and then caught and fixed inside
  this same closure round — see Changelog.) `approve_appointment` checks
  `status = 'pending'` directly instead.
- **Staff creating/editing an appointment for THEMSELVES (Own scope) has
  `staff_id` FORCED to their own staff profile** (`my_staff_profile_id()`),
  not merely validated if supplied. Passing no id, or someone else's id, is
  silently overridden to the caller's own — there is exactly one legitimate
  choice for an Own-scope caller, so there is nothing to ask permission for.
  Booking someone else requires Branch/All scope. `appointments.cancel` and
  `appointments.approve` are **not** granted to Staff at all (doc §9), so a
  Staff member cannot cancel or approve anything, including their own —
  and `reopen_appointment` excludes them too (Owner/Manager only).
- **Walk-in is just `booking_source = 'walk_in'`** on an otherwise normal
  appointment (agreed with the user 2026-10-05) — no special fields, no
  different validation, no notifications (Phase 6). It exists for
  reporting/filtering later.
- **Validate everything, mutate once** (CLAUDE.md §10a) in every write RPC.
  `update_appointment`'s collision check excludes its own row
  (`p_exclude_appointment_id`), the same fix `reschedule_booking` needed
  after its original bug. None of the seven write RPCs here ever mutates
  before every check has passed.
- **These RPCs raise freely on a genuinely unexpected error** (unlike the
  public RPCs) — there is no rate-limit counter here to roll back. An
  EXPECTED failure (forbidden, invalid_transition, slot_unavailable) is
  still `{ok:false,code}`, never a raised Postgres error.
- **The Phase 5 invoice seam**: `appointments.invoice_id`, nullable, no FK
  yet. A completed appointment is never automatically unlocked to attach an
  invoice; Phase 5 writes the column directly. `reopen_appointment` reads
  this column as its guard: once invoiced, not reopenable by anyone.

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261004042720_phase4_appointments_schema.sql | `invoice_id`, `appointment_status_transitions` table + `is_allowed_appointment_transition()`, Realtime publication |
| supabase/migrations/20261004042940_phase4_appointment_rpcs.sql | `check_appointment_collision_v2()` (final form), `create_appointment` (final form, forces Own-scope staff_id, stores resource_id) |
| supabase/migrations/20261004043110_phase4_update_appointment.sql | `update_appointment` (final form, stores resource_id) |
| supabase/migrations/20261004043134_phase4_status_rpcs.sql | `cancel_appointment`, `mark_no_show`, `mark_completed`, `approve_appointment` (final form: pending-only, not a reopen side door) |
| supabase/migrations/20261004043313_phase4_read_rpcs.sql | `list_appointments` (keyset pagination), `get_calendar_appointments` |
| supabase/migrations/20261004044911_phase4_reopen_and_own_staff_fix.sql | `reopen_appointment`, `my_staff_profile_id()`, the reopen transitions |
| supabase/migrations/20261004045723_fix_dashboard_resource_id_not_stored.sql | `appointment_collision_result` composite type + `check_appointment_collision_v2` (the REAL bug fix — see Changelog) |
| supabase/migrations/20261004043628, 20261004045004, 20261004045754, 20261004045817, 20261004045901 | Historical no-op placeholders: these timestamps are real entries in the remote migration-history table (from intermediate `apply_migration` calls this session), folded into the FINAL function bodies in the files above rather than replayed as separate changes. Local files are kept at current content; see each placeholder's own comment. |
| supabase/tests/12_dashboard_appointments.sql | 141 assertions |

No app code in this file's scope — see [appointments-ui.md](appointments-ui.md) for the Calendar screen and drawers built on top of this RPC surface.

## Database

### Why SECURITY DEFINER, not INVOKER (the write RPCs)
`create_appointment`, `update_appointment`, `cancel_appointment`,
`mark_no_show`, `mark_completed`, `approve_appointment`, `reopen_appointment`
are all **DEFINER** with an explicit `can()`/role check as the actual
boundary — same posture as `resend_manage_link`:
1. They write `audit_logs` via `write_audit_log()`, DEFINER-only with
   EXECUTE revoked from `authenticated` entirely.
2. The collision check must see every OTHER appointment at that instant
   regardless of the caller's own row-level grants.

`list_appointments` and `get_calendar_appointments` are **INVOKER** — RLS's
existing Own/Branch/All scoping on `appointments_select` is the boundary.
`check_appointment_collision_v2` is INVOKER too (`service_role`-only
EXECUTE, called from inside the DEFINER functions).

### Functions
- **`check_appointment_collision_v2(branch, service, staff, starts_at,
  ends_at, buffer, people_per_slot, use_resources, exclude_appointment_id?)
  → appointment_collision_result`** (composite: `code`, `resource_id`,
  `resource_capacity`) — the shared collision-only check. Replaces
  `check_appointment_collision` (kept, deprecated, unused — see Changelog):
  the old version only returned a pass/fail code and never told the caller
  WHICH resource it had resolved, so no dashboard appointment ever got
  `resource_id` stored. `service_role` only.
- **`create_appointment(branch, service, starts_at, staff?, client_id?,
  client_name?, client_phone?, client_email?, client_notes?,
  internal_notes?, source default 'dashboard', auto_confirm default true) →
  jsonb`** — dashboard booking/walk-in. An Own-scope-only caller has
  `staff_id` FORCED to `my_staff_profile_id()`. `staff = null` (Branch/All
  caller) uses the SAME least-loaded "Any staff" rule as `create_booking`.
  Stores the resolved `resource_id` + `resource_capacity_at_booking`. Codes:
  `forbidden`, `not_found`, `unknown_service`, `service_unavailable`,
  `unknown_client`, `invalid_name`, `invalid_phone`, `invalid_email`,
  `staff_unavailable`, `no_staff`, `slot_unavailable`, `slot_taken`,
  `no_resource`.
- **`update_appointment(appointment_id, starts_at?, staff_id?,
  client_notes?, internal_notes?, clear_client_notes default false,
  clear_internal_notes default false) → jsonb`** — `null` means "leave
  unchanged"; the `clear_*` flags exist because of that. Same-time-and-staff
  is a notes-only edit (skips the collision path). Stores `resource_id` on
  a reschedule too. Codes additionally include `not_editable` (terminal
  row).
- **`cancel_appointment(appointment_id, reason?)`**,
  **`mark_no_show(appointment_id)`**, **`mark_completed(appointment_id)`** —
  gated by `is_allowed_appointment_transition()`.
- **`approve_appointment(appointment_id)`** — gated by `status = 'pending'`
  DIRECTLY, not the transitions table (see Business rules: avoiding the
  reopen side door).
- **`reopen_appointment(appointment_id) → jsonb`** — `no_show`/`completed`
  → `confirmed`. Owner/Manager role check (not a permission). Refuses with
  `invoiced` if `invoice_id is not null`. Audit action
  `appointment.reopened`.
- **`my_staff_profile_id(business_id) → uuid`** — the caller's own
  `staff_profiles` row in that business, or null. Used to FORCE `staff_id`
  for an Own-scope caller rather than merely validate it.
- **`is_allowed_appointment_transition(from, to) → boolean`** — reads
  `appointment_status_transitions`. `select` granted to `authenticated` AND
  `anon` (read-only reference data).
- **`list_appointments(...)`**, **`get_calendar_appointments(...)`** —
  unchanged from the first pass; see the SQL for full signatures.

### Realtime
`appointments` is in the `supabase_realtime` publication. Supabase's
`postgres_changes` applies the subscriber's own RLS policies to each change
event for an authenticated client, so **`appointments_select` (Own/Branch/
All) is the only access boundary** — nothing extra was built. Subscribe
with:

```ts
supabase
  .channel('appointments-changes')
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'appointments',
    filter: `business_id=eq.${businessId}`,
  }, handler)
  .subscribe();
```

A Staff member (Own scope) only ever RECEIVES events for rows RLS lets them
see, regardless of the `filter` — the filter narrows the WAL subscription
for efficiency; RLS decides visibility. Invalidate/refetch
`list_appointments`/`get_calendar_appointments` on an event rather than
patching the cache from the payload (CLAUDE.md §6).

**Proved with a live subscription, not just argued (2026-10-05).**
`set_config` JWT fixtures (the SQL suite's usual trick) cannot subscribe to
a Realtime channel — it needs a live, signed JWT. Proved with three REAL
signed-in `supabase-js` clients against the deployed project: Owner A
(business A), Owner B (a DIFFERENT business), and Staff X (a Staff member
on business A, Own scope, with a second staff profile on the SAME business
with no login — "someone else's" appointment from Staff X's point of
view). All three subscribed with no `filter`, to prove RLS alone does the
work. Owner A created two appointments on business A: one for Staff X
themselves, one for the other staff profile.

Result:
- **Owner B (another business) received ZERO events.**
- **Staff X received exactly ONE event — their own appointment** — the one
  for the other staff profile on the SAME business never arrived, proving
  `is_own_staff_profile` narrowing applies to the Realtime stream exactly
  as it does to an ordinary `select`.
- Owner A (Branch/All, own business) received both, as expected.

The throwaway script and its test businesses/users were deleted after the
run; nothing from this proof is left in the database.

### Migration history
All local filenames now match the REAL remote `supabase_migrations` history
exactly — `supabase migration list` reports 56/56 matched, zero mismatches,
confirmed 2026-10-05. **No `supabase migration repair` was needed or run.**
The mismatch this closure round found and fixed: `apply_migration` assigns
each migration its OWN timestamp based on when it actually runs, which does
not match whatever timestamp prefix the local filename happens to use.
Every Phase 4 file (and two Phase 3 files from the previous session) had
drifted for this reason. Fixed by renaming local files to the real remote
timestamps (confirmed with the user before doing it — pure `mv`, zero
database changes). See Changelog and `context/_handoff.md`'s Traps.

## Data & caching
Not wired here — see [appointments-ui.md](appointments-ui.md) for query
keys, staleTimes and the Realtime invalidation built on this RPC surface.

## Permissions & gating
`appointments.view`/`.create`/`.edit`/`.cancel`/`.approve`, each Own/Branch/
All per doc §9's matrix. `reopen_appointment` is gated by ROLE (Owner/
Manager), not a permission — see Business rules. No plan or add-on gate.

## UI
See [appointments-ui.md](appointments-ui.md) — Calendar screen (Day/Week/
List), create/detail drawers, the new shared scheduler.

## i18n
See [appointments-ui.md](appointments-ui.md).

## Known limits / TODO
- **`list_appointments`'s search is a plain `ilike`** via the existing trgm
  index.
- **No bulk operations** — one appointment per call, matching every other
  write RPC in the project.
- **True concurrent-backend proof is still out of reach on this machine**
  (no service-role key, no DB password, `dblink` rejected). The collision
  tests here prove the same three things `09_booking_concurrency.sql`
  proves for the public path: correct lock keys, the exclusion constraint
  as backstop, correct-at-every-count arithmetic under the lock.
- **The old `check_appointment_collision` (pre-v2) is kept, unused,
  deprecated by comment.** `DROP FUNCTION` is refused by the migration
  tooling available this session; harmless (no grants, not called from
  anywhere) but a candidate for real removal once the tooling allows it.

## Changelog
- 2026-10-05 (Phase 4 part B1): UI built on this RPC surface — see
  [appointments-ui.md](appointments-ui.md). Pre-check confirmed (no fix
  needed): the dashboard resource_id bug from the closure round below was
  specific to the dashboard RPCs and does not affect `create_booking`/
  `reschedule_booking` (public path), which already assert the stored
  column in `08_create_booking.sql`/`11_guest_manage_link.sql`.
- 2026-10-05 (closure round): Implemented the user's decisions (b) reopen
  (`reopen_appointment`, Owner/Manager role check, `invoice_id` guard,
  audited) and (c) staff_id FORCED for Own-scope `create_appointment`
  (`my_staff_profile_id`). **Found and fixed a real bug while adding the
  evidence this round asked for**: `create_appointment`/`update_appointment`
  never stored `resource_id` on the row at all, so the "how many bookings
  use this resource" count was always zero and a capacity-1 resource could
  be double-booked from the dashboard without ever being refused — caught
  only because the new resource-capacity test asserted the actual column
  value, not just the return code. Fixed with `check_appointment_collision_v2`
  (returns the resolved resource id) and both RPCs now storing it +
  `resource_capacity_at_booking`. Also found and fixed, mid-round, a second
  gap the reopen feature itself introduced: `approve_appointment` briefly
  became a side door into reopening a no_show/completed appointment,
  because it checked the transitions table generically instead of
  `status = 'pending'` directly — fixed before it was ever exposed to a
  real caller. Added Karachi (no-DST) coverage, group+resource capacity
  coverage on both create and update, audit_logs assertions for every
  write RPC, and reopen allowed/forbidden coverage. 141 SQL assertions (was
  103). Proved Realtime RLS with three live signed-in clients (see
  Realtime). Reconciled all migration filenames with the real remote
  history — 56/56 matched, no `migration repair` needed.
- 2026-10-05 (first pass): Built. Schema (`invoice_id` seam, status-
  transition table), the original `create_appointment`/`update_appointment`/
  status RPCs, `list_appointments`, `get_calendar_appointments`, Realtime
  publication. 103 SQL assertions. Backend only — no app code.
