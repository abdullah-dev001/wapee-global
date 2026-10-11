# CLI — Clients

[← Back to the index](../launch-test-checklist.md) · 12 cases (P0 5, P1 7, P2 0)

### CLI-001 · Client list, search, paging `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients`
- **Preconditions:** 30+ clients
- **Steps:**
  1. Open Clients
  2. Search by name (2+ chars), by phone
  3. Scroll to load more
  4. Toggle 'Show archived'
- **Expected:** Mobile cards / desktop table; server search; keyset paging; archived toggle and search kept in the URL.
- **Must be refused / negative:** 1 char does not search; error shows Retry.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-002 · Create client `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients`
- **Preconditions:** Owner
- **Steps:**
  1. New client: name, phone (E.164), email, notes
  2. Save
- **Expected:** Created; opens/lists.
- **Must be refused / negative:** Empty name -> 'Enter a name.'; 161 chars -> 'Name is too long.'; bad phone -> 'Enter a valid phone number.'; notes 5001 chars -> 'Notes are too long.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-003 · Duplicate phone `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients`
- **Preconditions:** Client with phone P
- **Steps:**
  1. Create another with phone P
- **Expected:** Banner 'This phone number already belongs to another client.' with a link to the existing client; nothing created.
- **Must be refused / negative:** Archived client's phone may be reused (unique among live rows only) — record result.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-004 · Edit and archive / unarchive `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client
- **Steps:**
  1. Edit name, save
  2. Archive (confirm)
  3. Show archived, unarchive
- **Expected:** Changes saved; archived badge; hidden from default list; unarchive restores.
- **Must be refused / negative:** Archived clients cannot be picked for a new appointment (record).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-005 · Profile sections `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client with history
- **Steps:**
  1. Open profile
- **Expected:** Contact, notes, upcoming (soonest first), visit history across ALL branches (newest first, load more), invoices (number, date, total in invoice currency, payment state), packages/files/forms when add-ons on, Export data, Erase personal data.
- **Must be refused / negative:** Visit history row tap does nothing (by design).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-006 · Staff sees only own clients, no contact `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/clients`
- **Preconditions:** Staff
- **Steps:**
  1. Open Clients
  2. Search for a client they never served
  3. Open own client
- **Expected:** List limited to clients with an appointment with them; phone/email/notes hidden (locked placeholder); phone search finds nothing.
- **Must be refused / negative:** Typing another client's /clients/<id> shows nothing (not found).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-007 · Contact lock without clients.view_contact `P0`

- [ ] **Actor:** Custom role (limited permissions) (`CUS`) · **Screen:** `/clients`
- **Preconditions:** Custom role with clients.view but not view_contact
- **Steps:**
  1. Open list and profile
  2. Edit the client
- **Expected:** Desktop table hides phone/email columns entirely; profile shows locked contact; edit form shows name only and saves only the name.
- **Must be refused / negative:** Network responses contain no phone/email/notes (null).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-008 · Receptionist contact allowed, no export/erase `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/clients/<id>`
- **Preconditions:** Receptionist
- **Steps:**
  1. Open a profile
- **Expected:** Phone/email/notes visible; no Export or Erase buttons.
- **Must be refused / negative:** Export/erase via API refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-009 · Other business's client by URL `P0`

- [ ] **Actor:** Signed-in user of another business (`OTHER`) · **Screen:** `/clients/<id>`
- **Preconditions:** Signed in to business B, id of a client of A
- **Steps:**
  1. Open /clients/<A client id>
- **Expected:** Not found / empty; no data.
- **Must be refused / negative:** No name, phone or history of business A.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-010 · Branch scope for clients `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/clients`
- **Preconditions:** Business plan, 2 branches, Manager of A
- **Steps:**
  1. Search a client who only visited branch B
- **Expected:** Not visible (clients tied to no branch and with no visits stay visible).
- **Must be refused / negative:** Client of B not openable by URL.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-011 · Invoices section on profile `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client with 25 invoices
- **Steps:**
  1. Scroll invoices, load more
  2. Tap one
- **Expected:** 20 per page then more; tap opens the invoice drawer; 'Show this client's invoices' filters the invoices list.
- **Must be refused / negative:** Hidden for roles without invoices.view.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### CLI-012 · Sensitive custom-field answers `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Booking with a sensitive answer
- **Steps:**
  1. Look for the answer on the client profile and appointment
- **Expected:** Expected: visible only with clients.view_sensitive.
- **Must be refused / negative:** KNOWN GAP: answers are not shown anywhere in the dashboard; only testable by SQL/API (Staff own scope must not read others').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
