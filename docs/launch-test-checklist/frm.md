# FRM — Add-on: Forms and consent

[← Back to the index](../launch-test-checklist.md) · 9 cases (P0 3, P1 6, P2 0)

### FRM-001 · Build a consent form `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/forms`
- **Preconditions:** Forms add-on (forms.manage)
- **Steps:**
  1. Settings > Forms > New: kind consent, title, heading + paragraph + bullet blocks, 2 questions (one dropdown), requires signature, attach to service, mark one question sensitive
  2. Save
- **Expected:** Listed with version 1.
- **Must be refused / negative:** Empty title / title >120 / dropdown with 1 option / empty block / >40 questions -> respective messages.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-002 · Versioning `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/forms`
- **Preconditions:** Saved template
- **Steps:**
  1. Save without changes
  2. Change a question, save
- **Expected:** No-change save keeps version; change creates version 2; signed copies keep their version.
- **Must be refused / negative:** Kind cannot change after creation.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-003 · Sign on the device `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/clients/<id>`
- **Preconditions:** Client with the form's service appointment
- **Steps:**
  1. Client > Forms > Sign here: answer, signer name, draw signature, submit
- **Expected:** Signed copy listed (immutable); appointment shows 'Signed'.
- **Must be refused / negative:** Missing required answer / no signature / no name -> 'Please answer the required questions.' / 'Please sign in the box.' / 'Enter the full name...'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-004 · Sign by link `P0`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/sign`
- **Preconditions:** Send link (copy, shown once)
- **Steps:**
  1. Open /<slug>/sign#token=...
  2. Fill + sign + submit
  3. Open the link again
- **Expected:** Signs; second open shows the generic 'This link doesn't work any more.'
- **Must be refused / negative:** Tampered / expired (14 days) / revoked / template deleted -> same generic page; two tabs submitting at once: only one signs.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-005 · Sensitive answers redacted `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Custom role without clients.view_sensitive
- **Steps:**
  1. Open the signed copy
- **Expected:** Sensitive answers hidden.
- **Must be refused / negative:** Value absent from the network response.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-006 · Void a signed copy `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Owner (forms.manage)
- **Steps:**
  1. Void with reason 'ab', then valid reason
- **Expected:** Short reason refused; void recorded as a new row; copy shown as void; client can sign again.
- **Must be refused / negative:** Void twice -> 'That form was already voided.'; Receptionist cannot void.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-007 · Forms never block booking `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Form attached to a service, unsigned
- **Steps:**
  1. Book that service publicly and in dashboard
- **Expected:** Bookings succeed; appointment shows 'Not signed yet'.
- **Must be refused / negative:** No public booking step for forms.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-008 · Delete template revokes open links `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/forms`
- **Preconditions:** Open signing link
- **Steps:**
  1. Delete template
  2. Open the link
- **Expected:** Generic invalid page.
- **Must be refused / negative:** Existing signed copies remain.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FRM-009 · Sign page rate limit and honeypot `P1`

- [ ] **Actor:** Guest customer (no account) (`GUEST`) · **Screen:** `/<slug>/sign`
- **Preconditions:** Same IP
- **Steps:**
  1. Submit 11 times/hour (invalid)
  2. Fill honeypot
- **Expected:** 'Too many attempts. Please wait a few minutes.'; honeypot submission not stored.
- **Must be refused / negative:** No raw IP stored.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
