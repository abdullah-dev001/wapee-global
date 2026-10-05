-- Phase 6A, part 6: least privilege on the new tables.
--
-- Supabase's default privileges grant `authenticated` ALL on every new table,
-- including TRUNCATE, which RLS does NOT govern. These tables are written only by
-- DEFINER functions, so the API roles keep exactly what a policy needs and nothing
-- else. (Pre-existing tables still carry the broad default grant: 41 of 53 public
-- tables give `authenticated` TRUNCATE. Not changed here, flagged in
-- context/_database.md for a project-wide follow-up.)

revoke all on public.message_outbox, public.messages, public.message_suppressions,
  public.messaging_limits, public.push_tokens, public.sms_credit_accounts,
  public.sms_credit_ledger, public.sms_country_rates, public.notification_settings
  from anon, authenticated;

grant select on public.message_outbox, public.messages, public.message_suppressions,
  public.messaging_limits, public.sms_credit_accounts, public.sms_credit_ledger,
  public.sms_country_rates to authenticated;
grant select, delete on public.push_tokens to authenticated;
grant select on public.notification_settings to authenticated;
grant update (reminders_enabled, reminder_hours_before, sms_enabled, review_requests_enabled,
              quiet_start_minute, quiet_end_minute) on public.notification_settings to authenticated;
