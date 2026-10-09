# DENY — Role denial matrix (every default role x every permission it lacks)

[← Back to the index](../launch-test-checklist.md) · 70 cases (P0 35, P1 35, P2 0)

> Generated from the role seed. For each row: confirm the UI hides/blocks the action AND (optional, with DevTools) that the server refuses it.

### DENY-001 · Manager cannot erase a client's personal data or delete the business (clients.erase) `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Open a client profile; open Settings
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No 'Erase personal data' button; no 'Delete this business' card.
- **Must be refused / negative:** Server refuses: gdpr_erase_client -> not_found/forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-002 · Manager cannot edit commission rules (commission.manage_rules) `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Open /commission
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Rules tab.
- **Must be refused / negative:** Server refuses: set_commission_rule -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-003 · Manager cannot manage roles or change / remove member roles (roles.manage) `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Type /settings/roles; Members > Manage an active member
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Roles card; no role change / remove member.
- **Must be refused / negative:** Server refuses: assign_member_role / remove_member -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-004 · Manager cannot see plan and billing; get the trial banner (settings.billing) `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Type /settings/billing
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No card; no-access; no trial banner.
- **Must be refused / negative:** Server refuses: my_plan_usage refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-005 · Manager cannot edit opening hours / holidays / locations (settings.business) `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Schedule > Opening hours; Holidays; /settings/branches
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Editors disabled; locations no-access.
- **Must be refused / negative:** Server refuses: replace_branch_hours refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-006 · Manager cannot buy SMS credits (no UI at launch) (sms.buy_credits) `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Look for any SMS purchase
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Nothing visible (SMS off).
- **Must be refused / negative:** Server refuses: no purchase RPC for tenants; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-007 · Manager cannot edit the website (website.edit) `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Type /website
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Website nav hidden; no-access.
- **Must be refused / negative:** Server refuses: save_website_section -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-008 · Manager cannot publish / unpublish the website (website.publish) `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Signed in as the Manager dev account; data for the action exists
- **Steps:**
  1. Open the website editor (if editable)
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Publish / Unpublish.
- **Must be refused / negative:** Server refuses: set_website_published -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-009 · Receptionist cannot erase a client's personal data or delete the business (clients.erase) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open a client profile; open Settings
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No 'Erase personal data' button; no 'Delete this business' card.
- **Must be refused / negative:** Server refuses: gdpr_erase_client -> not_found/forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-010 · Receptionist cannot export a client or open Data requests (clients.export) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open a client profile; type /settings/data-requests
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No 'Export data'; data requests shows no-access.
- **Must be refused / negative:** Server refuses: gdpr_export_client refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-011 · Receptionist cannot see sensitive answers (booking form / signed forms) (clients.view_sensitive) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open a signed form copy with a sensitive answer
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Sensitive answers hidden.
- **Must be refused / negative:** Server refuses: value absent from the response; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-012 · Receptionist cannot edit commission rules (commission.manage_rules) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /commission
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Rules tab.
- **Must be refused / negative:** Server refuses: set_commission_rule -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-013 · Receptionist cannot see the team commission report (commission.view_all) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /commission
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Team report tab.
- **Must be refused / negative:** Server refuses: get_commission_report returns own only / forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-014 · Receptionist cannot see own commission (commission.view_own) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Look for Commission nav
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Commission nav hidden.
- **Must be refused / negative:** Server refuses: report refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-015 · Receptionist cannot build form templates or void signed copies (forms.manage) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /settings/forms; open a signed copy
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Forms card, route no-access; no Void.
- **Must be refused / negative:** Server refuses: save_form_template / void -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-016 · Receptionist cannot create products, move stock or change stock rules (inventory.adjust) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /inventory and a product
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No New product, no movement form, switch disabled.
- **Must be refused / negative:** Server refuses: adjust_stock -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-017 · Receptionist cannot issue credit notes or reverse payments (invoices.credit_note) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open an issued paid invoice
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Credit note / Reverse buttons.
- **Must be refused / negative:** Server refuses: create_credit_note / reverse_payment -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-018 · Receptionist cannot give a line discount (invoices.discount) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open an invoice draft
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No discount field; draft with discount cannot be saved.
- **Must be refused / negative:** Server refuses: 'You don't have permission to give discounts.'; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-019 · Receptionist cannot reverse a session after the 10-minute undo window (packages.reverse_session) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open an old deduction
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Reverse action.
- **Must be refused / negative:** Server refuses: reverse_session -> forbidden / undo window passed; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-020 · Receptionist cannot open advanced reports (reports.view_advanced) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /settings/advanced-reports
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No card; no-access.
- **Must be refused / negative:** Server refuses: get_advanced_report -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-021 · Receptionist cannot open basic reports (reports.view_basic) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /reports
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Reports nav hidden; no-access.
- **Must be refused / negative:** Server refuses: get_basic_report counts null; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-022 · Receptionist cannot see revenue figures (reports.view_revenue) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open reports
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Revenue blocks hidden.
- **Must be refused / negative:** Server refuses: revenue null in response; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-023 · Receptionist cannot feature a review on the website (reviews.feature_on_website) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /reviews
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Feature button.
- **Must be refused / negative:** Server refuses: set_review_featured -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-024 · Receptionist cannot reply to a review (reviews.reply) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /reviews
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Reply button.
- **Must be refused / negative:** Server refuses: reply_to_review -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-025 · Receptionist cannot manage roles or change / remove member roles (roles.manage) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /settings/roles; Members > Manage an active member
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Roles card; no role change / remove member.
- **Must be refused / negative:** Server refuses: assign_member_role / remove_member -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-026 · Receptionist cannot manage services / packages definitions (services.manage) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /services
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Services nav hidden; no-access.
- **Must be refused / negative:** Server refuses: insert/update services refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-027 · Receptionist cannot see plan and billing; get the trial banner (settings.billing) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /settings/billing
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No card; no-access; no trial banner.
- **Must be refused / negative:** Server refuses: my_plan_usage refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-028 · Receptionist cannot change booking / notification settings (settings.booking) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /settings/booking and /settings/notifications
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Read-only or no-access; no Save.
- **Must be refused / negative:** Server refuses: save_booking_settings refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-029 · Receptionist cannot edit opening hours / holidays / locations (settings.business) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Schedule > Opening hours; Holidays; /settings/branches
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Editors disabled; locations no-access.
- **Must be refused / negative:** Server refuses: replace_branch_hours refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-030 · Receptionist cannot buy SMS credits (no UI at launch) (sms.buy_credits) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Look for any SMS purchase
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Nothing visible (SMS off).
- **Must be refused / negative:** Server refuses: no purchase RPC for tenants; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-031 · Receptionist cannot add / edit / remove staff profiles (staff.manage) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /staff
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No New / Edit / Delete.
- **Must be refused / negative:** Server refuses: staff_profiles insert refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-032 · Receptionist cannot edit working hours or add time off (staff.manage_schedule) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open Staff > Schedule; Schedule > Time off
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Schedule button; cannot add time off.
- **Must be refused / negative:** Server refuses: replace_staff_working_hours -> 42501; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-033 · Receptionist cannot invite people or manage invites (users.invite) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open /members
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Invite button; no resend/cancel.
- **Must be refused / negative:** Server refuses: invite_member -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-034 · Receptionist cannot edit the website (website.edit) `P1`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Type /website
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Website nav hidden; no-access.
- **Must be refused / negative:** Server refuses: save_website_section -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-035 · Receptionist cannot publish / unpublish the website (website.publish) `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Signed in as the Receptionist dev account; data for the action exists
- **Steps:**
  1. Open the website editor (if editable)
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Publish / Unpublish.
- **Must be refused / negative:** Server refuses: set_website_published -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-036 · Staff cannot approve a pending appointment (appointments.approve) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open a pending appointment (Calendar detail / Today)
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Approve button; no pending-approval badge/count.
- **Must be refused / negative:** Server refuses: approve_appointment -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-037 · Staff cannot cancel an appointment (appointments.cancel) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open a confirmed appointment
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Cancel button.
- **Must be refused / negative:** Server refuses: cancel_appointment -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-038 · Staff cannot see other staff members' columns (calendar.view_all_staff) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open Calendar Day view
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Only own column, no staff switcher.
- **Must be refused / negative:** Server refuses: other staff rows absent from responses; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-039 · Staff cannot create a client (clients.create) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open Clients
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No 'New client' button.
- **Must be refused / negative:** Server refuses: insert into clients refused by RLS; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-040 · Staff cannot edit / archive a client or change photo consent (clients.edit) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open a client profile
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Edit / Archive / consent switch.
- **Must be refused / negative:** Server refuses: update refused by RLS; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-041 · Staff cannot erase a client's personal data or delete the business (clients.erase) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open a client profile; open Settings
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No 'Erase personal data' button; no 'Delete this business' card.
- **Must be refused / negative:** Server refuses: gdpr_erase_client -> not_found/forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-042 · Staff cannot export a client or open Data requests (clients.export) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open a client profile; type /settings/data-requests
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No 'Export data'; data requests shows no-access.
- **Must be refused / negative:** Server refuses: gdpr_export_client refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-043 · Staff cannot see client phone / email / notes (clients.view_contact) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open client list and a profile
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Contact columns hidden, locked contact block, notes hidden.
- **Must be refused / negative:** Server refuses: clients_v returns NULL phone/email/notes; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-044 · Staff cannot edit commission rules (commission.manage_rules) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /commission
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Rules tab.
- **Must be refused / negative:** Server refuses: set_commission_rule -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-045 · Staff cannot see the team commission report (commission.view_all) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /commission
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Team report tab.
- **Must be refused / negative:** Server refuses: get_commission_report returns own only / forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-046 · Staff cannot build form templates or void signed copies (forms.manage) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /settings/forms; open a signed copy
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Forms card, route no-access; no Void.
- **Must be refused / negative:** Server refuses: save_form_template / void -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-047 · Staff cannot create products, move stock or change stock rules (inventory.adjust) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /inventory and a product
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No New product, no movement form, switch disabled.
- **Must be refused / negative:** Server refuses: adjust_stock -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-048 · Staff cannot see inventory (inventory.view) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Look for Inventory nav; type /inventory
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Hidden / no-access; no low-stock badge.
- **Must be refused / negative:** Server refuses: products not readable; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-049 · Staff cannot create, issue or take payment on invoices (invoices.create) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /invoices; completed appointment
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No New invoice / Create invoice / Add payment.
- **Must be refused / negative:** Server refuses: create_invoice_draft / add_payment -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-050 · Staff cannot issue credit notes or reverse payments (invoices.credit_note) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open an issued paid invoice
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Credit note / Reverse buttons.
- **Must be refused / negative:** Server refuses: create_credit_note / reverse_payment -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-051 · Staff cannot give a line discount (invoices.discount) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open an invoice draft
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No discount field; draft with discount cannot be saved.
- **Must be refused / negative:** Server refuses: 'You don't have permission to give discounts.'; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-052 · Staff cannot see invoices (invoices.view) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /invoices, /invoice-print/<id>; open a client profile
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Invoices nav hidden, no-access; no Invoices section on profile; no invoice button on appointments.
- **Must be refused / negative:** Server refuses: list_invoices returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-053 · Staff cannot reverse a session after the 10-minute undo window (packages.reverse_session) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open an old deduction
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Reverse action.
- **Must be refused / negative:** Server refuses: reverse_session -> forbidden / undo window passed; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-054 · Staff cannot sell packages / open Packages (packages.sell) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /packages; invoice editor
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Packages nav hidden; no 'Add package'.
- **Must be refused / negative:** Server refuses: package line refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-055 · Staff cannot open advanced reports (reports.view_advanced) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /settings/advanced-reports
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No card; no-access.
- **Must be refused / negative:** Server refuses: get_advanced_report -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-056 · Staff cannot open basic reports (reports.view_basic) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /reports
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Reports nav hidden; no-access.
- **Must be refused / negative:** Server refuses: get_basic_report counts null; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-057 · Staff cannot see revenue figures (reports.view_revenue) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open reports
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Revenue blocks hidden.
- **Must be refused / negative:** Server refuses: revenue null in response; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-058 · Staff cannot feature a review on the website (reviews.feature_on_website) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /reviews
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Feature button.
- **Must be refused / negative:** Server refuses: set_review_featured -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-059 · Staff cannot reply to a review (reviews.reply) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /reviews
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Reply button.
- **Must be refused / negative:** Server refuses: reply_to_review -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-060 · Staff cannot manage roles or change / remove member roles (roles.manage) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /settings/roles; Members > Manage an active member
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Roles card; no role change / remove member.
- **Must be refused / negative:** Server refuses: assign_member_role / remove_member -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-061 · Staff cannot manage services / packages definitions (services.manage) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /services
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Services nav hidden; no-access.
- **Must be refused / negative:** Server refuses: insert/update services refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-062 · Staff cannot see plan and billing; get the trial banner (settings.billing) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /settings/billing
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No card; no-access; no trial banner.
- **Must be refused / negative:** Server refuses: my_plan_usage refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-063 · Staff cannot change booking / notification settings (settings.booking) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /settings/booking and /settings/notifications
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Read-only or no-access; no Save.
- **Must be refused / negative:** Server refuses: save_booking_settings refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-064 · Staff cannot edit opening hours / holidays / locations (settings.business) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Schedule > Opening hours; Holidays; /settings/branches
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Editors disabled; locations no-access.
- **Must be refused / negative:** Server refuses: replace_branch_hours refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-065 · Staff cannot buy SMS credits (no UI at launch) (sms.buy_credits) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Look for any SMS purchase
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Nothing visible (SMS off).
- **Must be refused / negative:** Server refuses: no purchase RPC for tenants; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-066 · Staff cannot open SMS credits (off at launch) (sms.send) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /settings/sms-credits
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Redirects to Settings.
- **Must be refused / negative:** Server refuses: credit rows not readable; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-067 · Staff cannot add / edit / remove staff profiles (staff.manage) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /staff
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No New / Edit / Delete.
- **Must be refused / negative:** Server refuses: staff_profiles insert refused; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-068 · Staff cannot invite people or manage invites (users.invite) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open /members
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Invite button; no resend/cancel.
- **Must be refused / negative:** Server refuses: invite_member -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-069 · Staff cannot edit the website (website.edit) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Type /website
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** Website nav hidden; no-access.
- **Must be refused / negative:** Server refuses: save_website_section -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### DENY-070 · Staff cannot publish / unpublish the website (website.publish) `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Signed in as the Staff dev account; data for the action exists
- **Steps:**
  1. Open the website editor (if editable)
  2. Optionally replay the owner's request with this user's token (DevTools)
- **Expected:** No Publish / Unpublish.
- **Must be refused / negative:** Server refuses: set_website_published -> forbidden; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
