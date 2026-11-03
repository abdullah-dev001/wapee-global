# S02 — Business setup (40 min)

**Goal:** opening hours, closures, rooms, services, categories, staff, schedules, booking settings and the booking form all save correctly and warn before they hurt existing bookings.
**Logins / windows:** A = `team-owner`, later `biz-owner`, `solo-owner`, `m01` · B (Incognito) = `team-rec`, `biz-mgr-ldn`.
**Ready first:** S01 done (m01 business exists). Pick three future weekdays (Mon–Sat, not 26 Nov) and write them here:
**D1** = 7–10 days from today · **D2** = 14–20 days from today · **D3** = 3–6 days from today.
All E2E Team Salon times are New York time.

## Hours and closures (E2E Team Salon)
1. A: log in as **team-owner** → **Schedule** → **Opening hours**. Set Sunday **Closed**, Mon–Sat 09:00–18:00. Save.
   You should see: "Schedule saved". Reload: values kept. `[F02-01]`
   CLAUDE CHECK C-S02-01: `branch_hours` = 6 rows 09:00–18:00.
2. **Calendar** → **New appointment**: New client **S02 Fri A** (+1 202 555 0110), Haircut, **Sam**, next Friday 17:00, **Book appointment**.
   Again: **S02 Fri B** (+1 202 555 0111), Haircut, **Lee**, same Friday 17:00.
   Then **Schedule → Opening hours**: Friday close at **16:00**, save.
   You should see: "This affects existing bookings" with **2** upcoming appointments; **Save anyway** works. Put Friday back to 18:00 after. `[F02-02]`
   CLAUDE CHECK C-S02-02: both appointments are unchanged.
3. Calendar → New appointment: **S02 Holiday** (+1 202 555 0112), Haircut, Sam, **D1** 10:00. Then **Schedule → Holidays and closures → Add closure**: name "S02 Closure", date **D1**.
   You should see: a warning with **1** upcoming appointment; you can still save. In Window G open `http://localhost:8090/e2e-team/book` → Haircut → Any → go to **D1**: no times. `[F02-03]`
   Delete the closure afterwards (trash icon) so later sessions can book D1.

## Rooms (E2E Multi Clinic, LDN)
4. A: sign out, log in as **biz-owner**. Branch switcher (top right) → **LDN**. **Schedule → Rooms** → **Add room** "S02 Room". Then press delete on **Room 1** (it has a booking on 10 Nov), then on **S02 Room**.
   You should see: Room 1 refused: "1 upcoming appointment is using this room. Move or cancel it first."; S02 Room removed.
   Also note the line under the tabs ("…do not affect bookings until the booking engine arrives") and the empty "Delete" dialog — suspected **B-004**. `[F02-04]`
   (If 10 Nov has passed, Room 1 may have no future booking; then note "not testable".)
5. Look for a way to say "Colour needs Room 1" (service form) or to set a room's capacity.
   You should see: none — **KG-06** (known gap). `[F02-05]`

## Services and categories (E2E Team Salon)
6. Log in as **team-owner** → **Services** → **Categories** → **Add category** "S02 Hair". Open **Haircut** and **Colour**, set Category = S02 Hair, save. Rename the category "S02 Hair services", then delete it.
   You should see: both services back under **Uncategorised** after the delete. `[F02-06]`
7. **Add service**: Name **S02 Blow-dry**, Duration 45 min, Price **25.00**, Who performs this: **Sam**, **Bookable online** on. Save. 📱
   You should see: "Service saved"; list shows "45 min · $25.00". `[F02-07]`
   CLAUDE CHECK C-S02-03: price stored as `2500` minor units, USD.
8. **Add service** again and try, one at a time: name **Haircut** (exists), price **-5**, duration **0**, price **abc**.
   You should see: each refused with a message under the field (e.g. "A price cannot be negative"); no raw database text; nothing saved. `[F02-08]`
9. Window G: open `/e2e-team/book`.
   You should see: Haircut, Colour, S02 Blow-dry — **no Consult** (not online). In the dashboard, Consult is still offered in Calendar → New appointment. `[F02-09]`
10. Open **Calendar**, go to **2 Nov 2026**, open the "E2E Past Beard" appointment (service **Beard trim**, deleted by the automated run).
    You should see: it still says **Beard trim** with its old price. Then on **Services** look for a way to show / restore deleted services and restore Beard trim if possible. Note what you find. `[F02-10]`

## Staff and schedules (E2E Multi Clinic)
11. Log in as **biz-owner**, LDN. **Staff → Add staff**: Name **Zoe**, Works at **LDN**, Services: Haircut, **Bookable online** on. Save.
    You should see: "Staff saved"; Zoe in the list with a "Set working hours" badge. `[F02-11]`
12. Open Zoe → working hours Mon–Sat 09:00–18:00, **Breaks** 13:00–13:30. Save.
    You should see: "Schedule saved"; badge gone. `[F02-12]`
    CLAUDE CHECK C-S02-04: Zoe's public slots on a weekday skip 13:00–13:30.
13. **Schedule → Time off → Add time off**: **Lena** (LDN), whole day **D2**, reason "S02 off". Switch to **NYC**, add whole day **D2** for **Nora**. Look at the Time off list in NYC, then in LDN.
    You should see: each person listed with their own single day **D2**. If an LDN person appears in the NYC list as two days ("D2-1 – D2"), that is suspected **B-008** — note it. `[F02-13]`
    CLAUDE CHECK C-S02-05: Lena = D2 00:00–24:00 London, Nora = D2 00:00–24:00 New York (different UTC).

## Conflicts (E2E Team Salon)
14. Log in as **team-owner**. Calendar → New appointment: **S02 TimeOff** (+1 202 555 0113), Haircut, Sam, **D3** 11:00. Then **Schedule → Time off → Add time off**: Sam, whole day **D3**.
    You should see: "This affects existing bookings" with 1 appointment; **Save anyway** works; the appointment is still in the Calendar. Delete the time off after. `[F02-14]`
15. **Staff → Sam → Remove** (Sam has future appointments).
    You should see: refused with the number of upcoming appointments; Sam still active. `[F02-15]`
    CLAUDE CHECK C-S02-06: Sam unchanged.

## Booking settings (E2E Multi Clinic)
16. Window B: log in as **biz-mgr-ldn** → **Settings → Booking settings** (LDN). Change **Minimum notice** to **90** minutes, **Save changes**.
    Window A (biz-owner): switch to NYC → Booking settings: Minimum notice still **60**. Back in B, set LDN to **60** again. Do NOT change "Customers can book up to" (must stay 180).
    You should see: "Booking settings saved."; only LDN changed. `[F02-16]`
    CLAUDE CHECK C-S02-07: LDN 60 / NYC 60 at the end, window 180 both.
17. Window B: log in as **team-rec**, type `/settings/booking`.
    You should see: no Settings in the menu; the page is read-only or "You don't have access to this". `[F02-17]`
    CLAUDE CHECK C-S02-08: `save_booking_settings` as team-rec is refused and the row is unchanged.
18. Window A (biz-owner) → NYC → Booking settings → **People per time slot** from 3 to **2**, Save.
    Needs 3 bookings in one future NYC slot. The automated run left 3 for Nora on 10 Nov 17:00. If that date has passed, first create 3 appointments for Nora at one future time (NYC, different new clients).
    You should see: refused, naming the full slot; value stays 3. `[F02-18]`

## Booking form
19. Log in as **solo-owner** → **Settings → Booking settings → Booking form → Your own questions → Add a question**. Add, one by one:
    "S02 short" (Short text), "S02 long" (Long text), "S02 pick" (Choose one: Red, Green, Blue), "S02 yes" (Yes / no), "S02 number" (Number, **Ask for these services**: Colour only).
    You should see: "Booking form updated." each time; "S02 number" shows "1 service". The customer preview shows them; note if the Number field shows "0" (suspected **B-009**). `[F02-19]`
    Press **Edit** on "S02 pick": the drawer must show its saved question, type and choices (suspected **B-011**: opens empty).
    CLAUDE CHECK C-S02-09: one new form version per change, answers types correct.
20. Still Solo: Add a question "S02 one" (Choose one) with only **one** choice. Then log in as **biz-owner** → Booking form → Edit **Allergies** (sensitive, already answered) → switch **Sensitive answer** off; also try to change the type of **Age**.
    You should see: 1 choice refused; sensitive cannot be switched off for an answered question (clear message); type buttons locked ("The answer type cannot change once a question is saved"). `[F02-20]`
21. biz-owner: open the Booking form and press save without changing anything (if a save button is shown).
    CLAUDE CHECK C-S02-10: form version number did not change. `[F02-21]`

## Location and booking link
22. Log in as **solo-owner** → **Settings → Business location**: Address "10 E2E High Street, London SW1A 1AA", phone 07700 900456, Tax rate **20**, Tax number **GB123456789**. Save.
    You should see: "Location saved" (values may already be these; change the phone last digit and save to prove it works). `[F02-22]`
    (Shown on invoices in S07 and the website contact block in S13.)
23. Log in as **m01** → **Staff** → your own profile → working hours: set every day Closed, save. Open **Settings → Booking settings**.
    You should see: a warning list (no working hours) with a **Fix this** button; the booking link card says **Not ready**. Restore Mon–Sat 09–18 afterwards and see it become ready. `[F02-23]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F02-01 | ☐ | ☐ | + C-S02-01 |
| F02-02 | ☐ | ☐ | + C-S02-02 |
| F02-03 | ☐ | ☐ | |
| F02-04 | ☐ | ☐ | B-004? |
| F02-05 | KG-06 ☐ | ☐ | |
| F02-06 | ☐ | ☐ | |
| F02-07 | ☐ | ☐ | + C-S02-03 |
| F02-08 | ☐ | ☐ | |
| F02-09 | ☐ | ☐ | |
| F02-10 | ☐ | ☐ | |
| F02-11 | ☐ | ☐ | |
| F02-12 | ☐ | ☐ | + C-S02-04 |
| F02-13 | ☐ | ☐ | + C-S02-05, B-008? |
| F02-14 | ☐ | ☐ | |
| F02-15 | ☐ | ☐ | + C-S02-06 |
| F02-16 | ☐ | ☐ | + C-S02-07 |
| F02-17 | ☐ | ☐ | + C-S02-08 |
| F02-18 | ☐ | ☐ | |
| F02-19 | ☐ | ☐ | + C-S02-09, B-009? B-011? |
| F02-20 | ☐ | ☐ | |
| F02-21 | ☐ | ☐ | C-S02-10 |
| F02-22 | ☐ | ☐ | |
| F02-23 | ☐ | ☐ | |
