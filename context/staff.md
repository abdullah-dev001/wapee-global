# Staff
Status: done (Phase 2 scope + login link) + Feature 10 audit · Phase: 2 · Last updated: 2026-10-15

## What it does
The people who perform services. A staff member is a profile, not necessarily an
app user: a salon can add "Ayesha, does haircuts" with no email and no login.
Also records which branches they work at and which services they perform.

## Business rules
- **A staff member need not have a login.** `staff_profiles.member_id` is
  nullable. A login is linked through `link_staff_member` (Staff form "App login"
  field), at invite time (`invite_member(..., p_staff_id)`), or for the signed-in
  Owner with "Add me as staff" (`add_me_as_staff`). The column is closed to direct
  writes by a guard trigger, and a removed member releases its profile. Plan limits count **staff**,
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
| src/features/staff/staffLogin.ts | Login picker options (members not taken by another profile) + link error keys |
| supabase/migrations/20261022090000_staff_member_link.sql | `link_staff_member`, `add_me_as_staff`, `invite_member` + staff, guard + release triggers |
| supabase/tests/37_staff_member_link.sql | 57 assertions (link rules, guard, invite -> accept, add-me, own scope, push recipients) |
| supabase/migrations/20261024120000_archive_staff.sql | `staff_archive_blockers`, `archive_staff` RPC (mirrors `archive_branch`) |
| src/features/staff/staffLogin.ts | Also: `archiveErrorKey`, `staffErrorKey` (generic fallback) |

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
- Creating a staff profile still does not invite anyone (most staff need no login);
  the owner invites from Members and may pick the profile there, or picks an
  existing member in the staff form.
- No reordering (`sort_order` exists but nothing sets it).
- `useSaveStaff` is not atomic (confirmed again this round, not fixed — see
  below; recoverable, does not corrupt anything).
- No avatar/photo (needs the files add-on, Phase 8).
- A staff member with zero assigned services/staff shows no badge calling that
  out (unlike "no working hours"); not fixed — not asked for, and the slot
  engine already makes them unbookable by construction.
- Breaks outside a person's working hours are silently accepted and have no
  effect (confirmed live again this round) — a pre-existing, documented,
  cosmetic limitation in [schedule.md](schedule.md), not fixed here.

## Feature 10 audit (2026-10-15)
Full trace of create/edit/archive for staff profiles, the login link, working
hours/breaks/time off/branch hours/closures/resources, the slot engine's DST
handling, and the Calendar's staff-column visibility. Verified LIVE against
dev inside rolled-back transactions; no data left behind.

**Confirmed correct, no bug:**
- `useSaveStaff`'s rollback-the-new-profile-on-cap-refusal logic (so a staff
  cap rejection never leaves an active profile assigned to no branch).
- The slot engine's DST handling: a shift stored as "9:00–17:00 local" resolves
  to the correct UTC instant on both sides of the November 2026 fall-back
  (13:00 UTC before, 14:00 UTC after — the correct 1-hour shift), proven live
  with a real staff fixture.
- Breaks correctly block their exact interval in `get_free_slots` (11:45–12:45
  unavailable around a 12:00–13:00 lunch break on a 30-minute service) and
  resume cleanly outside it.
- The overnight-shift CHECK and the overlap exclusion constraint both still
  refuse as documented.
- `is_active` already correctly blocks a NEW booking or reschedule onto that
  person (`create_appointment`/`update_appointment`); it never touches an
  EXISTING appointment's own `staff_id`.

**Three real bugs found and fixed**, all in the "never silently orphan a
booking" area the brief asked about directly:
1. **Deactivating a staff member hid their existing future appointments from
   the Calendar Day/Week grid entirely.** `DayView` fetched staff with
   `includeInactive: false`, so an inactive person got no column at all — any
   appointment still pointing at them (never deleted, never touched) became
   unreachable on that view, while still showing correctly in the List view's
   filter (which already used `includeInactive: true`). Fixed: `DayView` now
   includes an inactive staff member's column on any day they still have an
   appointment, labelled "(Inactive)" so it is never mistaken for someone
   still bookable.
2. **There was no refusal at all for archiving a staff member with future
   appointments** — only a bare `update staff_profiles set deleted_at = ...`,
   RLS as the sole boundary, unlike `archive_branch`/`branch_archive_blockers`
   for a branch. Fixed with the same shape: `staff_archive_blockers` +
   `archive_staff` RPC (migration `20261024120000`), refusing with a count
   when the person has a future pending/confirmed appointment. Verified live
   (`not_found`/`forbidden` paths over a real call; the blocker function
   itself proven with a real future-appointment fixture).
3. **Saving reduced hours or new time off had no idea existing future
   appointments existed at all** — decided with the user: warn with a count
   and let the owner proceed (nothing is actually lost; a schedule edit is
   common, unlike archiving). New read-only `staff_schedule_conflicts` /
   `staff_time_off_conflicts` (same migration), called by
   `StaffScheduleEditor`/`TimeOffList` right before saving; a `Dialog` shows
   the count and the save only proceeds on confirmation. Proven live with a
   real future appointment: hours that exclude its time count 1 conflict,
   hours that include it count 0, a covering time-off range counts 1, a
   non-overlapping one counts 0.

**A fourth real bug, found while building #3's time-off check:**
`TimeOffList`'s "whole day(s) off" save built `starts_at`/`ends_at` as
`${date}T00:00:00.000Z` — **UTC** midnight of the chosen local date, not the
BRANCH's local midnight. For `America/New_York` this is 4–5 hours off in both
directions: the stored range started 4–5 hours into the previous calendar day
and ended 4–5 hours before the actual end of the last day off. **Proven live**:
the old literal range did NOT cover 23:30 local time on the intended day off;
the fix does. Fixed with the already-existing, already-DST-tested
`dayRangeUtc()` helper (`lib/time`) instead of raw string concatenation — no
new helper needed, this one case had just never used it.

Also fixed, matching this task's explicit ask: the same raw-server-error-text
pattern as Feature 9, across the ENTIRE schedule feature (staff hours, breaks,
time off, branch hours, closures, resources) and the remaining spots in
staff's own save/delete/list paths — `scheduleErrorKey()` /
`staffErrorKey()`/`archiveErrorKey()` (same reason-code pattern as
`serviceErrorKey`), `.code` preserved on every throw. Two screens
(`BranchHoursEditor`, `ClosuresList`) had NO error state at all for their list
queries — a failed load either stuck on the loading skeleton forever or looked
exactly like "nothing here yet," with no retry; both now show `ErrorState`.
Three delete confirmations (time off, closure, resource) had no `onError`
handler wired at all; all three now do.

Suite 05 re-verified (23/23); suite 16's two new assertions from Feature 9
still pass; suite 37 (staff/login link) re-verified unaffected (57/57); suite
12 (dashboard appointments) re-verified unaffected (153/153). `npm run
check:migrations` 157/157 from empty (was 155). 6 new unit tests
(`scheduleErrorKey.test.ts`); 848/848 full suite, tsc/lint clean. Not applied
to prod.

## Changelog
- 2026-10-15: Feature 10 audit — see "Feature 10 audit" above for the full list.
- 2026-10-22: Saving a profile whose login link is refused now throws `StaffLinkError` (profile id + reason). The form shows "Profile saved. Login not linked." with the reason, keeps editing THAT profile (retry updates instead of creating a duplicate) and resets the login picker to No login. Verified in a browser for edit and create.
- 2026-10-22: Login <-> profile link: "App login" field in the staff form, login name in the list, "Add me as staff" button (Owner/Manager without a profile), invite form picks an unlinked profile. Verified on dev over HTTP as dev.manager / dev.staff: unlinked staff sees 0 appointments, linked sees only its own (1 of 3), push recipients include them for their bookings only.
- 2026-10-20: row badge "No working hours set — no online slots" + "Set working hours" button in the edit panel (`staffHours.ts`); list query now embeds `staff_working_hours(branch_id)`.
- 2026-10-02: Staff UI: list with no-login badge, create/edit drawer, branch and service assignment, soft delete, schedule drawer.
- 2026-10-02: Staff schema: profiles with optional member_id, branch assignment, service assignment, RLS, Own-scope helper.
