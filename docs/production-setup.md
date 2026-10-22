# Production database setup

How the production Supabase project is built from the migrations, and how to prove the migration chain is clean before touching it.

- Dev project: `rfuovquhultjydtswtqf` (holds test data, never used for production).
- Production project: `bvnurpuqrcwfqguxniio` (Wapee Global Production, empty of customer data).

## 1. Before every production push: replay from empty

```
npm run check:migrations
```

Needs Docker (Colima works: `brew install colima docker && colima start`) and the Supabase CLI. It never touches dev or production.

It starts a throwaway local stack (project id `wapee-migcheck`, ports 553xx, so it does not clash with `supabase start`), gives it the default privileges a hosted project has, applies every file in `supabase/migrations` in filename order, each in its own transaction like `supabase db push`, and lists **every** failure (not only the first). It then looks for functions that call a `public.<function>(...)` that no migration creates, because PL/pgSQL resolves names at run time and a replay alone cannot see that. Exit code 0 means clean. `KEEP=1 npm run check:migrations` leaves the stack up for inspection.

The first run downloads the Supabase images (a few GB). Later runs take a few minutes.

## 2. Pushing to production

Use the production-only CLI workdir so the repo's dev link is never changed (the repo's `supabase/.temp` points at dev):

```
cd ~/wapee-prod-cli                      # linked to bvnurpuqrcwfqguxniio only
cat supabase/.temp/project-ref           # must print bvnurpuqrcwfqguxniio
read -s "PW?DB password: "; echo
SUPABASE_DB_PASSWORD="$PW" supabase db push --linked      # never --include-seed
unset PW
```

Do not run seed files that create test accounts. Production gets reference data from the migrations only.

Edge Functions and secrets are set with an explicit ref (the repo is linked to dev):

```
supabase functions deploy --use-api --project-ref bvnurpuqrcwfqguxniio
supabase secrets set --env-file <file outside the repo> --project-ref bvnurpuqrcwfqguxniio
```

## 3. Prove production equals dev after a push

`scripts/schema-fingerprint.sql` returns one row per schema category (count + md5). Run it on both projects and compare:

```
supabase db query --linked -f scripts/schema-fingerprint.sql        # dev (repo link)
# production: paste the file into the production SQL editor, or use the Supabase connector with project_id bvnurpuqrcwfqguxniio
```

Every category must match except `vault_secret_names` (dev also has `outbox_worker_url`, set by hand; production gets it only once Resend works, see below). Reference values from dev on 2026-10-11 (the chain after the fixes in section 5 reproduces all of them locally, with hosted default privileges):

| category | n | hash |
|---|---|---|
| columns | 878 | 12b5c9dce4f96b2c8a92d55697b6d455 |
| comments | 161 | f611a3f4413ebc49f2748c5d683700a2 |
| constraints | 550 | 83120adab13c4541bcb908155b3005cc |
| cron_jobs | 5 | 8531df9e779a280175b9499b354305d0 |
| enum_types | 18 | 80b9327927348f8d6b0713f0ca30a56b |
| function_acl | 374 | 40ee6bc06cba872ba705cc6d3a33b19f |
| functions | 374 | deb1bc139976fc23cc413b5c4f41dc1d |
| indexes | 388 | 497eb83f47f2063b95f0646e557b7f70 |
| policies | 140 | 84225629b8986e2467ed8a5c3d508339 |
| table_grants | 160 | 4b55dfc814877cf857578f09f77b499c |
| tables | 86 | 38519f51a6918bd9ad308dbc412cb0f2 |
| triggers | 111 | 69ce4eb319a97ec41c94be3ffe0c0edd |
| views | 1 | 8407d258c26e5ba13dbe56714fac1180 |
| storage_buckets | 2 | 2de0c390fcf2501a7dc2c6359b9d1b38 |
| storage_policies | 3 | e7044a23d1ab27e79cc7682c59d98d4d |

These values change whenever dev's schema changes; treat them as a snapshot, and prefer comparing the two live projects.

## 4. After the push: things that are not in the migrations

| Item | Why | When |
|---|---|---|
| Vault secret `outbox_worker_url` = `https://bvnurpuqrcwfqguxniio.supabase.co/functions/v1/send_outbox` | Tells the cron job where the mail worker is. Without it `invoke_outbox_worker()` returns null and does nothing | **Only after** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set (see below) |
| Edge secrets `PUBLIC_SITE_URL`, `PUBLIC_SITE_ORIGINS`, `PUBLIC_IP_HASH_SALT`, `PUBLIC_FORM_HMAC_KEY`, `UNSUBSCRIBE_SIGNING_KEY`, `VAPID_*` | Required by the public endpoints, CORS, unsubscribe links, Web Push | Already set on production (2026-10-11) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email delivery | After `mail.wapee.online` is verified in Resend |
| Auth hook `custom_access_token_hook` (Dashboard > Authentication > Hooks) | Blocks sign-in for suspended businesses; since `20261026130000` also refuses Google for the super admin and writes the admin sign-in audit + alert | After the push (the function must exist) |
| Google sign-in: Google Cloud OAuth client (Web) with **Authorized redirect URI `https://bvnurpuqrcwfqguxniio.supabase.co/auth/v1/callback`** (note `/auth/v1/`) and Authorized JavaScript origin `https://wapee.online`; then Supabase > Authentication > Sign In / Providers > Google: enable, paste client ID + secret | Continue with Google (Part A) | Before deploying the web build that shows the button |
| Supabase > Authentication > URL Configuration > Redirect URLs: add `https://wapee.online/auth/callback` | The app's own return page after Google | Same time as the Google provider |
| Remove the super admin's TOTP factor (`delete from auth.mfa_factors where user_id = '<id>' and factor_type = 'totp'`) | Super admin is password-only since `20261026130000` (Part C) | Only AFTER that migration is live and a password sign-in to /admin is proven |

**While Resend is not configured:** `send_outbox` does not crash. Each email attempt fails with the retryable code `not_configured`; a row is retried up to 5 times and then marked dead, and anything still open after 48 hours is expired. That is why `outbox_worker_url` must stay unset until Resend is ready: with no URL the worker never runs and rows simply wait.

## 5. Why the chain needed fixing (2026-10-11)

Found by pushing to the empty production project and then replaying all 147 files from empty. Dev worked because its history was built in a different real order than the filenames say (the files were renamed afterwards, and several definitions were applied by hand and never written to a file).

1. **`20261003223121_get_booking_page_rate_limit.sql`** inserted into `rate_limit_rules`, which `20261004090000` creates a day later in filename order. The insert is now guarded, and `20261004090000` seeds the same row.
2. **`check_appointment_collision_v2` existed only on dev.** `create_appointment` and `update_appointment` call it; a replay built them without it (no error at build time) and every dashboard create / reschedule would have failed. It is now created in `20261004045723`, and the original text-returning `check_appointment_collision` is kept as on dev (deprecated).
3. **`create_appointment` and `update_appointment` in the chain were the old, buggy versions** (they never stored `resource_id`, so a capacity-1 room could be double-booked from the dashboard). The fixed versions existed only on dev. They are now in `20261004045754` and `20261004045817`, which were empty placeholders.
4. **Six documentation comments** had been edited by hand on dev. They are now in `20261004152214`.

None of these edits changes dev: its history already records every version, and `supabase db push` only runs versions it has not recorded. The files that were edited are all later than production's first 36 applied migrations, so production did not need a reset.

## 6. Known, harmless differences between a local replay and a hosted project

- `pgtap` is installed on dev by hand (it is not in any migration). Install it locally with `create extension pgtap with schema extensions` to run suites 01 to 05.
- `pg_net` patch version and the `supabase_realtime_messages_publication` entries are platform internals.
- A local Supabase image does not give `postgres`-created objects the same default privileges as a hosted project. `scripts/check-migrations.sh` adds them, and with that the function ACLs and table grants match dev exactly.
- SQL suites 19 and 34 assume rows from other businesses already exist (`limit 1` of another business's service, an existing business) and fail on an empty database; they are not schema problems.
