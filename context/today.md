# Today
Status: done (Phase 4 part B2) · Phase: 4 · Last updated: 2026-10-05

## What it does
The mobile home screen: today's appointments (branch timezone), in order,
next appointment highlighted, counts (today total, pending approval,
completed), quick status actions (approve/complete/no-show), empty state.
Replaces the Phase 4 placeholder. Reuses the Phase 4 part B1 RPC surface
and UI pieces wholesale — no new backend, no new query hook.

## Business rules
- **"Today" is the BRANCH timezone's today** (`todayInZone(timeZone)`,
  decision 23) — not the device's, same rule every other calendar screen
  follows.
- **Reuses `get_calendar_appointments`** (the SAME query `DayView` uses for
  its one-day grid) rather than a new RPC — a date range of `(today,
  today)` is exactly "today's appointments", already excludes `cancelled`
  rows, and RLS already scopes an Own-scope Staff caller to their own
  appointments. No backend gap found.
- **Quick actions are the SAME mutations the Calendar screen's detail
  drawer uses** (`useApproveAppointment`/`useMarkCompleted`/
  `useMarkNoShow`) — gated by the SAME permissions
  (`appointments.approve`/`.edit`) and still confirmed via a `Dialog`
  before firing, so "quick" means "one tap to open the confirm", not
  "skips the confirm".
- **The next appointment is the earliest `confirmed`/`pending` row whose
  start is still at or after now** — purely a display highlight, not a
  business rule with a server-side meaning.

## Files
| Path | Purpose |
|---|---|
| app/(app)/today.tsx | route: `RouteGuard` + `TodayScreen` |
| src/features/appointments/components/TodayScreen.tsx | the screen |
| src/features/appointments/api/useAppointments.ts | gained `calendarAppointmentToRow()` (exported, pure) — the `CalendarAppointment -> AppointmentRow` padding `DayView` already needed privately, now shared so Today's detail-drawer handoff doesn't duplicate it |

## Data & caching
`useCalendarAppointments(businessId, branchId, today, today)` —
`staleTimes.live`, same key scope as the Calendar screen's Day view.
`useAppointmentsRealtime(businessId, branchId)` is mounted here too (the
same hook Calendar uses), so Today updates live without a pull-to-refresh.
Quick actions invalidate the whole appointments scope, same as every other
appointment mutation.

## Permissions & gating
No permission to VIEW Today (same as the nav item). Pending-approval count
only shows for `appointments.approve` holders. Quick actions:
approve needs `appointments.approve`, complete/no-show need
`appointments.edit` — identical to the Calendar detail drawer's own gating,
re-derived here with `usePermission()` rather than imported, since the
quick-action buttons live in a different row component.

## UI
Counts row (total / pending-approval chip if the caller can approve /
completed), then a list of today's appointments as rows: time, `Avatar`,
client name, service + staff, `StatusBadge`, and the one or two quick
actions that status allows. The next upcoming row is visually highlighted
(primary border + tint). Tapping a row opens the SAME
`AppointmentDetailDrawer` the Calendar screen uses, padded from
`CalendarAppointment` via `calendarAppointmentToRow`. Empty state when
nothing is scheduled today.

## i18n
Reuses the `appointments.*` namespace entirely — no new keys.

## Known limits / TODO
- **Click-tested on the iOS simulator (2026-10-05)**: confirmed by
  screenshot — counts row, empty state, bottom tab bar. The REAL Realtime
  channel-collision bug (see Business rules / `appointments-ui.md`) was
  caught specifically BECAUSE Today mounts `useAppointmentsRealtime`
  alongside Calendar; worth remembering if a third screen ever mounts it
  too. **Not confirmed**: a day with real appointments (no seeded data
  landed on "today" during this session), the quick-action confirm
  dialogs, or tapping a row to open the detail drawer.
- **"Next appointment" highlighting is purely visual** — if two
  appointments tie on start time, both/neither could read as "next"
  depending on array order; not worth a tiebreaker rule for a cosmetic
  highlight.
- **No in-progress visual distinction** — a `confirmed` appointment whose
  time window has already started looks the same as one not yet started;
  doc only asked for "upcoming and in-progress... in order", which the
  time-sorted list already satisfies without a separate visual state.

## Changelog
- 2026-10-05 (UI polish): layout fixes, no behaviour change. The body no
  longer sets `flex: 1` — it sits inside the scrolling `Screen`, where a flex
  child cannot grow and only squeezes its own content — and it uses
  `usePagePadding()` so it lines up with the title on mobile. The gap under
  the counts row came from `PageContainer`'s `flex: 1` (fixed in the shared
  component — see `_foundation.md`).
- 2026-10-05: Built. Counts, ordered list, next-appointment highlight,
  quick actions (approve/complete/no-show) via confirm dialogs, empty
  state, Realtime. Extracted `calendarAppointmentToRow()` from `DayView`
  into the shared API module so Today's detail-drawer handoff reuses it
  instead of a second inline copy.
- 2026-10-06 (Phase 5B): row restructured — the tappable summary and the action buttons are SIBLINGS (no `<button>` in `<button>` on web) and actions sit on their own line, which also stops a 375px phone squeezing the client name out. Completed rows get `AppointmentInvoiceButton` (Create/View invoice).
