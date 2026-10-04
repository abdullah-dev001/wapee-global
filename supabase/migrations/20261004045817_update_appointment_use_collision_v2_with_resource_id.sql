-- Historical record: same fix as
-- 20261004045754_create_appointment_use_collision_v2_with_resource_id.sql,
-- applied to update_appointment (the reschedule path never stored
-- resource_id either). Folded into the final definition now live in
-- 20261004043110_phase4_update_appointment.sql's local file. No-op
-- placeholder so `supabase migration list` has a local match.
select 1;
