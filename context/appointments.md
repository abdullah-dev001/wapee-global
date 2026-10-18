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
- **The invoice link (Phase 5A, live)**: `appointments.invoice_id` now has a real FK and is written ONLY by the invoice RPCs (`create_invoice_draft` sets it, `discard_invoice_draft` clears it; guard trigger refuses any other write). See [invoices.md](invoices.md). `reopen_appointment` reads
  this column as its guard: once invoiced, not reopenable by anyone.

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261004042720_phase4_appointments_schema.sql | `invoice_id`, `appointment_status_transitions` table + `is_allowed_appointment_transition()` (it once added `appointments` to the Realtime publication; removed 2026-10-09) |
| supabase/migrations/20261004042940_phase4_appointment_rpcs.sql | `check_appointment_collision_v2()` (final form), `create_appointment` (final form, forces Own-scope staff_id, stores resource_id) |
| supabase/migrations/20261004043110_phase4_update_appointment.sql | `update_appointment` (final form, stores resource_id) |
| supabase/migrations/20261004043134_phase4_status_rpcs.sql | `cancel_appointment`, `mark_no_show`, `mark_completed`, `approve_appointment` (final form: pending-only, not a reopen side door) |
| supabase/migrations/20261004043313_phase4_read_rpcs.sql | `list_appointments` (keyset pagination), `get_calendar_appointments` |
| supabase/migrations/20261004044911_phase4_reopen_and_own_staff_fix.sql | `reopen_appointment`, `my_staff_profile_id()`, the reopen transitions |
| supabase/migrations/20261004045723_fix_dashboard_resource_id_not_stored.sql | `appointment_collision_result` composite type + `check_appointment_collision_v2` (the REAL bug fix — see Changelog) |
| supabase/migrations/20261004043628, 20261004045004, 20261004045754, 20261004045817, 20261004045901 | Historical no-op placeholders: these timestamps are real entries in the remote migration-history table (from intermediate `apply_migration` calls this session), folded into the FINAL function bodies in the files above rather than replayed as separate changes. Local files are kept at current content; see each placeholder's own comment. |
| supabase/migrations/20261004143401_is_owner_or_manager.sql | `is_owner_or_manager(business_id, branch_id?)` (new) + `reopen_appointment` refactored to call it instead of its own inline query (Phase 4 part B1 fix 1 — see Changelog) |
| supabase/tests/12_dashboard_appointments.sql | 171 assertions (2026-10-16) |

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
  → `confirmed`. Owner/Manager role check (not a permission), via
  `is_owner_or_manager()` (below). Refuses with `invoiced` if `invoice_id
  is not null`. Audit action `appointment.reopened`.
- **`is_owner_or_manager(business_id, branch_id default null) → boolean`**
  (new, 2026-10-05, Phase 4 part B1 fix 1) — the single source of truth for
  "is this caller Owner or Manager", extracted from `reopen_appointment`'s
  own inline query so the RPC and the UI's Reopen button can never drift
  apart. `branch_id null` asks "anywhere" (what the UI wants when deciding
  whether to show the button at all, before it knows one appointment's
  branch); `reopen_appointment` passes the specific appointment's branch.
  `STABLE`, `SECURITY DEFINER`, `authenticated` only.
- **`my_staff_profile_id(business_id) → uuid`** — the caller's own
  `staff_profiles` row in that business, or null. Used to FORCE `staff_id`
  for an Own-scope caller rather than merely validate it.
- **`is_allowed_appointment_transition(from, to) → boolean`** — reads
  `appointment_status_transitions`. `select` granted to `authenticated` AND
  `anon` (read-only reference data).
- **`list_appointments(...)`** — gained `p_client_id` (2026-10-05, Phase 4
  part B2, for the client profile's visit history — see
  `context/clients.md`); every other filter unchanged from the first pass.
  **`get_calendar_appointments(...)`** — unchanged from the first pass.
  See the SQL for full signatures.

### Freshness (no Realtime)
The product uses NO Realtime (owner decision 2026-10-09; migration `20261019100000_remove_realtime.sql` removed `appointments` from the `supabase_realtime` publication). The dashboard stays fresh through TanStack Query: refetch on window focus / reconnect, a 30 s `refetchInterval` on Today and Calendar only while focused and visible (`useLiveRefetchInterval`), and manual refresh. Visibility of rows is decided by `appointments_select` / the RPCs (Own/Branch/All) on every fetch.

## Data & caching
Not wired here — see [appointments-ui.md](appointments-ui.md) for query
keys, staleTimes and the refetching built on this RPC surface.

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
- 2026-10-18: F11 fix (QA run): `mark_no_show` returns `{ok:false, code:'not_started'}` before the appointment's start, checked before the write (`20261025140000`). `mark_completed` is unchanged (completing early stays allowed). Suite 47 (9/9; 5 failures before); suite 12's no-show fixture now starts in the past (171/171).
- 2026-10-18: F9 fix (QA run): a refused dashboard booking no longer creates the new client (or fills an existing client's empty name/email). `create_appointment` only LOOKS UP the client during validation; the client insert/update now sits in the same begin/exception block as the appointment insert (`20261025120000`). Suite 46 (17/17; 5 failures before the migration). Open: `create_booking` (public) still inserts the client before its insert block, so a lost race on the exclusion constraint can leave a client row (rare).
- 2026-10-16: No RPC change. The dashboard UI now calls `update_appointment` (Reschedule, see appointments-ui.md). Suite 12 gained the reschedule cases the UI relies on (171/171, was 153): a time change queues exactly one client `rescheduled` outbox row, a staff-only move queues none, a staff member without the service is refused (`staff_unavailable`) with the row exactly unchanged, a move into the branch buffer is refused and the next start after it is allowed, a pending appointment stays pending, Own-scope staff can move but not hand over their own appointment.
- 2026-10-08 (Phase 6A): an AFTER INSERT/UPDATE trigger on `appointments` queues client and staff notifications for create / approve / cancel / reschedule (walk-ins excluded); `scheduled_at` column added. RPC behaviour unchanged. See [notifications.md](notifications.md).
- 2026-10-07 (Phase 7A): `mark_completed` now also creates the review request in the same transaction and returns `review_request:{token,expires_at}` once (only when new). Nothing else changed. See [website-reviews-widget.md](website-reviews-widget.md).
- 2026-10-05 (Phase 4 part B2): `list_appointments` gained `p_client_id`
  for the Clients feature's profile screen (see
  [clients.md](clients.md)) — the client profile's "visit history" needed
  server-paginated past appointments for one client, a real gap (asked the
  user before adding it). Applied as two connector calls (create the new
  12-arg overload, then drop the old 11-arg one) because the connector
  declined a combined drop+create as destructive SQL, and because a
  PL/pgSQL caller with a named-but-unqualified call (the test suite) got
  `function ... is not unique` while both overloads briefly existed — see
  the migration file's own header for the exact mechanics. 2 new SQL
  assertions (150 total, was 148): one client's visit history spans every
  branch (decided with the user: clients are business-wide).
- 2026-10-05 (Phase 4 part B1 fix 1): Added `is_owner_or_manager()` and
  refactored `reopen_appointment` to call it instead of its own inline
  role query — same behaviour, now deduplicated against the UI's Reopen
  button check (see [appointments-ui.md](appointments-ui.md)). 7 new SQL
  assertions (148 total, was 141): agrees with every role the existing
  reopen tests already covered, plus another business and anon (cases a
  working reopen call never exercises on its own).
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
