-- Historical record: fixed create_appointment's client insert, which tried
-- to CASE a text literal into clients.source (public.booking_source, not
-- text) -- 42804. Folded into the final create_appointment definition now
-- live in 20261004042940_phase4_appointment_rpcs.sql's local file (this repo
-- keeps local files at their FINAL correct content rather than replaying
-- every intermediate fix as a separate file). This file exists only so
-- `supabase migration list` has a local match for the remote history row
-- recorded under this name/timestamp; it is an intentional no-op.
select 1;
