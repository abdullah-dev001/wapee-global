# E2E results tracker

One row per run of a case from `test-plan.md`. Status: `Pass`, `Fail`, `Blocked`, `Known gap`, `Skipped`, `Not run`.
Bug link = an ID from `bugs.md` (e.g. `B-001`). Screenshots: `docs/screenshots/e2e/<case id>-<width>.png`.
Environment: DEV `rfuovquhultjydtswtqf` only.

| ID | Status | Date | Notes | Bug link |
|---|---|---|---|---|
| F09-17 | Pass | 2026-11-03 | All 6 cron jobs active; last 24 h: outbox-worker 1440 runs, outbox-reminders 288, report-schedules 96, outbox-maintenance 24, billing-reconcile 1, cleanup 1 — 0 failures. Outbox: 3 sent, 10 skipped (`stale` member_added, `no_token` push), 10 dead — all `rejected` by the DEV Resend test sender (non-owner addresses, expected on DEV), newest 2026-10-22, not growing; no sealed token left on any finished row. | — |
| F18-04 | Pass | 2026-11-03 | anon can EXECUTE only `get_public_pricing`. anon table privileges: only `reserved_slugs` SELECT (intentional public list, documented in notifications.md). Policies naming anon/public: `reserved_slugs_select_all`, `appointment_status_transitions_select` (no anon grant on the latter, so not reachable). 0 tables with RLS off; 0 tables in `supabase_realtime`. Plan wording "no table readable" should read "only `reserved_slugs`". | — |
| F19-06 | Pass | 2026-11-03 | `appointments_no_staff_double_booking` EXCLUDE gist (staff_id =, tstzrange(starts_at, ends_at, '[)') &&) WHERE staff_id not null AND is_exclusive AND deleted_at is null AND status not in (cancelled, no_show); `appointments_no_resource_double_booking` same on resource_id WHERE resource_is_exclusive. | — |
| F18-08 | Pass | 2026-11-03 | `npm run build:web` (DEV public URL + anon key in git-ignored `.env`) exit 0, dist 12 MB. 18 secret patterns grepped (service_role, sb_secret_, Resend/Twilio/VAPID/Polar/HMAC/salt names and key shapes, PEM, sk_): 0 real hits. One `sb_secret_` match is supabase-js's own prefix check, not a key. Only JWT in the bundle has `"role":"anon"`. | — |
| UT (npm test) | Pass | 2026-11-03 | vitest: 87 files, 970/970 passed in 8.6 s. A `NODE_TLS_REJECT_UNAUTHORIZED` warning comes from the test-only local fake push server in `webpush.test.ts`, not app code. | — |
