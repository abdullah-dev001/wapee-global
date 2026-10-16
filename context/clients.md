# Clients
Status: done (Phase 4 part B2) · Phase: 4 · Last updated: 2026-10-16

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
- **Contact details (phone/email) need `clients.view_contact`, enforced by the DATABASE (Phase 11A).**
  `authenticated` has no privilege on `clients.phone_e164` / `email`; the app reads
  `clients_v` (also `notes`), which returns them only for callers holding the permission in that
  business and NULL for everyone else (Staff Own scope, custom roles without it).
  Row visibility is unchanged (`clients_select`; the view carries the same rule,
  suite 31 keeps them equal). Phone search is closed to blocked roles too (the view
  matches nothing). `list_appointments.client_phone` follows the same rule. See `gdpr.md`.
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
| src/features/clients/api/useClients.ts | `useClients` (keyset list over `clients_v`), `useClient` (profile), `useSaveClient`, `useArchiveClient`, `useFindClientByPhone` (duplicate-phone lookup) |
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
(RLS + UI), `clients.view_contact` (database column lock via `clients_v`, see Business
rules), `clients.export` / `clients.erase` (GDPR, `gdpr.md`), `clients.view_sensitive` (unchanged, a different table). No plan or
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
- 2026-10-16: Profile shows **Booking form answers** per visit (`ClientAnswersSection`, `useClientAnswers`: 20 visits a page, keyset, newest first; labels from each answer's own form version; RLS decides visibility incl. sensitive). New `clientErrorKey()` (23505 duplicate phone, 42501 forbidden, 23514/23502/22001 invalid input, else unknown) on the list, form and profile; api rethrows the original Postgrest error. i18n `clients.errors.forbidden/invalidInput/unknown`.
- 2026-10-20: `contactLinks.ts` (tel / wa.me digits-only / mailto / display format / `contactState`); `useClient` takes `{enabled}`.
- 2026-10-07: Phase 11B: `notes` is blanked by `clients_v` without `clients.view_contact`; the edit form for a caller without it shows the name only and sends only the name.
- 2026-10-07: Phase 11A: contact lock is a database boundary (`clients_v`), profile gets Export data / Erase personal data (`gdpr.md`), list reads indexed `(business_id, full_name, id)`.
- 2026-10-07: Phase 10B: the profile shows Files and photos (consent, gallery, upload) and Forms (sign here, send link, signed copies, void) sections while the add-ons are on.
- 2026-10-07: Phase 10A: the profile shows a Packages section (`ClientPackagesSection`: balance, state, expiry) when the add-on is on and the member holds a packages permission.
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
- 2026-10-09: the profile's Invoices section is real: `features/invoices/components/ClientInvoicesSection` (number, date, total in the invoice's own currency, payment state; `useInvoiceList({clientId})`, 20 per page + load more; row opens `InvoiceDrawer`; hidden without `invoices.view`; empty + error states). Replaces the "coming soon" placeholder.
