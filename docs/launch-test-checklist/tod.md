# TOD — Today screen

[← Back to the index](../launch-test-checklist.md) · 6 cases (P0 0, P1 5, P2 1)

### TOD-001 · Today list and counts `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** Appointments today in branch timezone
- **Steps:**
  1. Open Today
- **Expected:** Counts: total, pending (approvers only), completed; list in time order; next upcoming highlighted; cancelled excluded.
- **Must be refused / negative:** 'Today' follows the BRANCH timezone, not the device (set device to another zone to check).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### TOD-002 · Quick actions with confirm `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** Pending and confirmed rows
- **Steps:**
  1. Approve a pending row
  2. Complete / no-show a confirmed row
- **Expected:** Each opens a confirm dialog, then updates counts; completed rows show Create/View invoice.
- **Must be refused / negative:** Quick actions respect permissions (Staff: no approve).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### TOD-003 · Row opens the detail drawer `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** Any row
- **Steps:**
  1. Tap the summary (not the buttons)
- **Expected:** Same detail drawer as Calendar.
- **Must be refused / negative:** Pressing an action button does not also open the drawer.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### TOD-004 · Staff sees own appointments only `P1`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/today`
- **Preconditions:** Staff
- **Steps:**
  1. Open Today
- **Expected:** Only own appointments; no pending count.
- **Must be refused / negative:** No other staff's clients.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### TOD-005 · Empty state and refresh `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** No appointments today
- **Steps:**
  1. Open Today
  2. Pull to refresh (native) / wait 30 s
- **Expected:** Calm empty state; new bookings appear within 30 s while visible.
- **Must be refused / negative:** No error state when simply empty.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### TOD-006 · Mobile branch switcher and low-stock badge on Today `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** Business with 2 branches; inventory with a low product
- **Steps:**
  1. 375: open Today
- **Expected:** Compact branch switcher above counts; low-stock badge for inventory.view holders.
- **Must be refused / negative:** Single-branch business shows no switcher.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
