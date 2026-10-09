# ROLE — Roles, permissions and navigation gating

[← Back to the index](../launch-test-checklist.md) · 20 cases (P0 10, P1 8, P2 2)

> Default roles (seed): Owner 47 perms at All; Manager 39 at Branch (no settings.billing, settings.business, roles.manage, website.edit, website.publish, commission.manage_rules, sms.buy_credits, clients.erase); Receptionist 20 at Branch; Staff 12 at Own (appointments view/create/edit, clients.view, clients.view_sensitive, staff.view, staff.manage_schedule, reviews.view, commission.view_own, files.view, files.upload, packages.deduct_session).

### ROLE-001 · Owner navigation shows every area `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `sidebar`
- **Preconditions:** Owner of a Business-plan or trial business, all add-ons on
- **Steps:**
  1. Desktop 1440: read the sidebar
  2. Mobile 375: read bottom tabs + More
- **Expected:** Sidebar: Today, Calendar, Clients, Services, Staff, Members, Schedule, Invoices, Reports, Commission, Packages, Inventory, Reviews, Website, Settings. Mobile tabs: Today, Calendar, Clients + More (rest in More).
- **Must be refused / negative:** No item is shown that the role cannot open (opening each must not show 'You do not have access to this page').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-002 · Manager navigation and blocked areas `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `sidebar`
- **Preconditions:** Manager of branch A
- **Steps:**
  1. Read the sidebar
  2. Type /website and /settings/billing, /settings/roles, /settings/branches, /settings/delete-business
- **Expected:** Visible: Today, Calendar, Clients, Services, Staff, Members, Schedule, Invoices, Reports, Commission (Team+), Packages/Inventory (add-on on), Reviews, Settings. Settings hub shows Booking, Notifications, Message log, Data requests, My notifications, Account only.
- **Must be refused / negative:** /website shows 'You do not have access to this page'; billing / roles / locations / delete business show the no-access or not-allowed state; DB refuses the writes even if forced.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-003 · Receptionist navigation and blocked areas `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `sidebar`
- **Preconditions:** Receptionist
- **Steps:**
  1. Read the sidebar
  2. Type /services /reports /commission /website /settings /settings/booking
- **Expected:** Visible: Today, Calendar, Clients, Staff, Members, Schedule, Invoices, Reviews, Packages + Inventory (add-ons on). Not visible: Services, Reports, Commission, Website, Settings.
- **Must be refused / negative:** Each typed URL shows the no-access state (no data, no form).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-004 · Staff navigation and own-scope only `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `sidebar`
- **Preconditions:** Staff with a linked staff profile
- **Steps:**
  1. Read the sidebar / tabs
  2. Type /invoices /reports /services /website /settings /packages /inventory
- **Expected:** Visible: Today, Calendar, Clients, Staff, Members, Schedule, Commission (Team+), Reviews. Typed URLs show no-access.
- **Must be refused / negative:** Staff never sees Invoices, Reports, Services, Settings, Website, Packages, Inventory content.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-005 · Staff and Receptionist can reach Account / My notifications / Delete my account `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/settings/account`
- **Preconditions:** Staff or Receptionist signed in
- **Steps:**
  1. Look for any menu path to Settings > Account (sidebar, More, header avatar)
  2. Type /settings/account
- **Expected:** Expected (product rule): every member can change email/password, delete their account and enable push from inside the app.
- **Must be refused / negative:** KNOWN GAP: Settings is hidden for them and the header avatar does nothing, so the only way is typing /settings/account (which works). Mark FAIL if no in-app path (store requirement for account deletion).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-006 · Custom role sees exactly its permissions `P0`

- [ ] **Actor:** Custom role (limited permissions) (`CUS`) · **Screen:** `sidebar`
- **Preconditions:** Custom role e.g. 'Front desk lite' = appointments.view (Branch), clients.view (Branch) only
- **Steps:**
  1. Sign in as a member with that role
  2. Open every nav item shown
  3. Type /invoices, /services
- **Expected:** Only Today, Calendar, Clients (+ Staff/Members/Schedule only if staff.view) appear; Calendar has no 'New appointment'; client contact shows locked.
- **Must be refused / negative:** Typed URLs for missing permissions show no-access; RPCs refuse (e.g. create appointment -> 'You don't have permission to do that.').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-007 · Roles screen: default roles `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Owner, Business plan or trial (custom_roles feature on)
- **Steps:**
  1. Settings > Roles
  2. Open Owner, Manager, Receptionist, Staff
- **Expected:** Four default roles listed read-only with their permission matrix; each offers Clone.
- **Must be refused / negative:** Editing or deleting a default role is impossible ('Default roles cannot be changed or deleted. Clone it instead.').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-008 · Create custom role `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Owner, custom roles on
- **Steps:**
  1. Create role 'Junior stylist'
  2. Set scopes per permission in the matrix (None/Own/Branch/All)
  3. Save
- **Expected:** Role saved and listed with its member count 0; matrix grouped by area; add-on permissions hidden while the add-on is off.
- **Must be refused / negative:** Name of 1 char or 61 chars -> 'Give the role a name of 2 to 60 characters.'; duplicate name -> 'Another role already has this name.'; no permission -> 'Choose at least one permission.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-009 · Billing can never be in a custom role `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Owner editing a custom role
- **Steps:**
  1. Look at settings.billing in the matrix
  2. Clone the Owner role
- **Expected:** settings.billing is locked 'Owner only' in the matrix; a clone of Owner drops it (reported).
- **Must be refused / negative:** No custom role can hold settings.billing (server: 'Only the Owner manages billing; it cannot be given to a role.').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-010 · Escalation guard: cannot grant what you lack `P0`

- [ ] **Actor:** Custom role (limited permissions) (`CUS`) · **Screen:** `/settings/roles`
- **Preconditions:** A member with roles.manage at Branch scope (custom) but without e.g. invoices.discount
- **Steps:**
  1. Create/edit a role and try to give invoices.discount or All scope
- **Expected:** Scopes above what you hold are not offered in the matrix.
- **Must be refused / negative:** Forced via API: 'You cannot give a permission, or a reach, that you do not have yourself.' and nothing saved.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-011 · Edit custom role and see it applied `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Member holding the custom role signed in elsewhere
- **Steps:**
  1. Remove a permission from the role, save
  2. On the member's device refocus the tab (or wait 60 s)
- **Expected:** Member's nav/actions update without re-login (permissions version refresh on focus / 60 s).
- **Must be refused / negative:** Member must not keep using a removed permission: the server refuses immediately even before the UI refreshes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-012 · Clone a role `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Owner
- **Steps:**
  1. Clone Receptionist
  2. Rename to 'Receptionist plus', add invoices.discount, save
- **Expected:** New custom role with Receptionist's permissions plus the change.
- **Must be refused / negative:** The default Receptionist role is unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-013 · Delete a role in use requires a replacement `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Custom role assigned to 2 members
- **Steps:**
  1. Delete the role
  2. Pick a replacement role
  3. Confirm
- **Expected:** Dialog says the role is in use and asks for a replacement; after confirm both members hold the replacement at the same locations.
- **Must be refused / negative:** Choosing the same role as replacement -> 'Choose a different role to replace it.'; deleting without replacement is refused ('This role is still in use...').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-014 · Custom role limit 50 `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/roles`
- **Preconditions:** Business with 50 custom roles (seed via UI or SQL)
- **Steps:**
  1. Create the 51st
- **Expected:** 'You have reached the limit of 50 custom roles.'
- **Must be refused / negative:** No 51st role created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-015 · Custom roles gated by plan / add-on `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/roles`
- **Preconditions:** Team owner WITHOUT custom_roles add-on; then with add-on on; Solo owner
- **Steps:**
  1. Open Settings hub
  2. Type /settings/roles
- **Expected:** Without the feature: no Roles card, and the route shows 'Not included in your plan'. With the add-on on (Team) or Business plan: Roles works.
- **Must be refused / negative:** After a downgrade, existing custom-role assignments keep working but new custom roles cannot be created ('Custom roles are not part of your plan.').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-016 · Manager cannot manage roles `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/settings/roles`
- **Preconditions:** Manager
- **Steps:**
  1. Type /settings/roles
- **Expected:** No-access state.
- **Must be refused / negative:** No role can be created via the API (forbidden).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-017 · Different roles in two branches `P0`

- [ ] **Actor:** Member of two branches, different roles (`TWOBR`) · **Screen:** `/calendar`
- **Preconditions:** User is Manager at branch A and Staff at branch B (Business plan, 2 branches)
- **Steps:**
  1. Switch to branch A: open Calendar, Invoices
  2. Switch to branch B: open Calendar, Invoices
- **Expected:** Branch A: full manager actions on A data. Branch B: only own appointments, no Invoices data for B.
- **Must be refused / negative:** Data of branch B beyond own scope must never appear, even with branch filter 'all'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-018 · Inactive business denies everything except Settings/Billing `P0`

- [ ] **Actor:** Owner, trial ended / inactive (`OWN-X`) · **Screen:** `/today`
- **Preconditions:** Owner whose trial ended
- **Steps:**
  1. Open Today, Calendar, Clients
  2. Open Settings and Billing
- **Expected:** Operational screens show the lock screen; Settings and Billing open.
- **Must be refused / negative:** No operational RPC succeeds (e.g. creating a client is refused) while inactive.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-019 · Super admin passes every check (aal2) `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/today`
- **Preconditions:** Super admin that is also a member of a business
- **Steps:**
  1. Open that business's screens
- **Expected:** All screens open, even on an inactive business.
- **Must be refused / negative:** With only aal1 the super admin is treated like a stranger (see ADM).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ROLE-020 · Nav skeleton while permissions load `P2`

- [ ] **Actor:** Any signed-in member (`ANY`) · **Screen:** `sidebar`
- **Preconditions:** Slow network (DevTools throttling)
- **Steps:**
  1. Reload the app
- **Expected:** Sidebar/tab bar shows skeleton rows, then the allowed items.
- **Must be refused / negative:** No item flashes in then disappears.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
