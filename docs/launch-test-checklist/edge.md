# EDGE — Data edge cases

[← Back to the index](../launch-test-checklist.md) · 10 cases (P0 3, P1 5, P2 2)

### EDGE-001 · Very long names `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Client/service/staff names at max length (160/120/120), business name 120
- **Steps:**
  1. View in lists, calendar blocks, invoices, print, emails, public pages at 375
- **Expected:** Truncated or wrapped cleanly.
- **Must be refused / negative:** No layout break; full value preserved in DB.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-002 · Emoji and special characters `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Names with emoji '💇‍♀️', quotes, ampersand, apostrophe, accents
- **Steps:**
  1. Save and view everywhere incl. CSV, print, email subject
- **Expected:** Shown correctly; search finds 'Zoë' with 'zoe' only if supported (record).
- **Must be refused / negative:** No mojibake in CSV (BOM) or emails.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-003 · Zero and very large amounts `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Prices 0, 0.01, 999,999,999.99; JPY 1,000,000,000
- **Steps:**
  1. Create services and invoices
- **Expected:** Exact amounts, correct currency decimals, no float rounding; price limit 1e11 minor units refused above.
- **Must be refused / negative:** Total 0 invoice cannot be issued.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-004 · JPY (0 decimals) and KWD (3 decimals) end to end `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Branches in JPY and KWD
- **Steps:**
  1. Service price, booking page price, invoice, payment, credit note, reports
- **Expected:** JPY never shows decimals; KWD always 3; reports per currency.
- **Must be refused / negative:** No conversion between currencies.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-005 · DST transition days `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/<slug>/book`
- **Preconditions:** Branch America/New_York (and Europe/London); appointments on the change Sundays
- **Steps:**
  1. Book 01:30 and 03:00 on spring-forward day
  2. Check reminders and reports
- **Expected:** Non-existent local times not offered; reminders on wall clock; report days correct.
- **Must be refused / negative:** No duplicate or missing hour slots.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-006 · Asia/Karachi (no DST) and far-east zones `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/today`
- **Preconditions:** Branch Asia/Karachi; device in America/Los_Angeles
- **Steps:**
  1. Today, calendar, booking, reports
- **Expected:** All in branch time; 'today' is Karachi's date.
- **Must be refused / negative:** Device timezone never used.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-007 · Leap day `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/schedule`
- **Preconditions:** Time off / closure / booking on 29 Feb 2028; package expiry crossing it
- **Steps:**
  1. Create them
- **Expected:** Dates stored and shown correctly; expiry counted in calendar days.
- **Must be refused / negative:** No off-by-one.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-008 · Many items `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Invoice with 100 lines; client with 200 visits; 60 staff (Business)
- **Steps:**
  1. Open and scroll
- **Expected:** Usable; pagination where lists are long.
- **Must be refused / negative:** No freeze > a few seconds.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-009 · Whitespace-only input `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Names '   '
- **Steps:**
  1. Save client/service/staff
- **Expected:** Treated as empty -> required error.
- **Must be refused / negative:** No blank-named records.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### EDGE-010 · Leading/trailing spaces and case `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(all)`
- **Preconditions:** Email ' A@B.COM '
- **Steps:**
  1. Use in signup, client, invite
- **Expected:** Trimmed, lowercased where emails are compared.
- **Must be refused / negative:** Duplicate accounts by case impossible.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
