# ADM — Super admin

[← Back to the index](../launch-test-checklist.md) · 18 cases (P0 5, P1 11, P2 2)

### ADM-001 · Flagged admin without TOTP is forced to 2FA `P0`

- [ ] **Actor:** Super admin, password only (aal1) (`SA1`) · **Screen:** `/admin/2fa`
- **Preconditions:** Super admin account, password only (aal1)
- **Steps:**
  1. Sign in
  2. Type /admin, /admin/platform, /admin/business/<id>
- **Expected:** Always lands on /admin/2fa ('Set up two-factor' or 'Enter your 6-digit code').
- **Must be refused / negative:** No admin data shown; admin RPCs return 'Sign in with your two-factor code to continue.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-002 · aal1 admin sees no tenant data `P0`

- [ ] **Actor:** Super admin, password only (aal1) (`SA1`) · **Screen:** `/admin`
- **Preconditions:** Same aal1 session
- **Steps:**
  1. Try to open a business they are not a member of via /clients etc.
- **Expected:** Treated as a stranger (only own profile).
- **Must be refused / negative:** No tenant rows visible.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-003 · TOTP enrol (first time) `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/2fa`
- **Preconditions:** Flagged account with no factor; authenticator app
- **Steps:**
  1. Sign in > Set up two-factor
  2. Scan QR or type secret
  3. Enter code > Verify
- **Expected:** Session upgrades (aal2) and lands on /admin; the admin menu entry appears in sidebar / More.
- **Must be refused / negative:** Wrong code: error, still aal1. There is no recovery flow: save the secret.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-004 · TOTP sign-in `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/2fa`
- **Preconditions:** Enrolled admin
- **Steps:**
  1. Sign in, enter 6-digit code
- **Expected:** Lands on /admin.
- **Must be refused / negative:** Expired/old code refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-005 · Non-admin cannot see the admin area `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/admin`
- **Preconditions:** Owner, Manager, any member
- **Steps:**
  1. Type /admin, /admin/platform, /admin/business/<id>, /admin/2fa
- **Expected:** 'Not found' style screen; no admin menu entry.
- **Must be refused / negative:** Admin RPCs refused (forbidden).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-006 · Businesses list: search, filters, paging `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin`
- **Preconditions:** aal2
- **Steps:**
  1. Search with 1 char, then 2+ chars (name or slug)
  2. Filter plan: Solo/Team/Business; status: Trial/Active/Paused/Suspended
  3. Scroll to load more (20 per page)
- **Expected:** Server search from 2 chars; filters combine; keyset paging loads next 20.
- **Must be refused / negative:** 1 char: 'Type at least 2 characters to search.'; '%' or '_' are searched literally; owner email search is not supported (known).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-007 · Business detail `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** aal2
- **Steps:**
  1. Open a business
- **Expected:** Subscription (plan, status, trial/period), usage (active staff, locations, appointments this UTC month, issued invoices, SMS balance), add-ons, reviews, support view; every dialog says the action is recorded.
- **Must be refused / negative:** Notes typed by admin never appear in the owner's audit log.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-008 · Assign plan `P0`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** Trial business
- **Steps:**
  1. Assign plan Team with period end and note
- **Expected:** Business becomes Active on Team; owner sees it within ~60 s; audit row 'admin.assign_plan' without the note.
- **Must be refused / negative:** Invalid date format refused; suspended business stays suspended after assigning a plan.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-009 · Set status active / inactive / suspended `P0`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** Business with a plan
- **Steps:**
  1. Set Suspended (note)
  2. Set Active
  3. Set Inactive
- **Expected:** Suspended: members lose sessions (if only business) and cannot sign in; Active: restored; Inactive: lock screen.
- **Must be refused / negative:** Activating a business without a plan -> 'Assign a plan before activating this business.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-010 · Extend trial `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** Trial or inactive business
- **Steps:**
  1. Extend 0, 91, 'abc' days
  2. Extend 7 days
- **Expected:** Invalid -> 'Enter a whole number of days from 1 to 90.'; valid extends from now/trial end.
- **Must be refused / negative:** Active business -> 'Only a trial or a paused business can be extended.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-011 · Add-on toggles `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** Active Team business
- **Steps:**
  1. Enable Packages (confirm)
  2. Disable Packages (confirm)
- **Expected:** Owner sees the module appear/disappear; existing data kept.
- **Must be refused / negative:** Toggle without aal2 refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-012 · Add SMS credits (admin tool, SMS off at launch) `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** aal2
- **Steps:**
  1. Add +500 with note
  2. Add -100000000 (correction beyond balance)
  3. Add 0
- **Expected:** Positive adds to balance; 0 -> 'Enter a non-zero whole number of credits.'; below zero -> 'That would take the balance below zero.'
- **Must be refused / negative:** Owner still sees no SMS credits screen (launch.sms off).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-013 · Support view `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** aal2
- **Steps:**
  1. Press Support view
- **Expected:** Read-only summary without client personal data; the screen says it is logged; an audit row admin.support_view is written (owner-readable by RLS; no audit screen in the app).
- **Must be refused / negative:** No client names/phones in the summary.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-014 · Remove a review `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/business/<id>`
- **Preconditions:** Business with a published review
- **Steps:**
  1. Remove with reason 'ab'
  2. Remove with reason 'Abusive language'
- **Expected:** Short reason refused ('Give a reason (at least 3 characters).'); valid removes it from website and reviews list (status removed, un-featured); reason visible to owner in audit.
- **Must be refused / negative:** Removing again -> 'That review is already removed.'; customer words are not altered.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-015 · Platform: plan and add-on prices `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/platform`
- **Preconditions:** aal2
- **Steps:**
  1. Edit Team monthly/annual price and currency
  2. Use currency 'usd1'
- **Expected:** Saved in major units; invalid currency refused.
- **Must be refused / negative:** Prices never appear to owners (no pricing UI).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-016 · Platform: SMS rates `P2`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/platform`
- **Preconditions:** aal2
- **Steps:**
  1. Add rate dial 44, country GB, 56 credits
  2. Dial '0', country 'G', credits 0
- **Expected:** Valid saved; invalid fields show their validation messages.
- **Must be refused / negative:** No effect on customers while SMS is off.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-017 · Platform: industry presets `P2`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `/admin/platform`
- **Preconditions:** aal2
- **Steps:**
  1. Create preset key 'salon', terminology 'client = Guest', fields 'Hair type | dropdown | required | Short,Long'
  2. Enter a bad line 'client Guest'
- **Expected:** Valid preset saved; bad line -> 'Check the terminology lines.' naming the line.
- **Must be refused / negative:** Presets are not applied to onboarding yet (known): record behaviour only.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### ADM-018 · Every admin action is audited `P1`

- [ ] **Actor:** Super admin (TOTP, aal2) (`SA`) · **Screen:** `(DB)`
- **Preconditions:** After the actions above
- **Steps:**
  1. Read audit_logs with a read-only SQL query (the app has no audit screen)
- **Expected:** Rows admin.view_business / assign_plan / set_status / set_addon / extend_trial / remove_review / support_view exist with no admin notes.
- **Must be refused / negative:** Admin notes never stored in audit rows.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
