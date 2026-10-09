# REP — Reports: basic and advanced

[← Back to the index](../launch-test-checklist.md) · 11 cases (P0 1, P1 10, P2 0)

### REP-001 · Basic report: today and this month `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/reports`
- **Preconditions:** Issued invoices and appointments
- **Steps:**
  1. Open Reports
- **Expected:** Today / This month: revenue PER currency (invoiced, credited, tax, net revenue, collected, count), appointments by status, top services.
- **Must be refused / negative:** Different currencies are never added together.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-002 · Revenue needs reports.view_revenue `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/reports`
- **Preconditions:** Custom role with reports.view_basic only
- **Steps:**
  1. Open Reports
- **Expected:** Counts and top services visible; revenue block hidden/null.
- **Must be refused / negative:** Revenue figures absent from the network response.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-003 · Receptionist / Staff cannot open reports `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/reports`
- **Preconditions:** Receptionist, Staff
- **Steps:**
  1. Type /reports, /settings/advanced-reports, /report-print
- **Expected:** No-access state / nothing.
- **Must be refused / negative:** RPCs refuse.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-004 · Day and month boundaries in branch timezone `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/reports`
- **Preconditions:** Branch America/New_York; invoice issued 23:30 local
- **Steps:**
  1. Check Today and Month
- **Expected:** Counted on the local day/month, correct across DST.
- **Must be refused / negative:** Not counted in the UTC day.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-005 · Advanced report periods `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Team or Business
- **Steps:**
  1. Reports > Advanced
  2. Week (Mon-Sun), Month, Custom range
  3. Custom range of 367 days
  4. End before start
- **Expected:** Current vs previous period with deltas; 'The range is longer than 366 days.' / 'Choose a start before the end.'
- **Must be refused / negative:** Anchor more than a year ahead refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-006 · Advanced sections `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Data in all areas
- **Steps:**
  1. Open Revenue, Team, Services, Clients, Appointments
- **Expected:** Revenue per currency (daily bars, by method, discounts); Team (appointments, revenue net of credit notes, commission); Services top 20; Clients (active, new, retention); Appointments (rates).
- **Must be refused / negative:** Commission column only with commission.view_all.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-007 · Locations comparison section `P1`

- [ ] **Actor:** Owner on Business plan (`BIZ`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Business plan, 2 branches with different currencies
- **Steps:**
  1. Open Locations section
- **Expected:** Each branch in its own currency; archived branches with history included.
- **Must be refused / negative:** Team plan: Locations section not available.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-008 · CSV export `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Web
- **Steps:**
  1. Export CSV
  2. Open in a spreadsheet; include a client named '=SUM(1)'
- **Expected:** File downloads (UTF-8 BOM, accents OK), plain major-unit numbers per row currency; cells starting with = + - @ are neutralised.
- **Must be refused / negative:** Native: share sheet with CSV text (no file attachment).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-009 · Print view `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/report-print`
- **Preconditions:** Web
- **Steps:**
  1. Open print view
- **Expected:** /report-print shows the report only; browser print / save as PDF works.
- **Must be refused / negative:** Signed out -> /login.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-010 · Scheduled email settings `P1`

- [ ] **Actor:** Owner on Team plan (`TEAM`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Owner holding reports.view_advanced at All
- **Steps:**
  1. Email tab: enable weekly at 08:00
  2. Enable monthly
  3. Disable
- **Expected:** Saved; recipient rule text shown (members with advanced reports at All scope; revenue only with revenue permission).
- **Must be refused / negative:** A Manager (Branch scope) is not a recipient. New schedule starts with the NEXT period.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### REP-011 · Advanced reports gated `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`) · **Screen:** `/settings/advanced-reports`
- **Preconditions:** Solo
- **Steps:**
  1. Open advanced reports
- **Expected:** 'Not included in your plan'.
- **Must be refused / negative:** RPC feature_unavailable.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
