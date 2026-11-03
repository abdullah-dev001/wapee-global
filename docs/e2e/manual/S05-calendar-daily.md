# S05 — Calendar and the daily work (40 min)

**Goal:** the front desk can see, create, move, cancel, approve and complete appointments; every rule holds and the calendar refreshes without reloading.
**Logins / windows:** A = `team-owner`, later `biz-owner` · B (Incognito) = `team-rec`, `team-mgr`, `team-stf1`, `biz-mgr-ldn`, `biz-custom` · G = guest.
**Ready first:** S04 done (Ada's LDN booking is pending). Re-use **D2** from S02. Best on another day than S04 (Ada's 5-emails-per-day cap).
All E2E Team Salon times are New York time.

## Views
1. A: log in as **team-owner** → **Calendar**. 📱 Switch **Day**, **Week**, **List**. In List: filter **All statuses → Confirmed**, search `S0` (2 characters), then `S` (1 character).
   You should see: Day = one column per person (Sam, Lee, Kim, Ana, Raj) with grey for closed hours / breaks / time off; Week = a 7-day strip plus a day grid; List = 20 per page with **Load more**; search only starts at 2 characters. `[F05-01]`
   CLAUDE CHECK C-S05-01: the counts on screen match the database for that week.

## Creating
2. B: log in as **team-rec** → Calendar → **New appointment** → **Existing client** → search "Ada" → **Ada Real**, Haircut, **Sam**, **D2 10:00** → **Book appointment**.
   You should see: it appears as Confirmed. `[F05-02]`
   CLAUDE CHECK C-S05-02: `booking_confirmed` email queued (with no manage link inside) and staff push queued. Gmail: the email arrives without a "manage" link. `[F09-08]`
3. B: New appointment, new client **S05 Late** (+1 202 555 0140), Haircut, Sam, **D2 19:00** (after closing).
   You should see: an out-of-hours warning, and you can still book it. `[F05-03]`
4. B: New appointment, **New client** **S05 Orphan** (+1 202 555 0141), Haircut, **Sam**, **D2 10:00** (Ada has it).
   You should see: refused (time taken), friendly message. `[F05-04]`
   CLAUDE CHECK C-S05-03: no client "S05 Orphan" exists.
5. B: **Book walk-in** now: client **Ada Real**, Haircut, any free person.
   You should see: saved with source **Walk-in**. `[F05-05]`
   CLAUDE CHECK C-S05-04: nothing queued in the outbox for the walk-in. `[F09-07]`
6. A (owner): New appointment, Haircut, **Sam**, **D2 10:15** (inside Ada's 10:00–10:30), new client **S05 Double** (+1 202 555 0142).
   You should see: refused; Ada's appointment unchanged. `[F05-06]`

## Changing
7. B: log in as **team-mgr**. Open Ada's **D2 10:00** → **Reschedule** → 11:00 and person **Lee** → **Save new time**. Then Reschedule again: keep 11:00, change only the person to **Kim**.
   You should see: "Appointment moved" both times. `[F05-07]`
   CLAUDE CHECK C-S05-05: one `rescheduled` email for the time change; nothing to the customer for the person-only change.
8. B: log in as **team-stf1** (Sam). Open one of Sam's appointments → Reschedule.
   You should see: no way to choose another person. `[F05-08]`
   CLAUDE CHECK C-S05-06: `update_appointment` moving it to Lee is refused; row unchanged.
9. B: log in as **team-rec**. Open Ada's D2 11:00 (Kim) → **Cancel** → reason "S05 test" → **Cancel appointment**. Then open it again.
   You should see: Cancelled; no Approve / Complete / No-show / Reschedule buttons any more. `[F05-09]`
   CLAUDE CHECK C-S05-07: `cancelled` email + `staff_cancelled` push queued, the reminder superseded, and every later status change refused. `[F09-05]`
10. B (team-rec): New appointment **S05 NoShow** (+1 202 555 0143), Haircut, any free person, **today** about 2 hours from now. Open it → **Mark no-show**.
    You should see: refused (it has not started). Come back after its start time and **Mark no-show** again: works. `[F05-10]`
11. B (team-rec): New appointment for new client **Cara Fake** (+1 202 555 0103, `cara.e2e@wapee-dev.test`), Haircut, any free person, **today 1 hour ago** (a past time). Open it → **Mark completed**.
    You should see: Completed, and a dialog with a **Review link** and **Copy link**. Copy it to links.md as "Review Cara". `[F05-11]`
    CLAUDE CHECK C-S05-08: exactly one review request + one `review_request` email row.
12. B (team-rec): open Cara's completed appointment → look for **Reopen**. Then log in as **team-mgr**, Reopen it, then Mark completed again.
    You should see: Receptionist has no Reopen (or it is refused); Manager can reopen. `[F05-14]` (The "has an invoice" part is in S07 step 15.)
    CLAUDE CHECK C-S05-09: reopen audited; still exactly one review request (no second email). `[F10-01]`

## Approvals (E2E Multi Clinic)
13. B: log in as **biz-mgr-ldn** → **Today** (LDN) → find Ada's pending Colour (D1 10:00) → **Approve** → confirm.
    You should see: a confirm dialog first ("Approve this appointment?"), then Confirmed. `[F05-12]`
    CLAUDE CHECK C-S05-10: `booking_confirmed` queued after approval.
14. CLAUDE CHECK C-S05-11: as **biz-stf-nyc** (staff), `approve_appointment` and cancel on a Nora appointment are refused; rows unchanged. `[F05-13]`
15. A: log in as **biz-owner**. Calendar → New appointment at **TYO** (Taro) **today** Tokyo time, and at **LDN** (Lena) today London time (new clients **S05 Tokyo** +81 90 1234 5678, **S05 London** +44 7700 900144). Open **Today**, switch the branch LDN → TYO.
    You should see: each branch's own date as "today" (Tokyo is 9 hours ahead of London; after 20:00 Pakistan time Tokyo is already tomorrow). Counts and the "next" appointment follow the branch. Quick actions ask before acting. `[F05-15]`

## Freshness and details
16. B: log in as **team-rec**, open Calendar on today (New York date). Open DevTools → Network → filter **WS**. In G book E2E Team Salon for a later time today (Haircut, Any, **S05 Live** +1 202 555 0145).
    You should see: the new booking appears in B within 30 seconds without reloading; **Refresh** works; WS list stays empty (no live socket). `[F05-16]`
17. B: log in as **biz-mgr-ldn**, open Ada's LDN Colour → **Booking form answers**. Then log in as **biz-custom** and open the same appointment. Then (biz-mgr-ldn) open Cara Fake's 29 Mar 2027 booking.
    You should see: Manager sees "Allergies: Pollen" marked **Sensitive**; the custom role does not see Allergies. Cara's message status says the provider refused it, with **Try again**. `[F05-17]`
18. B: log in as **team-stf1**. Calendar Day and List.
    You should see: only Sam's column / Sam's appointments; no "All staff" choice. `[F05-18]`
    CLAUDE CHECK C-S05-12: the API returns only Sam's appointments for this user.
19. A: log in as **team-owner** → **Staff → Lee** → switch **Active** off, save (Lee has future bookings). Calendar → the day of Lee's next booking.
    You should see: Lee's column is still shown, labelled "(Inactive)". If deactivation is refused, note the message. Switch Lee back to Active. `[F05-19]`

The branch switcher (F05-20) is in S10.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F05-01 | ☐ | ☐ | + C-S05-01 |
| F05-02 | ☐ | ☐ | + C-S05-02 |
| F05-03 | ☐ | ☐ | |
| F05-04 | ☐ | ☐ | + C-S05-03 |
| F05-05 | ☐ | ☐ | + C-S05-04 |
| F05-06 | ☐ | ☐ | |
| F05-07 | ☐ | ☐ | + C-S05-05 |
| F05-08 | ☐ | ☐ | + C-S05-06 |
| F05-09 | ☐ | ☐ | + C-S05-07 |
| F05-10 | ☐ | ☐ | |
| F05-11 | ☐ | ☐ | + C-S05-08 |
| F05-12 | ☐ | ☐ | + C-S05-10 |
| F05-13 | C | | C-S05-11 |
| F05-14 | ☐ | ☐ | + C-S05-09; invoiced part S07 |
| F05-15 | ☐ | ☐ | |
| F05-16 | ☐ | ☐ | |
| F05-17 | ☐ | ☐ | |
| F05-18 | ☐ | ☐ | + C-S05-12 |
| F05-19 | ☐ | ☐ | |
| F09-05 | C | | C-S05-07 |
| F09-07 | C | | C-S05-04 |
| F09-08 | ☐ | ☐ | + C-S05-02 |
