# S17 — Security, privacy and my account (30 min)

**Goal:** injected text is always shown as text; a business can be erased; people can change their password / email and delete their account; everything else in the security area is checked by Claude.
**Logins / windows:** A = `team-owner`, `m01` · B (Incognito) = `m04`, `m02` · C (Safari) = `m04` (second device) · G = guest · Gmail tab.
**Ready first:** S16 done. m04 = Staff in E2E Team Salon (linked to Kim), m02 = Manager there. Use only m02 / m04 / m01 for account changes (fixture passwords must stay as they are).

## Injected text
1. A: log in as **team-owner**. Create, with the text `<img src=x onerror=alert(1)>`: a new client **name**; a new service **name** (S17 test, 30 min, $1, not online); Calendar → New appointment for that client with **Notes** = the same text. G: book E2E Team Salon Haircut with name `S17 <b>x</b>` (+1 202 555 0180) and **Anything we should know?** = `<img src=x onerror=alert(1)>`.
   Open them in the Calendar drawer, Clients, Services, the public booking confirmation, and the website (S13 has the review case).
   You should see: the text shown literally everywhere; no popup, no broken layout. Delete / archive the S17 test service after. `[F18-10]`

## Erase a whole business (throwaway: M01 Studio)
2. A: log in as **m01** → Clients → **S10 Nepal** → Files and photos → record photo consent → Add photo `photo.jpg`.
   Then **Settings → Delete this business** → read the page → type **M01 Studio** → **Delete the business** → confirm.
   You should see: "Business deleted"; m01 is still signed in (now without a business → onboarding). `[F18-13]`
   CLAUDE CHECK C-S17-01: storage files gone first, business and its data gone, one `erasure_log` row with ids/counts only; a Manager cannot do it.

## My account
3. B: log in as **m04**; C (Safari): also log in as **m04**. B: type `/settings/account` → **Change password**: Current password wrong → New password → Change password. Then with the correct current password (note the new one in logins.md).
   You should see: "That password is not right." first; then success; B stays signed in, C is signed out on its next action. `[F22-01]`
   CLAUDE CHECK C-S17-02: audit `account.password_changed`.
4. B (m04): Account → **New email** `wapeeglobal+m04b@gmail.com` → **Change email**.
   You should see: "Waiting for confirmation" with **Send the link again**. Gmail: confirm the link(s) (open in this browser, localhost) — both the old and new address may get one. After confirming, Account shows the new email. `[F22-02]`
   CLAUDE CHECK C-S17-03: `profiles.email` = the new address.
5. A: log in as **team-owner** → type `/settings/delete-account` → enter password → Delete my account.
   You should see: refused — "You are the only Owner of: E2E Team Salon". `[F18-14]`
6. B: log in as **m02** (Manager) → `/settings/delete-account` → password → **Delete my account** → confirm. Then try to sign in as m02.
   You should see: "Your account was deleted."; sign-in fails ("Incorrect email or password."). A (team-owner): Team no longer lists m02; appointments m02 created are still there. `[F18-14]`
7. B: log in as **m04** (new email) → type `/settings/delete-account` (no menu path — KG-03) → password → Delete my account.
   You should see: works; A: Staff → **Kim** still exists (now "No login"), Kim's appointments kept. `[F22-04]`
   CLAUDE CHECK C-S17-04: m02 and m04 auth users gone; staff profile Kim kept with `member_id` null; appointments kept.

## Claude-only checks (ask "run all checks for S17")
- C-S17-05 tenant isolation: as oth-owner, SELECT every table and call RPCs with E2E Team Salon ids → 0 rows / not found `[F18-01]`
- C-S17-06 cross-tenant writes: UPDATE / DELETE E2E Team Salon rows as oth-owner → 0 rows, before = after `[F18-02]`
- C-S17-07 RLS suites 01, 02, 07, 21, 28, 31, 41, 43 all green `[F18-03]`
- C-S17-08 anon surface: only `get_public_pricing` executable; only `reserved_slugs` readable `[F18-04]`
- C-S17-09 public payloads minimal (`get_booking_page`, `get_slots`, `get_website`, `manage_booking get`) `[F18-05]`
- C-S17-10 rate limits per endpoint (spread; asks first, uses budgets) `[F18-06]`
- C-S17-11 a manage token for appointment A cannot cancel appointment B; tokens stored as hashes `[F18-07]`
- C-S17-12 no secrets in the served web bundle `[F18-08]`
- C-S17-13 security headers on the served build `[F18-09]`
- C-S17-14 audit log visibility per role and tenant `[F18-11]`
- C-S17-15 `profiles.is_super_admin` cannot be self-set `[F18-15]`
- F18-16 leaked-password protection: production-only (Pro plan) — recorded for the prod checklist, not run on DEV.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F18-01 | C | | C-S17-05 |
| F18-02 | C | | C-S17-06 |
| F18-03 | C | | C-S17-07 |
| F18-04 | C | | C-S17-08 |
| F18-05 | C | | C-S17-09 |
| F18-06 | C | | C-S17-10 |
| F18-07 | C | | C-S17-11 |
| F18-08 | C | | C-S17-12 |
| F18-09 | C | | C-S17-13 |
| F18-10 | ☐ | ☐ | |
| F18-11 | C | | C-S17-14 |
| F18-13 | ☐ | ☐ | + C-S17-01 |
| F18-14 | ☐ | ☐ | + C-S17-04 |
| F18-15 | C | | C-S17-15 |
| F18-16 | n/a DEV | | prod checklist |
| F22-01 | ☐ | ☐ | + C-S17-02 |
| F22-02 | ☐ | ☐ | + C-S17-03 |
| F22-04 | ☐ | ☐ | + C-S17-04 |
