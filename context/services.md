# Services (catalogue)
Status: schema done · UI next · Phase: 2 · Last updated: 2026-10-02

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
Not built yet — hooks land with the UI. Planned: `serviceKeys.list({businessId, branchId})`,
staleTime `static` (services change rarely), invalidated by any service mutation.

## Permissions & gating
`services.manage` for every write. Reading needs only membership, because the
booking flow and the calendar both need the catalogue.

## i18n
Namespace `common`, keys `services.*` (added with the UI).

## Verification (2026-10-02)
Run against the live database inside rolled-back transactions:
- **12 constraint assertions**, all passing — valid service, duration floor,
  duplicate name (case-insensitive), free price allowed, negative price refused,
  cross-tenant price refused, plus the schedule ones in [schedule.md](schedule.md).
- Advisors: security **0 errors**, performance **0 warnings** (only "unused index"
  INFO, expected on empty tables).

## Known limits / TODO
- **No UI yet** — list, create/edit, category management, resources.
- `service_resources` is stored but nothing reads it until the Phase 3 slot engine.
- The services list will need server-side pagination once catalogues grow
  (CLAUDE.md §6); a `pg_trgm` index on `name` is already in place for search.

## Changelog
- 2026-10-02: Catalogue schema: categories, services, per-branch prices, resources, RLS, tenant guard, FK indexes.
