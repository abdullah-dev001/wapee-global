-- Index the foreign keys the performance advisor flagged on the Phase 2 tables.
--
-- CLAUDE.md §6: "Index every foreign key and every column used in filters/sorting."
-- The `created_by` columns are only read by an audit-style lookup ("what did this
-- person add"), but an unindexed FK also makes every DELETE on `profiles` scan the
-- child table, which is the real reason to index them.
--
-- `staff_time_off.branch_id` matters more: the slot engine will filter time off by
-- branch in Phase 3.

create index service_categories_created_by_idx
  on public.service_categories (created_by) where created_by is not null;

create index services_created_by_idx
  on public.services (created_by) where created_by is not null;

create index staff_profiles_created_by_idx
  on public.staff_profiles (created_by) where created_by is not null;

create index staff_time_off_created_by_idx
  on public.staff_time_off (created_by) where created_by is not null;

create index staff_time_off_branch_idx
  on public.staff_time_off (branch_id) where branch_id is not null;
