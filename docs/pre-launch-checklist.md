# Pre-launch checklist

Compiled 2026-10-07 from everything recorded as a launch blocker, open item or known limit in `context/` and `docs/`. Nothing here is built by this document: it lists what has to happen before real customers use Wapee.

**Blocking** = do not launch without it. **Not blocking** = launch is possible, but fix soon (the cost of waiting is stated).
**Owner** = a decision, an account, a payment or a legal act only the business owner can do. **Developer** = work in the repo, the Supabase project or a host.

Source files are in brackets, e.g. [_handoff] is `context/_handoff.md`.

---

## A. Owner: decisions, accounts, money, legal

| # | Item | Status | Why / what is needed |
|---|---|---|---|
| A1 | **Final product name, trademark, domain** | **Blocking** | The code uses placeholders: `app.wapee.com`, `wapee.site`, `support@wapee.com`, placeholder app icons, bundle id. The name lives only in `src/config/brand.ts`. Everything below that needs a domain waits on this. [Build Plan Phase 12, billing, _handoff] |
| A2 | **Company and payment provider (Stripe or other) for subscriptions** | **Blocking for self-serve billing; not blocking for a manual launch** | Today plans and add-ons are assigned by the super admin by hand and prices are placeholders (solo 1500 / team 3900 / business 7900 minor units). Online subscription payment is not built (Build Plan Phase 12, out of product scope until decided). Decide: launch with manual billing, or build collection first. Set the real prices either way. [plans-super-admin, Build Plan] |
| A3 | **Supabase Pro plan** (and a separate production project, see B1) | **Blocking** | Leaked-password protection is a Pro-only feature, point-in-time backups need Pro, and the free tier pauses idle projects and caps auth emails. The org `Wapee Global` is on FREE. [_handoff Open items, security-review M6] |
| A4 | **Apple Developer and Google Play accounts; store listing, privacy labels, data-safety form** | **Blocking for the native apps; not blocking for web/PWA** | Android + PWA ship first, iOS later (CLAUDE.md). Needs the accounts, app name / icons / screenshots, age rating, the data-safety / privacy-label answers (the app stores personal data: names, phones, emails, photos), and the store policy review. [Build Plan Phase 12] |
| A5 | **Privacy policy, terms of service, and a data-processing agreement for business customers** | **Blocking** | Wapee processes end customers' personal data on behalf of businesses (GDPR). The export / erase tools exist; the legal texts and a retention statement do not. Needed for the stores as well. [product doc §13] |
| A6 | **Resend account: verified sending domain** | **Blocking** | Resend's test sender (`onboarding@resend.dev`) delivers only to the account owner's address. Until a domain is verified no customer receives a confirmation, reminder or review request. [notifications, _handoff] |
| A7 | **Twilio account (SMS)** | Not blocking if SMS is not sold at launch | No Twilio secret is set; SMS was never exercised over HTTP. SMS credits are sold manually. Decide the sender (number or messaging service), per-country registration (some countries require sender registration), and the credit prices. [notifications] |
| A8 | **Expo / EAS account, Apple and Google push credentials** | **Blocking for native push; not blocking for web** | See B6. [notifications, push.md] |
| A9 | **Super admin identity** | **Blocking** | Choose who the platform super admin is (a real mailbox, authenticator app on a phone). See B4. [plans-super-admin] |
| A10 | **Backup and incident ownership** | **Blocking** | Decide who is on call, who receives the monitoring alerts (B13), and the restore drill owner. |
| A11 | **Support contact and email** | Not blocking | `brand.supportEmail` is a placeholder; real address needed for the lock screen and legal pages. [billing] |
| A12 | **Real-device and real-account acceptance testing** | **Blocking** | Phase 11B (end-to-end on all platforms) is still open; Android has never been run, iOS only on the simulator. Plan tester devices and a pilot business. [_handoff] |

## B. Developer: build, infrastructure, security

### B1. Production Supabase project and release process
| # | Item | Status | Detail |
|---|---|---|---|
| B1.1 | Create the **production project** (separate from `rfuovquhultjydtswtqf`, the dev project that holds test data) | **Blocking** | Apply migrations in order with `supabase db push`; check `supabase migration list` is 1:1 afterwards. Do NOT run the test fixtures or the SQL suites against production. |
| B1.2 | **Edge Function deploy**, all of them, with the right JWT mode | **Blocking** | 16 functions. `verify_jwt = false` (pinned in `supabase/config.toml`; do not "fix"): `get_booking_page`, `get_slots`, `create_booking`, `manage_booking`, `get_website`, `get_review_request`, `submit_review`, `validate_widget`, `send_outbox`, `unsubscribe`, `sign_form`, `portal`. `verify_jwt = true`: `resend_manage_link`, `message_preview`, `client_files`, `gdpr`. Deploy with `supabase functions deploy <name> --use-api`. [booking-public-api, gdpr] |
| B1.3 | **Edge Function secrets** | **Blocking** | Required (the code throws without them): `PUBLIC_IP_HASH_SALT`, `PUBLIC_FORM_HMAC_KEY`. Needed for features: `UNSUBSCRIBE_SIGNING_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_SITE_URL`, `PUBLIC_WEBSITE_BASE_URL`, `PUBLIC_SITE_ORIGINS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `EXPO_ACCESS_TOKEN`. Generate new random values for production; never reuse the dev ones; never paste `supabase secrets list` output (it prints digests). [_handoff, supabase/functions/.env.example] |
| B1.4 | **pg_cron, pg_net and the outbox worker token** | **Blocking** | The mail / SMS / push worker (`send_outbox`) is called every minute by pg_cron through pg_net with a token kept in Vault; reminders are queued by pg_cron. Confirm the extensions and the Vault token exist in production, that the cron jobs are scheduled, and that `outbox_worker_authorize` accepts the production token. Never install `dblink` (see _handoff trap). [notifications] |
| B1.5 | Storage buckets | **Blocking** | `client-files` (private, no policy, 10 MB, jpeg/png/webp/pdf) and `website-assets` (public, 5 MB, images). Created by migrations; verify limits and that `client-files` still has NO policy. [security-review] |
| B1.6 | **Create the first real data safely** | **Blocking** | No seed data in production (`supabase/seed.sql` is dev only). |

### B2. Auth configuration (hosted project, set in the dashboard: editing `config.toml` does not change a hosted project)
| # | Item | Status | Detail |
|---|---|---|---|
| B2.1 | **Custom SMTP for auth emails** (verification, password reset, invites) | **Blocking** | Supabase's built-in sender delivers only to team members and is rate limited to a handful per hour. Without custom SMTP (use the verified Resend domain, A6) real users never get their verification email. [auth] |
| B2.2 | Site URL and **Redirect URLs** (web origin and the `wapee://` scheme) | **Blocking** | Authentication > URL Configuration. [auth] |
| B2.3 | **Leaked-password protection** | **Blocking after the move to Pro (A3)** | One toggle: Authentication > Providers > Email. Stays an advisor warning on the free plan. [security-review M6] |
| B2.4 | **Minimum password length 8** (and the password policy) on the hosted project | **Blocking** | `config.toml` was changed to 8 to match the app, but the hosted value is separate; check Authentication > Policies. [security-review M5] |
| B2.5 | **TOTP (MFA) enabled** on the hosted project | **Blocking** | Required for the super admin (every admin RPC needs an `aal2` session). `config.toml` has it on; the hosted project is NOT changed by editing the file and we deliberately do not run `supabase config push` (it would overwrite other hosted auth settings). [plans-super-admin] |
| B2.6 | **Create and enrol the super admin** | **Blocking** | Follow the procedure in `context/plans-super-admin.md` (SQL to flag the profile, then enrol TOTP at `/admin/2fa`; check `list_businesses()` returns ok at `aal2`). Without it nobody can assign plans or add-ons, so no business can be put on a plan after its trial. |
| B2.7 | Auth rate limits and email-sending limits reviewed for production | Not blocking | Defaults are small; raise with custom SMTP. |

### B3. Web host and the widget (no host is chosen yet)
| # | Item | Status | Detail |
|---|---|---|---|
| B3.1 | **Choose and set up the static web host** (HTTPS, SPA fallback to `index.html`, correct cache headers for the service worker and `manifest.json`) | **Blocking** | `npm run build:web`. The app is a single Expo web export (PWA). [pwa.md] |
| B3.2 | **`Content-Security-Policy: frame-ancestors` header on the booking page** | **Blocking** | LAUNCH BLOCKER since Phase 7A. The widget's "allowed sites" list is only enforced if the host sends `frame-ancestors <per-business allowed domains>` on `/<slug>/book`. The value comes from the `validate_widget` action `frame_policy`. Edge Functions cannot serve HTML, so this needs a host with a header rule or an edge worker that calls `validate_widget`. Until then any site can frame the booking page. [website-reviews-widget, security-review M7] |
| B3.3 | **`PUBLIC_SITE_ORIGINS`** (CORS allow-list) and `PUBLIC_WEBSITE_BASE_URL` | **Blocking** | Unset today: CORS falls back to placeholder domains, so a real site's browser calls are refused. Set to the real origins (comma-separated, no trailing slash). [_handoff] |
| B3.4 | `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_PUBLIC_SITE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in the build environment | **Blocking** | Production values; the anon key is the publishable key, never the service-role key. [.env.example] |
| B3.5 | Final PWA icons, splash, theme colours, web manifest generated from the final brand | Not blocking for a pilot; blocking for public launch | Placeholder icons today. [pwa.md, _handoff] |
| B3.6 | Real domain for booking links, website, `unsubscribe`, portal and sign links | **Blocking** | Links in emails are built from `PUBLIC_SITE_URL`. |

### B4. Email, SMS, push
| # | Item | Status | Detail |
|---|---|---|---|
| B4.1 | **Resend domain verification: SPF, DKIM, DMARC DNS records**; set `RESEND_FROM_EMAIL` to an address on that domain | **Blocking** | See A6. Then re-run a real delivery test to an outside inbox (only the account owner's address has been proven). [notifications] |
| B4.2 | **Bounce and complaint handling** | Not blocking at pilot size | Resend bounces / complaints and Twilio delivery receipts are not consumed (no webhooks). Dead rows are visible in the messages log. Add webhooks before volume grows, so bad addresses stop being retried and complaints suppress reminders. [notifications] |
| B4.3 | **Twilio secrets** and one real SMS test per launch country | Not blocking if SMS is not sold | See A7. [notifications] |
| B4.4 | **EAS `projectId` in `app.config.ts`**, push credentials (FCM, APNs), real-device push test | **Blocking for native push** | "Not configured" state shows until the projectId exists. Web Push needs the VAPID key pair (public key in the build env, private key as an Edge secret). [notifications, push.md] |
| B4.5 | Email templates in more languages | Not blocking | Templates are English with a fallback; per-business language is stored. [notifications] |

### B5. Native apps
| # | Item | Status | Detail |
|---|---|---|---|
| B5.1 | **First real run on Android** (never run; every task ended with a written code review only) | **Blocking for Android** | EAS build on a real device. [_handoff] |
| B5.2 | iOS device run, not just the simulator | **Blocking for iOS** | Native modules added without a device pass: `expo-image-picker`, `expo-document-picker`, `expo-clipboard`, secure store. Run `npm run ios` after pulling. [_handoff] |
| B5.3 | Bundle id / package name, version, icons, splash, permissions strings (camera, photos, notifications) final | **Blocking** | `brand.bundleId` is a placeholder. |
| B5.4 | App Store / Play review: privacy labels, account-deletion expectation, permission rationale | **Blocking for the stores** | **Account deletion DONE (2026-10-09):** Settings > Account > Delete my account + public URL `/delete-account` for Play Console (see `context/account.md`). Still open: privacy labels / data-safety answers and permission rationale strings. |

### B6. Observability, backups, operations
| # | Item | Status | Detail |
|---|---|---|---|
| B6.1 | **Backups**: Pro plan daily backups, ideally point-in-time recovery; one tested restore | **Blocking** | Also keep copies of the Storage buckets (backups cover the database, not bucket files). |
| B6.2 | **Monitoring and alerts** | **Blocking** | Supabase log drains or dashboards for Edge Function errors (5xx), failed cron runs, database CPU / connections / disk, and an alert for outbox rows in `dead` status and for the worker not having run for 5 minutes. Add uptime checks for the web host and for `get_booking_page`. No error-reporting service is chosen (a new dependency, ask first). |
| B6.3 | Retention jobs and growth | Not blocking | Rate-limit attempt tables and `messages` grow; pg_cron retention exists for the attempt tables. Review sizes monthly. `storage_cleanup_queue` rows that stay pending mean a failed file removal: check weekly. |
| B6.4 | Super admin access is logged and 2FA-protected | Done; verify in production | `admin_*` RPCs audit every call. |
| B6.5 | Log hygiene | Not blocking | Confirm no secrets or personal data in Edge Function logs after a day of real traffic (the code logs reasons, not payloads). |

### B7. Repo, CI and quality
| # | Item | Status | Detail |
|---|---|---|---|
| B7.1 | **CI secrets and first run** | Not blocking for launch; blocking for team development | `.github/workflows/ci.yml` is written, never run. Add repository secrets for the TEST project only: `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY` (publishable key), `SMOKE_BUSINESS_SLUG`, `SMOKE_SERVICE_ID`. The `database` job applies all migrations to a fresh local database for the first time (it has never been done from scratch: expect to fix ordering or extension issues). |
| B7.2 | `npm run smoke:public` against production after the first deploy | **Blocking** | It spends the per-IP booking budget (10 an hour); run once, from a quiet hour, with its own throwaway business. |
| B7.3 | **Phase 11B: end-to-end test on web, Android and iOS** (a person clicking the full journeys) | **Blocking** | Many flows were verified over HTTP / SQL and by screenshot only: the Phase 4 and 5 manual test (postponed), guest manage dialogs, portal cancel / reschedule / book, forms signing, data-rights buttons (export file, run erase from requests), Android hardware Back. [_handoff, gdpr, client-portal] |
| B7.4 | `docs/manual-test-guide.md` run by a non-developer | Not blocking | Exists since Phase 10A. |

### B8. Product gaps that were recorded and are not launch-critical
| Item | Status | Detail |
|---|---|---|
| Staff cannot be given app access from a staff profile (no link to an invite) | Not blocking | Use Team > invite. [staff] |
| Members UI gaps (some role / remove / revoke flows) | Not blocking | Backend exists. [members] |
| No dashboard screen for customer portal sessions | Not blocking | Customers can sign out themselves. [client-portal] |
| Packages report (doc §8.3) | Not blocking | Listed as the next report. [_handoff] |
| Open items in plan-features UI (unclicked flows, mobile switcher) | Not blocking | [plan-features-ui] |
| Real PDF export on native (needs `expo-print` + `expo-sharing`, new dependencies: ask first) | Not blocking | Web print works. [invoices] |
| Sign-in account of a person is never deleted by business erase | Not blocking, note for the privacy policy | A person may belong to several businesses. **Account-deletion flow now exists** (B5.4, `context/account.md`); business erase still keeps the sign-in account. [gdpr] |
| Single-branch assumptions not fixed in a few places | Not blocking | Listed in [plan-features]. |
| Deferred by product decision: online payments / deposits, waitlist, custom domain + SSL, WordPress plugin, marketing email, dark mode | Not blocking | Out of scope. [Build Plan] |

---

## C. Verification before the go / no-go meeting
1. Production project created, all migrations applied, `supabase migration list` matches.
2. Advisors (security and performance) clean except the accepted items in `docs/security-review.md` (`security_definer_view` on `clients_v`, `extension_in_public` for pg_net, `rls_enabled_no_policy` on internal tables).
3. One real business created through the app on the production URL; booking made from a phone; confirmation email arrives in an outside inbox (SPF / DKIM pass); reminder queued; guest manage link works.
4. Super admin signs in with a code and assigns a plan.
5. Widget embedded on a test page of an allowed domain works and is refused on another (checks B3.2).
6. Erase and export tried on a throwaway client; business erase tried on a throwaway business.
7. Restore from backup rehearsed once.
