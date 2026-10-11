# FIL — Add-on: Files and photos

[← Back to the index](../launch-test-checklist.md) · 7 cases (P0 4, P1 3, P2 0)

### FIL-001 · Photo needs consent; PDF does not `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Files add-on, client without consent
- **Steps:**
  1. Client > Files > add photo
  2. Turn photo consent on
  3. Add photo (before/after/damage/other)
  4. Add a PDF (web)
- **Expected:** Without consent: 'Record the client's photo consent before adding photos.'; with consent: photo uploads and shows a thumbnail; PDF allowed without consent.
- **Must be refused / negative:** Consent change is audited; withdrawing consent keeps existing photos.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FIL-002 · File type and size checks `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Files: 11 MB jpg, .heic, .gif, a .txt renamed to .jpg, empty file
- **Steps:**
  1. Upload each
- **Expected:** 'That file is larger than 10 MB.' / 'Only JPEG, PNG, WebP and PDF files are allowed.' / renamed fake: 'That file is not what it claims to be, so it was not saved.' / empty: 'That file is empty.'
- **Must be refused / negative:** Rejected files never appear in the gallery.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FIL-003 · Signed URLs expire `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Uploaded photo
- **Steps:**
  1. Copy the image URL
  2. Open it after 5+ minutes
  3. Open it in a private window
- **Expected:** Works within ~5 min; afterwards refused; screen refetches a fresh URL before expiry.
- **Must be refused / negative:** No public bucket URL works; list/download via storage API refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FIL-004 · Delete file `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/clients/<id>`
- **Preconditions:** Photo
- **Steps:**
  1. Delete (confirm)
- **Expected:** Gone from gallery; no new URL is ever issued for it.
- **Must be refused / negative:** Cancel keeps it.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FIL-005 · Staff uploads for own clients only `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/calendar`
- **Preconditions:** Staff
- **Steps:**
  1. Own client's appointment > Files > add photo
  2. Another client by URL
- **Expected:** Own allowed (with consent); others not visible.
- **Must be refused / negative:** API prepare for another client refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FIL-006 · Appointment files tab `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/calendar`
- **Preconditions:** Appointment
- **Steps:**
  1. Detail > Files: add photo tied to this appointment
- **Expected:** Appears both on the appointment and the client profile.
- **Must be refused / negative:** Appointment of another client -> 'That appointment belongs to a different client.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### FIL-007 · Add-on off hides files, keeps data `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/clients/<id>`
- **Preconditions:** Turn files add-on off
- **Steps:**
  1. Open profile
- **Expected:** Files section gone; turning back on shows the same files.
- **Must be refused / negative:** No URL issued while off.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
