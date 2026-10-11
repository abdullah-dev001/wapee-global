# PLAN — Plans, billing, trial, lock screen, feature gating

[← Back to the index](../launch-test-checklist.md) · 15 cases (P0 4, P1 11, P2 0)

> Plans: Solo (1 staff per location, 1 location), Team (5 staff per location, 1 location), Business (unlimited). Team+: commission, advanced reports, widget. Business only: multi-branch, branch comparison; custom roles = Business or Team + add-on. Add-ons: packages, inventory, files & photos, forms & consent, client portal, custom roles. Trial = Business level with every add-on on.

### PLAN-001 · Billing screen on trial `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `/settings/billing`
- **Preconditions:** Owner on trial
- **Steps:**
  1. Settings > Plan and billing
- **Expected:** Shows 'Free trial', status 'Trial', 'Your trial ends on <date> (N days left)', staff per location with 'no limit', locations, 'Every add-on is on during your trial.', 'Change your plan' with Contact us (mailto support@wapee.online, subject names the business).
- **Must be refused / negative:** No prices and no checkout anywhere.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-002 · Billing screen on an active plan `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/billing`
- **Preconditions:** Owner on Team (assigned by super admin)
- **Steps:**
  1. Open Plan and billing
- **Expected:** Plan 'Team', status 'Active', period end if set, 'x of 5 staff' per location, 'Locations: 1 of 1', each add-on On/Off as assigned.
- **Must be refused / negative:** Numbers match the real active staff per location (inactive/deleted staff not counted).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-003 · Billing is Owner-only `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/settings/billing`
- **Preconditions:** Manager, Receptionist, Staff, custom role
- **Steps:**
  1. Look for the Billing card
  2. Type /settings/billing
- **Expected:** No card; route shows no-access.
- **Must be refused / negative:** No plan/subscription details leak to non-owners.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-004 · Trial banner in the last 3 days `P1`

- [ ] **Actor:** Owner on trial (`OWN-T`) · **Screen:** `(shell)`
- **Preconditions:** Trial ending in ~2.5 days, then ~30 h, then ~10 h (super admin extend/SQL to set)
- **Steps:**
  1. Open the app at 375 and 1440
  2. Tap the banner
- **Expected:** Shows 'Your trial ends in 3 days' / 'ends tomorrow' / 'ends today' (error tint on the last day); tapping opens Settings; on mobile the banner sits under the status bar with no double gap.
- **Must be refused / negative:** With 4+ days left, or for Manager/Receptionist/Staff, no banner.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-005 · Trial ended: lock screen `P0`

- [ ] **Actor:** Owner, trial ended / inactive (`OWN-X`) · **Screen:** `/today`
- **Preconditions:** Trial end in the past (super admin or SQL)
- **Steps:**
  1. Open Today, Calendar, Clients, Invoices, Services
  2. Open More, Settings, Billing
- **Expected:** Operational routes show 'Your trial has ended' + 'Your 14-day trial is over...' + 'Nothing has been deleted...' + Contact us + Sign out. Settings, Billing and More open.
- **Must be refused / negative:** No operational data or action is reachable; the public booking page of this business shows the generic 'not available'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-006 · Suspended (multi-business member still signed in): lock wording `P0`

- [ ] **Actor:** Owner, business suspended (`OWN-S`) · **Screen:** `/today`
- **Preconditions:** Business suspended; viewer is a member of another active business too, or hook disabled
- **Steps:**
  1. Open the suspended business screens
- **Expected:** Lock screen with 'This business has been paused...' wording.
- **Must be refused / negative:** No operational access; public pages say not available.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-007 · Reactivation restores everything `P1`

- [ ] **Actor:** Owner, trial ended / inactive (`OWN-X`) · **Screen:** `/today`
- **Preconditions:** Inactive business, then super admin assigns a plan / extends trial
- **Steps:**
  1. Refocus the app (or wait 30 s)
- **Expected:** Lock disappears; all data intact.
- **Must be refused / negative:** Nothing was deleted during the lock.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-008 · Solo: staff cap 1 per location `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`) · **Screen:** `/staff`
- **Preconditions:** Solo business with 1 active staff
- **Steps:**
  1. Staff > add a second active staff at the same location
  2. Reactivate an inactive staff member
- **Expected:** Refused: 'Your plan's staff limit for this location has been reached...' and no ghost profile is left.
- **Must be refused / negative:** Inactive or deleted staff do not count (deactivating one then adding works).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-009 · Team: staff cap 5 per location `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/staff`
- **Preconditions:** Team business with 5 active staff
- **Steps:**
  1. Add a 6th
- **Expected:** Same refusal message.
- **Must be refused / negative:** 5th was allowed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-010 · Business: no staff cap `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/staff`
- **Preconditions:** Business plan
- **Steps:**
  1. Add 6+ staff
- **Expected:** All allowed.
- **Must be refused / negative:** No cap message.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-011 · Location limit on Solo/Team `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/branches`
- **Preconditions:** Team owner
- **Steps:**
  1. Type /settings/branches
- **Expected:** 'Not included in your plan' (multi-branch is Business only); no Locations card on the hub.
- **Must be refused / negative:** create_branch via API -> feature_unavailable / branch limit.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-012 · Plan-gated screens show the calm state `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`) · **Screen:** `/commission`
- **Preconditions:** Solo owner
- **Steps:**
  1. Open /commission, /settings/advanced-reports, /settings/roles, /settings/branches
- **Expected:** Each shows 'Not included in your plan' with the explanation; no prices; the nav hides Commission.
- **Must be refused / negative:** No data is fetched from the gated RPCs (they refuse with feature_unavailable).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-013 · Add-on off hides and blocks the module `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/packages`
- **Preconditions:** Team plan, packages add-on OFF
- **Steps:**
  1. Look for Packages nav, client-profile Packages section, invoice 'Add package', appointment package block
  2. Type /packages
- **Expected:** All hidden; /packages shows the not-included or no-access state.
- **Must be refused / negative:** Turning the add-on back ON restores all existing package data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-014 · Trial ended turns every feature off `P1`

- [ ] **Actor:** Owner, trial ended / inactive (`OWN-X`) · **Screen:** `/settings/billing`
- **Preconditions:** Expired trial (no plan)
- **Steps:**
  1. Super admin assigns Solo
- **Expected:** After assignment, Business-only features (locations, roles) stay off; core works.
- **Must be refused / negative:** No retroactive commission is created for invoices paid while the feature was off.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### PLAN-015 · Downgrade over limits is refused `P0`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** Business plan business with 2 locations and 6 staff in one
- **Steps:**
  1. Super admin: assign Team
- **Expected:** Refused: 'The business is over the limits of that plan, so nothing was changed.' listing '<branch> has 6 active staff (limit 5)' and locations count.
- **Must be refused / negative:** Plan stays Business; nothing changed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
