# SCH — Schedule: working hours, breaks, time off, branch hours, holidays

[← Back to the index](../launch-test-checklist.md) · 13 cases (P0 2, P1 9, P2 2)

### SCH-001 · Edit a staff member's week `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Staff with a branch
- **Steps:**
  1. Staff > person > Schedule
  2. Mon 09:00-12:00 and 13:00-17:00 (split), Tue 10:00-18:00, Sun closed
  3. Add a break Tue 14:00-14:30
  4. Save
- **Expected:** 'Saved'; reopening shows the same; Calendar shading reflects it; public slots follow it.
- **Must be refused / negative:** Leaving the drawer with unsaved edits does not save half a week.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-002 · Overlapping or overnight interval is refused and keeps the old week `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Existing saved week
- **Steps:**
  1. Add Mon 09:00-12:00 and 11:00-14:00
  2. Save
  3. Try 22:00-02:00
- **Expected:** Refused with an error; the previously saved week is unchanged after reload.
- **Must be refused / negative:** Never an empty week after a failed save.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-003 · Adjacent split shift accepted `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Week editor
- **Steps:**
  1. 09:00-12:00 and 12:00-17:00
- **Expected:** Accepted (half-open intervals).
- **Must be refused / negative:** Zero-length 09:00-09:00 refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-004 · Staff edits own hours only `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/staff`
- **Preconditions:** Staff with linked profile
- **Steps:**
  1. Open own schedule: change and save
  2. Try to open another person's schedule
- **Expected:** Own week saves. No Schedule button for others.
- **Must be refused / negative:** API write for another staff id -> 42501 refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-005 · Branch opening hours `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** Owner (settings.business)
- **Steps:**
  1. Schedule > Opening hours: set Mon-Fri 09:00-17:00, Sat 10:00-14:00
  2. Save
- **Expected:** Saved; weekday with no interval is closed; booking warnings update.
- **Must be refused / negative:** Overlapping intervals refused, old hours kept.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-006 · Opening hours read-only for Manager `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/schedule`
- **Preconditions:** Manager
- **Steps:**
  1. Schedule > Opening hours
- **Expected:** Hours visible but editor disabled.
- **Must be refused / negative:** API write refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-007 · Time off: whole days `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** Staff member
- **Steps:**
  1. Time off > add for staff X, 2 days, reason
  2. Check list
  3. Check calendar and public slots on those days
- **Expected:** Shows first and LAST day correctly (not one day short); no slots for X on those days; calendar shaded.
- **Must be refused / negative:** Start date before today (branch timezone) not selectable; overlapping time off refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-008 · Staff adds own time off only `P1`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/schedule`
- **Preconditions:** Staff
- **Steps:**
  1. Add time off for self
  2. Try for someone else
- **Expected:** Own allowed; staff picker limited to self.
- **Must be refused / negative:** API insert for another -> refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-009 · Cancel time off `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** Existing future time off
- **Steps:**
  1. Cancel it
- **Expected:** Removed; slots return.
- **Must be refused / negative:** Staff cannot cancel another person's time off.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-010 · Holidays (branch closures) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** Owner
- **Steps:**
  1. Holidays > add '25 Dec' single day
  2. Add a 3-day range
  3. Add a past date range
- **Expected:** Listed with correct dates (no off-by-one west of UTC); no public slots on those days; past dates allowed.
- **Must be refused / negative:** Overlapping closure refused; Manager cannot add (read-only).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-011 · Empty states on schedule tabs `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** New branch
- **Steps:**
  1. Open each tab with no data
- **Expected:** Time off / holidays / rooms empty states with descriptions.
- **Must be refused / negative:** No blank screen.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-012 · Break outside working hours `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/staff`
- **Preconditions:** Week editor
- **Steps:**
  1. Add break 20:00-20:30 on a 09-17 day
- **Expected:** Accepted (no warning; it has no effect).
- **Must be refused / negative:** Record behaviour (cosmetic gap).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### SCH-013 · DST week shows correct local times `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/<slug>/book`
- **Preconditions:** Branch timezone America/New_York; week of the DST change
- **Steps:**
  1. Set Mon-Sun 09:00-17:00
  2. Open public booking on the DST Sunday and next day
- **Expected:** Slots start at 09:00 local on both sides of the change.
- **Must be refused / negative:** No 08:00 or 10:00 shift.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
