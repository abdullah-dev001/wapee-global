# Staff
Status: schema done · UI next · Phase: 2 · Last updated: 2026-10-02

## What it does
The people who perform services. A staff member is a profile, not necessarily an
app user: a salon can add "Ayesha, does haircuts" with no email and no login.
Also records which branches they work at and which services they perform.

## Business rules
- **A staff member need not have a login.** `staff_profiles.member_id` is
  nullable. Invite them later and the rows link up. Plan limits count **staff**,
  not seats (product doc §10, "Staff per location").
- Removing someone's app account does **not** erase their schedule or history:
  `member_id` is `ON DELETE SET NULL`.
- One staff profile per app account per business (partial unique index).
- `display_name` is independent of the login name, so a clinic can show "Dr. A".
- `is_active` off keeps history but takes no new bookings; `is_bookable_online`
  hides them from the public booking page while still bookable in the dashboard.
- **No per-staff price or duration** (product doc §6.3).
- `staff_branches` exists separately from working hours, so a staff member can be
  assigned to a branch before anyone sets their timetable.
- Soft delete (`deleted_at`).

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261002181000_staff_and_schedule.sql | Tables, RLS, guards, `is_own_staff_profile()` |
| supabase/tests/05_catalogue_and_schedule.sql | pgTAP (see Verification) |

## Database
| Table | Key columns |
|---|---|
| `staff_profiles` | business_id, **member_id (nullable)**, display_name, job_title, email, phone, is_active, is_bookable_online |
| `staff_branches` | staff_id, branch_id (composite PK) |
| `service_staff` | service_id, staff_id (composite PK) |

- RLS: read = `is_member`; write = `can(..., 'staff.manage')`.
- `enforce_staff_branch_tenant` / `enforce_service_staff_tenant` refuse rows whose
  staff, branch and business do not line up.
- **`is_own_staff_profile(staff_id)`** — `SECURITY DEFINER`, `authenticated` only.
  True when the profile belongs to the caller. This is what implements the **Own**
  scope: `has_permission()` can say "you hold this at own scope" but cannot say
  "this row is yours", so the schedule policies combine the two. See
  [schedule.md](schedule.md).

## Data & caching
Not built yet. Planned: `staffKeys.list({businessId, branchId})`, staleTime
`static`.

## Permissions & gating
- `staff.view` to see the team (the nav item uses it).
- `staff.manage` to add, edit or assign.
- `staff.manage_schedule` governs hours and time off — see [schedule.md](schedule.md).
- Editing one's *own* profile is deliberately **not** covered: a "my profile"
  screen is a Phase 4 concern and `staff.manage` should not imply it.

## i18n
Namespace `common`, keys `staff.*` (added with the UI).

## Verification (2026-10-02)
Against the live database, in rolled-back transactions:
- A staff profile with `member_id = null` is accepted (the core requirement).
- **10 RLS assertions** passing, including: a Staff member cannot add a staff
  profile, cannot add a service, cannot set branch hours, but can read the team;
  an Owner can do all of it. Full list in [schedule.md](schedule.md).

## Known limits / TODO
- **No UI yet** — staff list, profile, services offered, branch assignment.
- No link from the invite flow to a staff profile: inviting someone creates a
  `business_member` but no `staff_profile`. Deciding whether that should be
  automatic is a UI-stage question ([members.md](members.md)).
- No avatar/photo (needs the files add-on, Phase 8).

## Changelog
- 2026-10-02: Staff schema: profiles with optional member_id, branch assignment, service assignment, RLS, Own-scope helper.
