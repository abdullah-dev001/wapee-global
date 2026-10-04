-- Historical record: fixed approve_appointment, which checked
-- is_allowed_appointment_transition(status, 'confirmed') generically --
-- that table also allows no_show/completed -> confirmed (the reopen
-- decision), so approve_appointment had briefly become a side door into
-- reopening a finished appointment without reopen_appointment's Owner/
-- Manager-only check and invoice_id guard. Fixed to check `status =
-- 'pending'` directly. Folded into the final definition now live in
-- 20261004043134_phase4_status_rpcs.sql's local file. No-op placeholder so
-- `supabase migration list` has a local match for this remote history row.
select 1;
