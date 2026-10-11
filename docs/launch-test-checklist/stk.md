# STK — Add-on: Inventory

[← Back to the index](../launch-test-checklist.md) · 8 cases (P0 1, P1 7, P2 0)

### STK-001 · Create product with opening stock `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/inventory`
- **Preconditions:** Inventory add-on
- **Steps:**
  1. Inventory > New product: name, SKU, unit 'bottle', price, alert level 3, opening stock 10
- **Expected:** Listed 'in stock' with 10; history shows 'Opening stock' adjustment.
- **Must be refused / negative:** Duplicate SKU in the branch -> 'Another product here already uses that SKU.'; unit >20 / SKU >60 / name >120 refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-002 · Stock movements `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/inventory`
- **Preconditions:** Product
- **Steps:**
  1. Purchase +5
  2. Adjustment -2 without reason, then with reason
  3. Return +1 with reason
  4. Quantity 0 / 1.5
- **Expected:** Stock and history update (immutable rows with stock after); missing reason -> 'A reason is required (at least 3 characters).'; 0/1.5 -> 'Enter a whole number greater than zero.'
- **Must be refused / negative:** A 'sale' movement cannot be typed in by hand.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-003 · Sale at invoice issue `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/invoices`
- **Preconditions:** Product stock 2
- **Steps:**
  1. Invoice with product qty 3 > issue
  2. Qty 2 > issue
- **Expected:** Qty 3 refused 'Not enough stock...' and nothing issued; qty 2 issues, stock 0 'out'.
- **Must be refused / negative:** Two people selling the last unit at once: exactly one succeeds.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-004 · Negative stock switch `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/inventory`
- **Preconditions:** Branch setting off, then on
- **Steps:**
  1. Turn 'allow negative stock' on
  2. Sell more than stock
- **Expected:** Allowed; history records negative stock after.
- **Must be refused / negative:** Off (default): refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-005 · Low-stock badge and alert `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/inventory`
- **Preconditions:** Alert level 3, stock 4
- **Steps:**
  1. Sell 1 (stock 3)
- **Expected:** Badge on Today and header for inventory.view holders; email + push queued once on crossing.
- **Must be refused / negative:** Not repeated on further decreases until restocked above 3.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-006 · Exhausting credit note restores stock `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Issued invoice with product lines
- **Steps:**
  1. Full credit note
- **Expected:** Return movement per product line linked to the credit note; stock restored once.
- **Must be refused / negative:** Partial credit restores nothing.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-007 · Receptionist views, cannot adjust `P1`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/inventory`
- **Preconditions:** Receptionist
- **Steps:**
  1. Open Inventory, a product
- **Expected:** List and history visible; no create/edit/movement/settings actions.
- **Must be refused / negative:** API adjust refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### STK-008 · Filters and paging `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/inventory`
- **Preconditions:** 25 products, 3 low
- **Steps:**
  1. Search name/SKU
  2. 'Low stock only'
  3. Load more
- **Expected:** Correct subsets; 20 per page.
- **Must be refused / negative:** Empty-search state.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
