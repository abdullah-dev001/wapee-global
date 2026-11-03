# S12 — Messages, reminders and reviews (40 min, plus a short look the next day)

**Goal:** reminders go out at the right time and can be unsubscribed; the message log and retries work; push alerts work on desktop; reviews are collected, answered and moderated safely.
**Logins / windows:** A = `team-owner` · B (Incognito) = `team-rec`, `team-mgr`, `team-stf1` · C (Safari) = `sa` · G = guest · Gmail tab.
**Ready first:** S05, S07 and S11 done (completed appointments: Cara Fake (S05), Ada with Lee (S07 step 7), S11 Comm C with Sam). Ada's daily email cap: do steps 1–2 on a day Ada has had few emails.

## Reminders and unsubscribe
1. B: log in as **team-rec** → Calendar → New appointment: **Ada Real**, Haircut, **Sam**, **tomorrow 15:00** (New York).
   CLAUDE CHECK C-S12-01: a `reminder` row due exactly 24 h before on the New York wall clock (today 15:00 New York = 01:00 Pakistan), plus a `staff_reminder` push row. `[F09-03]`
2. **Next day** (after 01:10 Pakistan time): Gmail → the reminder for Ada.
   You should see: reminder with the business name, 15:00 New York, and an **Unsubscribe** link. `[F09-03]`
   CLAUDE CHECK C-S12-02: reminder `sent` within one cron run of its due time.
3. Open the Unsubscribe link (do not press anything yet), then close the tab. Open it again and press **Unsubscribe**.
   You should see: the page alone changes nothing; after the button, a confirmation. `[F09-09]`
   CLAUDE CHECK C-S12-03: before the press no suppression; after it, `reminder` + `review_request` suppressed for that address only; booking confirmations still sent; a forged token POST gets the same answer and changes nothing.

## Message log and retries
4. B: log in as **team-mgr** → **Settings** → **Message log**. Use the Channel, Status and Branch filters; scroll to the end. 📱
   You should see: recipients masked (e.g. `wa•••@gmail.com`), statuses like Sent / "The provider refused it" / "Not sent: no contact details", 20 per page with **Show more** / Load more. `[F09-10]`
   B: log in as **team-rec** → type `/settings/messages`: "You don't have access to this".
5. B (team-mgr): Calendar → open **Cara Fake**'s completed Haircut (S05) → message status → **Try again** on the refused email.
   You should see: "Queued to send again" (it will be refused again by the DEV sender — that is fine). `[F09-11]`
   CLAUDE CHECK C-S12-04: the retry is a fresh outbox row with a new idempotency key; an `ambiguous_send` row is not retryable.
   CLAUDE CHECK C-S12-05: no raw token, email address or message body in `messages`, `audit_logs`; `sealed` emptied on finished rows. `[F09-12]`
6. B (team-rec): open **Ben Nomail**'s D4 16:00 booking (S03): **Reschedule** to 16:30, and after its time **Mark completed**.
   You should see: the drawer shows no message sent to the customer. `[F09-06]`
   CLAUDE CHECK C-S12-06: no client email/SMS row for Ben at all; staff push rows exist.

## Push alerts (desktop Chrome on localhost)
7. Use **Window A** (Incognito cannot keep push alerts): sign out, log in as **team-rec**, type `/settings/my-notifications` (Settings is hidden for this role) → **Enable notifications** → allow in the browser prompt. Under **Tell me about**, switch **New bookings** on. G: book E2E Team Salon Haircut, Any, D2 12:00, **S12 Push** +1 202 555 0170.
   You should see: "Notifications turned on"; a desktop notification for the new booking; clicking it opens the app. `[F09-13]`
8. A (team-rec): My notifications → switch **New bookings** off. G: book another (D2 12:30, **S12 Push 2** +1 202 555 0171).
   You should see: no notification this time. Then **Sign out**. `[F09-15]`
   CLAUDE CHECK C-S12-07: no `staff_new_booking` row for team-rec for the second booking; after sign-out team-rec's push token is gone.
   F09-14 (iPhone Safari) and Android PWA push need the HTTPS Vercel preview — **later**.
9. CLAUDE CHECK C-S12-08: daily / per-recipient caps (6th message to one address in 24 h skipped `recipient_cap`, suite 17). `[F09-16]`
   CLAUDE CHECK C-S12-09: cron jobs healthy, no growing dead backlog. `[F09-17]`
10. B (team-rec): open any confirmed online booking (e.g. S12 Push) and look for "Send manage link again".
    You should see: none — **KG-02** (known gap). `[F09-18]`

## Reviews
11. B (team-rec): Calendar → Ada's completed appointment with **Lee** (S07 step 7) → **Review link** → **Copy link** (or **Get review link again** if none shows). G: open it → 2 stars, comment "S12 slow service" → **Send review**.
    Then the same for **S11 Comm C** (Sam): 5 stars, comment `<img src=x onerror=alert(1)>` → Send review.
    You should see: "How was your visit?" with business and service; both times the same "Thank you! Your review has been sent."; no "Review on Google" button (no Google link can be set — **KG-01**); nowhere asks you to name the staff; the odd comment shows as plain text, no popup. `[F10-02]` `[F10-07]`
    CLAUDE CHECK C-S12-10: two reviews, first name only stored, staff = Lee / Sam.
12. G: open Ada's review link again; then the same link with one character changed.
    You should see: one generic "This page didn't load" page for both. `[F10-03]`
    CLAUDE CHECK C-S12-11 (writes one SQL clock change; asks first): a 31-day-old link gets the same generic page.
13. A: log in as **team-owner** → **Reviews** → the 2-star → **Reply** "S12 sorry" → save. B: log in as **team-rec** → Reviews; then **team-stf1** → Reviews.
    You should see: "Reply saved" and the reply shown; Receptionist has no Reply button; Sam sees only his own (5-star) review. `[F10-04]`
    CLAUDE CHECK C-S12-12: `reply_to_review` as team-rec refused; reply audited.
14. A (team-owner) → Reviews → both → **Show on website**.
    You should see: marked "On website". (Website view: S13 step 8. The 12-review cap: C-S12-13.) `[F10-05]`
    CLAUDE CHECK C-S12-13: a 13th featured review is refused (suite 16).
    CLAUDE CHECK C-S12-14: REST update of a review's comment / rating is refused; unchanged. `[F10-06]`
15. B: log in as **team-mgr** → Calendar → **Cara Fake**'s completed Haircut (not reviewed) → **Get review link again**. G: open Cara's OLD link (links.md "Review Cara").
    You should see: the old link shows the generic page; a new link is shown. On Ada's (already reviewed) appointment the reissue is refused. `[F10-08]`
16. C: log in as **sa** → Super admin → `e2e-team` → **Reviews** → **Load reviews** → **Remove** the 2-star, Reason "S12 test removal".
    You should see: "Review removed."; owner's Reviews list no longer features it. `[F10-09]` `[F17-10]`
    CLAUDE CHECK C-S12-15: audit row with the reason, visible to the business owner.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F09-03 | ☐ | ☐ | + C-S12-01/02 (next day) |
| F09-06 (rest) | ☐ | ☐ | + C-S12-06 |
| F09-09 | ☐ | ☐ | + C-S12-03 |
| F09-10 | ☐ | ☐ | |
| F09-11 | ☐ | ☐ | + C-S12-04 |
| F09-12 | C | | C-S12-05 |
| F09-13 | ☐ | ☐ | desktop only; phone later |
| F09-14 | Later | | needs HTTPS preview |
| F09-15 | ☐ | ☐ | + C-S12-07 |
| F09-16 | C | | C-S12-08 |
| F09-17 | C | | C-S12-09 |
| F09-18 | KG-02 ☐ | ☐ | |
| F10-01 | C | | C-S05-09 |
| F10-02 | ☐ | ☐ | + C-S12-10 |
| F10-03 | ☐ | ☐ | + C-S12-11 |
| F10-04 | ☐ | ☐ | + C-S12-12 |
| F10-05 | ☐ | ☐ | + C-S12-13, website in S13 |
| F10-06 | C | | C-S12-14 |
| F10-07 | KG-01 ☐ | ☐ | |
| F10-08 | ☐ | ☐ | |
| F10-09 | ☐ | ☐ | + C-S12-15 |
| F17-10 | ☐ | ☐ | same as F10-09 |
