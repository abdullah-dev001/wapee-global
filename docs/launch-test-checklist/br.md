# BR — Multi-branch (locations) — Business plan

[← Back to the index](../launch-test-checklist.md) · 9 cases (P0 4, P1 5, P2 0)

### BR-001 · Add a location `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/branches`
- **Preconditions:** Business plan owner
- **Steps:**
  1. Settings > Locations > Add
  2. Name, country (Pakistan), currency PKR, timezone Asia/Karachi, address, phone, tax number, tax rate 17, prefix KHI
  3. Copy hours from main (optional)
  4. Save
- **Expected:** Location created with its own booking settings; hours copied when chosen; switcher appears in header/More.
- **Must be refused / negative:** Tax rate 101 or 'abc' -> 'Enter a tax rate between 0 and 100.'; prefix 'k_1' -> prefix error; duplicate name -> 'Another location already has this name.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-002 · Prefix rules `P0`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/branches`
- **Preconditions:** Two locations
- **Steps:**
  1. Use the same prefix as another location
  2. Change a prefix after an invoice was issued
  3. Reuse the prefix of an archived location
- **Expected:** 'That invoice prefix is already used, or was used by an archived location.' / 'The invoice prefix cannot change once invoices have been issued.'
- **Must be refused / negative:** No change saved.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-003 · Currency and timezone locks `P0`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/branches`
- **Preconditions:** Location with bookings / prices / upcoming appointments
- **Steps:**
  1. Change currency
  2. Change timezone
- **Expected:** 'The currency cannot change while the location has bookings or prices...' / 'The time zone cannot change while the location has upcoming bookings.'
- **Must be refused / negative:** Unchanged after refusal.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-004 · Archive refusals `P0`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/branches`
- **Preconditions:** Main location; only location; location with upcoming bookings; with draft invoices; used by the website
- **Steps:**
  1. Archive each
- **Expected:** Respective messages: main cannot be archived / only location / N upcoming bookings / N draft invoices / website uses it.
- **Must be refused / negative:** Nothing archived.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-005 · Archive, restore, make main `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/branches`
- **Preconditions:** Clean secondary location
- **Steps:**
  1. Archive (confirm)
  2. Show archived > Restore
  3. Make main
- **Expected:** Toasts; archived hidden from switcher; restored back; main badge moves; public site/booking now use the new main location.
- **Must be refused / negative:** Restoring over the staff cap -> 'Restoring it would put too many staff in this location for your plan.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-006 · Overview tab per currency `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/branches`
- **Preconditions:** Locations in USD and PKR
- **Steps:**
  1. Overview, change month
- **Expected:** Per-location rows + totals PER currency; never added across currencies; note for archived.
- **Must be refused / negative:** Without revenue permission: revenue hidden ('noRevenueAccess').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-007 · Manager of A cannot see/act on B `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/calendar`
- **Preconditions:** Manager of A
- **Steps:**
  1. Open Clients, Calendar, Invoices with branch B selected or by URL
- **Expected:** Only A's data; B absent from the switcher.
- **Must be refused / negative:** B data refused by RLS.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-008 · Public site uses the main location `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/<slug>`
- **Preconditions:** 2 locations
- **Steps:**
  1. Open /<slug> and /<slug>/book
- **Expected:** Address, hours, services and slots of the main location only.
- **Must be refused / negative:** Known limit: no location picker.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BR-009 · Locations gated below Business `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/branches`
- **Preconditions:** Team owner
- **Steps:**
  1. Open /settings/branches
- **Expected:** 'Not included in your plan'.
- **Must be refused / negative:** API create refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
