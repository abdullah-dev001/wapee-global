-- Phase 11A performance: the three list orderings that had no index to read in order (docs/performance-review.md).
--  * list_appointments: business filter + ORDER BY starts_at DESC, id DESC (only branch-level indexes existed, so a
--    business-wide page sorted every matching row).
--  * messages log: business filter + ORDER BY id DESC with keyset paging (the existing index is on created_at).
--  * clients list: business filter + ORDER BY full_name, id with keyset paging.
create index appointments_business_starts_idx on public.appointments (business_id, starts_at desc, id desc) where deleted_at is null;
create index messages_business_id_desc_idx on public.messages (business_id, id desc);
create index clients_business_name_idx on public.clients (business_id, full_name, id) where deleted_at is null;
analyze public.appointments;
analyze public.messages;
analyze public.clients;
