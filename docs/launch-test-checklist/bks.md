# BKS — Booking settings, booking form (custom fields), live preview

[← Back to the index](../launch-test-checklist.md) · 15 cases (P0 3, P1 11, P2 1)

> Per BRANCH. Defaults: staff choice optional, only available slots, auto confirm, prices shown, 15-min interval, buffer 0, notice 60 min, window 30 days, customer can cancel with 24 h cutoff, rooms off, 1 person per slot, online booking on.

### BKS-001 · Settings tab defaults and save only changed keys `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** New branch
- **Steps:**
  1. Settings > Booking > Settings tab
  2. Read Basics and open Advanced
  3. Change only staff choice, save
- **Expected:** Defaults match the list above; hint under each setting changes with the choice; save toasts; other keys unchanged after reload.
- **Must be refused / negative:** Leaving without saving keeps old values.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-002 · Advanced ranges `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Advanced section
- **Steps:**
  1. Buffer: try >1440; Notice: >43200; Window: 0 and 731; Cancel cutoff: >8760; People per slot: 0 and 101
- **Expected:** Steppers stop at: buffer 0-1440 (step 5), notice 0-43200 (step 15), window 1-730, cutoff 0-8760, people 1-100.
- **Must be refused / negative:** Server refuses out-of-range values sent by API.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-003 · Lowering people per slot blocked by future bookings `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** People per slot 3, a future slot with 3 bookings
- **Steps:**
  1. Set people per slot to 2, save
- **Expected:** Refused, naming the slot that is over the new limit; value stays 3.
- **Must be refused / negative:** Past slots never block; existing bookings are never cancelled.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-004 · Bookable warnings and link gating `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** New branch: no hours, no services, no staff
- **Steps:**
  1. Open booking settings
  2. Fix each warning via its link (hours, service, staff, staff-service link)
  3. Turn online booking off
- **Expected:** Warnings listed: booking off / no opening hours / no bookable service / no bookable staff / no staff for any service, each with a fix route; booking link card shows inactive until all clear; then shows <site>/<slug>/book with Copy.
- **Must be refused / negative:** With any warning the public page shows the generic 'not available'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-005 · Website-not-published note on link card `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Website unpublished, booking ready
- **Steps:**
  1. Read the link card
- **Expected:** 'Your website is not published yet, but your booking link works.'
- **Must be refused / negative:** Note absent once published.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-006 · Live preview `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Desktop 1440 and mobile 375
- **Steps:**
  1. 1440: preview column beside settings
  2. 375: 'Show customer preview' opens a full-screen drawer
  3. Change show prices / staff choice
- **Expected:** Preview uses your real services, prices and staff with labelled SAMPLE times; updates with the draft.
- **Must be refused / negative:** Preview never claims real availability (no notice/window/buffer logic in it).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-007 · Manager edits booking settings of own branch `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/settings/booking`
- **Preconditions:** Manager of A
- **Steps:**
  1. Edit and save on branch A
- **Expected:** Saves.
- **Must be refused / negative:** Branch B settings (if switchable) refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-008 · Read-only booking settings by URL `P1`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/settings/booking`
- **Preconditions:** Receptionist
- **Steps:**
  1. Type /settings/booking
- **Expected:** Settings visible read-only (or no-access), no save.
- **Must be refused / negative:** Any save attempt refused by the server.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-009 · Booking form: default fields `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Booking form tab
- **Steps:**
  1. Read the fixed fields
  2. Toggle 'require client email'
- **Expected:** Name, phone, email, notes shown locked with reasons; email becomes required on the public form when toggled on.
- **Must be refused / negative:** Default fields cannot be deleted or retyped.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-010 · Create custom fields of all 5 types `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Booking form tab
- **Steps:**
  1. Add short text, long text, dropdown (3 options, one per line), yes/no, number
  2. Mark one required
  3. Save each
- **Expected:** All listed in order; public form shows them with matching inputs.
- **Must be refused / negative:** Empty label -> 'labelRequired'; label 121 chars / help 301 chars -> too long.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-011 · Dropdown option rules `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Dropdown field
- **Steps:**
  1. 1 option
  2. 51 options
  3. Duplicate option lines
- **Expected:** Too few / too many / duplicate messages.
- **Must be refused / negative:** Cannot save until fixed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-012 · Per-service fields `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Field set to specific services
- **Steps:**
  1. Untick 'all services' and choose none
  2. Choose service A only
  3. Book service B publicly
- **Expected:** None chosen -> 'servicesRequired'. Field appears only for service A on the public form.
- **Must be refused / negative:** Server refuses an answer for a field that does not apply.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-013 · Sensitive can only be escalated `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Field with answers
- **Steps:**
  1. Turn 'sensitive' on (confirm dialog)
  2. Try to turn it off
- **Expected:** Dialog explains it also marks existing answers sensitive; afterwards the switch cannot be turned off.
- **Must be refused / negative:** Staff/roles without clients.view_sensitive never see those answers.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-014 · Type frozen, reorder, archive, restore `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Saved field
- **Steps:**
  1. Try to change its type
  2. Move it up/down
  3. Archive, then restore
- **Expected:** Type locked after first save; order persists; archived field disappears from the public form and returns on restore.
- **Must be refused / negative:** Old bookings keep the labels/options they were answered with (form version snapshot).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### BKS-015 · Form versions: no-op save does not create a version `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/booking`
- **Preconditions:** Booking with answers made before a change
- **Steps:**
  1. Save a field without changes
  2. Change a label
  3. Open an old booking's answers (DB or appointment)
- **Expected:** Unchanged save keeps the same version; label change makes a new one; old booking still shows the old label.
- **Must be refused / negative:** form_versions rows can never be updated or deleted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
