# Database

Status: planned · Phase: 0 · Last updated: 2026-10-01

## State

- **No migrations yet.** No Supabase project exists; the repo is **not linked**.
- `supabase/` created with `supabase init` (CLI 2.109): `config.toml`, `migrations/` (empty), `functions/` (only `.env.example`), `seed.sql` (empty, dev only), `tests/` (empty).
- `config.toml` tweaks: `project_id = "wapee"`, auth `site_url = http://localhost:8081`, `additional_redirect_urls = ["http://localhost:8081", "wapee://"]`.
- App types: `src/lib/supabase/database.types.ts` is an empty placeholder `Database` type. Regenerate after the first migration.

## Tables

_None yet._

## RLS helper functions

_None yet._ Planned for Phase 0 DB task: current user's businesses, `is_member(business_id)`, `has_permission(business_id, branch_id, perm)`, `audit_logs`, soft-delete pattern.

## Migrations

| File   | What |
| ------ | ---- |
| _none_ |      |

## Edge Function secrets (names only)

See `supabase/functions/.env.example`: RESEND_API_KEY, RESEND_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_MESSAGING_SERVICE_SID, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, EXPO_ACCESS_TOKEN.

## Changelog

- 2026-10-01: `supabase init`; no migrations.
