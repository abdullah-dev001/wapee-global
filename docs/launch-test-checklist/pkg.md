# PKG — Add-on: Packages and sessions

[← Back to the index](../launch-test-checklist.md) · 9 cases (P0 4, P1 5, P2 0)

### PKG-001 · Create a package `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/packages`
- **Preconditions:** Packages add-on on
- **Steps:**
  1. Packages > New
  2. Name '5 cuts', sessions 5, bonus 1, price, validity 30 days, services Haircut
  3. Save
- **Expected:** Listed; search works (2+ chars), 20 per page.
- **Must be refused / negative:** Sessions 0/1000 -> 'Sessions must be a whole number from 1 to 999.'; bonus 1000; validity 0/3651 -> 'Validity must be from 1 to 3650 days, or empty.'; no service -> 'Choose at least one service.'; duplicate name -> 'A package with that name already exists here.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-002 · Edit and delete a package `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/packages`
- **Preconditions:** Package (one sold)
- **Steps:**
  1. Change price and services
  2. Delete (confirm)
- **Expected:** Definition updated; already-sold client packages keep their snapshot (sessions, price paid, services, expiry).
- **Must be refused / negative:** Deleted package in an open draft -> 'That package is no longer available.' at issue.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-003 · Sell a package through an invoice `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/invoices`
- **Preconditions:** Client, package
- **Steps:**
  1. New invoice for client > Add package > issue
- **Expected:** Client profile Packages shows balance 6 (5+1), expiry = sold local date + 30 days (inclusive).
- **Must be refused / negative:** No client -> refused at issue; qty must be 1.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-004 · Use a session on own appointment `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/calendar`
- **Preconditions:** Staff, confirmed own appointment for that client and covered service
- **Steps:**
  1. Appointment > Packages > Use a session
- **Expected:** Balance drops by 1; history shows the deduction.
- **Must be refused / negative:** Second use on same appointment -> 'A session was already used for this appointment.'; other staff's appointment -> forbidden.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-005 · Deduction refusals `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/calendar`
- **Preconditions:** Packages in different states
- **Steps:**
  1. Use on a pending appointment
  2. Use a package of another client
  3. Use for an uncovered service
  4. Use an expired package
  5. Use a cancelled package
  6. Use when 0 left
- **Expected:** Respective messages: only confirmed/completed / different client / doesn't cover this service / expired / cancelled / No sessions left.
- **Must be refused / negative:** Balance never goes below 0 (two people pressing at once: only one wins).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-006 · Undo within 10 minutes `P1`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/calendar`
- **Preconditions:** Session just used by you
- **Steps:**
  1. Undo within 10 min
  2. Use again, wait 11 min, try Undo
- **Expected:** Undo works without reason; after 10 min -> 'The 10-minute undo window has passed...'
- **Must be refused / negative:** Another user cannot undo your deduction (needs reverse permission).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-007 · Reverse with reason `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/calendar`
- **Preconditions:** Manager (packages.reverse_session)
- **Steps:**
  1. Reverse an old deduction with reason 'ab', then 'Wrong client'
- **Expected:** Short reason refused; reversal adds a new row, balance restored; appointment can be deducted again.
- **Must be refused / negative:** Reversing twice -> 'That session was already returned.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-008 · Credit note and packages `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Invoice with a package line
- **Steps:**
  1. Full credit note with no sessions used
  2. Another invoice: use a session, then full credit note
- **Expected:** First: package cancelled (state badge). Second: refused 'Sessions of a package on this invoice were already used...' and nothing changes.
- **Must be refused / negative:** A partial credit never cancels a package.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PKG-009 · Staff without packages.sell `P1`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/packages`
- **Preconditions:** Staff
- **Steps:**
  1. Look for Packages nav
- **Expected:** Hidden; Staff sees package block only on own appointments.
- **Must be refused / negative:** /packages -> no-access.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
