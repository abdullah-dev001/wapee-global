# S16 — Plans, trial, super admin (40 min)

**Goal:** plan limits and features are enforced; an ended trial or plan locks the app but keeps data; the super admin can manage businesses safely and every action is audited.
**Logins / windows:** C (Safari) = `sa` · A = `team-owner`, `solo-owner`, `biz-owner`, `onb01`, `m01` · B (Incognito) = `team-mgr`.
**Ready first:** S01–S15 done. Note the current **Team monthly price** ($39.00) before step 8.

## Super admin
1. C: log in as **sa** (password).
   You should see: **Super admin** area (`/admin`) with **Businesses** and **Platform**. `[F17-01]`
   CLAUDE CHECK C-S16-01: audit `admin.signed_in` and an `admin_signin_alerts` row for this sign-in.
   CLAUDE CHECK C-S16-02: a non-password session (magic link) gets `/admin/sign-in-again` and admin RPCs answer `reauth_required`; sessions older than 12 h too (unit tests + suite 18). `[F17-02]` `[F17-03]`
2. A: log in as **team-owner**, type `/admin`.
   You should see: "not found" / no admin area. `[F17-04]`
   CLAUDE CHECK C-S16-03: `list_businesses` as team-owner → `forbidden`.
3. C: **Businesses** → Search `E2E`, then `e2e-multi`, then `wapeeglobal+e2e-biz`; filters **Status** and **Plan**; **Load more** at the bottom. Search `rosario`.
   You should see: right results for name, slug and owner email; Rosario Clinic shown as trial ended (not as an active trial). `[F17-05]`
4. C: open **E2E Team Salon**.
   You should see: Subscription (Team, Active), Limits, Usage: Active staff, Locations 1, Appointments this month (UTC), Invoices issued. `[F17-06]`
   CLAUDE CHECK C-S16-04: the usage numbers match the database.
5. C: **Open support view** (twice), then **Refresh**.
   You should see: a read-only summary (members, appointments last 30 days, add-ons on, recent activity) with **no client names, phones or emails**. `[F17-09]`
   CLAUDE CHECK C-S16-05: one audit row per press, visible to the business.
6. C: open **M01 Studio** (throwaway): **Assign plan** Business with Internal note "S16 note A" → Assign; **Set status** Paused, note "S16 note B" → then back to Active; **Extend trial** 3 days (expect refused now that a plan is active — note what happens); **Add-ons** → Inventory **Switch off**, note "S16 note C" → then on.
   You should see: each asks to confirm, then "Plan assigned." / "Status updated." / "Add-on updated.". `[F17-07]`
   CLAUDE CHECK C-S16-06: every action audited; the internal notes are NOT in the audit rows.
7. C: **Platform** → **Prices** → Team → Edit: Monthly price **41.00** → Save. G: reload `http://localhost:8090/` (landing).
   You should see: "Saved."; landing shows Team **$41**/mo (if it still shows $39, the landing is a build-time snapshot — note it). Set Team back to **39.00**. `[F17-08]`
   CLAUDE CHECK C-S16-07: price back to 3900.
8. C: Platform → **Industry presets** → **Add preset** (Key "s16-test", Name "S16 Preset") → Save.
   You should see: "Preset saved." A new sign-up with that industry gets nothing from it — **KG-09** (known gap). `[F17-11]`
9. C: E2E Team Salon → **Add SMS credits** 10, note "S16" → Add credits. Platform → **SMS rates** → **Add rate**: Dial code 44, Country GB, Credits per segment 2 → Save.
   You should see: "Credits updated." / "Rate saved." (SMS itself stays off.) `[F17-12]`
   CLAUDE CHECK C-S16-08: both audited.
10. C: **E2E Solo Barber** → Add-ons → **Custom roles** → Switch on.
    You should see: accepted (the add-on is meant for Team only — record what happens). Switch it off again. `[F17-13]`

## Limits
11. A: log in as **solo-owner** → Staff → **Add staff** "S16 Second", Works at London → Save.
    You should see: refused with a staff-limit message; no extra profile in the list. `[F16-01]`
    CLAUDE CHECK C-S16-09: still exactly 1 staff profile (no ghost row).
12. A: log in as **team-owner** → Staff → Add staff "S16 Six" (New York). Then Raj → Active off → save; add "S16 Six" again. Then Raj → Active on.
    You should see: 6th refused (5 per location on Team); after Raj is inactive, S16 Six saves; reactivating Raj refused. Finally set S16 Six inactive and Raj active again. `[F16-02]`
13. A: log in as **biz-owner** → LDN → add staff **S16 B1**, **S16 B2**, **S16 B3** (LDN then has 6 people).
    You should see: all saved (Business has no staff limit). `[F16-03]`
14. A: as **solo-owner** look for Commission, Advanced reports, Locations, Roles; as **team-owner** look for Locations and Roles, and the Locations section in Advanced reports.
    You should see: "Not included in your plan" for all of them. `[F16-04]` `[F16-05]`
    CLAUDE CHECK C-S16-10: the matching RPCs are refused for Solo and Team.
15. A: as **solo-owner** → Team → Add person `wapeeglobal+m06@gmail.com` as **Manager**.
    You should see: accepted — **KG-05** (doc says Solo = Owner only; decision pending). Cancel the add afterwards. `[F16-06]`
16. A: **Settings → Plan and billing** as solo-owner, team-owner, biz-owner, m01. B: as **team-mgr** type `/settings/billing`.
    You should see: plan, status, trial / period end, "x of y staff" per location, "Locations: x of y", add-ons On/Off, **Contact us** (no "Subscribe" / checkout). Manager: no access. `[F16-14]` `[F21-07]`

## Lifecycle
17. A: log in as **onb01** (E2E Onboard Spa, trial) → Clients → New client **S16 Keep** (+92 300 1234567). Then tell Claude **"run C-S16-11"**.
    CLAUDE CHECK C-S16-11 (**writes**: ends this trial now; asks first).
    A: reload, open Today, Calendar, Clients, Settings, **Plan and billing**, More. G: `/e2e-onboard/book`.
    You should see: "Your trial has ended" lock on the work screens; Settings, Plan and billing and More still open; booking page "Not available". `[F16-07]`
    CLAUDE CHECK C-S16-12: data count unchanged; a write via the API is refused.
18. A (onb01, still locked): Clients is locked, so go to Settings → Data requests / or the client page if reachable → **Export data** for S16 Keep.
    You should see: export still works (customer rights do not depend on the plan). If no path exists while locked, note it. `[F16-13]`
19. C: **E2E Onboard Spa** → **Assign plan** Team → Assign. A (onb01): wait up to 30 s, click into the app.
    You should see: unlocked without signing out. `[F16-08]`
20. C: **M01 Studio** → Assign plan Business with **Current period ends** = today's date → Assign. A: log in as **m01**.
    You should see: "Your plan has ended" wording (not "trial") once the date has passed (if not locked today, check tomorrow). Then C: Assign plan Business again **without** a date → unlocked. `[F16-10]`
21. C: **E2E Multi Clinic** → Assign plan **Team**.
    You should see: refused, with how many locations / staff are over the Team limit; nothing changes (still Business). `[F16-11]`
22. C: **QA Add By Email** → Extend trial 7 days. Then **E2E Team Salon** (active paid) → Extend trial.
    You should see: trial end moved by 7 days; the paid business refused (cannot extend). `[F16-12]`
23. CLAUDE CHECK C-S16-13: the suspend sign-in hook is switched ON on DEV (if not, step 24 cannot pass — tell the founder).
24. A: log in as **solo-owner**, leave it open. C: **E2E Solo Barber** → **Set status** Suspended, note "S16". A: click into the app / reload. Then sign out and sign in again.
    You should see: the open session is signed out or locked; sign-in refused ("account disabled"). C: Set status **Active** → A can sign in again. `[F16-09]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F16-01 | ☐ | ☐ | + C-S16-09 |
| F16-02 | ☐ | ☐ | |
| F16-03 | ☐ | ☐ | 6 not 8 staff |
| F16-04 | ☐ | ☐ | + C-S16-10 |
| F16-05 | ☐ | ☐ | + C-S16-10 |
| F16-06 | KG-05 ☐ | ☐ | |
| F16-07 | ☐ | ☐ | + C-S16-11/12 |
| F16-08 | ☐ | ☐ | |
| F16-09 | ☐ | ☐ | + C-S16-13 |
| F16-10 | ☐ | ☐ | maybe next day |
| F16-11 | ☐ | ☐ | |
| F16-12 | ☐ | ☐ | |
| F16-13 | ☐ | ☐ | |
| F16-14 | ☐ | ☐ | |
| F17-01 | ☐ | ☐ | + C-S16-01 |
| F17-02 | C | | C-S16-02 |
| F17-03 | C | | C-S16-02 |
| F17-04 | ☐ | ☐ | + C-S16-03 |
| F17-05 | ☐ | ☐ | |
| F17-06 | ☐ | ☐ | + C-S16-04 |
| F17-07 | ☐ | ☐ | + C-S16-06 |
| F17-08 | ☐ | ☐ | + C-S16-07 |
| F17-09 | ☐ | ☐ | + C-S16-05 |
| F17-11 | KG-09 ☐ | ☐ | |
| F17-12 | ☐ | ☐ | + C-S16-08 |
| F17-13 | ☐ | ☐ | |
| F21-07 | ☐ | ☐ | |
