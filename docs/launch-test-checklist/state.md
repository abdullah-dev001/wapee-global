# STATE — Loading, empty and error states

[← Back to the index](../launch-test-checklist.md) · 7 cases (P0 0, P1 7, P2 0)

### STATE-001 · States: Today, Calendar list, Clients `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/today /calendar /clients`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /today /calendar /clients under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STATE-002 · States: Invoices, Reports, Advanced reports `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/invoices /reports /settings/advanced-reports`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /invoices /reports /settings/advanced-reports under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STATE-003 · States: Services, Staff, Members, Schedule tabs `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/services /staff /members /schedule`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /services /staff /members /schedule under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STATE-004 · States: Reviews, Website editor, Packages, Inventory, Commission `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/reviews /website /packages /inventory /commission`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /reviews /website /packages /inventory /commission under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STATE-005 · States: Settings: notifications, messages, data requests, roles, branches, forms, billing `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/settings/*`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /settings/* under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STATE-006 · States: Public: booking, manage, review, sign, portal, website `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/<slug>/*`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /<slug>/* under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STATE-007 · States: Admin: list, detail, platform `P1`

- [ ] **Actor:** Tester (device / platform / build check) (`TST`) · **Screen:** `/admin/*`
- **Preconditions:** Throttle to Slow 3G; then block the Supabase host; then use an empty business
- **Steps:**
  1. Open /admin/* under each condition
- **Expected:** Skeletons while loading; an error state with Retry (Retry works after unblocking); a calm empty state with guidance when there is no data.
- **Must be refused / negative:** Never a blank screen, a raw error string, or an empty list shown instead of an error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
