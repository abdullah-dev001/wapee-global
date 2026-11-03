# S10 — Several locations (30 min)

**Goal:** locations are created, locked, archived and switched correctly; every location keeps its own time zone, currency and data.
**Logins / windows:** A = `m01` (trial = Business level, used as the throwaway), `biz-owner` · B (Incognito) = `team-owner`, `solo-owner` · G = guest.
**Ready first:** S07 done (E2E Multi Clinic has invoices in LDN, NYC, TYO). m01-studio has one location "Main" (GBP, London).

## Create (m01 Studio)
1. A: log in as **m01** → Settings → **Locations** → **Add location**: Name **KTM**, Country Nepal, Currency **NPR**, Time zone **Asia/Kathmandu**, Invoice prefix **KTM**, copy hours from Main → **Create location**.
   Then **Add location**: **London 2**, United Kingdom, **GBP**, Europe/London, prefix **LO2**, copy from Main.
   You should see: "Location created"; KTM says **0 prices copied** (different currency), London 2 says **1 prices copied** (Haircut, same GBP). Each has its own booking settings. `[F12-01]`
2. B: log in as **team-owner**, then **solo-owner**: Settings → look for Locations; type `/settings/branches`.
   You should see: only **Business location** (one place); the typed URL says "Not included in your plan". `[F12-02]`
   CLAUDE CHECK C-S10-01: `create_branch` as team-owner → `branch_limit_reached` / `feature_unavailable`; nothing written.

## Odd time zone (Kathmandu, UTC+05:45)
3. A (m01): **Services → Haircut** → set a price at **KTM** (e.g. 1500). **Staff** → your profile → Works at: add **KTM**; working hours at KTM Mon–Sat 09:00–18:00. G: `/m01-studio/book?branch=KTM` → Haircut → next weekday → **10:00**, customer **S10 Nepal** +977 980 1234567.
   You should see: times every 15 min in Kathmandu time ("Times shown in Asia/Kathmandu"), 10:00 bookable. `[F19-10]`
   CLAUDE CHECK C-S10-02: stored `starts_at` = 04:15 UTC.

## Locks and archive (m01 Studio)
4. A (m01): Invoices → switch to **London 2** → New invoice, Haircut → **Create draft** (leave it as a draft). Locations → try **Archive** on: **Main** (primary), **KTM** (has S10 Nepal booking), **London 2** (open draft).
   You should see: all three refused with a reason (main location / upcoming appointments / open draft). `[F12-06]`
5. Discard the London 2 draft, then Archive **London 2** again. G: `/m01-studio/book` and `/m01-studio/book?branch=LO2`.
   You should see: "Location archived"; the public picker shows Main and KTM only; `?branch=LO2` silently shows the picker. `[F12-06]` `[F04-03]`
   CLAUDE CHECK C-S10-03: London 2 archived, prefix LO2 retired (cannot be reused).
6. A (m01): Locations → **KTM** → **Make main location** → confirm. G: `/m01-studio/book`. Then make **Main** the main location again.
   You should see: "Main location changed"; KTM marked **Main** and listed first / used as the default. `[F12-07]`

## Locks and overview (E2E Multi Clinic)
7. A: log in as **biz-owner** → Locations → **NYC** → Edit: change **Time zone** to America/Chicago, Save. (Currency / prefix were tried in S07.)
   You should see: refused because NYC has upcoming appointments; NYC unchanged. `[F12-05]`
8. Locations → **Overview** (combined view), current month.
   You should see: one row per location; **Totals by currency** with separate GBP, USD and JPY lines — never one grand total. `[F12-08]`
9. Switch the branch in the desktop header LDN → NYC → TYO and look at Calendar and Invoices each time. Then make the window phone-size 📱: **Today** has the branch switcher; open **More** too.
   You should see: data follows the chosen branch everywhere (Nora / NYC invoices in NYC, Taro / ¥ in TYO). `[F12-10]` `[F05-20]`
10. Calendar at **TYO**: New appointment for **S10 Late TYO** (+81 90 1111 2222), Haircut, Taro, a future day at **23:30** (accept the out-of-hours warning); another for **S10 Early TYO** (+81 90 1111 3333) the next day at **00:30**.
    You should see: the 23:30 one on the first day, the 00:30 one on the next day (Tokyo dates), in Day view and in Today when that day comes. `[F19-05]` `[F12-03]`
    CLAUDE CHECK C-S10-04: both stored correctly in UTC; a whole-day time off at TYO covers 00:00–24:00 Tokyo.
11. CLAUDE CHECK C-S10-05: as **biz-mgr-ldn**, every list (appointments, invoices, staff, services, booking settings) returns 0 NYC rows and NYC updates change 0 rows (suite 21). `[F12-09]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F12-01 | ☐ | ☐ | |
| F12-02 | ☐ | ☐ | + C-S10-01 |
| F12-03 | ☐ | ☐ | also S05 step 15 |
| F12-05 | ☐ | ☐ | |
| F12-06 | ☐ | ☐ | + C-S10-03 |
| F12-07 | ☐ | ☐ | |
| F12-08 | ☐ | ☐ | |
| F12-09 | C | | C-S10-05 |
| F12-10 | ☐ | ☐ | |
| F04-03 (archived part) | ☐ | ☐ | |
| F05-20 | ☐ | ☐ | |
| F19-05 | ☐ | ☐ | + C-S10-04 |
| F19-10 | ☐ | ☐ | + C-S10-02 |
