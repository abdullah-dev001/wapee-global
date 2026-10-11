-- Phase 10A advisor follow-up: index the created_by FK of client_package_cancellations.
create index if not exists client_package_cancellations_created_by_idx
  on public.client_package_cancellations (created_by) where created_by is not null;
