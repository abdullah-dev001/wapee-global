# APT — Appointments and calendar

[← Back to the index](../launch-test-checklist.md) · 26 cases (P0 9, P1 16, P2 1)

> Status transitions: pending->confirmed (approve), pending->cancelled, confirmed->cancelled/completed/no_show, completed/no_show->confirmed (reopen: Owner/Manager only, not invoiced). Cancelled is final.

### APT-001 · Calendar Day view `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Branch with 3 staff and appointments today
- **Steps:**
  1. Open Calendar (Day)
  2. Use prev/next date buttons
  3. Return to today
- **Expected:** Hour ruler + one column per staff, closed hours shaded per staff (their hours, breaks, time off), current-time line on today, overlapping blocks side by side.
- **Must be refused / negative:** No appointment from another branch or business appears.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-002 · Calendar Week view `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Same data
- **Steps:**
  1. Switch to Week
  2. Tap another day in the 7-day strip
- **Expected:** Locale-aware week strip; the grid shows the selected day; URL keeps the tab.
- **Must be refused / negative:** Reloading the page restores the same tab and date (web URL params).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-003 · Calendar List view: filters, search, paging `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** 40+ appointments
- **Steps:**
  1. List tab
  2. Filter status, staff, service
  3. Search a client name (2+ chars)
  4. Scroll to load more
  5. Pull to refresh (mobile)
- **Expected:** Server-side filtered list, more rows load at the end, skeleton while loading, empty state for no match.
- **Must be refused / negative:** Error from the server shows an error state with Retry, not an empty list.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-004 · Mobile Day view staff switcher `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** 375 width, holder of calendar.view_all_staff
- **Steps:**
  1. Open Day view
  2. Change staff in the select
- **Expected:** One column at a time with a staff select.
- **Must be refused / negative:** Staff role does not get the select (see own-scope case).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-005 · Refresh and 30 s auto refresh `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Two browsers: A on Calendar, B creates a booking
- **Steps:**
  1. Wait ≤30 s on A with the tab visible
  2. Hide A's tab for a minute, show it again
  3. Press Refresh
- **Expected:** New booking appears within ~30 s while visible, immediately on focus and on Refresh.
- **Must be refused / negative:** No polling while the tab is hidden (check network tab); no Realtime websocket.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-006 · Create appointment for an existing client `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Client exists
- **Steps:**
  1. New appointment
  2. Search client, pick
  3. Service, staff, date, time
  4. Client notes + internal notes
  5. Create
- **Expected:** Appointment appears as Confirmed in Day/List; confirmation email queued for clients with email.
- **Must be refused / negative:** Submit cannot be double-pressed into two appointments.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-007 · Create with a new client `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** No client
- **Steps:**
  1. Choose 'New client': name, phone, email
  2. Create
- **Expected:** Client created and linked.
- **Must be refused / negative:** Invalid phone -> 'Enter a valid phone number.'; invalid email -> 'Enter a valid email address.'; name 161 chars refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-008 · Tap an empty slot pre-fills the form `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Day view
- **Steps:**
  1. Tap an empty time in a staff column
- **Expected:** Create drawer opens with that staff, date and time.
- **Must be refused / negative:** Closing a dirty form asks to confirm (close button, scrim and Android back).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-009 · Any staff assignment `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Two qualified staff, one busier
- **Steps:**
  1. Create with staff = Any staff
- **Expected:** Assigned to a free qualified staff (least loaded).
- **Must be refused / negative:** If nobody is free -> 'No staff member is available for this slot.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-010 · Out-of-hours is a warning, not a block `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Staff works 09-17
- **Steps:**
  1. Create at 18:00
- **Expected:** Warning shown; creating still works (dashboard may book outside hours, notice and window).
- **Must be refused / negative:** Warning does not appear for in-hours times.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-011 · Double booking refused `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Staff X has 10:00-10:30
- **Steps:**
  1. Create another for X at 10:15
- **Expected:** 'That time is no longer available.' (or 'just taken'); nothing created.
- **Must be refused / negative:** Even two people pressing Create at the same time -> only one succeeds.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-012 · Walk-in `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Any
- **Steps:**
  1. Toggle walk-in, Create (button reads 'walk-in')
- **Expected:** Source shows walk-in in the detail; NO email/push is queued for a walk-in.
- **Must be refused / negative:** Walk-in still respects double-booking rules.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-013 · Approve pending `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Pending booking (manual confirmation)
- **Steps:**
  1. Open detail > Approve > confirm
- **Expected:** Status Confirmed; approval badge count drops; confirmation email queued.
- **Must be refused / negative:** Approve not offered for any other status.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-014 · Cancel `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Confirmed booking
- **Steps:**
  1. Detail > Cancel > confirm
- **Expected:** Status Cancelled; disappears from Day grid; slot free again; cancelled email queued.
- **Must be refused / negative:** Cancelled has NO actions afterwards (final).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-015 · Complete and no-show `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Confirmed bookings
- **Steps:**
  1. Mark one Completed
  2. Mark another No-show
- **Expected:** Statuses change; Completed shows 'Create invoice' and the one-time review link dialog with Copy.
- **Must be refused / negative:** Neither offered on pending or cancelled.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-016 · Reopen completed / no-show `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/calendar`
- **Preconditions:** Completed and no-show appointments without invoice
- **Steps:**
  1. Detail > Reopen > confirm
- **Expected:** Back to Confirmed; audit row written.
- **Must be refused / negative:** Not offered to Receptionist/Staff/custom roles; once an invoice (even a draft) exists -> 'This appointment has an invoice and cannot be reopened.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-017 · Receptionist actions `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/calendar`
- **Preconditions:** Receptionist
- **Steps:**
  1. Open a confirmed and a completed appointment
- **Expected:** Can create, cancel, approve, complete, no-show; no Reopen.
- **Must be refused / negative:** Reopen via API -> forbidden.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-018 · Staff own scope `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/calendar`
- **Preconditions:** Staff with linked profile
- **Steps:**
  1. Open Calendar
  2. Create an appointment choosing another staff (if offered)
  3. Open an appointment
- **Expected:** Only own column, no staff switcher; created appointment is forced to own staff; can complete/no-show own; no cancel/approve buttons.
- **Must be refused / negative:** Other staff's appointments never visible; cancel/approve via API refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-019 · Every refused transition `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Appointments in each status
- **Steps:**
  1. Via API (or old tab) try: approve confirmed; complete pending; cancel cancelled; no-show completed; reopen cancelled
- **Expected:** Each -> 'That action isn't allowed for this appointment's current status.' and the row is unchanged.
- **Must be refused / negative:** Cancelled can never come back.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-020 · Dashboard edit / reschedule of an appointment `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Confirmed booking
- **Steps:**
  1. Open detail: look for Edit / Reschedule / change notes
- **Expected:** Product doc (decision 13, §6.3): create/reschedule/cancel via form from the dashboard.
- **Must be refused / negative:** KNOWN GAP: the detail drawer has no edit/reschedule (RPC exists, no UI). Mark FAIL / gap.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-021 · Resend manage link to the client `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Booking with email
- **Steps:**
  1. Look for 'resend manage link'
- **Expected:** Product doc (decision 3): the business can resend the guest manage link from the dashboard; a new link replaces the old one.
- **Must be refused / negative:** KNOWN GAP: no button in the UI (Edge Function exists). Mark gap.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-022 · Detail drawer content `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Completed booking with packages/forms/files add-ons on
- **Steps:**
  1. Open detail
- **Expected:** Status, client, service, staff, time, source; invoice button; package block; forms block; files block; message status list (event/channel/status); review link action.
- **Must be refused / negative:** Booking-form answers are NOT shown anywhere (known gap).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-023 · Pending approval badge `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(shell)`
- **Preconditions:** 2 pending bookings
- **Steps:**
  1. 375: look at the Calendar tab
  2. 1440: look at the header chip
- **Expected:** Badge/chip shows 2 for approvers; tapping the chip opens the calendar.
- **Must be refused / negative:** No badge for Staff (no approve permission).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-024 · Message status in detail `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Booking with sent/failed emails
- **Steps:**
  1. Open detail > messages
- **Expected:** Event, channel, status, code listed; no recipient address or body.
- **Must be refused / negative:** Staff at own scope see nothing here.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-025 · Branch switcher changes calendar data `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/calendar`
- **Preconditions:** Business plan, 2 branches
- **Steps:**
  1. Switch branch (header on desktop, More / Today on mobile)
- **Expected:** Calendar, Today, Clients, Invoices, Reports follow the chosen branch.
- **Must be refused / negative:** No data from the previous branch remains on screen.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### APT-026 · Very many overlapping appointments `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** 5 overlapping bookings for one staff (via group capacity)
- **Steps:**
  1. Day view
- **Expected:** Blocks split into side-by-side columns, readable at 375 and 1440.
- **Must be refused / negative:** No block hidden behind another.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
