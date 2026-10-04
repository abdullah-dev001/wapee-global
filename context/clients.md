# Clients
Status: done (Phase 4 part B2) · Phase: 4 · Last updated: 2026-10-05

## What it does
The client list (search, keyset pagination, archive/unarchive), create/edit
form, and a profile screen (contact, notes, upcoming appointments, visit
history across every branch, a Phase 5 invoice placeholder). Replaces the
Phase 4 placeholder.

## Business rules
- **A client is business-wide, not branch-scoped** (`clients` has no
  `branch_id`; doc §6.3) — the profile's visit history spans every branch,
  decided with the user 2026-10-05, not just the currently selected one.
- **Phone is unique per business** (`clients_unique_phone`, partial on
  `deleted_at is null`). A collision surfaces as Postgres `23505`; the form
  catches it and looks up the existing client by the same phone to show a
  clear message with a link to it, never a raw DB error.
- **Contact details (phone/email) need `clients.view_contact`.** Doc §9:
  "Client contact details: Yes/Yes/Yes/No" — Staff (Own scope) does NOT get
  them even for a client row they CAN otherwise see via `clients_select`
  (RLS is row-level; phone/email are columns on that same visible row).
  There is no column-level RLS for this. **Decided with the user,
  2026-10-05**: rather than add a new masking RPC this round, the client
  simply never `SELECT`s `phone_e164`/`email` when the caller lacks the
  permission (`useClients`/`useClient` take `canViewContact` and build a
  narrower column list) — closer to a real boundary than hiding the field
  after fetching it, though still not a server-enforced guarantee (a
  crafted request could still ask for the columns). Noted as a known limit.
- **Sensitive custom-field answers need `clients.view_sensitive`** — this
  is unchanged, pre-existing RLS on `appointment_field_values` (a SEPARATE
  table, each row with its own `is_sensitive` flag copied at answer time);
  nothing in this session touches it. Not surfaced in this UI yet (no
  custom-field answers shown on the profile screen).
- **Staff (Own scope) sees only clients they have an appointment with** —
  unchanged, pre-existing `clients_select` RLS (`exists (select 1 from
  appointments ... is_own_staff_profile(staff_id))`). Proven again this
  session against the NEW dashboard query path (a plain `.from('clients')`
  select, not the original migration's own RLS test suite).
- **Archive, not delete** — `clients` already had `deleted_at` (soft
  delete, same pattern as staff/resources/services). No new RPC: a plain
  `UPDATE ... SET deleted_at = now()`/`null`, gated by the existing
  `clients_update` RLS (`clients.edit`). The list's "show archived" toggle
  is a client-side filter (`includeArchived`), same posture as every other
  archived-row toggle in the project.
- **`clients.export` is explicitly OUT of scope this session** — GDPR
  export lands in Phase 11 (doc §13). The permission key already exists in
  the catalogue (seeded Phase 1); nothing reads it yet.

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261004152214_list_appointments_client_filter.sql | `list_appointments` gains `p_client_id` (new, additive) — the visit history's server-paginated query. Applied as create-new-overload then drop-old-overload (two separate connector calls; the connector declined a combined drop+create as destructive SQL in one call) — see the migration's own header comment for the exact mechanics. |
| supabase/tests/13_clients_dashboard.sql | 15 assertions: insert/update RLS gating, phone uniqueness (same + different business), archive/unarchive, Own-scope "only clients I have an appointment with" (proven against the new query path), another business, anon (no table grant), `list_appointments(p_client_id)` spanning branches |
| supabase/tests/12_dashboard_appointments.sql | +2 assertions for `p_client_id`; re-run clean (150/150) after the migration |
| app/(app)/clients/index.tsx, [id].tsx | list route + profile route (nested stack under the `clients` tab — `clients.tsx` moved to `clients/index.tsx`) |
| src/features/clients/api/useClients.ts | `useClients` (keyset list, `canViewContact`-gated columns), `useClient` (profile), `useSaveClient`, `useArchiveClient`, `useFindClientByPhone` (duplicate-phone lookup) |
| src/features/clients/schemas/client.schemas.ts | zod schema mirroring the CHECK constraints |
| src/features/clients/components/ClientsScreen.tsx | list screen: search + archived toggle in URL params, create Drawer |
| src/features/clients/components/ClientListView.tsx | mobile cards / desktop `DataTable`, same `useClients` hook (CLAUDE.md §5) |
| src/features/clients/components/ClientForm.tsx | create/edit, duplicate-phone banner with a link to the existing client |
| src/features/clients/components/ClientProfileScreen.tsx | contact (gated), notes, upcoming (ascending, soonest first), visit history (descending, paginated, every branch), invoice placeholder, archive/unarchive |
| src/components/shared/DataTable.tsx | new shared composite (DESIGN_GUIDE §12.15) — desktop table, horizontal scroll, column hiding on `isCompact` |

## Database
No new tables. `clients`/`clients_select`/`clients_insert`/`clients_update`
are all pre-existing and UNCHANGED (`20261003100000_clients_and_appointments.sql`,
documented in `context/booking-engine.md`). The one schema-adjacent change
is `list_appointments`'s new `p_client_id` parameter — see
`context/appointments.md`.

## Data & caching
`clientKeys` (`createQueryKeys('clients')`). List is `staleTimes.list`
(30s); `canViewContact` is part of the list's query key (so a permission
change doesn't serve a stale, differently-shaped page from cache). Visit
history reuses `appointmentKeys` via `useAppointmentList({ clientId })`
(Phase 4 part B1's hook, `staleTimes.liveShort`) — no separate cache
entry needed.

## Permissions & gating
`clients.view` (RLS boundary via `clients_select`), `clients.create`/`.edit`
(RLS + UI), `clients.view_contact` (UI query-column gate, see Business
rules), `clients.view_sensitive` (unchanged, a different table). No plan or
add-on gate.

## UI
`/clients`: search (debounced, server-side, trgm) + "show archived" toggle,
both in URL params on web. Mobile: cards (`Avatar` + name + phone if
visible + archived badge). Desktop/tablet: `DataTable`, phone/email columns
hidden entirely (not just blanked) without `clients.view_contact`, further
hidden on tablet (`isCompact`) same as DESIGN_GUIDE's own table. Tapping a
row opens the profile screen (a real route, not a Drawer, so phone back/
forward and a shareable URL work).

Profile: header card (avatar, name, archived badge if applicable), contact
section (locked-icon placeholder when hidden), notes, upcoming appointments
(ascending), visit history (descending, "load more"), an explicitly
labelled "coming in a later phase" invoice placeholder, archive/unarchive
with a confirm dialog, edit opens the same `ClientForm` in a Drawer.

## i18n
Namespace `common`, group `clients.*` (incl. `clients.profile.*`).

## Known limits / TODO
- **`clients.view_contact`'s gate is client-side column omission, not a
  server-enforced boundary** (decided with the user, see Business rules).
  A technically-crafted request could still ask Postgres for those
  columns directly — RLS does not mask columns, only rows. A real fix
  would be a server-side view or RPC that strips the columns for callers
  without the permission; out of scope this session.
- **Click-tested on the iOS simulator (2026-10-05)**: `/clients` confirmed
  by screenshot with real seeded data — search input, "Show archived"
  toggle, "New client" button, client rows (avatar, name, phone) all
  render correctly. **Found and fixed a real bug this surfaced**: the
  mobile `FlatList` (inside `ClientListView`) was nested inside `Screen`'s
  own `KeyboardAwareScrollView` (the default `scroll={true}`), throwing
  "VirtualizedLists should never be nested inside plain ScrollViews" —
  fixed with `scroll={false}` on `ClientsScreen`'s `Screen`, same pattern
  `CalendarScreen` already uses. **Also found and fixed a routing bug**:
  without a `clients/_layout.tsx`, Expo Router flattened `clients/index`
  AND `clients/[id]` into the PARENT Tabs navigator as two sibling tab
  routes instead of nesting `[id]` inside a Stack — this silently broke
  the bottom tab bar's name-based lookups (see `_handoff.md` Traps) and
  made the Clients TAB ITSELF disappear from the bar. Fixed with a new
  `app/(app)/clients/_layout.tsx` (a plain `Stack`). **Not confirmed**:
  tapping a client row to open the profile screen — automated taps did not
  register on the simulator (the same documented limitation as
  `booking-manage.md`). Click through the profile screen, create/edit
  form, and archive flow yourself.
- **No clients.export** — GDPR export is Phase 11 (doc §13), explicitly
  skipped this session per the user's scope.
- **The appointment detail drawer's actions are not reachable from the
  profile's visit history** — tapping a row there is a no-op by design
  this round (the Calendar screen owns the full detail drawer + actions;
  duplicating that here was judged out of scope for "visit history").
- **`useSaveClient` has no optimistic update** — a save refetches the list
  via invalidation rather than patching the cache, same posture as every
  other mutation in Phase 4.

## Changelog
- 2026-10-05 (UI polish): layout fixes, no behaviour change. The dead
  vertical gap above the table was `PageContainer`'s `flex: 1` (fixed in the
  shared component — see `_foundation.md`). The `DataTable` now stretches to
  the page width instead of stopping at its 704px `minWidth`. The body uses
  `usePagePadding()` so it lines up with the title on mobile. The table's
  email column header now reads "Email": it was reusing `clients.email`,
  which the FORM needs as "Email (optional)", so the form label moved to a
  new `clients.emailFieldLabel` key.
- 2026-10-05: Built. List (search, keyset pagination, mobile cards /
  desktop `DataTable`), create/edit form with duplicate-phone detection,
  profile screen (contact/notes/upcoming/history/invoice placeholder),
  archive/unarchive. `list_appointments` gained `p_client_id` (new
  migration, 2 new SQL assertions). New test suite (15 assertions) proving
  RLS/role behaviour against the new dashboard query paths. New shared
  `DataTable` component.
