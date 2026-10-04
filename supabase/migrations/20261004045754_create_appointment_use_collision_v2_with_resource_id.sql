-- Historical record: create_appointment originally never stored
-- resource_id on the appointment it wrote, making resource-capacity
-- checks a no-op from the dashboard (check_appointment_collision found a
-- free resource but nothing recorded which one was used, so the "how many
-- bookings use this resource" count was always zero). Fixed by switching
-- to check_appointment_collision_v2 (returns the resolved resource_id) and
-- storing it + resource_capacity_at_booking. Folded into the final
-- definition now live in 20261004042940_phase4_appointment_rpcs.sql's local
-- file. No-op placeholder so `supabase migration list` has a local match.
select 1;
