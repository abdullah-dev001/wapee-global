-- The product does not use Realtime. `appointments` was the only table in the supabase_realtime
-- publication (checked: no other table, no custom policy on the realtime schema). Remove it so no
-- row change is streamed. Clients now refresh with plain TanStack Query refetching.
-- Nothing else is dropped: the earlier migration only ran `alter publication ... add table`, and
-- no helper or policy exists for Realtime.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime drop table public.appointments;
  end if;
end $$;
