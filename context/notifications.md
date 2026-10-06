# Notifications (backend)
Status: backend + UI done; send_outbox, unsubscribe, message_preview DEPLOYED · Phase: 6A/6B · Last updated: 2026-10-09

## What it does
Every booking event is queued in an **outbox** in the same transaction as the action; a worker Edge Function sends email (Resend), SMS (Twilio, credits) and Expo push to business users. Reminders are queued by pg_cron. UI (6B) is documented in the UI section below.

## Business rules (decided with the user)
- **Channel:** client has an email -> EMAIL ONLY (even when SMS is on). No email -> SMS only if the branch has `sms_enabled`, else nothing. Never both. Business users -> Expo push. Walk-ins (`source = walk_in`) send nothing.
- **Events:** `booking_confirmed`, `pending_received`, `reminder`, `rescheduled`, `cancelled`, `manage_link`, `review_request` (clients); `staff_new_booking`, `staff_pending_approval`, `staff_cancelled`, `staff_reminder` (push). Triggered by an AFTER INSERT/UPDATE trigger on `appointments` (covers every RPC) plus enqueue calls inside `create_booking` (attaches the sealed manage token), `resend_manage_link`, `create_review_request_internal`, `reissue_review_request`.
- **Opt-out:** only `reminder` and `review_request` can be suppressed (`message_suppressions`, per business + channel + recipient hash). Transactional messages cannot. Filled by the signed unsubscribe link (email) and by Twilio error 21610 (STOP).
- **Quiet hours** (per branch, default 21:00-08:00 local): SMS `reminder`/`review_request` only. Deferred to the window end, never later than 2 h before the appointment (then sent now). Email, push, transactional: never deferred.
- **Reminders:** per branch `reminders_enabled`, `reminder_hours_before` (1-72, default 24), counted on the **branch wall clock** (a 10:00 appointment is reminded at 10:00 the day before across DST). Skipped for cancelled/completed/no_show/pending/walk-in, and when the slot was chosen after the reminder time (`appointments.scheduled_at`). A reschedule cancels the unsent reminder; the cron makes a new one.
- **Caps** (`messaging_limits`): 500 email / 200 SMS / 100 push per business per UTC day; 5 sent messages per recipient per 24 h (any business); 5 attempts. Over a cap = skipped (`daily_cap`, `recipient_cap`), logged.
- **Resend idempotency:** a retry after a DEFINITE refusal (HTTP 4xx, so no email exists) uses a fresh key (`message_outbox.idem_suffix` + 1, key `<key>:<n>`); an ambiguous outcome (timeout, network error, 5xx, stale lock) keeps the SAME key, so no duplicate is possible.
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

## Edge Functions (deployed 2026-10-09)
- `send_outbox`: authorises `x-worker-token` via `outbox_worker_authorize`, claims only channels whose secrets exist (push always), sends, reports counts.
- `unsubscribe` (verify_jwt false): **GET changes nothing** (fixed hint text). **POST** (`?t=` or JSON `{t}`) with an HMAC-signed token bound to business + recipient hash, 60-day expiry; **every POST outcome returns the same 200 text** (forged/expired/edited/garbage do nothing); CORS for the app origin; rate limited (30/min/IP). The email links the app page `/unsubscribe#t=<token>` (a confirm button POSTs here); the `List-Unsubscribe-Post` header points at the function.
- `message_preview` (**JWT required**): renders a sample message with the real templates for the signed-in member (`settings.booking` checked through their own JWT) and, for SMS, segments + credits for the branch country.
- `_shared/outbox/`: `templates.ts` (English + fallback, by `businesses.language`), `unsubscribe.ts`, `process.ts` (all I/O injected), `providers.ts` (Resend/Twilio/Expo), `types.ts`. 31 unit tests (`outbox.test.ts`) run with stubs.
**Secrets** (Edge, all set): `UNSUBSCRIBE_SIGNING_KEY` was generated by Claude and never printed; `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`onboarding@resend.dev`), `PUBLIC_SITE_URL` (`https://wapee.site`). **Twilio is NOT set** (SMS never exercised over HTTP). Full list: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`), `UNSUBSCRIBE_SIGNING_KEY`, `PUBLIC_SITE_URL`, optional `EXPO_ACCESS_TOKEN`.

## Tests
`supabase/tests/17_notifications_backend.sql` 304 assertions (RLS per role, atomic rollback, channel rule, sealed token, claim/retry/dead/stale, guards, SMS maths, credits, quiet hours + reminder timing in New_York/London/Karachi across DST, push, maintenance, grants, cascade). Regression 07/08/10/11/12/13/14/16 unchanged.

## UI (Phase 6B)
- Routes under `app/(app)/settings/` (now its own Stack via `_layout.tsx`, same fix as `clients/`): `notifications` (per-branch reminders on/off, hours 1-72, review requests, SMS on/off + readiness, quiet hours, live **message preview** with segment/credit hint), `sms-credits` (balance + keyset ledger, 20/page; Phase 8 super-admin "add credits" is only a seam/text), `messages` (log: channel/status/branch filters, keyset 20/page, masked recipient, cost, scrubbed error), `my-notifications` (push for THIS device; every member incl. Staff).
- Gating: notifications + messages = `settings.booking` (log read widened from `settings.business` by migration ..110000), credits = `sms.send`; each screen wrapped in `RequirePermission`; hub cards shown only if allowed. **Settings nav item now opens for `settings.business` OR `settings.booking`** (`NavItem.alsoPermission`) so Managers can reach it; the inactive-business lock is unchanged.
- Push: `src/lib/push` (lazy `expo-notifications`, no prompt on load; `enablePush()` only from the "Enable notifications" button; blocked / unsupported (web) / not_configured (no EAS projectId) states). Per-event switches in `push_preferences` (`save_push_preferences`; enqueue honours them). Sign-out unregisters the device token (best effort).
- Appointment detail: `AppointmentMessages` via `get_appointment_messages` (event/channel/status/code only; Staff at Own scope get nothing).
- Files: `src/features/notifications/{api,components,schemas,messageLogic.ts}` + tests (12), strings in `common.json` `notifications.*`.
- **Verified:** web 375 + 1440 screenshots of hub, settings, credits, log, push (web state), appointment detail; iOS simulator via deep link (settings + push states). Real HTTP checks listed under Verification. **Not tested:** real push (needs a real device + EAS projectId: no token has ever been issued), Android (written review below), RTL, hardware back, the "enable" prompt flow, SMS sending (Twilio not set), any real inbox delivery.
- **Android review (code only):** every screen uses `Screen`/`PageContainer` (safe areas), the credits/log lists are `FlatList` in a non-scrolling `Screen` with `usePagePadding`; touch targets come from the shared primitives (>= 44); the Select sheets and TimePicker are the existing Drawer-based components (keyboard-aware, back handled by `useOverlayDismiss`); no fixed bottom values; `Linking` is not used. Push: `setNotificationChannelAsync('default')` is created before the first token request (Android 8+), `expo-notifications` is imported lazily so a build without the module still starts; confirm on a device that the permission prompt appears on Android 13+ and that `app.config.ts` gets an EAS `projectId`. Hardware back on the stack screens is the default Stack pop (no internal sub-view state).

## Verification (2026-10-09, live project)
- Deployed `send_outbox`, `unsubscribe`, `message_preview`. A real booking through the public endpoints queued a confirmation; cron called the worker; **Resend answered 403 `validation_error`** (its test sender only delivers to the Resend account owner's own address, which is not devlook4uuu@gmail.com), so the row went `dead` / `rejected`, logged `failed` with no token left. **No email reached any inbox**; the full path up to Resend was exercised for real.
- Reminder timing: appointment at T, 24 h reminder due at T-24h 21:14:00Z, cron enqueued at 21:15:00Z (within the 5-minute tick), then correctly skipped `suppressed` because that address had unsubscribed earlier in the run.
- Unsubscribe over HTTP: GET changes nothing; forged signature, expired, wrong key, edited business and garbage all do nothing; the valid POST suppresses; all replies identical; CORS preflight ok. (Signing key was rotated twice to run this, then replaced by a fresh unprinted random key.)
- **Real delivery proven (2026-10-09, second run):** 3 emails (booking confirmation, reminder, review request) sent via Resend to the account owner's address `wapeeglobal@gmail.com` (the ONLY address allowed for tests); all outbox rows `sent` with a Resend id, tokens nulled. The booking used `create_booking` directly in SQL because the public endpoint was rate-limited (429) after the smoke run. The `/unsubscribe` confirm page (`src/features/unsubscribe`) renders its button and makes no POST until pressed; the email link is `<PUBLIC_SITE_URL>/unsubscribe#token=…` and that host is still a placeholder domain, so the link does not resolve yet.
- Retry path over HTTP **not** exercised (no safe way to make Resend return a retryable error); covered by SQL (retry, backoff, dead, fresh key after a definite failure, stale locks) and unit tests.
- Privileges: after the project-wide revoke, password login, own-business reads, service insert/update/delete, `notification_settings` column grants, `create_appointment`, `get_calendar_appointments` and audit-log write refusal all worked over REST; anon reads refused except `reserved_slugs`.
- `smoke:public`: 34 pass, 2 fail with 429 (the e2e run had already spent the per-IP `create_booking` budget; known trap), 1 skipped.
- Throwaway business/user deleted by id; the 3 original businesses and 4 users are untouched; outbox, log, ledger, suppressions and push tokens are empty.

- 2026-10-06 (Phase 8A): `admin_add_sms_credits` / `admin_set_sms_rate` now sit behind `admin_gate()` (super admin + aal2).

## Known limits / TODO
- **A crashed SMS send is never re-sent** (debit taken, outcome unknown: `dead` / `ambiguous_send`, no refund), so the customer may get no message.
- **Email spam vector:** anyone can book with a victim's email; the per-phone (5/day), per-business (30/h, 120/day) and per-recipient (5/day) caps are the only brake.
- **Latency up to about 1 minute** (cron every minute).
- **No log retention job** for `messages` (outbox rows purge after 30 days).
- **No webhooks:** Twilio delivery receipts and Resend bounces/complaints are not consumed.
- **English only** (catalogue per language, fallback to English).
- **Rescheduled and cancelled emails carry no manage link** (the raw token is unknown at that point).
- A link scanner that opens the unsubscribe PAGE does nothing (only the button POSTs).
- UTC-day caps; segment counting does not keep an extension char whole across a part boundary.
- Not deployed-tested: Twilio (no secrets), push on a real device, Resend inbox delivery (needs a verified domain or the account owner's address as the test recipient).

## Changelog
- 2026-10-07: `report_summary` payloads (revenue figures) are emptied the moment the row reaches sent / dead / skipped / cancelled (trigger `purge_report_payload` + CHECK `message_outbox_report_payload_only_while_open`), like the sealed token. One real report email was sent to the Resend account owner's address and confirmed with a provider id (throwaway business deleted).
- 2026-10-09: Phase 6B + fixes: confirm-page unsubscribe, project-wide privilege revoke, Resend fresh-key retries, 3 Edge Functions deployed, settings/credits/log/push screens, appointment send status, push_preferences, message_preview.
- 2026-10-08: Phase 6A built (7 migrations, 2 Edge Functions + shared module, 304 SQL assertions, 31 unit tests).
