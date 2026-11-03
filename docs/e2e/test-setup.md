# E2E test setup: data, accounts, tools

Status (2026-11-03): **seeded on DEV** with `scripts/e2e/seed-dev.mjs` (phases `sa-reset`, `owners`, `businesses`, `plans`, `members`, `claim`), each phase checked by read-only SQL. Ids and passwords only in `~/.wapee-e2e/` (outside the repo).

**Seeded fixtures (2026-11-03)**
| Fixture | Slug | Plan / add-ons | Branches (currency, tz, prefix, tax bp) | People (role @ branch) |
|---|---|---|---|---|
| FX-SOLO | `e2e-solo` | Solo, active | London (GBP, Europe/London, SOL, 2000) | solo-owner Owner @ all, also its own staff profile |
| FX-TEAM | `e2e-team` | Team, active, none | New York (USD, America/New_York, TEA, 888) | team-owner Owner; team-mgr Manager @ New York; team-rec Receptionist @ New York; team-stf1 Staff @ New York linked to "Sam"; profiles Lee, Kim, Ana, Raj without login (5 = Team cap) |
| FX-BIZ | `e2e-multi` | Business, active, packages + inventory + files_photos + forms_consent + client_portal | LDN primary (GBP, Europe/London, LDN, 2000, owner approves, rooms on, Room 1 for Colour) · NYC (USD, America/New_York, NYC, 888, 3 per slot) · TYO (JPY, Asia/Tokyo, TYO, 1000); window 180 d | biz-owner Owner; biz-mgr-ldn Manager @ LDN; biz-stf-nyc Staff @ NYC linked to "Nora"; biz-custom "Front desk lite" @ LDN (appointments.view/create + clients.view, branch); profiles Lena, Liam (LDN), Taro (TYO) |
| FX-OTHER | `e2e-other` | Team, active, none | Chicago (USD, America/Chicago, OTH, 1025) | oth-owner Owner; oth-rec Receptionist @ Chicago; profile Ola |

All users are `wapeeglobal+e2e-<id>@gmail.com`, made confirmed by Auth admin (no Auth mail). Every business: Haircut 30, Colour 90 + 15 buffer, Consult 15 (not online), Mon-Sat 09:00-18:00 branch + staff hours, break 13:00-13:30, all staff on all services, `branch_is_bookable` = true. FX-BIZ has the 7 custom fields. The 7 `member_added` outbox rows go to plus-addresses the DEV Resend sender refuses (expected `dead/rejected`).
Notes for the plan: tax is stored in basis points, so "8.875 %" is **888 bp = 8.88 %** (F07-04 / F13-02 expectations must use 8.88 %). The Solo owner's staff name is the email local part (no profile name was set). Not seeded yet: holidays, time off, history (past appointments / invoices), customers C-*.
Project: **DEV only** `rfuovquhultjydtswtqf`. Production `bvnurpuqrcwfqguxniio` is never touched by this plan.
No password, key or token is written in this file or anywhere in the repo.

---

## 1. Accounts and businesses we need

IDs below (`FX-*`, `U-*`) are used in `test-plan.md`. "Reuse" = already on DEV (checked 2026-11-03 by read-only SELECT).

### 1.1 Reuse (already on DEV)
| ID | What | Notes |
|---|---|---|
| FX-NOVA | **Nova Hair Studio** (`nova-hair-studio`), Team, active, add-ons packages + inventory, 1 branch USD / America/New_York | Long-lived fixture with real history. Use for READ checks and light writes only (suites 22/24 depend on its clean state). |
| U-NOVA-OWNER | `wapee.owner.1790890259@gmail.com` | Owner of Nova |
| U-DEV-MGR / U-DEV-REC / U-DEV-STF | `dev.manager@`, `dev.receptionist@`, `dev.staff@wapee-dev.test` | Manager / Receptionist / Staff ("Dev Staff") in Nova |
| U-SA | `dev.superadmin@wapee-dev.test` | Super admin, password-only (TOTP removed 2026-10-23) |
| FX-LAPSED | **Rosario Clinic 19481** or **Buenos Clinic** | Trial ended 2026-10-16, status still `trialing` → locked. Owner logins unknown. |
| FX-QA-ADD | **QA Add By Email** (`qa-add-by-email`), trial ends 2026-11-05 | In the 3-day trial-warning window right now; carries Polar sandbox history. |

Passwords of the reused users are not stored anywhere (by design). **You need to give me the passwords, or approve a reset**
(`update auth.users set encrypted_password = crypt(<new>, gen_salt('bf')) where email = …` on DEV; new value kept only in the session scratchpad).

### 1.2 New fixtures (proposed, all names start with `E2E`)
| ID | Business | Plan / add-ons | Branches | People (role @ branch) |
|---|---|---|---|---|
| FX-SOLO | E2E Solo Barber (`e2e-solo`) | Solo, active | 1: **London** GBP, Europe/London, VAT 20 %, prefix `SOL` | U-SOLO-OWNER (also the only staff profile) |
| FX-TEAM | E2E Team Salon (`e2e-team`) | Team, active, **no add-ons** at start (switched on/off in F15) | 1: **New York** USD, America/New_York, tax 8.875 %, prefix `TEA` | U-TEAM-OWNER, U-TEAM-MGR, U-TEAM-REC, U-TEAM-STF1 (linked to profile "Sam"), staff profile "Lee" with no login, 3 more profiles to reach cap 5 for the cap test |
| FX-BIZ | E2E Multi Clinic (`e2e-multi`) | Business, active, all 5 add-ons ON | 3: **LDN** GBP Europe/London 20 % (primary) · **NYC** USD America/New_York 8.875 % · **TYO** JPY Asia/Tokyo 10 % (zero-decimal currency) | U-BIZ-OWNER (All), U-BIZ-MGR-LDN (Manager @ LDN only), U-BIZ-STF-NYC (Staff @ NYC), U-BIZ-CUSTOM (custom role "Front desk lite" @ LDN) |
| FX-OTHER | E2E Other Tenant (`e2e-other`) | Team, active | 1: USD America/Chicago | U-OTH-OWNER, U-OTH-REC — the "other business" for isolation tests |
| FX-SIGNUP | created live in F01 | trial | — | U-NEW-OWNER (fresh email each run) |

Catalogue per business (seeded through the app or its RPCs, never by raw INSERT into money tables):
- Services: "Haircut" 30 min, "Colour" 90 min (+ 15 min buffer), "Consult" 15 min (not online-bookable), one service needing a room (FX-BIZ only, room "Room 1" capacity 1).
- Hours: Mon-Sat 09:00-18:00 branch + staff; one break 13:00-13:30; one holiday next month; one time-off day.
- Booking settings: FX-TEAM confirmation **auto**, FX-BIZ LDN **owner approves**, people per slot 1 except one "Group class" service at FX-BIZ NYC with people per slot 3.
- Custom fields (FX-BIZ): short text, long text, dropdown (3 options), yes/no, number, one **sensitive** field ("Allergies"), one field for one service only.
- DST: FX-BIZ booking window raised to **180 days** so a public booking can land on **2027-03-14** (US clocks forward) and **2027-03-28** (EU clocks forward). FX-TEAM keeps the default 30 days.

### 1.3 Customers (no account; portal uses email)
| ID | Name | Phone | Email |
|---|---|---|---|
| C-MAIL | Ada Real | +1 202 555 0101 | `wapeeglobal@gmail.com` — the **only** address the dev Resend sender really delivers to |
| C-NOMAIL | Ben Nomail | +44 7700 900123 | none (tests "client with no email") |
| C-FAKE | Cara Fake | +1 202 555 0103 | `cara.e2e@wapee-dev.test` (Resend refuses → outbox row goes `dead/rejected`, which still proves the queue) |
| C-RTL | سارا (Arabic name) | +971 50 123 4567 | none (RTL / Unicode check) |

Numbers are from fictional/reserved ranges (555-01xx, Ofcom 07700 900xxx).

### 1.4 Email inboxes
- **App emails** (outbox): real delivery only to `wapeeglobal@gmail.com` until a Resend domain is verified. Everything else is verified by the `message_outbox` / `messages` rows.
- **Auth emails** (signup confirm, reset, email change): Supabase mailer. Needs a real inbox. Proposal: plus-addresses of the founder's Gmail (`…+e2e01@gmail.com`) read through the Gmail connector, **or** admin `generate_link` (needs the service key at runtime, never written down). Question Q3 in the report.

---

## 2. Proposed seed approach (NOT run)

Principle: **build fixtures through the real paths**, so the seed itself is a smoke test, and every row is tagged for cleanup.

1. **Users** (founder decision 2026-11-03): fixture accounts `wapeeglobal+e2e-<id>@gmail.com` are made with Auth admin `createUser` (`email_confirm: true`, no Auth mail). The DEV service role key is read at runtime from the git-ignored `.env.e2e-admin`, used for Auth admin only, never printed; the script refuses a non-DEV URL or a key minted for another project. Only the real signup cases (F01, F03-02, F03-03) use real emails clicked in Gmail. Passwords: allowed to reset only `@wapee-dev.test` and E2E accounts, never `wapee.owner.1790890259@gmail.com`; kept only in `~/.wapee-e2e/e2e-secrets.json` (outside the repo, mode 600).
2. **Businesses**: each owner runs onboarding in the browser (= F01 for FX-SOLO) or calls `create_business_with_owner` with their own JWT.
3. **Plan / add-ons / status**: super admin (U-SA) through `/admin` (= part of F17), so `assign_plan`, `set_addon` audit rows exist.
4. **Branches, services, staff, hours, booking settings, custom fields, roles, members**: the owner through the app or the same RPCs the app calls (`create_branch`, `save_booking_settings`, `add_member_by_email`, `create_custom_role`, …).
5. **History for reports / money** (past appointments, paid invoices): dashboard RPCs as the owner (`create_appointment` in the past is allowed for staff; `mark_completed`, `create_invoice_draft`, `issue_invoice`, `add_payment`). No direct INSERT into invoice / payment tables (guards refuse it anyway).
6. **Expired trial**: reuse FX-LAPSED; if we need our own, create a trial business then have U-SA run the status change, or (only with your OK) one `update business_subscriptions set trial_ends_at = now() - interval '1 minute'` as postgres.
7. Script `scripts/e2e/seed-dev.mjs` (Node, `@supabase/supabase-js` already in the repo; refuses unless the URL is DEV and the state folder is outside the repo). Phases: `owners` → `businesses` → `plans` (super admin) → `members` → `claim` → `report`. Written, **not run**.
8. **Record every created id** in the session scratchpad (`e2e-fixtures.json`), never in the repo.
9. **Cleanup** after the campaign: Owner "Delete this business" for each `E2E*` business (that is also test F18-x), then delete the `e2e.*@wapee-dev.test` auth users. Guarded by name prefix + id list; asks you first.

Rate-limit budget traps (from `_handoff.md`): `create_booking` 10/h per IP, portal login 3/h per email, DB belt 5 links/h. Public-booking rounds must be spaced or use several fixtures; never clear counters on DEV without asking.

---

## 3. How tests are executed

| Kind | Tool | Status in this session |
|---|---|---|
| Browser (web + PWA) at 375 and 1440 | **Playwright + Chromium pre-installed in this container** (`require('playwright')`), scripts kept in the session scratchpad, screenshots in `docs/screenshots/e2e/` | **Blocked today**: the container's network policy refuses `rfuovquhultjydtswtqf.supabase.co` (proxy 403). Needs the host added under Allowed domains. |
| App under test | Local `npm run build:web` served from `dist/` (landing + shell, like Vercel) with DEV keys in a git-ignored `.env` (`EXPO_PUBLIC_SUPABASE_URL`, publishable anon key, `EXPO_PUBLIC_GOOGLE_SIGNIN=1` only for F01 Google cases) — or your Vercel preview URL if you have one | Needs the same network access |
| SQL checks | Supabase MCP `execute_sql` on DEV, **read-only SELECTs** | Works now |
| Writes for setup | App UI / RPCs as the role under test; anything else only after you say yes | — |
| pgTAP suites | `python3 supabase/tests/run_pgtap.py` via the Supabase CLI (`supabase db query --linked`) | CLI v3.0.0 installed globally (not in package.json); **blocked**: linked commands need `SUPABASE_ACCESS_TOKEN` |
| Unit tests | `npm test` (vitest, already a dependency) | Works offline |
| HTTP (public endpoints, rate limits, tokens) | Node `fetch` scripts in scratchpad, existing `scripts/smoke-public.mjs` and `supabase/tests/*_http.mjs` | Needs network access |
| Email | `message_outbox` + `messages` rows; real inbox only for `wapeeglobal@gmail.com` (Gmail connector, if you allow) | — |
| Android | not run here; "reviewed in code, not run" | — |
| iOS | no simulator in a Linux container; not run here | — |

**No new dependency is needed** for the plan as written: Playwright is pre-installed in the container and used from scratch
scripts, not added to `package.json`. If you want the browser tests committed as a re-runnable suite in the repo, that
needs `@playwright/test` as a devDependency → **asking, not installing** (alternative: keep plain Node scripts using the
container's Playwright, not committed).

Screenshots follow `docs/reference/platform.md`: real screenshots at ~375 and 1440 for every UI case marked "browser".
