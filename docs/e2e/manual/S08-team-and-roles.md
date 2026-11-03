# S08 — Team: adding people and what each role sees (40 min)

**Goal:** people are added by email and join only with a confirmed email; each role sees exactly its part; owners are protected.
**Logins / windows:** A = `team-owner` · B (Incognito) = new people m02–m05, `team-rec`, `team-mgr`, `team-stf1` · C (Safari) = a second signed-in person · `biz-mgr-ldn`, `oth-rec`.
**Ready first:** Gmail open. New people use `wapeeglobal+m02@gmail.com` … `+m05@gmail.com`; note their passwords in logins.md.
App emails to `+m0x` addresses are refused by the DEV mail sender (expected); sign-up confirmation emails from Supabase do arrive.

## Adding people
1. B: sign up **m02** (`wapeeglobal+m02@gmail.com`, name "M02 Manager") and confirm the email. When you reach **Set up your business**, stop (do not create a business). Close B.
   A: log in as **team-owner** → **Team** → **Add person**: email m02, Role **Manager**, Branch **New York** → **Add**.
   You should see: m02 listed as **Pending** with "Valid until <date ~30 days>". `[F03-01]`
   B: log in as m02.
   You should see: lands on **Today** of E2E Team Salon (no onboarding), toast "You have joined a team." `[F03-01]`
   CLAUDE CHECK C-S08-01: member active as Manager @ New York; audit `member.joined_by_email`.
2. A: Add person: `wapeeglobal+m03@gmail.com`, **Receptionist**, New York. B: sign up m03 ("M03 Desk") at `/signup` and confirm.
   You should see: after confirming, m03 lands in E2E Team Salon as Receptionist; no business and no trial were created for m03. `[F03-02]`
   CLAUDE CHECK C-S08-02: `member_added` outbox row with a `/login` link and no token; m03 owns no business.
3. B: sign up m04 ("M04 Staff") but do **not** confirm yet. A: Add person m04 as **Staff**, New York. B: try to sign in as m04.
   You should see: m04 stays on "Confirm your email"; Team still shows m04 Pending. Now confirm the email: m04 joins as Staff. `[F03-03]`
4. A: Add person `wapeeglobal+m05@gmail.com` as **Staff**. Add m05 again as **Receptionist**. Open m05 → **Send the email again**. Then **Cancel add** → confirm.
   You should see: role replaced (one pending row, Receptionist), "Valid until" renewed, "Add cancelled". Optional: sign up m05 later — it must NOT join. `[F03-04]`
   CLAUDE CHECK C-S08-03: one row, role replaced, expiry renewed, `invite.revoked` audit.
   CLAUDE CHECK C-S08-04 (writes one SQL clock change; asks first): an expired pending add does not join and shows **Expired**. `[F03-05]`
5. A: Add person with `not-an-email`; then with **team-rec**'s email.
   You should see: "Enter a valid email address."; then a message that the person is already a member. `[F03-06]`
   CLAUDE CHECK C-S08-05: the 31st add in an hour is refused `rate_limited` and the counter is kept (asks first: uses the hourly budget).
6. B: log in as **biz-mgr-ldn** → **Team** → **Add person** and open the Role and Branch lists.
   You should see: no **Owner** role offered; only **LDN** as branch (no NYC, no All branches). `[F03-07]`
   CLAUDE CHECK C-S08-06: `add_member_by_email` as Manager@LDN for Owner or for NYC returns `cannot_grant`; nothing written.
7. B: log in as **team-rec**, then **team-stf1**: look for Team / Add person; type `/members`.
   You should see: no Add person button for either (staff: the Team page may be read-only or locked). `[F03-08]`
   CLAUDE CHECK C-S08-07: `add_member_by_email` as Rec and as Staff → `forbidden`; nothing written.

## Staff login link
8. A: **Staff** → **Kim** → **App login** → pick **M04 Staff** → save. Then **Staff → Ana → App login** → pick M04 Staff again.
   You should see: Kim shows "Login: M04 Staff"; linking M04 to Ana is refused (that login already has a staff profile). `[F03-09]`
   B: log in as m04 → Calendar.
   You should see: only Kim's column/appointments (Kim's are now "own"). `[F03-09]`

## What each role sees (E2E Team Salon)
9. B: log in as **team-stf1** (Sam). Look at the menu; then type `/invoices`, `/reports`, `/settings`, `/members`. 📱
   You should see: menu Today, Calendar (Sam only), Clients (Sam's only, no phone/email), Schedule (own time off), Commission (own), Reviews (own). Typed URLs show the lock state ("You don't have access to this"), the address stays. `[F03-10]`
10. B: log in as **team-rec**. Check Calendar (all staff), Clients (phone and email visible), Invoices (create + payment). Open an issued invoice: look for Discount and **Credit note**. Look for Reports and Settings.
    You should see: no discount, no credit note, no Reports, no Settings. `[F03-11]`
    CLAUDE CHECK C-S08-08: `add_credit_note` as team-rec refused, invoice unchanged.
11. B: log in as **team-mgr**. Check Booking settings, Services, Staff, Invoices (discount, credit note), Reports. Type `/website`, `/settings/billing`, `/settings/roles`.
    You should see: the first group works; Website, Billing and Roles are not in the menu and typed URLs are locked. `[F03-12]`
12. Header / account menu as each of: team-owner, team-mgr, team-rec, team-stf1.
    You should see: role shown under the name: Owner, Manager, Receptionist, Staff. `[F03-19]`

## Changing and removing
13. C (Safari): log in as **m03** (Receptionist), leave Calendar open. A: Team → m03 → **Manage** → **Change** → **Manager** → **Save change**. Wait up to 60 s, click into window C.
    You should see: "Role changed"; m03's menu now has Reports / Booking settings without signing out; header says Manager. `[F03-13]`
    CLAUDE CHECK C-S08-09: audit `role.assignment_changed`.
14. C (m03): Calendar → New appointment for new client **S08 By M03** (+1 202 555 0150), any time. A: Team → m03 → Manage → **Remove from business** → confirm. In C, click any menu item.
    You should see: "Person removed"; m03's next click shows no access; the appointment S08 By M03 still exists for the owner. `[F03-14]`
15. A: Team → your own row (team-owner) → Manage: try to remove your Owner role; try **Remove from business**.
    You should see: both refused; you stay the Owner. `[F03-15]`
    CLAUDE CHECK C-S08-10: raw REST change of the owner's `role_id` refused; exactly one active Owner (suite 41).
16. B: log in as **team-rec**, then **team-stf1**: look for **Account**, "Delete my account" or "My notifications" in the side menu, More, and the avatar menu. Then type `/settings/account`.
    You should see: no menu path (**KG-03** known gap); the typed URL opens the Account page. `[F03-16]`
17. A: Team → Add person: **oth-rec**'s email as Staff, New York. B: log in as **oth-rec**.
    You should see: oth-rec joins, but there is no business switcher and they cannot open E2E Team Salon (known gap: business switcher decided for later). Then A: cancel/remove oth-rec from E2E Team Salon. `[F03-17]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F03-01 | ☐ | ☐ | + C-S08-01 |
| F03-02 | ☐ | ☐ | + C-S08-02 |
| F03-03 | ☐ | ☐ | |
| F03-04 | ☐ | ☐ | + C-S08-03 |
| F03-05 | C | | C-S08-04 |
| F03-06 | ☐ | ☐ | + C-S08-05 |
| F03-07 | ☐ | ☐ | + C-S08-06 |
| F03-08 | ☐ | ☐ | + C-S08-07 |
| F03-09 | ☐ | ☐ | |
| F03-10 | ☐ | ☐ | |
| F03-11 | ☐ | ☐ | + C-S08-08 |
| F03-12 | ☐ | ☐ | |
| F03-13 | ☐ | ☐ | + C-S08-09 |
| F03-14 | ☐ | ☐ | |
| F03-15 | ☐ | ☐ | + C-S08-10 |
| F03-16 | KG-03 ☐ | ☐ | |
| F03-17 | Known gap ☐ | ☐ | |
| F03-19 | ☐ | ☐ | |
