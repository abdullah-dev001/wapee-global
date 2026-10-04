# Dashboard appointments — UI
Status: done (Phase 4 part B1, fixed in B2) · Phase: 4 · Last updated: 2026-10-05

The Today screen (`context/today.md`) reuses this file's hooks/components
directly: `useCalendarAppointments`, `useAppointmentsRealtime`,
`AppointmentDetailDrawer`, `StatusBadge`, `Avatar`. The one addition made
FOR Today, `calendarAppointmentToRow()` (exported from `useAppointments.ts`),
is also now used by `DayView` instead of its own private copy.

## What it does
The Calendar screen (Day/Week/List) and the appointment create/detail
drawers — everything the dashboard's RPC surface (`context/appointments.md`)
is called from. Reads/writes go through that RPC surface only; this file
documents the UI layer on top of it.

## Business rules
- **No drag-and-drop** (doc §6.3 — deliberate, do not add).
- **UI hiding is never the boundary** (CLAUDE.md §7): every action button is
  filtered by `usePermission()` AND the RPC re-checks itself. **`reopen`'s
  button calls `is_owner_or_manager(business_id, branch_id)` directly**
  (fixed 2026-10-05 — a new tiny RPC, the SAME function `reopen_appointment`
  now calls internally instead of its own inline role query, so the two can
  never drift apart; see `context/appointments.md`). The previous
  `usePermission('staff.manage')` stand-in was correct only by coincidence
  (that permission happens to be held by exactly Owner+Manager) and is gone.
- **Day/Week shading uses per-staff working hours, breaks and time off**
  (fixed 2026-10-05, `useDayShading` + the pure `buildDayShading` —
  `src/features/appointments/dayShading.ts`, 9 tests), falling back to
  branch hours only for a staff member with no individual hours configured
  for that weekday. Previously every column showed identical branch-only
  shading regardless of who was actually available.
- **Own-scope staff see one locked column, no switcher.** Decided by
  `calendar.view_all_staff`: holders get the staff switcher (mobile) /
  every column (tablet/desktop); non-holders (Staff) are locked to their own
  column via `useMyStaffProfile` (mirrors `my_staff_profile_id()`, the same
  RPC the backend uses to FORCE their `staff_id` — this is UI-only, the RPC
  enforces the real rule either way).
- **Week view is a 7-day strip + the Day grid**, not a full staff×day
  matrix (asked the user, 2026-10-05: much simpler, still literally "one
  column per staff" per doc §6.3, far less horizontal-scroll burden on
  mobile).
- **Closing a dirty create form confirms first**, on the close button, the
  scrim tap AND Android hardware back (`Drawer`'s existing
  `useOverlayDismiss` routes all three through one `onClose` callback — no
  new back-handling needed, just a dirty check before deciding what
  `onClose` does).
- **Out-of-hours is a warning, never a block** (doc §6.2: staff can book
  outside hours in the dashboard) — shown in the create form by comparing
  the chosen slot to `useStaffSchedule`/`useBranchSchedule`, purely
  advisory; the RPC enforces nothing based on it.

## Files
| Path | Purpose |
|---|---|
| app/(app)/calendar.tsx | route: `RouteGuard` + `CalendarScreen` |
| src/features/appointments/api/useAppointments.ts | all 8 RPCs wrapped: `list_appointments` (`useInfiniteQuery`, keyset), `get_calendar_appointments`, create/update/cancel/no_show/complete/approve/reopen mutations, `appointmentKeys` |
| src/features/appointments/api/useAppointmentsRealtime.ts | the app's FIRST Realtime subscription — see Data & caching |
| src/features/appointments/api/useMyStaffProfile.ts | wraps `my_staff_profile_id()` for the UI's own-column lock |
| src/features/appointments/api/useClientSearch.ts | minimal client search (name/phone) for the create form — gated the same as `clients_select` RLS, not a Clients feature |
| src/features/appointments/api/usePendingApprovalCount.ts | count of `status='pending'` rows for the approval badge |
| src/features/appointments/api/useIsOwnerOrManager.ts | (2026-10-05) wraps `is_owner_or_manager()` — the Reopen button's real check, not a permission stand-in |
| src/features/appointments/api/useDayShading.ts | (2026-10-05) per-staff working hours/breaks/time off for the Day/Week grid — one round trip for every staff member at the branch |
| src/features/appointments/dayShading.ts | (2026-10-05) pure `buildDayShading` the hook above calls — time-off instant-range clamping, 9 tests |
| src/features/appointments/types.ts | `AppointmentRow`, `AppointmentRpcError`, error codes |
| src/features/appointments/statusActions.ts | pure status→action mapping mirroring `appointment_status_transitions` (21 tests) |
| src/features/appointments/timeGrid.ts | pure time-grid maths: minute↔px, overlap column layout (sweep line), now-line minute (15 tests) |
| src/features/appointments/schemas/createAppointment.schemas.ts | zod schema for the create/walk-in form |
| src/features/appointments/components/CalendarScreen.tsx | Day/Week/List tabs (+ list filters) in URL params; create Drawer with unsaved-changes confirm; detail Drawer |
| src/features/appointments/components/DayView.tsx | one `StaffColumnsGrid` for one date |
| src/features/appointments/components/WeekView.tsx | 7-day strip + `DayView` |
| src/features/appointments/components/CreateAppointmentForm.tsx | client search/new, service, staff, date/time, notes, walk-in toggle, out-of-hours warning |
| src/features/appointments/components/AppointmentDetailDrawer.tsx | fields, `StatusBadge`, status+permission-filtered actions, confirm dialogs |
| src/features/appointments/components/AppointmentListView.tsx | `FlatList` + keyset `onEndReached`, pull-to-refresh |
| src/features/appointments/components/AppointmentListFilterBar.tsx | status/staff/service `Select`s + `SearchInput` |
| src/features/appointments/components/DateNavButton.tsx | icon-only prev/next button — see Known limits |
| src/components/shared/scheduler/StaffDayColumn.tsx, HourRuler.tsx, StaffColumnsGrid.tsx | new shared scheduler: hour ruler + N staff columns, shaded hours, current-time line, blocks laid out by `timeGrid.ts` |
| src/components/shared/StatusBadge.tsx, Avatar.tsx | new shared composites |
| src/lib/time/index.ts | **implemented** this session (was skeleton): `zonedToUtc`/`utcToZoned`/`dayRangeUtc` (DST-safe, date-fns-tz), `formatDate`/`formatTime`/`formatDateTime`, `formatRelative`, `nowUtc`, `addMinutesUtc`, `getDeviceTimeZone`, `isValidTimeZone` |

## Data & caching
`appointmentKeys` (`createQueryKeys('appointments')`), scoped by business +
branch. `list_appointments`/`get_calendar_appointments` use
`staleTimes.live`/`liveShort`. `useAppointmentsRealtime(businessId,
branchId)` subscribes to `appointments` (`business_id` filter narrows the
WAL subscription only — RLS is the real boundary, see
`context/appointments.md`), invalidates `appointmentKeys.scope()` on every
event, re-subscribes on business/branch change. `usePendingApprovalCount`
has its own key, `liveShort`. `useDayShading` (per-staff hours/breaks/time
off, see Business rules) is `staleTimes.static`. Mutations invalidate the
whole appointments scope (no precise per-row `setQueryData` — acceptable
since Realtime already re-invalidates).

**Confirmed (2026-10-05, not a fix — traced and verified, no gap found):
the Realtime subscription is torn down on logout and cleared on both
logout and branch switch.** `useAppointmentsRealtime`'s `useEffect` cleanup
calls `removeChannel` whenever `businessId`/`branchId` change OR the
component unmounts. On sign-out, `SessionProvider`'s `onAuthStateChange`
handler calls `queryClient.clear()` AND flips session state to null in the
same synchronous event; `AuthGate` reads that same state and renders
`<Redirect href="/login">` instead of `children` in the very next render,
which unmounts `CalendarScreen` (and therefore this hook) in that same
commit — there is no window where a live channel event could invalidate
into an already-cleared cache while still mounted. On branch switch, the
`branchId` dependency alone re-runs the effect (old channel removed, new
one opened) without needing an unmount at all.

## Permissions & gating
`appointments.view`/`.create`/`.edit`/`.cancel`/`.approve` via
`usePermission()`. `calendar.view_all_staff` gates the staff switcher/extra
columns. **`reopen`'s button uses `is_owner_or_manager()` directly** (fixed
2026-10-05 — see Business rules), the SAME function `reopen_appointment`
calls internally, not a permission stand-in. Pending-approval badge:
`appointments.approve` only.

## UI
`/calendar`: Day / Week / List tabs, state in URL params on web
(`useLocalSearchParams`/`setParams`). "+ New appointment" (gated on
`appointments.create`) and tap-an-empty-slot both open the create `Drawer`,
pre-filled when opened from a slot. Tap an appointment opens
`AppointmentDetailDrawer`. Pending-approval count shows as a tab badge
(mobile, `BottomTabBar`) and a header chip (tablet/desktop, `Header`) — both
built this session, see `_foundation.md`.

**Day**: `StaffColumnsGrid` — hour ruler + one `StaffDayColumn` per staff,
shaded closed hours, current-time line (today only), overlap-aware block
layout. Mobile: one column + a staff `Select` (hidden for Own-scope). Tablet/
desktop: every visible column, horizontal scroll if they overflow.

**Week**: a locale-aware 7-day strip above the same Day grid for the
selected day.

**List**: filter bar (status/staff/service/search) above a paginated
`FlatList` (pull-to-refresh, skeleton/empty/error states).

## i18n
Namespace `common`, group `appointments.*`.

## Known limits / TODO
- **Click-tested on the iOS simulator (2026-10-05, Phase 4 part B2
  session)**: launched the installed dev build against a fresh Metro
  bundle, signed in as a real Owner. Confirmed by screenshot: Today
  (counts, empty state), Calendar Day view (Day/Week/List tabs, date nav,
  per-staff shaded closed hours visible, "New appointment" button). Found
  and fixed two REAL bugs this surfaced (see Traps in `_handoff.md`): (1)
  `useAppointmentsRealtime` subscribed to a channel named only by
  `businessId`, so Today and Calendar (both always mounted under the Tabs
  navigator) collided on the SAME channel name and the second `.on()` call
  threw, blanking the screen — fixed with a per-mount sequence number in
  the channel name. (2) Could not tap through to a client's profile screen
  — automated taps (AppleScript `click at`, then a compiled CGEvent tap
  tool) did not register on the correct element, the same class of
  simulator-interaction limitation documented in `booking-manage.md` from
  an earlier session. Click through creating/editing an appointment and
  the reschedule/cancel flows yourself.
- **`DateNavButton` is a third private copy** of the icon-only button shape
  `Header.tsx` and `DayHoursRow.tsx` already have. Unifying all three into
  `ui/` is a reasonable follow-up, not done here (would touch existing
  files, out of scope).
- **Mutations invalidate the whole scope**, not precise per-row
  `setQueryData` — fine given Realtime already re-invalidates.

## Changelog
- 2026-10-05 (Phase 4 part B2): Extracted `calendarAppointmentToRow()` out
  of `DayView` (was a private helper) into `useAppointments.ts`, exported,
  so the new Today screen (`context/today.md`) can reuse the SAME
  `CalendarAppointment -> AppointmentRow` padding instead of a second
  inline copy.
- 2026-10-05 (B1 fixes, same day): (1) Reopen button now calls the real
  `is_owner_or_manager()` RPC instead of the `staff.manage` permission
  stand-in — see `context/appointments.md` for the new function and the
  `reopen_appointment` refactor. (2) Day/Week shading now reads per-staff
  working hours, breaks and time off (`useDayShading`/`buildDayShading`),
  not branch hours only. (3) Confirmed, not fixed: the Realtime subscription
  already tears down on logout (via the unmount that follows
  `AuthGate`'s redirect in the same render as `queryClient.clear()`) and on
  branch switch (the effect's own dependency array) — see Data & caching.
  148 SQL assertions (was 141; 7 new for `is_owner_or_manager`), 9 new unit
  tests (250 total).
- 2026-10-05: Built. Calendar screen (Day/Week/List), create and detail
  drawers, the new shared scheduler, `StatusBadge`/`Avatar`, the app's first
  Realtime subscription, pending-approval badges (tab + header), and
  `lib/time`'s DST-sensitive helpers (were skeletons). Pre-check confirmed
  (no fix needed): the dashboard resource_id bug from the earlier closure
  round was specific to the dashboard RPCs and does not affect
  `create_booking`/`reschedule_booking` (public path), which already assert
  the stored column in `08_create_booking.sql`/`11_guest_manage_link.sql`.
  35 new unit tests (241 total).
