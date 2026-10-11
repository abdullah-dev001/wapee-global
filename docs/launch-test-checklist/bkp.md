# BKP — Public booking page /<slug>/book

[← Back to the index](../launch-test-checklist.md) · 24 cases (P0 12, P1 11, P2 1)

### BKP-001 · Book end to end (auto confirm) `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Bookable branch, auto confirm, staff choice optional
- **Steps:**
  1. Open /<slug>/book
  2. Pick service
  3. Pick staff or 'Any staff'
  4. Pick date + time
  5. Fill name, phone (country picker), email, notes
  6. Wait 3+ s, submit
- **Expected:** Confirmation shows status Confirmed, summary in branch local time with timezone name, and a manage link (#token=) with Copy and a 'shown once' note. Appointment appears in Calendar; confirmation email queued.
- **Must be refused / negative:** Double-clicking submit creates exactly one booking.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-002 · Manual confirmation gives Pending `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** confirmation = manual
- **Steps:**
  1. Book
- **Expected:** Confirmation says pending/request received; appointment is Pending in Calendar with the approval badge.
- **Must be refused / negative:** Pending booking does not get a reminder.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-003 · Staff choice modes `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Set hidden, then optional, then required
- **Steps:**
  1. Book in each mode
- **Expected:** Hidden: staff step skipped; optional: 'Any staff' + staff who perform the service; required: must pick one.
- **Must be refused / negative:** Staff who do not perform the chosen service are never listed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-004 · Slot display modes `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** only_available vs all_greyed
- **Steps:**
  1. Open the slot step in each mode
- **Expected:** Only available: taken times hidden. All greyed: taken times visible but disabled.
- **Must be refused / negative:** Greyed slot cannot be selected or submitted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-005 · Show prices off `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** show_prices off
- **Steps:**
  1. Open service step
- **Expected:** No prices on the page.
- **Must be refused / negative:** Price not in the network response either.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-006 · Minimum notice `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Notice 120 min
- **Steps:**
  1. Look at today's slots
- **Expected:** No slot earlier than now + 2 h.
- **Must be refused / negative:** A booking request for an earlier time (API) -> slot_unavailable.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-007 · Booking window `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Window 7 days
- **Steps:**
  1. Navigate the calendar beyond 7 days
- **Expected:** No slots beyond the window.
- **Must be refused / negative:** API request beyond -> slot_unavailable.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-008 · Buffer between appointments `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Service buffer 15 (or branch buffer 15)
- **Steps:**
  1. Book 10:00 (30 min)
  2. Look at slots after
- **Expected:** Next free slot for that staff starts at 10:45 or later.
- **Must be refused / negative:** No overlapping booking accepted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-009 · Group capacity `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** people per slot 3
- **Steps:**
  1. Book the same slot 3 times (different phones)
  2. Try a 4th
- **Expected:** First 3 succeed; slot then unavailable; 4th -> 'That time was just taken. Pick another.'
- **Must be refused / negative:** Never 4 in a 3-person slot (even with two tabs at once).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-010 · Two guests race for the last slot `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Two browsers on the same slot
- **Steps:**
  1. Both fill the form
  2. Submit at the same time
- **Expected:** Exactly one succeeds; the other returns to the slot step with 'That time was just taken' and keeps all typed answers.
- **Must be refused / negative:** Never a double booking (DB exclusion constraint).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-011 · Form validation `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Form step
- **Steps:**
  1. Submit empty
  2. Name 161 chars
  3. Phone too short / letters
  4. Bad email
  5. Notes 2001 chars
  6. Required custom fields empty; number field 'abc'; short text 501 chars
- **Expected:** 'Enter your name.' / 'That name is too long.' / 'Enter a valid phone number.' / 'Enter a valid email address.' / 'That note is too long.' / 'This is required.' / 'Enter a number.' / 'That answer is too long.'
- **Must be refused / negative:** No request is sent while invalid.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-012 · Email required setting `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** require_client_email on
- **Steps:**
  1. Leave email empty
- **Expected:** 'Enter your email.'
- **Must be refused / negative:** Off: email optional.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-013 · Too fast submit auto-retries once `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Fill the form within 3 s (autofill)
- **Steps:**
  1. Submit immediately after slots load
- **Expected:** Page waits ~1 s and resubmits automatically; booking succeeds without retyping.
- **Must be refused / negative:** No second booking is created by the retry.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-014 · Honeypot `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** DevTools: fill the hidden 'company_website' input
- **Steps:**
  1. Submit
- **Expected:** Generic error; no booking created.
- **Must be refused / negative:** Field is off-screen (not display:none), not reachable by Tab.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-015 · Rate limits `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Same IP / same phone
- **Steps:**
  1. Make 11 bookings within an hour from one IP (or 6 in a day with one phone)
- **Expected:** Further attempts show 'Too many attempts' / 'Please wait a little before trying again.' with no retry loop.
- **Must be refused / negative:** Blocked attempts still count; no booking created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-016 · Not-bookable states are indistinguishable `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/<slug>/book`
- **Preconditions:** Unknown slug; business with trial ended; booking switched off; branch with warnings
- **Steps:**
  1. Open /<slug>/book for each
- **Expected:** All show the same generic 'not available' state.
- **Must be refused / negative:** Nothing reveals whether the business exists.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-017 · Back navigation through steps `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** On form step with typed data
- **Steps:**
  1. Press the in-page Back
  2. Use browser / Android back
- **Expected:** Steps back one at a time (form -> slot -> staff -> service); dirty form asks to confirm discarding.
- **Must be refused / negative:** Back never leaves the page from the middle of the flow silently.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-018 · Timezone display `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Branch in America/New_York, your device in another zone
- **Steps:**
  1. Look at slot times and the confirmation
- **Expected:** Times are branch local with the timezone note/name.
- **Must be refused / negative:** Not converted to the device zone.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-019 · Closures, time off, breaks, out-of-hours `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Holiday tomorrow, staff X off Friday, break 13-14
- **Steps:**
  1. Browse those days
- **Expected:** No slots on the holiday, none for X on Friday, none during the break, none outside opening hours.
- **Must be refused / negative:** API cannot book them either.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-020 · Returning phone does not overwrite client `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Existing client with phone P and name 'Ann'
- **Steps:**
  1. Book with phone P and name 'Annie', new email
- **Expected:** Booking linked to the existing client; client name/email in the dashboard unchanged.
- **Must be refused / negative:** Response identical to a new phone (no hint the phone is known).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-021 · Primary branch only `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Business with 2 branches
- **Steps:**
  1. Open /<slug>/book
- **Expected:** Shows the PRIMARY branch's services and slots only (no location picker, known limit).
- **Must be refused / negative:** Branch B is not bookable publicly.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-022 · Page metadata `P2`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Web
- **Steps:**
  1. View source / devtools head
- **Expected:** Title and description set; robots noindex.
- **Must be refused / negative:** No business ids in the HTML.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-023 · Phone input country picker `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Form step
- **Steps:**
  1. Pick +44, type national number with leading 0
  2. Pick a country not in the 42-code list
- **Expected:** Number sent as E.164 (+44...); summary shows it correctly.
- **Must be refused / negative:** Unknown country still accepts a valid +E.164 number.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKP-024 · Framed booking page is refused (widget off) `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/book`
- **Preconditions:** Local HTML page with an iframe to /<slug>/book (dev) 
- **Steps:**
  1. Open the HTML page
- **Expected:** Framed page shows 'This booking form isn't available here' (EmbedGate).
- **Must be refused / negative:** In production the header frame-ancestors 'self' blocks it entirely (see PROD).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
