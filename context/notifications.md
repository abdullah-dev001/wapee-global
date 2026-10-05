# Notifications (backend)
Status: backend done, NOT deployed, no UI · Phase: 6A · Last updated: 2026-10-08

## What it does
Every booking event is queued in an **outbox** in the same transaction as the action; a worker Edge Function sends email (Resend), SMS (Twilio, credits) and Expo push to business users. Reminders are queued by pg_cron. No UI yet (notification settings, push registration, message log, credits screens are 6B).

## Business rules (decided with the user)
- **Channel:** client has an email -> EMAIL ONLY (even when SMS is on). No email -> SMS only if the branch has `sms_enabled`, else nothing. Never both. Business users -> Expo push. Walk-ins (`source = walk_in`) send nothing.
- **Events:** `booking_confirmed`, `pending_received`, `reminder`, `rescheduled`, `cancelled`, `manage_link`, `review_request` (clients); `staff_new_booking`, `staff_pending_approval`, `staff_cancelled`, `staff_reminder` (push). Triggered by an AFTER INSERT/UPDATE trigger on `appointments` (covers every RPC) plus enqueue calls inside `create_booking` (attaches the sealed manage token), `resend_manage_link`, `create_review_request_internal`, `reissue_review_request`.
- **Opt-out:** only `reminder` and `review_request` can be suppressed (`message_suppressions`, per business + channel + recipient hash). Transactional messages cannot. Filled by the signed unsubscribe link (email) and by Twilio error 21610 (STOP).
- **Quiet hours** (per branch, default 21:00-08:00 local): SMS `reminder`/`review_request` only. Deferred to the window end, never later than 2 h before the appointment (then sent now). Email, push, transactional: never deferred.
- **Reminders:** per branch `reminders_enabled`, `reminder_hours_before` (1-72, default 24), counted on the **branch wall clock** (a 10:00 appointment is reminded at 10:00 the day before across DST). Skipped for cancelled/completed/no_show/pending/walk-in, and when the slot was chosen after the reminder time (`appointments.scheduled_at`). A reschedule cancels the unsent reminder; the cron makes a new one.
- **Caps** (`messaging_limits`): 500 email / 200 SMS / 100 push per business per UTC day; 5 sent messages per recipient per 24 h (any business); 5 attempts. Over a cap = skipped (`daily_cap`, `recipient_cap`), logged.
- **Retries:** failure -> retry after 1, 4, 16, 64 min, then `dead`. A stale `sending` lock (worker died, 5 min) -> retry; **an SMS whose debit was taken is never re-sent** (`dead`, `ambiguous_send`, no refund). Open rows older than 48 h -> `dead` `expired`.
- **No double send:** unique `idempotency_key` per event (`booking_confirmed:<appt>`, `reminder:<appt>:<epoch>`, ...); claim uses `for update skip locked`; Resend gets the key as `Idempotency-Key`.

## Token handling (sealed)
Raw manage/review token is encrypted (`pgp_sym_encrypt`, key `outbox_seal_key` in **Supabase Vault**, generated in the migration) into `message_outbox.sealed` in the same transaction as the action. `outbox_claim` decrypts it into the job; it is nulled on sent/dead/skipped/cancelled (a CHECK enforces it) and by hourly maintenance after 48 h. The log, errors and audit rows never hold a token, address or body (tested). **Vault was available, so the Edge-secret fallback was not used.**

## SMS credits
`sms_country_rates` (dial code -> credits per segment; 1 credit = USD 0.001; seeded +1 US 12, +61 AU 52, +44 GB 56, +971 AE 118, zero markup; **no row = refused `no_rate`**, e.g. Pakistan). `sms_credit_accounts` (balance, CHECK >= 0) + append-only `sms_credit_ledger` (purchase/adjustment/debit/refund). `sms_segments()` counts GSM-7 (160/153, extension chars double) vs UCS-2 (70/67, UTF-16 units). `outbox_reserve_sms` debits atomically with the send decision (one debit per outbox attempt); `outbox_fail` refunds it once. No credit = skipped `skipped_no_credits`. Credits are added by `admin_add_sms_credits` / rates by `admin_set_sms_rate` (super admin, audited).

## Database
Tables: `notification_settings` (per branch, auto-created), `message_outbox`, `messages` (log: hashed + masked recipient, status, code, provider id, segments/credits), `message_suppressions`, `push_tokens`, `messaging_limits`, `sms_country_rates`, `sms_credit_accounts`, `sms_credit_ledger`; `appointments.scheduled_at`. RLS on all; `anon` nothing; business roles only read: settings (members; update `settings.booking`), `messages` (`settings.business`), credits (`sms.send`), own `push_tokens`. Outbox/suppressions/limits: super admin read only. Table grants are least-privilege (migration ..140000).
Authenticated RPCs: `register_push_token`, `unregister_push_token`, `admin_add_sms_credits`, `admin_set_sms_rate`. service_role only: `outbox_claim(limit, channels)`, `outbox_reserve_sms`, `outbox_complete`, `outbox_fail`, `suppress_recipient`, `push_remove_dead_tokens`, `outbox_worker_authorize`. Internal (no API grant): enqueue, guards, sealing, `enqueue_due_reminders_at(now)` (clock-injectable), `outbox_maintenance`, `invoke_outbox_worker`.
pg_cron: `outbox-worker` every minute (calls the worker only if something is due), `outbox-reminders` every 5 min, `outbox-maintenance` hourly. The worker is called through **pg_net**; schema `net` is not exposed by PostgREST (checked: 406 PGRST106) and only `invoke_outbox_worker` touches it. Vault holds `outbox_seal_key`, `message_hash_key`, `outbox_worker_token` (generated in the DB) and `outbox_worker_url` (set by hand, project function URL).

## Edge Functions (verify_jwt = false, pinned)
- `send_outbox`: authorises `x-worker-token` via `outbox_worker_authorize`, claims only channels whose secrets exist (push always), sends, reports counts.
- `unsubscribe`: GET/POST `?t=` HMAC-signed link bound to business + recipient hash, 60-day expiry; **every outcome returns the same 200 text** (forged/expired/unknown do nothing); rate limited (30/min/IP).
- `_shared/outbox/`: `templates.ts` (English + fallback, by `businesses.language`), `unsubscribe.ts`, `process.ts` (all I/O injected), `providers.ts` (Resend/Twilio/Expo), `types.ts`. 31 unit tests (`outbox.test.ts`) run with stubs.
**Secrets** (Edge): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`), `UNSUBSCRIBE_SIGNING_KEY`, `PUBLIC_SITE_URL`, optional `EXPO_ACCESS_TOKEN`.

## Tests
`supabase/tests/17_notifications_backend.sql` 304 assertions (RLS per role, atomic rollback, channel rule, sealed token, claim/retry/dead/stale, guards, SMS maths, credits, quiet hours + reminder timing in New_York/London/Karachi across DST, push, maintenance, grants, cascade). Regression 07/08/10/11/12/13/14/16 unchanged.

## Known limits / TODO
- Not deployed; no provider call has ever been made (stubs only).
- Messages are English only; no per-business sender domain (one platform sender; seam: `RESEND_FROM_EMAIL`). Web push is a seam.
- Worker latency up to ~1 min (cron). Rescheduled/cancelled emails carry no manage link (raw token unknown at that point).
- Unsubscribe is a plain-text reply (Edge cannot serve HTML); a link scanner opening it unsubscribes the recipient.
- `messages` log has no retention job. Twilio delivery receipts and Resend bounces are not consumed.
- UTC-day caps; segment counting does not keep an extension char whole across a part boundary.

## Changelog
- 2026-10-08: Phase 6A built (7 migrations, 2 Edge Functions + shared module, 304 SQL assertions, 31 unit tests).
