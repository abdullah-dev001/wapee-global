# Wapee manual test guide (DEV)

You test by hand; Claude prepares data checks and runs the technical checks you cannot do in a browser.
**DEV only** (`rfuovquhultjydtswtqf`). Production is never used. Do not fix anything while testing; just report.

## 1. Before you start
1. Make sure the test app is running: open **http://localhost:8090** on the Mac. You should see the Wapee landing page.
   If it does not load, tell Claude "start the test app" (it runs `node scripts/e2e/serve-dist.mjs`).
2. Open your logins sheet: `~/.wapee-e2e/logins.md` (private, not in the repo). Every "Log in as **team-rec**" in the
   sessions means: use the row whose short name is `team-rec`.
3. Keep this folder open next to the browser. Do the sessions in order (some create data the next one uses).

### Which URL
| Where | URL | What works |
|---|---|---|
| Mac (main) | http://localhost:8090 | Everything, incl. sign-up / reset links from emails |
| Phone on the same Wi-Fi | http://192.168.1.178:8090 | Signed-in app screens only. Public pages (booking, website, manage link, review, portal) show "Couldn't load this page" because DEV only allows `localhost` for them. Email links also open `localhost`. Use the phone only for the layout checks in S18, or wait for the HTTPS Vercel preview |
| HTTPS Vercel preview (later) | to be set up | Needed for PWA install (F20-05/06), web push (F09-13/14) and real phone tests |

The copied booking link in the app shows `https://wapee.online/<slug>/book` (the real domain). On DEV, open
`http://localhost:8090/<slug>/book` instead. Do not open wapee.online links during testing.
**Links inside app emails** (manage, review, signing, portal, unsubscribe) may also start with `https://wapee.online`.
Right-click → copy the link, replace only `https://wapee.online` with `http://localhost:8090`, keep the rest (including
`#token=…`), and open that. Sign-up / reset emails from Supabase already point at `localhost:8090`.

### Separate windows for separate people
The app keeps one login per browser profile. To be two people at once:
| Window | Use it for |
|---|---|
| **A** Chrome normal window | The main person of the session (usually an Owner) |
| **B** Chrome Incognito window (⇧⌘N) | A second person (Receptionist, Staff, Manager). Close it and open a new one to switch person |
| **C** Safari (or a second Chrome profile) | A third person, or the customer on the public booking page |
| **G** Guest = any window where nobody is logged in | Public pages, as a customer |

Sign out with **Sign out** (bottom of the side menu, or **More → Sign out** on a phone-sized window).

### Phone-size and desktop-size checks
Steps marked **📱** should be looked at in a phone-size window too: Chrome DevTools (⌥⌘I) → device toolbar (⇧⌘M) →
pick iPhone 12 Pro (390 wide) or type 375. Desktop = full-width window (≈1440). You do not need both for every step.

### Times and time zones
Your Mac is on Pakistan time. The test businesses are not:
- **E2E Team Salon** (`e2e-team`) = **New York** time (10 hours behind Pakistan).
- **E2E Multi Clinic** (`e2e-multi`) = LDN **London** (5 h behind) · NYC **New York** · TYO **Tokyo** (4 h ahead).
- **E2E Solo Barber** (`e2e-solo`) = London. **E2E Other Tenant** (`e2e-other`) = Chicago (11 h behind).
The app always shows times in the branch's own time zone. That is correct, not a bug.

### Test customers (type them in; they are not seeded)
| Name | Phone | Email | Note |
|---|---|---|---|
| Ada Real | +1 202 555 0101 | `wapeeglobal@gmail.com` | The ONLY address that really receives app emails on DEV. Max 5 emails per 24 h to one address (the 6th is skipped on purpose) |
| Ben Nomail | +44 7700 900123 | (none) | Tests "client without email" |
| Cara Fake | +1 202 555 0103 | `cara.e2e@wapee-dev.test` | Email is refused by the DEV mail sender; the row still shows the queue works |
| سارا | +971 50 123 4567 | (none) | Arabic name (Unicode / right-to-left) |
| Extra people | +1 202 555 0110 … 0199 | `cara.e2e+<n>@wapee-dev.test` | When a step says "a new customer", use the next unused number |

### Limits that look like bugs but are not
- Public booking: **10 bookings per hour from one internet connection**, 5 per day per phone number. If the page says
  "Too many attempts", wait an hour or continue with the next session. Use different phone numbers where a step says so.
- Emails on DEV only really arrive at `wapeeglobal@gmail.com`. Everything else is checked by Claude in the database.
- Sign-up / reset emails come from Supabase and can be slow (1–5 min) or rate-limited. Wait, then press **Resend email** once.
- Data left from the automated run on 2026-11-03 exists (clients named "E2E …", a closure "Thanksgiving" on 2026-11-26 in
  E2E Team Salon, some appointments on 6, 10, 11, 12, 17 Nov). Leave it alone unless a step uses it.
- **Tax**: E2E Team Salon and NYC use **8.88 %** (not 8.875 %; known bug B-001 — the rate cannot hold 3 decimals).

## 2. How to read a session file
- **Goal**, **Logins / windows**, **Ready first** at the top.
- Numbered steps. After each: **You should see:** the expected result, and the case IDs it covers, e.g. `[F07-03]`.
- `CLAUDE CHECK C-S05-03` = a database / security check you cannot do by hand. Do not stop: carry on, and at a good
  moment tell Claude **"run C-S05-03"** (or "run all checks for S05"). The scripts are in `claude-checks.md`.
- `KG-xx` = **known gap** (already in `bugs.md`). If you see that behaviour, tick "Known gap", do not report it as new.
- At the end: a checklist of case IDs with Pass / Fail boxes.

## 3. How to report
Write to Claude in this form (short is fine):
- `S05 step 7 failed: I saw "Something went wrong" after pressing Book appointment` → Claude logs a bug in `bugs.md`
  (ID, session/step, case ID, suggested severity, steps, expected, actual) and marks the case in `results.md`.
- `S05 done: steps 1-12 pass, 13 skipped (no time)` → Claude records it in `results.md`.
- `run C-S05-03` → Claude runs it and answers pass/fail plus one line.
- A screenshot helps: ⇧⌘4, then drag it into the chat.
Claude commits and pushes the docs after each session.

## 4. Sessions
Do them in this order. Times are for one careful pass.

| # | Session | Time | Flows covered |
|---|---|---|---|
| S01 | [New owner: sign-up, sign-in, onboarding](S01-new-owner-signup.md) | 30 min | F01, F03-18, F21-08, F22-03 |
| S02 | [Business setup](S02-business-setup.md) | 40 min | F02 |
| S03 | [Public booking: the basics](S03-public-booking.md) | 35 min | F04 (single location), F09-01, F09-06, F20-11 |
| S04 | [Public booking: locations, approval, manage link, time zones](S04-booking-manage-and-time.md) | 40 min | F04 (rest), F09-02, F09-04, F12-11, F19 |
| S05 | [Calendar and the daily work](S05-calendar-daily.md) | 40 min | F05, F09-05, F09-07, F09-08 |
| S06 | [Clients](S06-clients.md) | 25 min | F06 |
| S07 | [Invoices and money](S07-invoices-money.md) | 40 min | F07, F12-04, F19-09 |
| S08 | [Team: adding people and what each role sees](S08-team-and-roles.md) | 40 min | F03 |
| S09 | [Custom roles](S09-custom-roles.md) | 25 min | F14 |
| S10 | [Several locations](S10-multi-branch.md) | 30 min | F12, F05-20, F19-05 |
| S11 | [Reports and commission](S11-reports-commission.md) | 40 min | F08, F13 |
| S12 | [Messages, reminders and reviews](S12-messages-reviews.md) | 40 min | F09, F10 |
| S13 | [Website](S13-website.md) | 30 min | F11 |
| S14 | [Add-ons 1: packages and inventory](S14-addons-packages-inventory.md) | 40 min | F15-01 … F15-12 |
| S15 | [Add-ons 2: files, forms, client portal](S15-addons-files-forms-portal.md) | 40 min | F15-13 … F15-26, F18-12 |
| S16 | [Plans, trial, super admin](S16-plans-and-admin.md) | 40 min | F16, F17 |
| S17 | [Security, privacy and my account](S17-security-account.md) | 30 min | F18, F22 |
| S18 | [Screens, phone layout, PWA and hidden features](S18-platform-and-off-features.md) | 35 min | F20, F21 |

Total ≈ 11 hours, best spread over 3–4 days (some checks need the next day: reminders, trial/period end).
F23 (Polar self-service billing) is out of scope.

### Every screen, and where it is tested (numbers from `feature-inventory.md` §1)
| Screens | Session |
|---|---|
| P1 landing, P2 legal, P10 delete-account; A1–A7 auth + onboarding + retired invite page | S01 (P2 also S18) |
| P3 website | S13 · P4 booking: S03, S04 · P5 manage link: S04 · P6 review: S12 · P7 sign form: S15 · P8 portal: S15 · P9 unsubscribe: S12 |
| P11 invoice print | S07 · P12 report print: S11 |
| B1 Today, B2 Calendar | S05 (also S10) · B3 Clients: S06 · B4 Services, B5 Staff, B7 Schedule: S02 · B6 Team: S08 |
| B8 Invoices | S07 · B9 Reports, B10 Commission: S11 · B11 Packages, B12 Inventory: S14 · B13 Reviews: S12 · B14 Website: S13 · B15 Settings hub, B16 More: S18 |
| S1 Booking settings + form, S2 Business location | S02 · S3 Locations: S10 · S4 Customer notifications, S7 SMS credits: S18 · S5 Message log, S6 My notifications: S12 |
| S8 Roles | S09 · S9 Advanced reports: S11 · S10 Forms, S12 Data requests: S15 · S11 Billing: S16 · S13 Delete business, S14 Account, S15 Delete account: S17 |
| X1–X3 super admin | S16 · X4 sign-in-again: C-S16-02 · A8 Google return page: not testable (Google sign-in OFF) |

Claude checks: [`claude-checks.md`](claude-checks.md). Test plan: [`../test-plan.md`](../test-plan.md).
Screens list: [`../feature-inventory.md`](../feature-inventory.md). Results: [`../results.md`](../results.md). Bugs: [`../bugs.md`](../bugs.md).
