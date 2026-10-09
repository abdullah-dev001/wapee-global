# COM — Commission (Team+)

[← Back to the index](../launch-test-checklist.md) · 6 cases (P0 2, P1 4, P2 0)

### COM-001 · Set rules: default and per service `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/commission`
- **Preconditions:** Team plan, staff X
- **Steps:**
  1. Commission > Rules > X: default 10% from today
  2. Per service 'Colour': flat 5.00 (currency)
  3. Another service: no commission
- **Expected:** Rules saved with history; effective-from shown.
- **Must be refused / negative:** Percent >100 or <0 refused; flat without amount/currency refused; effective date more than a year ahead refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### COM-002 · Commission earned only when fully paid `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/commission`
- **Preconditions:** Invoice for X's appointment, rule 10%
- **Steps:**
  1. Issue invoice 100 net + tax
  2. Pay partially
  3. Pay the rest
- **Expected:** Nothing earned while partial; 10.00 earned (tax excluded) at full payment.
- **Must be refused / negative:** Free-text lines earn only a default PERCENT rule.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### COM-003 · Credit note and payment reversal reverse commission `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/commission`
- **Preconditions:** Fully paid invoice with commission
- **Steps:**
  1. Credit note 50%
  2. Reverse a payment so it is no longer fully paid
- **Expected:** Proportional reversal on credit note; reversal of the rest when no longer fully paid; paying again earns again as new rows.
- **Must be refused / negative:** Never double-reversed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### COM-004 · My earnings (own only) `P1`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/commission`
- **Preconditions:** Staff on Team plan
- **Steps:**
  1. Commission > My earnings, change month
- **Expected:** Own month totals and ledger only.
- **Must be refused / negative:** No Team report / Rules tabs; API for others refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### COM-005 · Team report `P1`

- [ ] **Actor:** Manager (branch-scoped) (`MGR`) · **Screen:** `/commission`
- **Preconditions:** Manager (view_all at branch)
- **Steps:**
  1. Team report tab
- **Expected:** Per staff per currency for own branch.
- **Must be refused / negative:** No Rules tab (manage_rules is Owner-only by default).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### COM-006 · Commission hidden on Solo `P1`

- [ ] **Actor:** Owner on Solo plan (`SOLO`) · **Screen:** `/commission`
- **Preconditions:** Solo
- **Steps:**
  1. Look for Commission nav; type /commission
- **Expected:** Hidden; 'Not included in your plan'.
- **Must be refused / negative:** No retroactive commission after upgrading.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
