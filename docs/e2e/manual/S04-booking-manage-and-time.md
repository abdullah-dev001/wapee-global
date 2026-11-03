# S04 — Public booking: locations, approval, manage link, time zones (40 min)

**Goal:** multi-location booking, owner approval, group slots, rooms and the custom form work; the guest manage link can view / move / cancel within the rules; times are right across time zones and clock changes.
**Logins / windows:** G = guest (customer) · C (Safari) = second guest · A = `team-owner` / `biz-owner` · B (Incognito) = `biz-mgr-ldn` · Gmail tab.
**Ready first:** S03 done; "Ada D1" manage link in `~/.wapee-e2e/links.md`. Best on a **different day from S03**: Ada may receive only 5 emails per 24 h (the 6th is skipped on purpose).
This session makes ~9 public bookings: if you see "Too many attempts", wait an hour.

## Choosing a location (E2E Multi Clinic)
1. G: open `/e2e-multi/book`. 📱 Look at the location list. Pick **NYC**, look at services and prices; then press **Change location** and pick **TYO**.
   You should see: LDN, NYC, TYO with address and time zone. NYC: prices in **$**, person **Nora**, "Times shown in America/New_York". TYO: prices in **¥** (no decimals), **Taro**. Changing location clears your choices. `[F04-02]`
2. Open, one by one: `/e2e-multi/book?branch=NYC`, `/e2e-multi/book?branch=29701e7a-5692-48b2-9092-ca5fd69c6020` (LDN id), `/e2e-multi/book?branch=410bd80a-3851-4122-953d-14202cacd5e6` (a branch of ANOTHER business).
   You should see: the first two open with NYC / LDN already chosen; the third shows the normal location list, with no hint that the id exists. (An archived branch code is tested in S10.) `[F04-03]`

## Owner approves, rooms, custom form (LDN)
3. A: log in as **biz-owner** → Settings → Booking settings → Booking form → Edit **Short note** → **Required** on, Save question. (If the Edit drawer opens empty, that is B-011: skip "required" in step 4.)
4. G: `/e2e-multi/book?branch=LDN` → **Colour** → **Lena** → **D1 10:00**. In Your details: leave **Short note** empty and press Confirm; then type `abc` in **Age**; then fill properly: **Ada Real**, +1 202 555 0101, `wapeeglobal@gmail.com`, Short note "S04 note", Age 30, Allergies "Pollen". Confirm.
   Also compare with **Haircut**: the "Hair length" question appears only for its service.
   You should see: "This is required." under Short note; "Enter a number." under Age; then **Request sent** / "Awaiting confirmation" (LDN = owner approves). Copy the manage link to links.md as "Ada LDN". `[F04-15]` `[F04-18]`
   CLAUDE CHECK C-S04-01: status `pending`; answers stored with the form version; `pending_received` email + `staff_pending_approval` push queued; stored `starts_at` = 10:00 UTC (London is on GMT in November). `[F19-01]`
5. Gmail: open Ada's new email.
   You should see: "Request received" wording (NOT "confirmed") and a "Location: LDN …" line. `[F09-02]`
6. G: Colour → **Liam** → **D1**.
   You should see: no 10:00 for Liam (Room 1 is busy with Ada's pending booking; a pending booking holds the slot). `[F04-12]`
   CLAUDE CHECK C-S04-02: Room 1 is the only room for Colour, and the engine has no Liam 10:00 slot.
7. A: set **Short note** back to optional.

## Group slot (NYC, 3 people per slot)
8. G: `/e2e-multi/book?branch=NYC` → Haircut → **Nora** → **D1 17:00**. Book 3 times: (1) **Ada Real** +1 202 555 0101 with her email, (2) **S04 Group B** +1 202 555 0130, (3) **S04 Group C** +1 202 555 0131. Then look at 17:00 again.
   You should see: all three booked; after the third, 17:00 is gone for Nora. `[F04-11]`
   CLAUDE CHECK C-S04-03: exactly 3 appointments at that slot; a 4th direct booking is refused `slot_unavailable`.
9. Gmail: Ada's NYC confirmation.
   You should see: "Location: NYC, 2 E2E Ave, New York" and **17:00** New York time. `[F12-11]`

## Manage link (E2E Team Salon)
10. G: open the **Ada D1** link from S03.
    You should see: first name only ("Ada"), Haircut, Sam, D1 10:00 with the time zone; the long `#token=…` part disappears from the address bar. `[F04-24]`
11. On that page press **Reschedule**, pick another free time on D1 or D2 (same person, Sam), **Confirm new time**.
    You should see: "Your booking has been moved."; only Sam's times offered. `[F04-27]`
    CLAUDE CHECK C-S04-04: `rescheduled` email queued, old reminder cancelled, new reminder for the new time. `[F09-04]`
12. Press **Cancel booking** → **Yes, cancel it**.
    You should see: "Your booking has been cancelled." In G, the booking page offers that time again. `[F04-25]`
    CLAUDE CHECK C-S04-05: status `cancelled` by guest, `cancelled` email queued, unsent reminder superseded.
13. G: book E2E Team Salon **Haircut**, Any, at a time **less than 24 hours** from now (New York time; tomorrow morning is fine), **S04 Soon** +1 202 555 0132 (no email). Save its link as "Soon". Open the link.
    You should see: no Cancel button and a plain explanation (cut-off is 24 h); Reschedule is also refused / not offered. `[F04-26]`
    CLAUDE CHECK C-S04-06: a direct cancel with this token is refused `cancel_window_passed`; appointment unchanged.
14. A: log in as **team-owner** → Booking settings → **Customers can cancel** off, Save. G: book Haircut, Any, D2 11:00, **S04 NoCancel** +1 202 555 0133, open its manage link.
    You should see: no Cancel button. Turn **Customers can cancel** on again. `[F04-29]`
    CLAUDE CHECK C-S04-07: direct cancel answers `not_cancellable`.
15. Bad links. Open each and compare:
    (a) the "Soon" link with the last character of the token changed; (b) the **Ada D1** link again (now cancelled);
    (c) G: book `/e2e-other/book` Haircut, any time, **S04 Other** +1 202 555 0134, copy its manage link and change `e2e-other` to `e2e-team` in it; (d) `/e2e-team/manage#token=hello`.
    You should see: one generic "not valid or expired" page for a, c, d. For b the plan also expects that page; if it shows the cancelled booking instead, report it as a question, not a bug. `[F04-28]`

## Two customers, one time
16. Window G and Window C (Safari) side by side: both open `/e2e-team/book` → Haircut → **Lee** → **D2 15:00** → fill details (**S04 Race A** +1 202 555 0135 / **S04 Race B** +1 202 555 0136). Press Confirm in both as close together as you can.
    You should see: one gets "You're booked!"; the other is told the time was just taken, is sent back to the times, and their typed details are still there. `[F04-22]`
    CLAUDE CHECK C-S04-08: exactly one appointment at Lee D2 15:00; no orphan client for the loser.

## Clock changes (spring 2027)
17. G: `/e2e-multi/book?branch=NYC` → Haircut → Nora → **Monday 15 March 2027** (the day after US clocks go forward). Note the first time.
    You should see: times from 09:00 New York, as on any other Monday. `[F19-02]`
    CLAUDE CHECK C-S04-09: 09:00 New York on 15 Mar 2027 = 13:00 UTC (EDT); the slot-engine DST suite passes (the plan's 14 Mar is a Sunday, closed).
18. G: `/e2e-multi/book?branch=LDN` → Haircut → Lena → **Monday 29 March 2027 10:00**, **Cara Fake** +1 202 555 0103, `cara.e2e@wapee-dev.test`. Window B: log in as **biz-mgr-ldn** → Today / Calendar (LDN) → go to 29 Mar 2027 → open it → **Approve**.
    You should see: Calendar and the manage page both show **10:00**. `[F19-03]`
    CLAUDE CHECK C-S04-10: stored 09:00 UTC (BST); reminder due 28 Mar 2027 10:00 London = 09:00 UTC, i.e. wall clock, not 24 real hours. `[F19-04]`

## Claude-only checks for this area (ask when you are done)
- C-S04-11 bot protection (honeypot, missing / forged start token, instant submit) `[F04-20]`
- C-S04-12 rate limit: the 11th booking from one IP in an hour gets 429 — **uses the hourly budget; Claude asks before running** `[F04-21]`
- C-S04-13 10 parallel bookings for one slot → exactly 1 row `[F19-07]` (writes test bookings; asks first)
- C-S04-14 dashboard vs public race for one slot → 1 row, no orphan client `[F19-08]`
- C-S04-15 the database itself forbids double-booking (staff + time and room + time exclusion constraints) `[F19-06]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F04-02 | ☐ | ☐ | |
| F04-03 | ☐ | ☐ | archived part in S10 |
| F04-11 | ☐ | ☐ | + C-S04-03 |
| F04-12 | ☐ | ☐ | + C-S04-02 |
| F04-15 | ☐ | ☐ | + C-S04-01 |
| F04-18 | ☐ | ☐ | + C-S04-01 |
| F04-20 | C | | C-S04-11 |
| F04-21 | C | | C-S04-12 |
| F04-22 | ☐ | ☐ | + C-S04-08 |
| F04-24 | ☐ | ☐ | |
| F04-25 | ☐ | ☐ | + C-S04-05 |
| F04-26 | ☐ | ☐ | + C-S04-06 |
| F04-27 | ☐ | ☐ | |
| F04-28 | ☐ | ☐ | |
| F04-29 | ☐ | ☐ | + C-S04-07 |
| F09-02 | ☐ | ☐ | |
| F09-04 | C | | C-S04-04 |
| F12-11 | ☐ | ☐ | |
| F19-01 | C | | C-S04-01 |
| F19-02 | ☐ | ☐ | + C-S04-09 |
| F19-03 | ☐ | ☐ | + C-S04-10 |
| F19-04 | C | | C-S04-10 |
| F19-07 | C | | C-S04-13 |
| F19-08 | C | | C-S04-14 |
| F19-06 | C | | C-S04-15 |
