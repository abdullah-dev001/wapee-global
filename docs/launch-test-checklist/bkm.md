# BKM — Guest manage page /<slug>/manage#token=

[← Back to the index](../launch-test-checklist.md) · 10 cases (P0 6, P1 4, P2 0)

### BKM-001 · View booking from manage link `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Fresh booking + its manage link
- **Steps:**
  1. Open the link
  2. Look at the address bar
- **Expected:** Shows business, branch, service, staff, local time + zone, status, FIRST NAME only. The #token is removed from the address bar after loading.
- **Must be refused / negative:** No phone, email, full name or ids on the page or in the response.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-002 · Cancel within the window `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Booking > 24 h away, customer can cancel
- **Steps:**
  1. Cancel > confirm
- **Expected:** Status Cancelled; slot freed; cancelled email queued; the link then shows the generic invalid page.
- **Must be refused / negative:** Dismissing the dialog changes nothing.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-003 · Cancel after the cutoff `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Booking 2 h away, cutoff 24 h
- **Steps:**
  1. Open the link
- **Expected:** No cancel button; a plain explanation that it is too late online.
- **Must be refused / negative:** API cancel -> cancel_window_passed (409); booking unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-004 · Customer cannot cancel setting off `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** customer_can_cancel off
- **Steps:**
  1. Open link
- **Expected:** No cancel button.
- **Must be refused / negative:** API cancel -> not_cancellable.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-005 · Reschedule (same staff) `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Confirmed booking
- **Steps:**
  1. Reschedule > pick a new day/time > confirm
  2. Reopen the SAME link
- **Expected:** Booking moved; same link still works and shows the new time; rescheduled email queued.
- **Must be refused / negative:** Choosing a time outside hours (API) -> slot_unavailable and the booking stays at its original time (not cancelled).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-006 · Reschedule with 'Any staff' booking `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Booked as any staff; that person busy at desired time
- **Steps:**
  1. Try to reschedule to that time
- **Expected:** Time not offered (only the assigned staff's availability; known limit).
- **Must be refused / negative:** Record behaviour.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-007 · Invalid / tampered / replayed / cancelled-booking token `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Change one char of the token; reuse after cancel; random 64-char token; token < 32 chars
- **Steps:**
  1. Open each
- **Expected:** All show 'This link is not valid or has expired' (same page).
- **Must be refused / negative:** No difference between cases; nothing about the business leaks.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-008 · Manage page rate limit and network errors `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Reload the manage link 60+ times in an hour; go offline
- **Steps:**
  1. Observe
- **Expected:** 429 -> calm message, no retry loop; offline -> overlay / retry.
- **Must be refused / negative:** No crash.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-009 · Back from reschedule view `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** In reschedule sub-view
- **Steps:**
  1. Browser/Android back or Escape
- **Expected:** Returns to the booking view, not out of the page.
- **Must be refused / negative:** No accidental exit.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKM-010 · Completed / no-show / cancelled booking via link `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/manage`
- **Preconditions:** Booking completed in dashboard
- **Steps:**
  1. Open its manage link
- **Expected:** Either the status is shown with no cancel/reschedule buttons, or the generic invalid page; record which.
- **Must be refused / negative:** API cancel -> not_cancellable.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
