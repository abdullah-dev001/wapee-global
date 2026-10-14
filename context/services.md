# Services (catalogue)
Status: done (Phase 2 scope) + Feature 9 audit · Phase: 2 · Last updated: 2026-10-14

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
| supabase/migrations/20261024110000_website_services_bookable_online.sql | Fix: `get_website_public` now also filters `is_bookable_online` |
| supabase/tests/05_catalogue_and_schedule.sql | pgTAP (see Verification) |
| supabase/tests/16_website_reviews_widget.sql | Plain-SQL suite; 2 new assertions for the website fix above |
| app/(app)/services.tsx | List screen + create/edit drawer + delete dialog + "Categories" header action |
| src/features/services/api/useServices.ts | `useServices`, `useServiceCategories`, `useSaveService`, `useDeleteService`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory` |
| src/features/services/components/ServiceForm.tsx | Create/edit form |
| src/features/services/components/ServiceList.tsx | Rows grouped by category |
| src/features/services/components/CategoriesDrawer.tsx | NEW: create / rename / delete categories |
| src/features/services/schemas/service.schemas.ts | zod; limits mirror the DB CHECKs |
| src/features/services/serviceErrorKey.ts | NEW: `serviceErrorKey()` / `categoryErrorKey()` — maps Postgrest `.code` to i18n keys |

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
- A "Categories" button next to "Add service" opens `CategoriesDrawer`: create
  (name + inline add row), rename (`Dialog` with one `Input`), delete (`Dialog`,
  no "in use" refusal — services simply move to Uncategorised). Permission-gated
  the same as the rest of the screen (`canManage.allowed`).

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
- **No resources UI yet** (Part 5 of Phase 2 covers branch settings; resources are
  listed there).
- `useSaveService` is still not atomic (see above) — confirmed again this round,
  not fixed (recoverable, does not corrupt anything; a single RPC is the eventual
  tidy fix, same note as 2026-10-02).
- `service_resources` is stored but nothing reads it until the Phase 3 slot engine.
- The services list will need server-side pagination once catalogues grow
  (CLAUDE.md §6); a `pg_trgm` index on `name` is already in place for search.
- A service with zero assigned staff still appears in the dashboard list and the
  category picker; it simply returns zero slots from the slot engine (inner join
  on `service_staff`), so it can never actually be booked. Not a bug — matches the
  documented intent ("Empty means nobody yet") — but there is no UI badge calling
  this out the way "Hidden" / "Not online" are called out. Left as-is (no fix asked
  for a visual nudge; flagging as a suggestion, not a bug).

## Feature 9 audit (2026-10-14)
Full trace of create/edit/archive/restore/delete for services and categories,
money/branch pricing, permissions, public exposure, and the UI. Verified LIVE
against dev inside rolled-back transactions (and one real published-website
read, also rolled back); no data left behind.

**Confirmed correct, no bug** (so this is not re-litigated next time):
- Soft delete only; a hard `DELETE` on `services` is blocked by `ON DELETE
  RESTRICT`/`NO ACTION` FKs from `appointments.service_id` and
  `invoice_items.service_id` — a service with any appointment or invoice line,
  past or future, cannot be hard-deleted. The app never attempts a hard delete.
- Price changes never touch issued invoices: `invoice_items.unit_price_minor` is
  captured at draft/issue time, not looked up live; invoices are immutable.
- Money is per-branch minor units, currency read from `branches.currency`, never
  stored on the price row (decision 23) — unchanged, correct.
- `service_staff` is a plain inner join in the slot engine: a service with no
  staff naturally returns zero slots, so it cannot be booked without any extra
  guard needed.
- Duplicate names refused case-insensitively per business (`23505`); negative
  price/out-of-range duration/buffer refused by CHECK constraints (`23514`).
- RLS: read = membership; write = `services.manage`, branch-scoped for
  `service_branches`/`resources` so a branch manager can only price their own
  branch. Cross-tenant price/branch mismatches refused by
  `enforce_service_branch_tenant`.
- `get_booking_page_catalogue` (the public booking page) correctly filters
  `is_active`, `is_bookable_online`, `enabled`, `deleted_at is null`, and leaks no
  private fields (no `buffer_minutes`, `description`, `sort_order`, ids beyond
  what's needed).
- No plan/feature gate on services (matches product doc §9/§10 — `services.manage`
  is a plain permission, not behind `useFeature`).

**Two real bugs found and fixed:**
1. **Raw server error text on save/delete/category-create** — `useServices.ts`
   discarded the Postgrest error's `.code` (`throw new Error(error.message)`
   everywhere), so `ServiceForm`'s toast and the list's `ErrorState` showed raw
   Postgres text verbatim. Fixed: every throw now preserves `.code`
   (`Object.assign(new Error(message), { code })`, same pattern as
   `src/features/clients/api/useClients.ts`), and new `serviceErrorKey()` /
   `categoryErrorKey()` (`src/features/services/serviceErrorKey.ts`, same
   reason-code pattern as `roleErrorKey`/`inviteMemberErrorKey`) map `23505` →
   duplicate name, `42501` → forbidden, `23503` → in use (appointments/invoices),
   `23514` → invalid input, else unknown. Wired into `ServiceForm.tsx`,
   `services.tsx` (list error + delete dialog), `CategoriesDrawer.tsx`.
2. **The public marketing website leaked services hidden from online booking** —
   `get_website_public` filtered `is_active` but never `is_bookable_online`,
   unlike every other public catalogue read (`get_booking_page_catalogue`, the
   slot engine, `save_booking_settings`'s own warnings). A service turned "not
   bookable online" (meant to stay internal-only, shown with a "Not online" badge
   in the dashboard) still appeared, priced, on the business's own website.
   Migration `20261024110000_website_services_bookable_online.sql` redefines the
   function with the same filter everyone else uses — the only migration that has
   ever defined it, so nothing else to check. **Verified live** against Nova Hair
   Studio inside a rolled-back transaction: a throwaway hidden service did not
   appear in the published website's services section; a throwaway visible one
   did, alongside the real fixture services. Suite 16 gained 2 assertions for this
   exact case (419/419, was 417). Advisors re-checked: `get_website_public` stays
   `service_role`-only (grants are untouched by `create or replace`), no new
   anon/authenticated-executable finding.

**One real gap filled** (explicitly asked for; was a genuine missing feature,
not a "while I'm here" extra): **there was no category management UI at all.**
`useCreateCategory`, `categorySchema`, and `services.categories.*` i18n keys
existed in the code but nothing in the app ever called them — a business could
never create, rename, or delete a category from the UI (only from a direct DB
write, or indirectly via the Phase 2 pgTAP fixtures). Built `CategoriesDrawer`
(opened from a new "Categories" header button on the Services screen, next to
"Add service"): create, rename, delete, all through the new error-key mapper.
**A second real bug was found while building this**: deleting a category only
set its own `deleted_at` — the FK comment says "a category with services SET
NULL," but that trigger only fires on a hard `DELETE`, never on this soft delete,
so a service kept pointing at a dead category id forever (the picker no longer
offered it; the list's embedded `service_categories(name)` join, which does not
filter `deleted_at`, kept rendering the dead category's name indefinitely).
Fixed: `useDeleteCategory` now does the unlink itself in the same mutation
(`update services set category_id = null where category_id = :id`, then the soft
delete) — same two-statement shape as the already-documented non-atomic
`useSaveService`. **Verified live**: inserted a category + a service in it, ran
the exact two statements, confirmed the service's `category_id` became `null`.
Deleting a category never refuses ("in use") the way deleting a service or a
role does — nothing downstream depends on a category existing.

## Changelog
- 2026-10-14: Feature 9 audit. Fixed raw-error-text on services/categories
  (`serviceErrorKey`/`categoryErrorKey`), the public website leaking
  not-bookable-online services (migration `20261024110000`), and the missing
  category-delete unlink. Built the category management UI
  (`CategoriesDrawer`) that never existed. 9 new unit tests, 2 new SQL
  assertions (suite 16, 419/419); suite 05 re-verified (23/23); full migration
  chain replays from empty (155/155). No other bugs found; everything else
  traced and confirmed correct (see "Feature 9 audit" above).
- 2026-10-02: Services UI: list grouped by category, create/edit drawer, soft delete, server-side search. New shared components (MoneyInput, SearchInput, TimePicker, DayHoursRow, DateRangePicker) and the money helpers they need.
- 2026-10-02: Catalogue schema: categories, services, per-branch prices, resources, RLS, tenant guard, FK indexes.
