# SCOPE — Scope checks: Own (Staff) and Branch (Manager / Receptionist)

[← Back to the index](../launch-test-checklist.md) · 24 cases (P0 24, P1 0, P2 0)

### SCOPE-001 · Staff (own scope) cannot see another staff member's appointments `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Calendar / Today / list filters
- **Expected:** Own records work; the other person's are invisible or refused (appointments.view is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-002 · Staff (own scope) cannot book for another staff member `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Create appointment (staff forced to self)
- **Expected:** Own records work; the other person's are invisible or refused (appointments.create is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-003 · Staff (own scope) cannot complete / no-show another staff member's appointment `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Appointment of another staff by id
- **Expected:** Own records work; the other person's are invisible or refused (appointments.edit is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-004 · Staff (own scope) cannot open a client they never served `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: /clients search and /clients/<id>
- **Expected:** Own records work; the other person's are invisible or refused (clients.view is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-005 · Staff (own scope) cannot read sensitive answers of clients they never served `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Signed form copies (API)
- **Expected:** Own records work; the other person's are invisible or refused (clients.view_sensitive is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-006 · Staff (own scope) cannot edit another person's hours or time off `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Staff > Schedule; Schedule > Time off
- **Expected:** Own records work; the other person's are invisible or refused (staff.manage_schedule is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-007 · Staff (own scope) cannot upload a photo for a client they never served `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Client Files (by id)
- **Expected:** Own records work; the other person's are invisible or refused (files.upload is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-008 · Staff (own scope) cannot see files of a client they never served `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Client Files (by id)
- **Expected:** Own records work; the other person's are invisible or refused (files.view is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-009 · Staff (own scope) cannot use a session on another staff member's appointment `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Appointment package block
- **Expected:** Own records work; the other person's are invisible or refused (packages.deduct_session is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-010 · Staff (own scope) cannot see another person's earnings `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: Commission > My earnings / API
- **Expected:** Own records work; the other person's are invisible or refused (commission.view_own is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-011 · Staff (own scope) cannot see reviews of other staff's appointments `P0`

- [ ] **Actor:** Staff (own scope) (`STF`)
- **Preconditions:** Staff dev account; a second staff member with data
- **Steps:**
  1. Try via: /reviews
- **Expected:** Own records work; the other person's are invisible or refused (reviews.view is Own scope).
- **Must be refused / negative:** Server refuses / returns nothing; data unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-012 · Manager of branch A cannot see or change appointments of branch B `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /calendar with branch B
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-013 · Manager of branch A cannot see clients who only visited branch B `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /clients search
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-014 · Manager of branch A cannot see or issue invoices of branch B `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /invoices?branch=all
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-015 · Manager of branch A cannot see branch B figures `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /reports, advanced reports branch filter
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-016 · Manager of branch A cannot edit staff who work only at branch B `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /staff
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-017 · Manager of branch A cannot change branch B prices `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /services
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-018 · Manager of branch A cannot change branch B booking / notification settings `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /settings/booking
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-019 · Manager of branch A cannot see / reply to branch B reviews `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /reviews branch filter
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-020 · Manager of branch A cannot see branch B team commission `P0`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /commission
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-021 · Receptionist of branch A cannot book or cancel at branch B `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /calendar
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-022 · Receptionist of branch A cannot see branch B invoices `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /invoices
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-023 · Receptionist of branch A cannot see branch B products `P0`

- [ ] **Actor:** Receptionist (`REC`)
- **Preconditions:** Business plan, branches A and B; role assigned at A only
- **Steps:**
  1. Try via: /inventory
- **Expected:** Only branch A data; branch B absent from switcher and filters.
- **Must be refused / negative:** Server returns nothing for B / refuses writes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCOPE-024 · All-branch custom role vs one-branch custom role `P0`

- [ ] **Actor:** Custom role (limited permissions) (`CUS`)
- **Preconditions:** Same custom role assigned once with 'all locations', once at A only
- **Steps:**
  1. Compare Calendar / Clients / Invoices for both users
- **Expected:** All-locations user sees A and B; A-only user sees A only.
- **Must be refused / negative:** No leakage of B to the A-only user.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
