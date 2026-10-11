# STF — Staff

[← Back to the index](../launch-test-checklist.md) · 7 cases (P0 1, P1 6, P2 0)

### STF-001 · Create staff without login `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Owner
- **Steps:**
  1. Staff > New
  2. Display name 'Dr. A', job title, email (contact only), phone, branch, services
  3. Save
- **Expected:** Listed with a 'No app access' badge; email hint says it does not create a login.
- **Must be refused / negative:** Empty name -> 'Enter a name'; 121 chars -> 'That name is too long'; phone 33 chars -> 'That phone number is too long'; bad email -> 'Enter a valid email address'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STF-002 · Edit, deactivate, hide from online booking `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Staff member
- **Steps:**
  1. Turn active off
  2. Turn bookable online off on another
- **Expected:** Inactive: badge, no new bookings, history kept. Not-online: hidden on public page, still bookable in dashboard.
- **Must be refused / negative:** Inactive staff do not count to the plan cap.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STF-003 · Remove staff (soft) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Staff with past appointments
- **Steps:**
  1. Delete > confirm
- **Expected:** Gone from list and booking; past appointments still name them.
- **Must be refused / negative:** Cancel keeps them.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STF-004 · Search staff `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** 8+ staff
- **Steps:**
  1. Search 2+ chars; search a missing name
- **Expected:** Filters; empty-search state.
- **Must be refused / negative:** No crash on emoji / RTL input.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STF-005 · Staff cannot add or edit staff profiles `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/staff`
- **Preconditions:** Staff
- **Steps:**
  1. Open Staff
- **Expected:** List readable; no create/edit/delete actions; only their own 'Schedule' button.
- **Must be refused / negative:** API insert/update refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STF-006 · Manager edits staff of own branch only `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/staff`
- **Preconditions:** Business, 2 branches, Manager of A
- **Steps:**
  1. Edit a staff member only in A
  2. Edit one in A and B
- **Expected:** A-only staff editable. A+B staff needs cover for every branch -> refused.
- **Must be refused / negative:** Staff of only B not editable.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STF-007 · Staff cap refusal leaves no ghost `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`) · **Screen:** `/staff`
- **Preconditions:** Solo at cap
- **Steps:**
  1. Add a new active staff with a location
- **Expected:** Plan message shown; the half-created profile is removed (no location-less ghost in the list).
- **Must be refused / negative:** List count unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
