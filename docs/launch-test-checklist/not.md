# NOT — Notifications: emails, unsubscribe, settings, message log, push

[← Back to the index](../launch-test-checklist.md) · 20 cases (P0 4, P1 14, P2 2)

> Dev: real emails reach ONLY the Resend account owner's inbox (wapeeglobal@gmail.com) — use it as the CLIENT email. Other addresses end 'dead / rejected' in the log. Worker runs every minute, reminders every 5 min. SMS is OFF at launch.

### NOT-001 · Booking confirmed email (with manage link) `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(email)`
- **Preconditions:** Public booking with client email = test inbox
- **Steps:**
  1. Book
  2. Wait ≤2 min
  3. Open the email
- **Expected:** Email 'booking confirmed' with business name, service, local time + zone, and a working manage link (/<slug>/manage#token=...). Message log shows 'sent'.
- **Must be refused / negative:** No other client's data in the email; the token never appears in the message log.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-002 · Pending received email `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(email)`
- **Preconditions:** Manual confirmation branch
- **Steps:**
  1. Book
- **Expected:** 'Request received / pending' email; after Approve, a 'confirmed' email.
- **Must be refused / negative:** No reminder while pending.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-003 · Reminder email on the branch clock `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(email)`
- **Preconditions:** Reminders on, 24 h; booking created > 24 h ahead
- **Steps:**
  1. Wait until 24 h before (or set hours to 1 and book 1 h 10 min ahead)
- **Expected:** Reminder arrives at start minus N hours local (± 5 min).
- **Must be refused / negative:** Not sent for cancelled / completed / no-show / pending / walk-in, nor when the booking was made after the reminder time.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-004 · Rescheduled and cancelled emails `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(email)`
- **Preconditions:** Booking with email
- **Steps:**
  1. Reschedule via manage link
  2. Cancel it
- **Expected:** 'Rescheduled' then 'Cancelled' emails (no manage link in them: known limit).
- **Must be refused / negative:** Reschedule cancels the old unsent reminder; only the new one is sent.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-005 · Review request email `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(email)`
- **Preconditions:** Review requests on; booking with email completed
- **Steps:**
  1. Mark completed
  2. Check inbox
- **Expected:** Review request email with the review link; reissuing the link sends a new email and kills the old link.
- **Must be refused / negative:** No review request when review requests are switched off.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-006 · Portal sign-in email `P1`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `(email)`
- **Preconditions:** Portal add-on on, client email = test inbox
- **Steps:**
  1. Request portal link
- **Expected:** Email with /<slug>/portal#token= link valid 15 min, single use.
- **Must be refused / negative:** Unknown email gets no email but the same on-screen answer.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-007 · Form signing link email `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(email)`
- **Preconditions:** Forms add-on, client email = test inbox
- **Steps:**
  1. Client profile > Forms > Send link (email)
- **Expected:** Email with /<slug>/sign#token= link.
- **Must be refused / negative:** Link used/revoked before sending -> email skipped as stale.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-008 · Low stock email + report summary email `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(email)`
- **Preconditions:** Inventory add-on; scheduled weekly report
- **Steps:**
  1. Sell a product below its alert level
  2. Wait for Monday send hour (or check queued row)
- **Expected:** Low-stock email to members with inventory.adjust; weekly report email with per-currency figures to eligible members.
- **Must be refused / negative:** Recipients who lost the permission are skipped (stale).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-009 · Manage-link email (resend) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(email)`
- **Preconditions:** Any booking
- **Steps:**
  1. Look for a way to resend the manage link
- **Expected:** Template exists, but there is NO button to trigger it (see APT gap).
- **Must be refused / negative:** Mark as not testable from UI.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-010 · Unsubscribe flow `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/unsubscribe`
- **Preconditions:** Reminder or review email with unsubscribe link
- **Steps:**
  1. Open the link (/unsubscribe#token=...)
  2. Read the page, check the address bar
  3. Press Unsubscribe
- **Expected:** Page explains (reminders and review requests only); nothing happens until the button is pressed; afterwards 'If this link was valid, you have been unsubscribed...'; token stripped from the URL.
- **Must be refused / negative:** Opening the page alone (link scanners) unsubscribes nothing.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-011 · Unsubscribe effect and limits `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `(email)`
- **Preconditions:** After unsubscribing
- **Steps:**
  1. Make a new booking with the same email
  2. Complete it
- **Expected:** Confirmation email still arrives (transactional); reminder and review request are suppressed (log shows skipped).
- **Must be refused / negative:** Suppression is per business: another business still sends reminders.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-012 · Forged / edited / expired unsubscribe token `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/unsubscribe`
- **Preconditions:** Edit one char of the token; use a 61-day-old one; open /unsubscribe with no token
- **Steps:**
  1. Press Unsubscribe
- **Expected:** Same 'If this link was valid...' text for all; no token -> 'This link is not complete. Open the link from your email again.'
- **Must be refused / negative:** Nothing is suppressed for forged tokens (check log).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-013 · Notification settings `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/notifications`
- **Preconditions:** Owner or Manager (settings.booking)
- **Steps:**
  1. Settings > Notifications
  2. Toggle reminders, set hours 1 and 72 (try 0 / 73)
  3. Toggle review requests
  4. Set quiet hours
  5. Save
- **Expected:** Saved per branch; stepper limits 1-72; 'SMS messages are coming soon.' instead of an SMS toggle; preview shows the email version.
- **Must be refused / negative:** Read-only roles see 'You can view these settings but not change them.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-014 · Message log `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/messages`
- **Preconditions:** Messages sent/failed
- **Steps:**
  1. Settings > Message log
  2. Filter channel, status, branch
  3. Load more
- **Expected:** Rows with event, channel, status, masked recipient, cost, scrubbed error; 20 per page.
- **Must be refused / negative:** No full addresses, bodies or tokens.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-015 · Notification settings and log hidden for desk roles `P1`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/settings/notifications`
- **Preconditions:** Receptionist, Staff
- **Steps:**
  1. Type /settings/notifications and /settings/messages
- **Expected:** No-access (settings.booking needed).
- **Must be refused / negative:** No log rows readable by API.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-016 · My notifications (web, desktop Chrome) `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/my-notifications`
- **Preconditions:** Production web build with VAPID key; or dev showing the state
- **Steps:**
  1. Settings > My notifications > Enable notifications
  2. Allow the browser prompt
  3. Toggle per-event switches
  4. Turn off on this device
- **Expected:** States: on/off; per-event switches (New bookings, Bookings that need approval, Cancellations, Upcoming appointments) save.
- **Must be refused / negative:** Prompt only after pressing the button (never on page load). Denied -> 'Notifications are blocked...'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-017 · Push state messages `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `/settings/my-notifications`
- **Preconditions:** Different browsers
- **Steps:**
  1. iPhone Safari tab
  2. Firefox private window / unsupported browser
  3. Dev build without VAPID key
- **Expected:** iPhone tab: 'On iPhone and iPad, add this app to your Home Screen first...'; unsupported: 'This browser does not support push notifications...'; no key: 'Push notifications are not set up for this build yet.'
- **Must be refused / negative:** No enable button that silently fails.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-018 · Walk-ins and channel rule `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/messages`
- **Preconditions:** Walk-in booking; booking for a client without email
- **Steps:**
  1. Create both
  2. Check message log
- **Expected:** Walk-in: nothing queued. No-email client: nothing (SMS off).
- **Must be refused / negative:** Never email AND SMS for one event.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-019 · Daily caps and per-recipient cap `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/messages`
- **Preconditions:** SQL/seed heavy booking
- **Steps:**
  1. Send 6 messages to one recipient within 24 h
- **Expected:** 6th skipped 'recipient_cap' in the log.
- **Must be refused / negative:** No crash; other recipients unaffected.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NOT-020 · SMS credits screen hidden for owners `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/sms-credits`
- **Preconditions:** Owner
- **Steps:**
  1. Type /settings/sms-credits
- **Expected:** Redirects to /settings (SMS off at launch).
- **Must be refused / negative:** No SMS credits card on the hub.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
