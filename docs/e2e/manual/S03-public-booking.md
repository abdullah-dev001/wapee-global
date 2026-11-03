# S03 — Public booking: the basics (35 min)

**Goal:** a customer can book E2E Team Salon online, and every booking rule (staff choice, notice, window, buffer, interval, hours, prices, email, phone) works.
**Logins / windows:** A = `team-owner` (changes Booking settings) · G = guest window for the customer (`http://localhost:8090/e2e-team/book`) · Gmail tab.
**Ready first:** S02 done (S02 Closure deleted). Re-use **D1** from S02 (7–10 days ahead), pick **D4** = 4–6 days ahead (Mon–Fri, not D1/D3).
Times are New York time ("Times shown in America/New_York"). This session makes ~7 public bookings: stay under 10 per hour.
Keep a private note `~/.wapee-e2e/links.md` for manage links (they are secret keys; never put them in the repo or chat).

## First booking
1. G: open `/e2e-team/book`. 📱 Pick **Haircut** → **Sam** → **D1** → **10:00** → Your details: **Ada Real**, +1 202 555 0101, `wapeeglobal@gmail.com` → **Confirm booking**.
   You should see: "You're booked!" with date, time, Sam, and **Manage your booking** with a **Copy link** button ("Link copied"). Copy the link into `links.md` as "Ada D1". `[F04-01]`
   CLAUDE CHECK C-S03-01: appointment `confirmed`, source `online`, client Ada created, `booking_confirmed` email queued with a sealed token, staff push queued.
2. Gmail: open the booking confirmation for Ada (allow ~2 min).
   You should see: business name, **10:00** with the New York time zone, a link that opens the booking (Manage page). Not in Spam. `[F09-01]`
   (If the link starts with `https://wapee.online`, swap that part for `http://localhost:8090` — README §1.)
   CLAUDE CHECK C-S03-02: outbox row `sent` with a provider id.

## Who the customer sees
3. A: log in as **team-owner** → **Settings → Booking settings** → **Choosing a person** = **Hidden**, Save. In G reload `/e2e-team/book` → Haircut.
   Then set **Required**, reload → Haircut. Then set **Optional** again.
   You should see: Hidden = no person step; Required = you must pick a person ("Any available person" not offered); Optional = "Any available person — We will assign whoever is free." `[F04-04]`
4. A: Calendar → New appointment ×2 for **Sam** on **D4** (09:00 and 15:00, new clients **S03 Sam A** +1 202 555 0120, **S03 Sam B** +1 202 555 0121). G: book **Haircut**, **Any available person**, **D4 11:00**, customer **S03 Any** +1 202 555 0122 (no email).
   You should see: booked; the confirmation shows a person who is **not Sam** (Sam has the most bookings that day). `[F04-05]`
   CLAUDE CHECK C-S03-03: which staff got it, and that person had the fewest bookings that local day.

## Time rules
5. G: open the booking page, Haircut, Any, **today** (New York date).
   You should see: the first time offered is at least 60 minutes from now (New York time), or no times if it's late. `[F04-06]`
   CLAUDE CHECK C-S03-04: a direct booking 30 minutes from now is refused `slot_unavailable` and nothing is written.
6. G: move forward day by day to day **30** from today, then day **31**.
   You should see: day 30 has times (if it is Mon–Sat), day 31 has none / cannot be picked. `[F04-07]`
   CLAUDE CHECK C-S03-05: a direct booking on day 31 is refused.
7. A: Calendar → New appointment: **Colour** (90 min + 15 min gap) for **Sam**, **D4 12:00**, new client **S03 Colour** +1 202 555 0123. G: Haircut → **Sam** → **D4**.
   You should see: no Sam start time between 12:00 and 13:45 (Colour 12:00–13:30 + 15 min gap; 13:00–13:30 is also his break). `[F04-08]`
   CLAUDE CHECK C-S03-06: engine slots for Sam on D4 agree.
8. A: Booking settings → **Start times every** = **1 hour**, Save. G: reload, Haircut, any day. Then **Service length**, then back to **15 min**.
   You should see: 1 hour → times on the hour (09:00, 10:00 …); Service length → every 30 min for Haircut; 15 min → :00 :15 :30 :45. `[F04-09]`
9. A: **Staff → Sam → working hours**: Saturday 10:00–17:00 (keep the 13:00–13:30 break). G: Sam → next Saturday; then 26 Nov (Thanksgiving closure).
   You should see: Saturday times from 10:00, last Haircut start 16:30, nothing 13:00–13:29; 26 Nov no times. Put Saturday back to 09:00–18:00. `[F04-10]`
   CLAUDE CHECK C-S03-07: no engine slot outside branch ∩ staff hours, break, closure or time off.
10. A: Booking settings → **Times to show** = **Show booked**, Save. G: Sam → D4.
    You should see: Sam's booked times (09:00, 12:00 …) visible but greyed / "— already booked", not pressable. Set back to **Free only**. `[F04-13]`
11. A: **Show prices** off, Save. G: reload.
    You should see: no price anywhere on the booking page (service list, summary). Turn **Show prices** on again. `[F04-14]`

## Customer details
12. G: book Haircut, Any, **D4** 16:00, **Ben Nomail**, +44 7700 900123, no email.
    You should see: booked (email is optional). `[F04-16]` `[F09-06]`
    CLAUDE CHECK C-S03-08: no client message queued (no email, SMS off); staff push still queued; phone stored `+447700900123`.
13. A: Booking settings → **Require an email address** on. G: book any time with **S03 Need Mail** +1 202 555 0124 and no email.
    You should see: "Enter your email." under the field; no booking. Turn the setting off again. `[F04-16]`
14. G: start a booking, type phone **12345**, try to confirm. Then type the UK number **07700 900125** with country United Kingdom.
    You should see: "Enter a valid phone number." for 12345; the UK number is accepted (book it as **S03 UK** on D4 17:00). `[F04-17]`
    CLAUDE CHECK C-S03-09: stored as `+447700900125`.
15. G: book again with Ada's phone +1 202 555 0101 but name **Ada Typo** (no email), Haircut, Any, D1 14:00.
    You should see: the same "You're booked!" screen as any booking (no hint that the phone is known). `[F04-19]`
    CLAUDE CHECK C-S03-10: client name still "Ada Real"; the new appointment links to the same client.
16. G: book Haircut, Any, D1 15:00, name **سارا**, +971 50 123 4567, no email.
    You should see: the Arabic name shown correctly on the confirmation. A: open the appointment in Calendar: name correct (not "???"). `[F20-11]`
17. G: start a booking: Haircut → Any → a day → a time → type a name in Your details. Press the browser **Back** button several times.
    You should see: back to time → person → service, step by step; leaving the filled form asks "Discard your details?". `[F04-30]`

## "Not available" looks the same every time
18. G: open each and compare: `/e2e-nope-xyz/book` (unknown), `/rosario-clinic-19481/book` (trial ended), then A: log in as **oth-owner** → Booking settings → **Online booking** off → G `/e2e-other/book`, then turn it back on.
    Also `/m01-studio/book` while m01 has no working hours (repeat S02 step 23 if you like).
    You should see: the same "Not available" page every time; nothing tells which reason. `[F04-23]`
    CLAUDE CHECK C-S03-11: the API answers identically (`not_bookable`) for all four.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F04-01 | ☐ | ☐ | + C-S03-01 |
| F04-04 | ☐ | ☐ | |
| F04-05 | ☐ | ☐ | + C-S03-03 |
| F04-06 | ☐ | ☐ | + C-S03-04 |
| F04-07 | ☐ | ☐ | + C-S03-05 |
| F04-08 | ☐ | ☐ | + C-S03-06 |
| F04-09 | ☐ | ☐ | |
| F04-10 | ☐ | ☐ | + C-S03-07 |
| F04-13 | ☐ | ☐ | |
| F04-14 | ☐ | ☐ | |
| F04-16 | ☐ | ☐ | |
| F04-17 | ☐ | ☐ | + C-S03-09 |
| F04-19 | ☐ | ☐ | + C-S03-10 |
| F04-23 | ☐ | ☐ | + C-S03-11 |
| F04-30 | ☐ | ☐ | |
| F09-01 | ☐ | ☐ | + C-S03-02 |
| F09-06 (booking part) | ☐ | ☐ | + C-S03-08 |
| F20-11 | ☐ | ☐ | |
