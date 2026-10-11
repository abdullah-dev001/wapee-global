# Services (catalogue)
Status: done (Phase 2 scope) · Phase: 2 · Last updated: 2026-10-02

## What it does
What a business sells: optional categories, services with a duration, and a price
per branch. Also rooms/chairs/bays (resources) and which service needs which
resource — stored now, consumed by the slot engine in Phase 3.

## Business rules
- **Categories are optional.** `services.category_id` is nullable; the UI groups
  the uncategorised ones. Deleting a category leaves its services (`SET NULL`).
- **Duration is per service**, 5–1440 minutes. Product doc §6.3 rules out
  staff-specific duration and price, so there is no per-staff override.
- **Price is per branch**, in `service_branches.price_minor` (integer minor
  units). Currency is **never stored** here: it comes from `branches.currency`,
  which is locked once the branch has invoices (decision 23). Product doc §8.2
  lists multi-branch as "own hours, staff, **prices**, currency, timezone", so a
  price without a branch would have no currency.
- **A free service (price 0) is allowed**; a negative price is refused.
- `service_branches.enabled = false` means this branch does not offer the service.
- Service names are unique per business, case-insensitively, among live rows.
- `buffer_minutes` is clean-up time after the service, on top of the global
  booking buffer (Phase 3).
- `is_active` off hides a service from new bookings but keeps its history.
- Soft delete everywhere (`deleted_at`).

## Files
| Path | Purpose |
|---|---|
| supabase/migrations/20261002180000_catalogue.sql | Tables, RLS, tenant guard |
| supabase/migrations/20261002182000_catalogue_fk_indexes.sql | FK indexes the advisor flagged |
| supabase/tests/05_catalogue_and_schedule.sql | pgTAP (see Verification) |
| app/(app)/services.tsx | List screen + create/edit drawer + delete dialog |
| src/features/services/api/useServices.ts | `useServices`, `useServiceCategories`, `useSaveService`, `useDeleteService`, `useCreateCategory` |
| src/features/services/components/ServiceForm.tsx | Create/edit form |
| src/features/services/components/ServiceList.tsx | Rows grouped by category |
| src/features/services/schemas/service.schemas.ts | zod; limits mirror the DB CHECKs |

## Database
| Table | Key columns |
|---|---|
| `service_categories` | business_id, name, sort_order |
| `services` | business_id, category_id (nullable), name, duration_minutes, buffer_minutes, is_active, is_bookable_online |
| `service_branches` | service_id, branch_id, business_id, **price_minor**, enabled — unique on (service, branch) |
| `resources` | business_id, branch_id, name, capacity, is_active |
| `service_resources` | service_id, resource_id (composite PK) |

- RLS: read = `is_member(business_id)`; write = `can(..., 'services.manage')`.
  `service_branches` and `resources` check the permission **at their branch**, so a
  branch-scoped manager can only price their own branch.
- Policies are split per action (never `FOR ALL`), so a read evaluates one policy.
- `enforce_service_branch_tenant` refuses a price row whose service and branch
  belong to different businesses.

## Data & caching
- `serviceKeys.list({ businessId, branchId, search, filters })`, staleTime
  `static` (5 min) — a catalogue changes rarely.
- `categoryKeys.list({ businessId })`, staleTime `static`.
- Any service mutation invalidates `serviceKeys.scope({ businessId })`; saving
  staff on a service also invalidates the staff queries and vice versa.
- **Search is server-side** (`ilike`, backed by the `pg_trgm` index), debounced
  300 ms with a 2-character minimum by `SearchInput` (CLAUDE.md §6).
- The price row is embedded and matched to the current branch in the mapper, so a
  service with no row there reads as "no price" rather than as free.

### Save is two writes, not an RPC
`useSaveService` writes `services`, then upserts `service_branches`, then replaces
`service_staff`. **Not atomic**: if the price write fails the service still exists.
That is recoverable (edit it again) and corrupts nothing, but a single RPC would be
tidier — worth doing when the invoice work needs similar multi-table writes.

## Permissions & gating
`services.manage` for every write. Reading needs only membership, because the
booking flow and the calendar both need the catalogue.

## UI
- One card list grouped by category, **uncategorised last**. Same screen on mobile
  and desktop; create/edit is a `Drawer` (480 px desktop, full-screen sheet mobile).
- Price uses `MoneyInput`, which stores integer minor units and takes the currency
  from the **branch**.
- Delete is a soft delete behind a `Dialog` that says history is kept.
- Hidden/not-online services carry a `Badge`.

## i18n
Namespace `common`, keys `services.*`. `services.minutes` uses i18next plurals.

## Verification (2026-10-02)
Run against the live database inside rolled-back transactions:
- **12 constraint assertions**, all passing — valid service, duration floor,
  duplicate name (case-insensitive), free price allowed, negative price refused,
  cross-tenant price refused, plus the schedule ones in [schedule.md](schedule.md).
- **7 client-path assertions through the real REST API** as a signed-in owner:
  category created · service created · price stored as minor units · **upsert twice
  updates one row rather than duplicating** · the exact embedded SELECT the hook
  runs returns category + branch-matched price + staff · server-side search matches
  and excludes correctly · a soft-deleted service disappears from the list.
- Advisors: security **0 errors**, performance **0 warnings** (only "unused index"
  INFO, expected on empty tables).

## Known limits / TODO
- **No category management screen** — a category can be created from the DB or by
  the `useCreateCategory` hook, but there is no UI to rename or delete one.
- **No resources UI yet** (Part 5 of Phase 2 covers branch settings; resources are
  listed there).
- `useSaveService` is not atomic (see above).
- `service_resources` is stored but nothing reads it until the Phase 3 slot engine.
- The services list will need server-side pagination once catalogues grow
  (CLAUDE.md §6); a `pg_trgm` index on `name` is already in place for search.

## Changelog
- 2026-10-02: Services UI: list grouped by category, create/edit drawer, soft delete, server-side search. New shared components (MoneyInput, SearchInput, TimePicker, DayHoursRow, DateRangePicker) and the money helpers they need.
- 2026-10-02: Catalogue schema: categories, services, per-branch prices, resources, RLS, tenant guard, FK indexes.
