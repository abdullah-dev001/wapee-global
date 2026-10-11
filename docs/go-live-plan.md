# Go-live plan: web, PWA, Android, iOS

Written 2026-10-08. Docs only. Companion files: `docs/feature-inventory.md` (what exists), `docs/pre-launch-checklist.md` (older, wider list).

**Who acts:** `Owner` = you (accounts, money, legal, decisions, store logins). `Dev` = developer work in the repo, Supabase, the host or a terminal (Claude Code can do these with your approval). **Blocking** = launch cannot go on without it.

## 0. What is realistic in 1-2 days

- **Web + PWA live on `wapee.online`: yes, in 2 days**, if the Day-0 accounts exist.
- **Android and iOS builds submitted to the stores: yes, by end of Day 2.** Being *public in the stores* is not in our hands: Apple review is usually 1-3 days; Google blocks production for 14 days if your Play account is a personal account created after 13 Nov 2023 (12 testers, 14 days in a row; organisation accounts are exempt) [Google Play help](https://support.google.com/googleplay/android-developer/answer/14151465). Plan: **launch web/PWA on Day 2, apps follow when the stores say yes.**
- Two things are code gaps, not setup, and must be fixed before the stores will pass the apps (see section 9): no **account deletion** (Apple 5.1.1(v), Play policy) and no EAS config (`eas.json`, `projectId`, Android `google-services.json`).

### What I verified vs only read
**Verified now:** typecheck, lint and 590 unit tests pass; the web export builds; 130/130 migrations match the dev project; there is no `eas.json`, no `projectId`, no `android/`; Web Push is built (VAPID keys needed, see S6 / W2); the Edge Function secret names listed below are the ones the code reads (grep of `Deno.env.get`); `business_is_active` does not look at `current_period_end` (a paid plan never locks by itself, section 8).
**Only read from docs/web, not tried:** every host, DNS, Resend, Apple, Google, EAS and Polar step. Commands are the standard ones; the developer must check each against the tool's current docs. Nothing in this plan has been executed.

## 1. Decisions needed before hour 0 (Owner)

| # | Decision | Recommendation | Blocking |
|---|---|---|---|
| D1 | Domain layout | **Decided 2026-10-10: ONE origin, `https://wapee.online`, for everything**: landing page `/`, dashboard and admin (`/login`, `/today`, `/admin/...`), business pages (`/<slug>`, `/<slug>/book`, manage, review, sign, portal) and every email link. There is no `app.` subdomain. Every top-level route and public file is a reserved slug (client list, database and a test that derives them from `app/` and `public/`). Trade-off: business-owned pages share the dashboard origin (see `docs/security-review.md` M8); content is rendered as text, never raw HTML. | Done |
| D2 | Bundle id / package name | `online.wapee.app` (`src/config/brand.ts` `bundleId`): the iOS bundle identifier and Android package name, NOT a web domain. **Cannot change after the first store release.** Keep it. | Done |
| D3 | Support mailbox | `support@wapee.online`, forwarded to your inbox by your domain / DNS host (email forwarding). Only `brand.supportEmail` holds it (the Auth hook SQL message is checked against it by a test). | Yes |
| D4 | Legal pages | Privacy policy, terms, (DPA for business customers). Publish at `/privacy` and `/terms` (reserved slugs). Needed by both stores and by GDPR. | Yes |
| D5 | Billing at launch | Manual (section 8). | Yes |
| D6 | SMS at launch | **Off.** Twilio is untested; launch with email + push only. | No |
| D7 | Widget at launch | Only if the `frame-ancestors` worker (step W7) ships. Otherwise the fallback in W7 blocks all framing. | Yes |
| D8 | Real prices | Launch prices are set by migration `20261021090000_public_pricing` (Solo 15, Team 39, Business 79 per location; yearly = 10x; add-ons 9-12). Adjust in `/admin/platform`; the landing page reads them live. | Done |

## 2. Day 0 (start today; long lead times, mostly waiting)

| # | Step | Who | Time | Blocking |
|---|---|---|---|---|
| 0.1 | Confirm you own `wapee.online`. DNS stays at your **external DNS host** (registrar or other); you add the Vercel and Resend records there (section 4). | Owner | 30 min + propagation | Yes |
| 0.2 | Create accounts: Vercel (**Pro**, see section 5: Hobby is non-commercial only), Resend, Supabase (Pro, section 3), Expo (EAS), Apple Developer Program ($99/yr), Google Play Console ($25 once) | Owner | 1 h of work | Yes |
| 0.3 | **Apple enrolment can take 1-2+ days (organisations need a D-U-N-S number).** **Google: choose organisation account if you have one, to skip the 12-tester rule.** Start both today. | Owner | waiting | Blocking for the apps only |
| 0.4 | Collect 12+ testers' Gmail addresses if the Play account is personal | Owner | 1 h | Blocking for Play production |
| 0.5 | Have privacy policy and terms text ready (D4) | Owner | depends | Yes |

## 3. Shared backend: production Supabase (everything depends on it)

Do this first on Day 1. The dev project `rfuovquhultjydtswtqf` holds test data and stays as dev; **never point production at it, never run SQL suites or `smoke:public` fixtures against production.**

| # | Step | Who | Time | Blocking |
|---|---|---|---|---|
| S1 | Upgrade the org `Wapee Global` to **Pro** ($25/mo). Needed for: leaked-password protection, daily backups, no auto-pause, usable auth email limits. | Owner | 10 min | Yes |
| S2 | Create a new project (name `wapee-prod`, pick the region closest to most customers, strong DB password in a password manager). Note the project ref. | Owner | 10 min | Yes |
| S3 | `supabase link --project-ref <PROD_REF>` then `supabase db push`. Then `supabase migration list` must show 130 = 130. The migrations create the extensions (`pg_cron`, `pg_net`, `pg_trgm`, `btree_gist`, `citext`) and the cron jobs. | Dev | 15 min | Yes |
| S4 | Vault: the migration generates `outbox_seal_key`, `message_hash_key`, `outbox_worker_token`. **Set the one by hand**: `select vault.create_secret('https://<PROD_REF>.supabase.co/functions/v1/send_outbox','outbox_worker_url');` (run in the SQL editor). Without it the mail worker silently does nothing. | Dev | 5 min | Yes |
| S5 | Check cron: `select jobname, schedule, active from cron.job;` expect `outbox-worker` (every minute), `outbox-reminders` (5 min), `outbox-maintenance` (hourly), `report-schedules` (15 min), plus the attempts-cleanup job, all active. | Dev | 5 min | Yes |
| S6 | Generate production secrets (fresh values, never the dev ones) into a file **outside the repo**, then `supabase secrets set --env-file ~/wapee-prod.env`. Names: `PUBLIC_IP_HASH_SALT`, `PUBLIC_FORM_HMAC_KEY`, `UNSUBSCRIBE_SIGNING_KEY` (each `openssl rand -hex 32`), `PUBLIC_SITE_URL=https://wapee.online` (the one origin: CORS allow-list, manage / review / unsubscribe / website links; `PUBLIC_SITE_ORIGINS` is only needed to add a preview domain, and `PUBLIC_WEBSITE_BASE_URL` is no longer read), `RESEND_API_KEY`, `RESEND_FROM_EMAIL="Wapee <no-reply@mail.wapee.online>"`, `EXPO_ACCESS_TOKEN` (EAS access token; optional but recommended once push is on). Web Push (built 2026-10-20): generate a FRESH VAPID pair for production (the dev pair is only for the dev project) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:support@wapee.online`. Skip for launch: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. Auto-injected: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Do not paste `supabase secrets list` output anywhere. | Dev | 20 min | Yes |
| S7 | Deploy all 16 functions: `supabase functions deploy --use-api`. `supabase/config.toml` pins `verify_jwt` (false for the 12 public/worker ones; true for `resend_manage_link`, `message_preview`, `client_files`, `gdpr`). Do not "fix" that. | Dev | 15 min | Yes |
| S8 | Hosted auth settings (dashboard; editing `config.toml` changes nothing on a hosted project and we do not run `supabase config push`): Site URL `https://wapee.online`; Redirect URLs `https://wapee.online/**`, `wapee:///**` (plus `https://*-<team>.vercel.app/**` only if you sign in on Vercel preview URLs); email confirmation ON; min password length **8**; leaked-password protection ON (Pro); MFA TOTP enroll + verify enabled; anonymous sign-ins OFF; raise the auth email rate limit after S10. | Dev | 20 min | Yes |
| S8b | **Auth hook (blocking):** Dashboard > Authentication > Hooks > **Custom Access Token** > enable, type *Postgres function*, schema `public`, function `custom_access_token_hook`. Test: suspend a throwaway business in /admin and try to sign in (expect "This account is disabled. Contact support@wapee.online"). The hook is fail-open. | Dev | 5 min | Yes |
| S9 | Storage: confirm buckets `client-files` (private, 10 MB, jpeg/png/webp/pdf, **no policy**) and `website-assets` (public, 5 MB) exist from the migrations. | Dev | 10 min | Yes |
| S10 | **Custom SMTP** (Authentication > SMTP): host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key (make a second key for this, separate from the `send_outbox` key), sender `no-reply@mail.wapee.online`. Without it signup/reset/verification mail reaches team members only. Send a real test signup to an outside inbox. | Dev | 20 min | Yes |
| S11 | Re-run advisors (security + performance). Accepted items only: `security_definer_view` on `clients_v`, `extension_in_public` (pg_net), `rls_enabled_no_policy` on internal tables, `invite_preview` anon. | Dev | 15 min | Yes |
| S12 | Super admin: sign up the platform account in the app, then run the SQL in `context/plans-super-admin.md` ("Creating the super admin"), sign in, enrol TOTP at `/admin/2fa` (save the secret in a password manager; there is no recovery flow), confirm `list_businesses()` returns `ok`. | Owner + Dev | 30 min | Yes |
| S13 | Set real plan and add-on prices in `/admin/platform` (D8). SMS rates stay as seeded; Pakistan and other unlisted countries have no SMS rate. | Owner | 20 min | Yes |
| S14 | Backups: Pro daily backups are automatic. Decide on Point-in-Time Recovery (paid add-on, recommended once paying customers exist). Backups do **not** cover Storage files: schedule a weekly copy of both buckets (script via the Storage API with the service key read at runtime). Do one restore rehearsal into a scratch project in the first week. | Dev | 30 min now | Yes (daily backups); PITR no |

## 4. Email and DNS for `wapee.online`

Sending uses the subdomain `mail.wapee.online`, so the apex keeps your DNS host's email forwarding (inbound `support@`) without MX clashes, and sender reputation is isolated. All records below go in your **external DNS host**.

| # | Record (at your DNS host) | Value | Who | Time |
|---|---|---|---|---|
| E1 | Add domain `mail.wapee.online` in Resend (choose the region nearest your users). Resend shows the exact records: **copy them, do not type them from this doc.** Typical shape: DKIM `TXT resend._domainkey.mail`, return-path `MX send.mail` and SPF `TXT send.mail` (`v=spf1 include:amazonses.com ~all`). Click Verify. | per Resend | Dev | 15 min + propagation |
| E2 | DMARC: `TXT _dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@wapee.online`. Tighten to `quarantine` after two clean weeks. | as shown | Dev | 5 min |
| E3 | Inbound: set up email forwarding for `support@` and `dmarc@` to your inbox at your domain / DNS host (it adds MX records on the apex). | | Owner | 15 min |
| E4 | Real delivery test: book from a phone with an outside Gmail and an Outlook address; check inbox (not spam), view headers for `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`. Also test the unsubscribe link. This has **never been proven to any address except the Resend owner's**. | Dev | 30 min | Yes |
| E5 | Resend plan: the free tier has a small daily limit and our own cap is 500 emails/business/day, with auth mail on top. Move to a paid Resend plan before real volume (check current limits). | Owner | 10 min | No at pilot size |
| E6 | Bounce/complaint webhooks are not built: watch dead rows manually (section 10) until added. | | | No |

Web records (at your DNS host). **Copy the exact values from Vercel > Project > Settings > Domains**; they are project-specific:

| Name | Type | Target | Note |
|---|---|---|---|
| `wapee.online` (apex, `@`) | A | the IP Vercel shows (historically `76.76.21.21`) | no `app` record any more |
| `www` | CNAME | the project CNAME Vercel shows (like `<hash>.vercel-dns-0xx.com`) | add `www.wapee.online` in Vercel and set it to redirect to `wapee.online` |
| any old `app` record | delete | | the dashboard lives on the apex |
| `mail` records | per E1 | | DNS only |
| `_dmarc` | TXT | E2 | |
No custom domain for the Supabase API is planned (paid add-on; the app uses the project URL). No `assetlinks.json`/`apple-app-site-association`: the apps use the `wapee://` scheme, not universal links, so web links open in the browser by design.

## 5. WEB (and PWA)

### Hosting choice and why
**Vercel** (decided 2026-10-10). It serves the static export from `dist/` with the rules in `vercel.json` (rewrites, headers, caching). **The free Hobby plan is for personal, non-commercial use only** (Vercel fair use guidelines), and Wapee sells subscriptions: use **Pro** for production (about $20 per developer seat per month; check the current price). DNS stays at your external DNS host.

| # | Step | Who | Time | Blocking |
|---|---|---|---|---|
| W1 | Vercel > Add New > Project > import GitHub `abdullah-dev001/wapee-global`. Framework preset **Other**. `vercel.json` already sets: install `npm ci`, build `npm run build:web`, output `dist`, `cleanUrls`. Node.js comes from `package.json` `engines` (**24.x**; the landing build needs Node's built-in TypeScript stripping). Production branch `main`; every `dev` push gets a preview URL. Production deploys happen only after you say "merge dev to main" (CLAUDE.md). | Dev | 20 min | Yes |
| W2 | Settings > Environment Variables (Production AND Preview; they are inlined at build time, so redeploy after a change): `EXPO_PUBLIC_SUPABASE_URL=https://<PROD_REF>.supabase.co`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>` (never the service-role key), `EXPO_PUBLIC_SITE_URL=https://wapee.online`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY=<production VAPID public key>`. The build **stops with a clear error** if either Supabase variable is missing (`prebuild:web` runs `build-landing.mjs --check-env`). | Dev | 10 min | Yes |
| W3 | Settings > Domains: add `wapee.online` and `www.wapee.online` (redirect `www` to the apex). Add the A / CNAME records Vercel shows at your DNS host (section 4). HTTPS is automatic once DNS resolves. | Dev | 15 min + propagation | Yes |
| W4 | **Routing (in `vercel.json`, nothing to configure):** real files first (`cleanUrls`: `login.html` is served at `/login`, `/x.html` redirects to `/x`); everything else is rewritten to `/_app/shell` (Expo's app shell; every exported route page is the same file). `/` is the static landing page, `/privacy`, `/terms`, `/refund` are generated pages, `robots.txt`, `sitemap.xml`, `manifest.json`, `sw.js`, `icons/` are plain files. Test with a hard refresh on the preview URL: `/`, `/login`, `/today`, `/<slug>`, `/<slug>/book`, `/<slug>/manage#token=x`, `/clients/<id>`, `/admin/business/<id>`, `/privacy`, `/terms`, `/refund`. Verified locally 2026-10-10 with Vercel's own `vercel build` output and its compiled routes. | Dev | 30 min | Yes |
| W5 | **Headers (in `vercel.json`):** HSTS, nosniff, Permissions-Policy and a Report-Only CSP everywhere; `Referrer-Policy: strict-origin-when-cross-origin`, except `/<slug>/{manage,review,sign,portal}` and `/unsubscribe` = `no-referrer`; `Cache-Control: no-cache` for everything except `/_expo/static/*` and `/assets/*` (`public, max-age=31536000, immutable`); `manifest.json` as `application/manifest+json`. Check on the preview URL with `curl -I`. | Dev | 15 min | Yes |
| W6 | **Framing:** every page except `/<slug>/book` gets `X-Frame-Options: DENY` + `frame-ancestors 'none'`; `/<slug>/book` gets `SAMEORIGIN` + `frame-ancestors 'self'` (static, in `vercel.json`). The rules never overlap, so the order Vercel applies them in does not matter. | Dev | 5 min | Yes |
| W7 | **Per-business `frame-ancestors` for the embed widget** would need Vercel Routing Middleware calling `validate_widget` (`{"action":"frame_policy","slug":...}`), caching ~60 s per slug and failing closed to `'self'`. **Not built: the widget is off at launch**, so the static `'self'` rule from W6 is the launch setting. | Dev | 2-3 h later | No (widget off) |
| W8 | Seed no data. Create the first real business through the app on `https://wapee.online` (owner signup, onboarding, services, staff, hours, booking link). | Owner | 30 min | Yes |
| W9 | `npm run smoke:public` against production **once**, from a quiet hour, with its own throwaway business whose slug contains `test`/`smoke` (it spends the 10/hour IP budget; delete that business afterwards through the erase-business screen). | Dev | 30 min | Yes |
| W10 | Legal pages: `/privacy`, `/terms`, `/refund` are generated at build (`src/features/landing/legal/*.html` and the refund template; DRAFT until a lawyer reviews them). | Owner | review | Yes |
| W11 | Add the production URL checks to monitoring (section 10). | Dev | 15 min | Yes |

### PWA check (all must pass on a real phone)
| # | Check | Who | Time |
|---|---|---|---|
| P1 | `https://wapee.online/manifest.json` (`start_url` `/today`, scope `/`) is served with name, `display: standalone`, theme `#024751`, 192/512 and maskable icons (generated from `brand.ts` at build; do not hand-edit `public/manifest.json`) | Dev | 10 min |
| P2 | Replace placeholder icons/splash with the final artwork (192, 512, maskable 192/512, apple-touch 180, favicon) | Owner (art) + Dev | 1 h |
| P3 | `/sw.js` served 200 with `no-cache`; DevTools > Application shows it active; Lighthouse "installable" passes | Dev | 20 min |
| P4 | Android Chrome: install prompt/menu "Install app"; iPhone Safari: "Add to Home Screen" hint appears and the installed app opens full screen | Owner | 20 min |
| P5 | Ship a new build, reload: "Update available" toast appears and refreshes | Dev | 20 min |
| P6 | The PWA gets **no push** (Web Push is not built). Tell pilot users: email only on web; push needs the native apps. | Owner | n/a |

## 6. ANDROID

| # | Step | Who | Time | Blocking |
|---|---|---|---|---|
| A1 | Decide D2 (package name) and finish brand values. Fix the gaps in `app.config.ts`: add `extra.eas.projectId` (after A2), `owner`, `android.googleServicesFile` (A4), final icons. | Dev | 1 h | Yes |
| A2 | `npx eas-cli login`, `eas init` (creates the project; copy its id into `app.config.ts`), `eas build:configure` (creates `eas.json`). Profiles: `development`, `preview` (internal APK), `production` (AAB, `autoIncrement: true`, `appVersionSource: remote`). | Dev | 30 min | Yes |
| A3 | EAS environment variables for the production profile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SITE_URL=https://wapee.online` (`eas env:create`). | Dev | 15 min | Yes |
| A4 | Push credentials: Firebase project, add Android app with the package name, download `google-services.json`, create an FCM v1 service-account key and upload it with `eas credentials`. | Dev + Owner (Firebase login) | 45 min | Blocking for push only |
| A5 | **First real Android run (never done).** `eas build -p android --profile preview`, install on 2 physical devices (one small/old, one recent) and run the test list in section 9. Fix what breaks. Also confirm: hardware Back on every overlay, 3-button and gesture nav insets, keyboard over inputs, notification permission prompt on Android 13+, image picker `content://` URIs. | Owner (testing) + Dev | 3-4 h | Yes |
| A6 | `eas build -p android --profile production` (AAB, uploads to EAS; first store upload is manual in Play Console, later `eas submit -p android`). | Dev | 30 min + queue | Yes |
| A7 | Play Console: create the app; store listing (name, short/full description, 512 icon, 1024x500 feature graphic, 2+ phone screenshots, tablet screenshots recommended); content rating questionnaire; target audience; **Data safety form** (collects names, phones, emails, photos, user IDs; encrypted in transit; deletion available); **privacy policy URL**; **app access**: give reviewers a demo owner account; ads: none; **account deletion**: in-app path plus a web URL (needs the account-deletion gap fixed, section 9). | Owner | 2-3 h | Yes |
| A8 | Testing track: internal testing first; if the account is personal, run the closed test with 12+ testers for 14 consecutive days **before** production. Then production with a staged rollout (start 10-20%). | Owner | 14 days if personal; none if organisation | Blocking for public Android |
| A9 | Push: send a real booking, confirm the phone receives it (never tested anywhere). | Dev | 30 min | Blocking for push only |

## 7. iOS

| # | Step | Who | Time | Blocking |
|---|---|---|---|---|
| I1 | Apple Developer Program active (Day 0). Create the App ID/bundle id (same as D2) and the app record in App Store Connect. | Owner | 30 min | Yes |
| I2 | `eas build -p ios --profile production`; let EAS manage certificates, provisioning and the **APNs key** (`eas credentials`) so push works. | Dev + Owner (Apple login) | 1 h + queue | Yes |
| I3 | First **device** run (only the simulator has been used): internal/TestFlight build on 1-2 iPhones, plus an iPad if `supportsTablet` stays true. Run the section 9 list; run `npm run ios` once locally to confirm the native modules (`expo-image-picker`, `expo-document-picker`, `expo-clipboard`, secure store) load. Real push test (I2 required). | Owner + Dev | 3-4 h | Yes |
| I4 | App Store Connect metadata: name, subtitle, description, keywords, support URL, privacy policy URL, screenshots for the required iPhone size, **13" iPad screenshots if `supportsTablet: true`** (or set it false in `app.config.ts` and skip iPad), age rating, **privacy nutrition labels** (contact info, user content/photos, identifiers, linked to the user, not used for tracking), export compliance (already `ITSAppUsesNonExemptEncryption: false`), review notes with a **demo account** and a note that billing is handled outside the app. | Owner | 2-3 h | Yes |
| I5 | **Account deletion inside the app** is mandatory for apps with signup (guideline 5.1.1(v)). Not built (section 9). | Dev | 3-5 h | Blocking for iOS review |
| I6 | The app must not sell or link to purchases of subscriptions (3.1.1). Today the billing screen only says "Contact us"; keep it that way, also when Polar arrives (web checkout only, no link or button inside the iOS app). | Dev | n/a | Yes |
| I7 | `eas submit -p ios`, then choose phased release. Review is usually 1-3 days. | Owner | 30 min + wait | Blocking for public iOS |

## 8. Billing at launch (manual) and Polar later

**At launch: manual plan assignment.** Nothing collects money in the app. Polar does not exist anywhere in the repo or docs yet (this is only your decision).
1. Trial: 14 days automatic. The owner sees a banner for the last 3 days.
2. Agree the price with the customer yourself (bank transfer, PayPal, Wise invoice; your choice and your company's).
3. After payment, in `/admin/business/[id]`: **Assign plan** (this also activates it). Put the payment reference in the note (notes are not copied to the owner-readable audit log). Add add-ons with the toggles. SMS credits only if SMS is sold.
4. Keep your own sheet of paid-until dates. **`current_period_end` is stored and shown but nothing enforces it**: a business with status `active` never locks by itself. When someone stops paying, set the status to inactive/suspended by hand (`set_business_status`). Inactive businesses lock but nothing is deleted.
5. If the trial ends and nobody assigns a plan, the app locks with the "trial ended / contact us" screen (support email must be real, D3).
6. Do not market "automatic billing" or online payments (product doc rule).

**What the Polar integration needs later** (Polar is a merchant of record; payouts go through Stripe Connect Express in many countries, so confirm your payout country and entity on [Polar's supported countries page](https://polar.sh/docs/merchant-of-record/supported-countries) first):
- Polar org + products and prices matching solo/team/business and each add-on; extra-branch pricing as quantity or a separate product; sandbox environment first.
- A new Edge Function `polar_checkout` (JWT, Owner only, `settings.billing`) that creates a checkout session with `business_id` in metadata, and a customer-portal link function.
- A new public Edge Function `polar_webhook` that verifies the Polar signature and is idempotent (an events table), mapping subscription created/updated/canceled/past_due to plan and status.
- A new **internal** service-role function for those changes: today `assign_plan` / `set_business_status` require a super admin at `aal2`, which a webhook can never be. Reuse the same validation (downgrade over limits refused) and write the audit row.
- A table linking `business_id` to Polar customer/subscription ids; dunning/grace rule (what happens at `past_due`); keep the 14-day Wapee trial and do not add a second Polar trial.
- Billing UI on web only (iOS rule above). Secrets: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`. Tests: SQL suite for the new functions (every failure path leaves state unchanged), a replayed-webhook test, an HTTP test against sandbox.

## 9. Gaps that must be closed (code or setup) before the apps can ship

| # | Gap | Evidence | Needed for |
|---|---|---|---|
| G1 | No `eas.json`, no EAS `projectId`, no Firebase file | files absent | any native build, push |
| G2 | No user account deletion (business erase exists; the sign-in account is kept) | `gdpr.md`, `pre-launch-checklist.md` B5.4 | App Store and Play |
| G3 | Android never run; iOS only simulator | handoff | both apps |
| G4 | No Web Push | `pushRegistration.ts` | PWA push (not blocking) |
| G5 | No legal pages | none found | stores, GDPR |
| G6 | Placeholder brand values, icons, bundle id, support email | `brand.ts` | all |
| G7 | `frame-ancestors` worker | none | widget |
| G8 | Many flows were verified only by SQL/HTTP, never clicked (list in `feature-inventory.md`, rows marked NONE) | context files | the click-through below |

**Click-through to run on web, Android and iOS before launch** (one person, throwaway business): signup, verify email, onboarding, create service/staff/hours; book from the public page on a phone; approve; reschedule and cancel from the guest link (both confirm dialogs); complete and create an invoice, take a payment, issue a credit note; create and use a package; low-stock; upload a photo and PDF; sign a form on device and by link; portal sign-in, book, cancel, reschedule, sign out; leave a review; invite a member, accept as that member; role change; export and erase a client; request and resolve a data request; trial-ended lock screen; super admin assign plan.

## 10. Monitoring, alerts, rollback

**Monitoring (all blocking at launch, none of it exists yet):**
| # | Step | Who | Time |
|---|---|---|---|
| M1 | Uptime checks (free tier of UptimeRobot or Better Stack) every 1-5 min: `https://wapee.online/`, `https://wapee.online/login`, and a `get_booking_page` call for a test slug; alerts to your phone and email | Dev | 30 min |
| M2 | Supabase: enable email alerts on usage/spend; read Edge Function logs and the Logs Explorer for 5xx daily for the first week | Dev | 20 min |
| M3 | Daily morning SQL check (first two weeks): `select status, count(*) from message_outbox where created_at > now() - interval '1 day' group by 1;` (watch `dead`), `select count(*) from storage_cleanup_queue;` (stuck erasures), and the latest run of each cron job in `cron.job_run_details` | Dev/Owner | 5 min/day |
| M4 | Error reporting (Sentry or similar) is a new dependency: decide after launch | Owner | n/a |
| M5 | Name the on-call person and who receives alerts | Owner | 10 min |

**Rollback:**
- **Web:** Vercel keeps every deployment; Deployments > a previous one > "Instant Rollback" (or "Promote to Production") takes under a minute. Tag each release in git.
- **Edge Functions:** redeploy the previous tagged commit (`git checkout <tag> -- supabase/functions && supabase functions deploy --use-api`).
- **Database:** migrations are forward-only; there are no down migrations. Rollback means a new corrective migration. Before the first production push and before every later push, take a backup (dashboard) and read the migration. After launch, restore = PITR/backup into a new project.
- **Emergency brakes:** stop all sending with `select cron.unschedule('outbox-worker');` (re-schedule after); suspend one business from the super admin; revoke the Resend API key; deploy a static maintenance page on Vercel.
- **Native apps:** there is no over-the-air update (`expo-updates` is not installed). A bad build means a new build and a new review (Apple allows expedited review requests; Play staged rollout can be halted). Start the staged/phased release at a small percentage.

## 11. Timeline

**Day 0 (today):** 0.1-0.5 (domain and DNS host, accounts, start Apple and Google, legal text, decisions D1-D8).

**Day 1: backend, web, email (about 9 working hours)**
| Time | Work | Who |
|---|---|---|
| 0:00-1:30 | S1-S5: Pro, project, `db push`, vault URL, cron check | Owner + Dev |
| 1:30-2:30 | S6-S7: secrets, deploy functions | Dev |
| 2:30-3:30 | E1-E3 DNS for Resend + DMARC + inbound; S8-S10 auth settings and SMTP (verification waits on DNS) | Dev |
| 3:30-5:00 | W1-W6 Vercel project, env vars, domains, routing and header checks | Dev |
| 5:00-7:30 | Buffer: DNS propagation, preview-URL deep-link checks (W4-W6) | Dev |
| 7:30-9:00 | S11, S12 super admin + TOTP, S13 prices, E4 first real email test, W10 legal pages | Owner + Dev |

**Day 2: finish web, apps, go live (about 9 working hours)**
| Time | Work | Who |
|---|---|---|
| 0:00-1:30 | W8, W9 smoke test, P1-P5 PWA checks, section 9 click-through on web | Owner + Dev |
| 1:30-3:00 | A1-A3, G1: EAS init, `eas.json`, env, brand fixes; start preview builds for Android and iOS | Dev |
| 3:00-5:00 | A5 and I3 device testing on the preview builds | Owner |
| 5:00-6:00 | **Go/no-go meeting** against section 13; merge `dev` to `main` (only when you say so); production deploy | Owner |
| 6:00-7:00 | Launch-day smoke checklist (section 12) on the live URL | Owner + Dev |
| 7:00-9:00 | G2 account deletion (or queue it), A6-A7, I2, I4 production builds and store metadata; submit | Dev + Owner |

After Day 2: Apple review (1-3 days), Play closed test (14 days if personal account), staged rollouts, E2 tighten DMARC, bounce webhooks, PITR, Polar.

## 12. Launch-day smoke checklist (production URLs, a real phone and an outside email)
1. `https://wapee.online/<slug>` website loads; `https://wapee.online/<slug>/book` loads; `https://wapee.online/` shows the landing page signed out and goes to `/today` signed in; `/login` loads; hard refresh each; `/privacy`, `/terms`, `/refund` load.
2. Sign up with an outside email: verification mail arrives (not spam, SPF/DKIM/DMARC pass); confirm; onboard; create service, staff, hours.
3. Booking link shows as active; book from a phone; confirmation email arrives with the manage link; the business receives it in the calendar (it appears within 30 s or on refresh).
4. Guest manage link: reschedule, then cancel; both emails arrive.
5. Approve/complete a booking; review request email arrives; leave a review; reply.
6. Create, issue and print an invoice; take a payment; credit note.
7. Reminder: book for the next day with 24 h reminders on and confirm the outbox row is scheduled; check `cron.job_run_details` shows recent runs.
8. Unsubscribe link works and changes nothing until the button is pressed.
9. Widget: allowed domain frames the booking page, another domain is refused (CSP error in console); direct URL of `/<slug>/book` cannot be framed by an unlisted site.
10. Invite a second user by link; accept; role limits hold (a Staff user cannot open Invoices).
11. Super admin: sign in with TOTP, open a business, assign a plan; confirm an aal1 session sees nothing.
12. Trial-ended lock: expire a throwaway trial, see the lock screen, Settings still opens.
13. Export and erase a throwaway client; delete a throwaway business (also removes bucket files).
14. Install the PWA on Android and iPhone; update toast works.
15. Native: sign in, book, receive a push on a real phone (after A4/I2).
16. Uptime monitors green; no 5xx in the Edge Function logs; no `dead` rows in the outbox; advisors unchanged.

## 13. Do NOT launch without
1. A **separate production Supabase project on Pro**, migrations 130/130, vault `outbox_worker_url` set, cron jobs active.
2. **Custom SMTP and a verified Resend domain** with SPF/DKIM passing, and a delivery test to an outside inbox.
3. Production secrets set, fresh values (`PUBLIC_IP_HASH_SALT`, `PUBLIC_FORM_HMAC_KEY` are mandatory or every public endpoint returns `server_error`), and `PUBLIC_SITE_URL=https://wapee.online`.
4. The static `frame-ancestors 'self'` on `/<slug>/book` (in `vercel.json`) with the widget off.
5. Hosted auth: Site URL and redirect URLs, password length 8, leaked-password protection, TOTP.
6. The **super admin created with TOTP working**; real plan prices.
7. **Backups** on (Pro) and the Storage copy scheduled; a named person for alerts; uptime monitors.
8. **Privacy policy, terms**, and a real support address.
9. The full click-through (section 9) done at least on web, and on a real device for each app you ship.
10. For the apps: account deletion, demo accounts for reviewers, store forms. For Android public release: closed test finished if the account is personal.
11. Nothing from the dev project (test data, fixtures, dev keys) in production; `smoke:public` run once against a throwaway business and that business erased.
