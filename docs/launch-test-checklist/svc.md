# SVC — Services, categories, rooms (resources)

[← Back to the index](../launch-test-checklist.md) · 12 cases (P0 2, P1 9, P2 1)

### SVC-001 · Create a service `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Owner, branch currency USD
- **Steps:**
  1. Services > New service
  2. Name 'Cut & Style', description, duration 45, buffer 10, price 30.00, staff toggles, active + bookable online on
  3. Save
- **Expected:** Toast 'saved'; service listed under its category (or 'Uncategorised' last) with duration, price in branch currency and buffer.
- **Must be refused / negative:** Saving with empty name -> 'Enter a name'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-002 · Service field limits `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Service drawer
- **Steps:**
  1. Duration 4, 1441
  2. Buffer -1, 481
  3. Price -1
  4. Name 121 chars, description 2001 chars
- **Expected:** 'A service must be at least 5 minutes' / 'cannot be longer than a day' / 'The gap cannot be negative' / 'That gap is too long' / 'A price cannot be negative' / 'That name is too long' / 'That description is too long'.
- **Must be refused / negative:** Nothing saved while any error shows.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-003 · Duplicate service name (case-insensitive) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Service 'Haircut' exists
- **Steps:**
  1. Create 'haircut'
- **Expected:** Refused with a clear error; no second service.
- **Must be refused / negative:** A deleted 'Haircut' does not block the name.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-004 · Free service and service without price `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Owner
- **Steps:**
  1. Create a service with price 0
  2. Create one with price left empty
- **Expected:** Price 0 shows as free (0.00 in currency); empty shows 'No price' (not free) and the public page shows no price.
- **Must be refused / negative:** Empty price must not be stored as 0.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-005 · Inactive and not-bookable-online badges `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Two services
- **Steps:**
  1. Turn 'active' off on one
  2. Turn 'bookable online' off on another
  3. Open the public booking page
- **Expected:** Badges show in the list; neither appears on /<slug>/book; the not-online one can still be booked from the dashboard.
- **Must be refused / negative:** Inactive service cannot be picked for new dashboard bookings; history keeps showing it.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-006 · Delete (soft) a service `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Service with past appointments
- **Steps:**
  1. Delete > confirm dialog (says history is kept)
- **Expected:** Disappears from list and booking; past appointments/invoices still show its name.
- **Must be refused / negative:** Cancel in the dialog keeps it.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-007 · Server-side search `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** 15+ services
- **Steps:**
  1. Type 1 char
  2. Type 2 chars
  3. Type a name that matches nothing
- **Expected:** Search starts at 2 chars (debounced ~300 ms); no-match shows the 'emptySearch' state.
- **Must be refused / negative:** 1 char does not filter.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-008 · Category picker (no category management UI) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Services exist
- **Steps:**
  1. Open a service: Category field
  2. Look for any way to create / rename / delete a category
- **Expected:** Picker lists existing categories plus 'no category'.
- **Must be refused / negative:** KNOWN GAP: no UI to create, rename or delete categories (hook exists, unused). Mark as gap; categories only via SQL.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-009 · Branch manager prices only their branch `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/services`
- **Preconditions:** Business plan, 2 branches, Manager of A
- **Steps:**
  1. Edit a service price for branch A
  2. Switch to branch B (if visible) and try
- **Expected:** Branch A price saves. Service name/duration changes need the permission for ALL branches the service is in.
- **Must be refused / negative:** Changing branch B price is refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-010 · Receptionist / Staff cannot manage services `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/services`
- **Preconditions:** Receptionist, Staff
- **Steps:**
  1. Type /services
- **Expected:** No-access state.
- **Must be refused / negative:** Direct insert/update via API refused by RLS.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-011 · Rooms tab: add and delete a room `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** Owner
- **Steps:**
  1. Schedule > Rooms > Add room 'Chair 1'
  2. Delete it
- **Expected:** Room listed (capacity 1); empty state when none; hint explains rooms.
- **Must be refused / negative:** There is no capacity editor and no service-to-room linking in the UI (known); 'use rooms' in booking settings therefore has no effect until linked by SQL.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SVC-012 · Service list ordering and grouping `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/services`
- **Preconditions:** Services in 2 categories + uncategorised
- **Steps:**
  1. Open Services at 375 and 1440
- **Expected:** Grouped by category, uncategorised last, durations pluralised correctly ('1 minute' / '45 minutes').
- **Must be refused / negative:** No overflow of long names at 375.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
