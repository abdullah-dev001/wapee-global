# NAV — App shell, navigation and branch switcher

[← Back to the index](../launch-test-checklist.md) · 6 cases (P0 1, P1 4, P2 1)

### NAV-001 · Shell per breakpoint `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(shell)`
- **Preconditions:** Resize 375 / 768 / 1024 / 1440
- **Steps:**
  1. Navigate at each width
- **Expected:** <768: bottom tabs (Today, Calendar, Clients, More); 768-1023: sidebar; ≥1024: sidebar + header (pending chip, low-stock badge, branch switcher).
- **Must be refused / negative:** Layout never decided by platform; no horizontal page scroll.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NAV-002 · More screen `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/more`
- **Preconditions:** 375
- **Steps:**
  1. Open More
- **Expected:** Branch switcher (multi-branch), the remaining allowed destinations, admin entry (super admin aal2 only), Sign out. Dev builds show a component gallery link.
- **Must be refused / negative:** Gallery link absent in the production build.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NAV-003 · Branch switcher `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `(shell)`
- **Preconditions:** 2+ live locations
- **Steps:**
  1. Switch branch in header (desktop) / More or Today (mobile)
  2. Archive the selected branch from another session
- **Expected:** Data screens follow the selection; a stale/archived selection falls back to the main location.
- **Must be refused / negative:** Single-location businesses show no switcher.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NAV-004 · Business switching for a member of two businesses `P0`

- [ ] **Actor:** Member of two businesses (`MULTI`) · **Screen:** `(shell)`
- **Preconditions:** User in business X (default) and Y
- **Steps:**
  1. Look for a business switcher (header avatar, More, sidebar)
- **Expected:** Expected: a member of two businesses can open either business.
- **Must be refused / negative:** KNOWN GAP: no business switcher UI (header avatar is a placeholder); the user always lands on the default business and cannot reach Y. Mark FAIL/gap; check Y data never leaks into X screens.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NAV-005 · Browser back/forward and deep links `P1`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `(shell)`
- **Preconditions:** Web
- **Steps:**
  1. Open drawers (invoice, appointment), filters in URL, then Back
- **Expected:** Back closes the drawer / restores previous filters; deep links reopen the same state.
- **Must be refused / negative:** Back never leaves the app unexpectedly from a drawer.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### NAV-006 · Header avatar `P2`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `(shell)`
- **Preconditions:** Desktop
- **Steps:**
  1. Click the 'W' avatar in the header
- **Expected:** Expected: user menu.
- **Must be refused / negative:** KNOWN: placeholder, does nothing.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
