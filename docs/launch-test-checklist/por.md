# POR — Add-on: Client portal /<slug>/portal

[← Back to the index](../launch-test-checklist.md) · 10 cases (P0 6, P1 4, P2 0)

### POR-001 · Request sign-in link `P0`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Client of the business with email = test inbox
- **Steps:**
  1. Open /<slug>/portal
  2. Enter email, request
- **Expected:** 'Link sent' screen; email arrives with a 15-minute single-use link.
- **Must be refused / negative:** Unknown email, unknown business or add-on off -> the SAME 'sent' answer and no email.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-002 · Use the link (single use) `P0`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Fresh link
- **Steps:**
  1. Open it
  2. Open it again in another browser
- **Expected:** First: signed in (token stripped from address bar), session 14 days in this tab's session storage. Second: invalid link page.
- **Must be refused / negative:** Expired (>15 min) or replaced link (newer requested) -> invalid.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-003 · Bookings tab `P1`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Client with upcoming + past bookings across linked client rows
- **Steps:**
  1. Open Bookings
- **Expected:** Upcoming and past, staff display names, own booking notes; never internal notes.
- **Must be refused / negative:** Bookings of other clients never shown.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-004 · Cancel and reschedule in portal `P0`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Upcoming booking
- **Steps:**
  1. Reschedule to another slot
  2. Cancel (confirm)
  3. Try cancelling a booking inside the cutoff
- **Expected:** Same rules as manage page; inside cutoff -> 'It is too late to cancel online. Please contact the business.'
- **Must be refused / negative:** Not cancellable states -> 'This booking can't be cancelled.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-005 · Book from the portal `P0`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Bookable branch
- **Steps:**
  1. Book now: service, staff, slot, confirm
- **Expected:** Booking created for the linked client; same engine rules.
- **Must be refused / negative:** Slot taken meanwhile -> 'That time is no longer available.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-006 · Packages, invoices, photos, forms tabs `P1`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Add-ons on, client consent on
- **Steps:**
  1. Open each tab
  2. Open an invoice and print (web)
- **Expected:** Packages balance + usage; ISSUED invoices only with payments/credit notes (no internal notes/reasons); photos only (no PDFs) and only with consent; forms list title/date/signer/status only.
- **Must be refused / negative:** Tabs hidden when their add-on is off; draft invoices never shown.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-007 · Session ends on email change / deletion / sign out `P0`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Signed-in portal session
- **Steps:**
  1. Staff changes the client's email (or archives the client)
  2. Refresh portal
  3. Sign in again, then Sign out
- **Expected:** Access ends at once (invalid session -> login).
- **Must be refused / negative:** Sign out invalidates the token immediately.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-008 · My data requests `P1`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Signed in
- **Steps:**
  1. My data > Request a copy
  2. Request again
  3. Request erasure
- **Expected:** Calm confirmation; repeat -> 'already have an open request'; requests appear in Settings > Data requests.
- **Must be refused / negative:** 6th request in a day -> rate-limited message.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-009 · Dashboard JWT is not a portal session `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Signed-in owner
- **Steps:**
  1. Open /<slug>/portal in the same browser
- **Expected:** Portal shows its own login (owner is not treated as a customer).
- **Must be refused / negative:** No dashboard data in the portal.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### POR-010 · Login rate limits and honeypot `P1`

- [ ] **Actor:** Portal customer (email link) (`PORTAL`) · **Screen:** `/<slug>/portal`
- **Preconditions:** Same IP / same email
- **Steps:**
  1. Request 4 links for one email within an hour
  2. Fill honeypot
- **Expected:** Still the same on-screen answer; extra emails not sent.
- **Must be refused / negative:** No error that reveals the limit per email.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
