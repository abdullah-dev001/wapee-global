# Staff
Status: done (Phase 2 scope) · Phase: 2 · Last updated: 2026-10-02

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
| app/(app)/staff.tsx | List + create/edit drawer + schedule drawer + remove dialog |
| src/features/staff/api/useStaff.ts | `useStaff`, `useSaveStaff`, `useDeleteStaff` |
| src/features/staff/components/StaffForm.tsx | Create/edit, branch and service assignment |
| src/features/staff/components/StaffList.tsx | Rows with status badges |
| src/features/staff/schemas/staff.schemas.ts | zod; limits mirror the DB CHECKs |

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
- `staffKeys.list({ businessId, branchId, search, filters })`, staleTime `static`.
- `useSaveStaff` replaces the branch and service links wholesale rather than
  diffing them: both are plain joins with no history, so replacing is simpler and
  cannot leave a half-updated set. It also invalidates the service queries,
  because a service's staff list changed too.
- **Branch filtering happens in JS**, not on the server: a team is tens of rows
  and the branch list arrives in the same round trip, while a server-side join
  would hide staff who have no branch assigned yet.
- `useSaveStaff` is **not atomic** (profile, then branches, then services). A
  failure part-way leaves a recoverable state, not a corrupt one; an RPC would be
  tidier.

## Permissions & gating
- `staff.view` to see the team (the nav item uses it).
- `staff.manage` to add, edit or assign.
- `staff.manage_schedule` governs hours and time off — see [schedule.md](schedule.md).
- Editing one's *own* profile is deliberately **not** covered: a "my profile"
  screen is a Phase 4 concern and `staff.manage` should not imply it.

## UI
- Card list with a **"No app access" badge** when `member_id` is null, so an owner
  can see at a glance who can actually open the app.
- Create/edit in a `Drawer`; a second drawer opens that person's weekly schedule
  ([schedule.md](schedule.md)).
- The schedule button appears for anyone with `staff.manage_schedule`, which is
  wider than editing the profile, because Staff may edit their **own** hours.
- The email field is labelled as a contact detail and says explicitly that it does
  not create a login.
- Remove is a soft delete behind a `Dialog` that says history is kept.

## i18n
Namespace `common`, keys `staff.*`.

## Verification (2026-10-02)
Against the live database, in rolled-back transactions:
- A staff profile with `member_id = null` is accepted (the core requirement).
- **10 RLS assertions** passing, including: a Staff member cannot add a staff
  profile, cannot add a service, cannot set branch hours, but can read the team;
  an Owner can do all of it. Full list in [schedule.md](schedule.md).
- **8 client-path assertions through the real REST API** as a signed-in owner:
  staff created with `member_id` null · branch assigned · a split shift plus a
  second day saved through the delete-then-insert path · **an overlapping shift
  refused (23P01)** · **an overnight shift refused (23514)** · the exact SELECT the
  schedule hook runs returns the rows in order · time off booked · overlapping
  time off refused.

## Known limits / TODO
- **Inviting someone does not create a staff profile**, and creating a staff
  profile does not invite them — they are separate on purpose (most staff need no
  login), but there is no "give this person app access" button linking the two.
  Worth adding: it is the obvious next question an owner asks.
- No reordering (`sort_order` exists but nothing sets it).
- `useSaveStaff` is not atomic (see above).
- No avatar/photo (needs the files add-on, Phase 8).

## Changelog
- 2026-10-20: row badge "No working hours set — no online slots" + "Set working hours" button in the edit panel (`staffHours.ts`); list query now embeds `staff_working_hours(branch_id)`.
- 2026-10-02: Staff UI: list with no-login badge, create/edit drawer, branch and service assignment, soft delete, schedule drawer.
- 2026-10-02: Staff schema: profiles with optional member_id, branch assignment, service assignment, RLS, Own-scope helper.
