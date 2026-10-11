-- Historical record: added a deprecation comment to the original
-- check_appointment_collision (kept, unused -- DROP FUNCTION is refused by
-- the migration tooling used in this session) once
-- check_appointment_collision_v2 replaced it everywhere. No-op placeholder
-- so `supabase migration list` has a local match for this remote history
-- row; the comment itself was applied directly and is not re-applied here.
select 1;
