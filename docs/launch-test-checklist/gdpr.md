# GDPR — Data rights: export, erase, requests, delete business

[← Back to the index](../launch-test-checklist.md) · 7 cases (P0 4, P1 3, P2 0)

### GDPR-001 · Export a client `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client with history
- **Steps:**
  1. Profile > Export data
- **Expected:** JSON file downloads (web) / share sheet (native) with the client's data; audited.
- **Must be refused / negative:** Receptionist / Staff have no button; API refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GDPR-002 · Erase client: blocked reasons `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client with an upcoming booking; another with a draft invoice
- **Steps:**
  1. Erase personal data on each
- **Expected:** 'This client has an upcoming appointment...' / 'This client has a draft invoice...'; nothing changed.
- **Must be refused / negative:** Typing a wrong name -> 'The name you typed does not match.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GDPR-003 · Erase client: success `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client with past visits, invoices, files, review, signed form
- **Steps:**
  1. Erase: read removed/kept lists, type name, confirm
- **Expected:** Profile shows 'Erased', no contact/notes/edit/archive; invoices keep amounts/numbers/dates; photos removed; review text blanked; portal sessions and links revoked.
- **Must be refused / negative:** Second erase changes nothing; Manager has no Erase button (clients.erase is Owner only).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GDPR-004 · Data requests screen `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/data-requests`
- **Preconditions:** Portal requests (copy + erasure + one with unknown email)
- **Steps:**
  1. Settings > Data requests: Open/Done/Declined
  2. Export <client> on a copy request
  3. Erase <client> on an erasure request
  4. Decline the unknown one
- **Expected:** Export downloads then closes the request; erase closes it; decline asks to confirm; unmatched requests can only be declined.
- **Must be refused / negative:** Closing an already closed request -> 'This request was already closed.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GDPR-005 · Manager on data requests `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/settings/data-requests`
- **Preconditions:** Manager (clients.export)
- **Steps:**
  1. Open Data requests
- **Expected:** Can export and decline; erase requests visible but not actionable.
- **Must be refused / negative:** No Delete-business card.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GDPR-006 · Delete this business `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/delete-business`
- **Preconditions:** Throwaway business (Owner role)
- **Steps:**
  1. Settings > Delete this business
  2. Type a wrong name, then the exact name
  3. Confirm, wait for progress
  4. Continue
- **Expected:** Wrong name refused; progress shown (Back disabled while running); result with counts; Continue clears cache and goes home (onboarding when no other business). Members' accounts are not deleted.
- **Must be refused / negative:** Non-Owner role (even with clients.erase via custom role) -> 'Only the business Owner can do this.'; storage not empty -> 'Some files could not be removed yet. Nothing was deleted.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### GDPR-007 · Rights still work when trial ended `P1`

- [ ] **Actor:** Owner, trial ended / inactive (`OWN-X`) · **Screen:** `/settings/data-requests`
- **Preconditions:** Inactive business
- **Steps:**
  1. Export / erase a client via data requests
- **Expected:** Works (GDPR not blocked by the lock).
- **Must be refused / negative:** Other operational actions still locked.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
