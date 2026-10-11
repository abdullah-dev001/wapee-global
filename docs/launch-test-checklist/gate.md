# GATE — Plan and add-on gates (feature must be hidden AND blocked)

[← Back to the index](../launch-test-checklist.md) · 13 cases (P0 0, P1 12, P2 1)

### GATE-001 · commission not available on Solo `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`)
- **Preconditions:** Solo plan business
- **Steps:**
  1. Look for and open: Commission nav, /commission
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-002 · advanced reports not available on Solo `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`)
- **Preconditions:** Solo plan business
- **Steps:**
  1. Look for and open: /settings/advanced-reports card and route
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-003 · multi-branch not available on Solo `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`)
- **Preconditions:** Solo plan business
- **Steps:**
  1. Look for and open: /settings/branches card and route, branch switcher
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-004 · custom roles not available on Solo `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`)
- **Preconditions:** Solo plan business
- **Steps:**
  1. Look for and open: /settings/roles card and route
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-005 · multi-branch not available on Team `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan business
- **Steps:**
  1. Look for and open: /settings/branches
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-006 · branch comparison not available on Team `P2`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan business
- **Steps:**
  1. Look for and open: Advanced reports Locations section
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-007 · custom roles (add-on off) not available on Team `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan business
- **Steps:**
  1. Look for and open: /settings/roles
- **Expected:** Hidden from menus; a typed route shows 'Not included in your plan' (no prices).
- **Must be refused / negative:** Server refuses with feature_unavailable; nothing is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-008 · Add-on OFF: packages `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan with this add-on switched off by super admin
- **Steps:**
  1. Check: Packages nav, client Packages, invoice 'Add package', appointment package block
  2. Switch it on again
- **Expected:** Everything hidden while off; data reappears unchanged when switched on.
- **Must be refused / negative:** Server refuses module RPCs while off (feature_unavailable / generic public answers).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-009 · Add-on OFF: inventory `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan with this add-on switched off by super admin
- **Steps:**
  1. Check: Inventory nav, invoice 'Add product', low-stock badge
  2. Switch it on again
- **Expected:** Everything hidden while off; data reappears unchanged when switched on.
- **Must be refused / negative:** Server refuses module RPCs while off (feature_unavailable / generic public answers).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-010 · Add-on OFF: files & photos `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan with this add-on switched off by super admin
- **Steps:**
  1. Check: client / appointment Files sections
  2. Switch it on again
- **Expected:** Everything hidden while off; data reappears unchanged when switched on.
- **Must be refused / negative:** Server refuses module RPCs while off (feature_unavailable / generic public answers).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-011 · Add-on OFF: forms & consent `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan with this add-on switched off by super admin
- **Steps:**
  1. Check: Settings > Forms, client / appointment Forms sections, /<slug>/sign links
  2. Switch it on again
- **Expected:** Everything hidden while off; data reappears unchanged when switched on.
- **Must be refused / negative:** Server refuses module RPCs while off (feature_unavailable / generic public answers).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-012 · Add-on OFF: client portal `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`)
- **Preconditions:** Team plan with this add-on switched off by super admin
- **Steps:**
  1. Check: /<slug>/portal (login answers 'sent' but no email; links invalid)
  2. Switch it on again
- **Expected:** Everything hidden while off; data reappears unchanged when switched on.
- **Must be refused / negative:** Server refuses module RPCs while off (feature_unavailable / generic public answers).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GATE-013 · Trial has every feature and add-on `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`)
- **Preconditions:** Business on trial
- **Steps:**
  1. Open every module
- **Expected:** All plan features and add-ons available, no staff caps.
- **Must be refused / negative:** After trial end every feature is off until a plan is assigned.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
