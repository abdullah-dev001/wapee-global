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

## Round 1a (automated browser run, 2026-11-03) — stopped by change of plan
Automated Playwright run on a local build against DEV. Screenshots named in the notes are in `~/.wapee-e2e-shots/` (outside the repo, not committed).
F02-07 … F02-23 were scripted but their results were never written down, so they count as **Not run** and are re-tested in the manual sessions.

| ID | Status | Date | Notes | Bug link |
|---|---|---|---|---|
| F01-01 | Pass | 2026-11-03 | 375+1440: hero, features, plans, add-ons, compare, FAQ, legal links (/terms /privacy /refund); monthly $15/$39/$79, yearly $150/$390/$790, add-ons $90/$90/$90/$120/$120/$100 per year = `plans`/`addons` rows; no SMS/widget/online-payment text; horizontal overflow 0 px. `F01-01-landing-*.png`, `F01-02-yearly-*.png` | — |
| F01-02 | Pass | 2026-11-03 | Yearly → Team "Start 14-day free trial" → `/signup?plan=team&interval=year`; localStorage `wapee.planIntent` = team/year/link (375+1440). `F01-02-signup-*.png` | — |
| F01-04 | Pass | 2026-11-03 | 7 chars → "Use at least 8 characters", 73 chars → "That password is too long" under the field, stays on /signup; `auth.users` has 0 rows for the test address. `F01-04-len7/len73-*.png` | — |
| F01-05 | Pass | 2026-11-03 | Signup with the registered team-owner address → same `/verify` "We sent a link…" screen as a new signup; no "already exists" text. `F01-05-duplicate-*.png` | — |
| F01-17 | Pass | 2026-11-03 | Unknown address → "If an account exists for …, a reset link is on its way." (neutral wording, compare with known address in F01-18). `F01-17-unknown-*.png` | — |
| F01-19 | Pass | 2026-11-03 | Signed in as team-owner, `/login` and `/signup` both redirect to `/today` (375+1440). `F01-19-redirect-*.png` | — |
| F01-08 | Pass | 2026-11-03 | Slug follows the name ("e2e-onboard-spa") until edited, then stays; `today`/`admin` "reserved", `e2e-other` "Already taken", `Bad Slug!` "lowercase letters, numbers and hyphens only", `a` "at least 3 characters" (375+1440); `is_slug_available` false for all five; `create_business_with_owner(slug=today)` refused 23514 "That address is not available". `F01-08-slug-*.png` | — |
| F01-09 | Pass | 2026-11-03 | UK pre-fills GBP + Europe/London; Pakistan pre-fills PKR + Asia/Karachi (plan said "no prefill": data now has it); manual currency override (EUR) and back works; currency hint "It cannot change once invoices exist". Side finding: country list has duplicate names → B-002. `F01-09-uk-*.png`, `F01-09-pakistan-*.png` | B-002 |
| F01-10 | Pass | 2026-11-03 | E2E Onboard Spa (`e2e-onboard`) → `/today`; `business_subscriptions` trialing, plan null, trial_ends_at now+13.99 d; primary branch "Lahore" PK/PKR/Asia/Karachi prefix `LAH`; 1 `booking_settings` row; Owner assignment; `profiles.default_business_id` = new business. `F01-10-today-*.png` | — |
| F01-11 | Pass | 2026-11-03 | `/onboarding` redirects to `/today` (375+1440); `create_business_with_owner` again → 23505 "You have already created a business"; still 1 business for the user | — |
| F01-12 | Pass | 2026-11-03 | Followed every checklist button on e2e-onboard (hours → service → Add me as staff → Sam with Haircut → staff hours); 5 of 6 then "Copy your booking link" shows `https://wapee.online/e2e-onboard/book`, Copy → clipboard has the link, "Link copied.", card completes and hides; `branch_is_bookable` = `{bookable:true, reasons:[]}`. `F01-12-checklist-done-375.png` | — |
| F01-13 | Pass | 2026-11-03 | "Add me as staff" → toast "You were added to your staff list."; `staff_profiles.member_id` = owner's member row, branch Lahore, online bookable | — |
| F01-14 | Pass | 2026-11-03 | Checklist dismissed (`setup_checklist_dismissed_at` set). Online booking OFF gives no banner **by design** (`setupChecklist.ts`: a deliberate switch never warns), so the plan's trigger is wrong; with a real break (Haircut not online → `no_bookable_service`) Today shows "Online booking is not available right now · Add at least one service… · Finish setup" (375+1440); restored after. `F01-14-banner-*.png` | — |
| F01-15 | Pass | 2026-11-03 | `my_features` on trial: plan business, all 16 features true, no caps; Settings shows Roles, Locations, Forms, Advanced reports, Data requests; `/commission`, `/settings/branches`, `/settings/roles`, `/settings/advanced-reports`, `/packages`, `/inventory`, `/settings/forms` all open, none locked (375+1440). `F01-15-*.png` | — |
| F01-16 | Pass | 2026-11-03 | QA Add By Email (trial ends 2026-11-05): Owner sees amber "Your trial ends in 2 days. Contact us" → press goes to `/settings`; Receptionist sees no banner (no Manager in that business, Receptionist used as the non-owner). Error tint on the last day not seen (not the last day). `F01-16-*.png` | — |
| F01-20 | Pass | 2026-11-03 | team-owner on /staff (Sam, Lee, Kim, Ana, Raj) → Sign out (localStorage empty) → oth-owner: 25 samples over 5 s show none of A's names; /staff shows only Ola (375+1440). `F01-20-b-staff-*.png` | — |
| F01-21 | Skipped (flag off) | 2026-11-03 | Google sign-in is OFF at launch | — |
| F02-01 | Pass | 2026-11-03 | e2e-onboard Schedule → Opening hours Mon-Sat 09-18 → "Schedule saved"; `branch_hours` 6 rows 540-1080; `no_branch_hours` warning gone. `F02-01-hours-saved-1440.png` | — |
| F02-02 | Pass | 2026-11-03 | FX-TEAM Fri close 18→16 with 2 bookings at 17:00 → "This affects existing bookings · 2 upcoming appointments fall outside these hours… save anyway?"; Save anyway → `branch_hours` Fri 540-960; both appointments byte-identical; Friday restored to 18:00. `F02-02-warning-*.png` | — |
| F02-03 | Pass | 2026-11-03 | Closure "Thanksgiving" 2026-11-26 (Sam booked 10:00) → "1 upcoming appointment falls inside this closure… close anyway?"; saved; `get_slots` 11-25 = 160 free, 11-26 = 0; appointment unchanged. Closure kept as the "holiday next month" fixture. `F02-03-warning-*.png` | — |
| F02-04 | Pass | 2026-11-03 | FX-BIZ LDN: added Room 2 in UI; Delete Room 1 (future Colour booking) → "1 upcoming appointment is using this room. Move or cancel it first.", not archived; Delete Room 2 → archived. Side finding: stale copy → B-004. `F02-04-*.png` | B-004 |
| F02-05 | Known gap | 2026-11-03 | Add room form has only "Name"; service form has no room field; capacity not editable (KG-06) | KG-06 |
| F02-06 | Pass | 2026-11-03 | FX-TEAM: created "Hair", set on Haircut + Colour, renamed "Hair services", deleted ("Its services move to Uncategorised") → both services `category_id` null (no dead id). `F02-06-*.png` | — |

## Everything else
Every other case in `test-plan.md` (F02-07 … F22-04) is **Not run**. F23 (Polar) is out of scope for the manual campaign.
Manual results are recorded below per session (`docs/e2e/manual/`).

## Manual sessions
| Session | Date | Steps passed | Steps failed | Bugs | Notes |
|---|---|---|---|---|---|
