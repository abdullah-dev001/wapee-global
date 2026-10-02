# Schedule
Status: schema done · UI next · Phase: 2 · Last updated: 2026-10-02

## What it does
When people and places are available: recurring weekly hours per staff per branch,
recurring breaks, one-off time off, branch opening hours, and holidays. This is
what the Phase 3 slot engine reads to decide what a customer may book.

## Business rules
- **Recurring hours are weekday + local minutes**, never timestamps.
  `day_of_week` 0–6 (0 = Sunday, matching Postgres `dow` and JS `getDay`), plus
  `start_minute`/`end_minute` from local midnight (540 = 09:00). "Tuesday 9am"
  must stay 9am when the clocks change, which a `timestamptz` cannot promise.
- **Why minutes and not `time`:** Postgres has **no range type over `time`**, and
  the no-overlap guarantee needs one. `int4range` over minutes is exact (nothing
  books sub-minute), GiST-indexable, and makes "no overnight" a plain check.
  `formatMinuteOfDay` / `parseMinuteOfDay` in `lib/time` convert for the UI.
- **No overlapping intervals** for the same staff + branch + weekday, enforced by a
  GiST **exclusion constraint** — not just UI validation. Ranges are half-open
  `[)`, so 09:00–12:00 and 12:00–17:00 are a legal split shift.
- **No overnight shifts**: `end_minute > start_minute`, max 1440. A business open
  past midnight needs a row on each day. Revisit if a real customer needs it.
- **Hours are per staff per branch.** Multi-branch gives each branch its own
  timetable (doc §8.2), and adding the column later would be painful.
- **Time off needs no approval.** Product doc §6.3 lists only "working hours,
  breaks, time off", and the §9 permission catalogue defines no approve-time-off
  permission (`appointments.approve` is about bookings). So it is recorded directly
  by whoever holds `staff.manage_schedule`. **This is a deliberate reading of a
  silent doc** — add a workflow later if wanted.
- Time off is a real instant (`timestamptz`, UTC) with `branch_id` nullable
  (`null` = away from every branch, the usual case). Overlaps are refused.
- Branch closures are **local dates** with an **inclusive** range, so a single day
  has `starts_on = ends_on` and two closures sharing an end day overlap.
- A branch weekday with no `branch_hours` row is closed.

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261002181000_staff_and_schedule.sql | Tables, exclusion constraints, RLS, guards |
| src/lib/time/index.ts | `MinuteOfDay`, `formatMinuteOfDay`, `parseMinuteOfDay`, `formatDuration` |
| src/lib/time/minuteOfDay.test.ts | 12 tests incl. the 24:00 boundary |
| supabase/tests/05_catalogue_and_schedule.sql | pgTAP (see Verification) |

## Database
| Table | Key columns |
|---|---|
| `staff_working_hours` | staff_id, branch_id, day_of_week, start_minute, end_minute |
| `staff_breaks` | same shape + label |
| `staff_time_off` | staff_id, branch_id (nullable), starts_at, ends_at (timestamptz), is_all_day, reason |
| `branch_hours` | branch_id, day_of_week, start_minute, end_minute |
| `branch_closures` | branch_id, starts_on, ends_on (date), name |

Exclusion constraints (5): `staff_working_hours`, `staff_breaks`, `branch_hours`
(int4range over minutes), `staff_time_off` (tstzrange), `branch_closures`
(daterange, inclusive).

### RLS and the Own scope
- Read: `is_member(business_id)` — the calendar needs everyone's hours.
- Write on staff hours / breaks / time off:
  `can(..., 'staff.manage')` **OR** (`can(..., 'staff.manage_schedule')` **AND**
  `is_own_staff_profile(staff_id)`).
  A Staff member's grant is scoped `own`, so `has_permission()` returns true for
  them and **`is_own_staff_profile()` is what limits them to their own rows**. A
  Manager's grant is `branch` and they pass the row check for anybody.
- Branch hours and closures: `settings.business` — they are a property of the
  location, not of a person.

## Data & caching
Not built yet. Planned: `scheduleKeys.staff({businessId, branchId, staffId})`,
staleTime `static`; the slot engine (Phase 3) will read these through its own RPC
rather than the client.

## Permissions & gating
`staff.manage_schedule` (Own for Staff, Branch for Manager, All for Owner) and
`staff.manage`. Branch hours/closures need `settings.business`, which after the
2026-10-02 seed fix is **Owner-only** ([roles.md](roles.md)).

## i18n
Namespace `common`, keys `schedule.*` (added with the UI).

## Verification (2026-10-02)
Against the **live database**, inside rolled-back transactions. Not inferred — each
assertion recorded its own PASS/FAIL row.

**12 constraint assertions, all passing:**
valid 09:00–17:00 shift accepted · overlapping shift refused · adjacent split shift
accepted · same hours on another weekday accepted · zero-length shift refused ·
overnight shift refused · cross-tenant branch refused · overlapping time off
refused · negative price refused · free service accepted · cross-tenant price
refused · overlapping closure refused.

**10 RLS assertions, all passing:**
Staff may set their own hours · cannot set another member's hours · may book their
own time off · cannot book another's · cannot add a staff profile · cannot add a
service · *can* read the team list · cannot set branch hours · Owner may set any
staff member's hours · Owner may set branch hours.

Advisors: security 0 errors, performance 0 warnings.

## Known limits / TODO
- **No UI yet** — weekly hours editor, breaks, time off, branch hours, holidays.
- **`supabase/tests/05_catalogue_and_schedule.sql` has never run as a suite** (no
  Docker), so its `plan(20)` count is unverified even though the assertions were
  checked individually.
- No overnight shifts (see above).
- Breaks are not validated against working hours: a break outside the shift is
  allowed and simply has no effect. The slot engine intersects them anyway, so
  this is cosmetic — worth a UI warning.
- Time off has no approval workflow (deliberate, see Business rules).

## Changelog
- 2026-10-02: Schedule schema: working hours, breaks, time off, branch hours, closures; 5 exclusion constraints; Own-scope RLS; minute-of-day helpers + tests.
