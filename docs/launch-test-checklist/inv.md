# INV — Invoices, payments, credit notes

[← Back to the index](../launch-test-checklist.md) · 21 cases (P0 14, P1 6, P2 1)

> Number <PREFIX>-000001 per branch, gapless, assigned at issue. Credit notes <PREFIX>-CN-000001. Tax exclusive, half-up on the invoice net. Issued rows are immutable for every role. Permissions: create/issue/pay = invoices.create (Owner, Manager, Receptionist); discount = invoices.discount; credit note + reverse payment = invoices.credit_note (Owner, Manager).

### INV-001 · Create invoice from a completed appointment `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Completed appointment with a priced service
- **Steps:**
  1. Appointment detail > Create invoice
- **Expected:** Draft opens with client and the service line at the price snapshot; appointment now links 'View invoice'.
- **Must be refused / negative:** Pending/confirmed appointment -> 'Only a completed appointment can be invoiced.'; second invoice for the same appointment -> 'This appointment already has an invoice.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-002 · Create a manual draft `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Owner
- **Steps:**
  1. Invoices > New
  2. Pick client (optional)
  3. Add a service line, a free-text line, quantity 3
  4. Notes
  5. Save draft
- **Expected:** Draft listed without a number; totals preview: net, tax (branch rate), total.
- **Must be refused / negative:** Description empty or >200 chars refused; quantity 0 or 10000 -> 'Quantity must be a whole number from 1 to 9999.'; 101 lines -> 'An invoice can have at most 100 lines.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-003 · Discount with reason `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Owner (invoices.discount)
- **Steps:**
  1. Add a discount to a line without reason
  2. Reason 'ab'
  3. Reason 'Loyalty', discount above line total
  4. Valid discount
- **Expected:** 'A discount needs a reason (at least 3 characters).' / 'A discount can't be more than the line total.'; valid discount reduces net, tax recalculated on the discounted net.
- **Must be refused / negative:** Negative discount refused ('Check the discount amount.').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-004 · Receptionist cannot discount `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/invoices`
- **Preconditions:** Receptionist
- **Steps:**
  1. Open a new draft: look for discount
  2. Open a draft created by the owner WITH a discount
- **Expected:** No discount input; on the discounted draft Save is disabled with an explanation.
- **Must be refused / negative:** API discount -> 'You don't have permission to give discounts.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-005 · Issue invoice: gapless number and tax snapshot `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Branch prefix MAI, rate 10%
- **Steps:**
  1. Issue draft 1
  2. Issue draft 2
  3. Change branch tax rate to 20%
  4. Open the issued invoices
- **Expected:** Numbers MAI-000001 then MAI-000002 with no gap; issued invoices keep 10% tax and old tax number.
- **Must be refused / negative:** Issue with no lines -> 'Add at least one item before issuing.'; total 0 -> 'A free invoice (total 0) can't be issued.'
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-006 · Discarded draft leaves no gap `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Draft A, draft B
- **Steps:**
  1. Discard draft A (confirm)
  2. Issue draft B
- **Expected:** B gets the next number (drafts have no number); A disappears; its appointment can be invoiced again.
- **Must be refused / negative:** Discard is only possible on drafts.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-007 · Issued invoice is immutable `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Issued invoice
- **Steps:**
  1. Look for edit/delete
  2. Try update via API
- **Expected:** No edit/delete; only payments and credit notes.
- **Must be refused / negative:** API update/delete refused for every role ('This invoice was already issued...').
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-008 · Payments: full, partial, methods `P0`

- [ ] **Actor:** Receptionist (`REC`) · **Screen:** `/invoices`
- **Preconditions:** Issued invoice total 100.00
- **Steps:**
  1. Add payment cash 40
  2. Add card 60
  3. Try bank transfer 1 more
- **Expected:** Status Pending -> Partial -> Paid; balance shown; overpayment -> 'That is more than the balance due.'
- **Must be refused / negative:** Payment date before issue or in the future -> 'The payment date can't be before the invoice was issued or in the future.'; amount 0 refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-009 · Reverse a payment `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Paid invoice
- **Steps:**
  1. Reverse payment with reason 'ab'
  2. Reverse 30 of a 60 payment with reason
  3. Try to reverse more than remains
- **Expected:** Short reason refused; partial reversal creates a new row; status back to Partial; over-limit -> 'That amount isn't allowed. Check the limit shown.'
- **Must be refused / negative:** A reversal row cannot itself be reversed ('Only a payment can be reversed.'). Receptionist has no Reverse.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-010 · Credit note partial and full `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Issued unpaid invoice net 100 + tax
- **Steps:**
  1. Credit note 40 net, reason
  2. Credit note for the rest (empty amount = full)
  3. Try another
- **Expected:** CN numbers <PREFIX>-CN-000001, -000002; tax follows the snapshot rate; credits sum exactly to the invoice (no rounding drift); status Credited.
- **Must be refused / negative:** Further credit -> 'This invoice is already fully credited.'; reason <3 refused. Receptionist cannot credit.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-011 · Credit after payment leaves refund due `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Paid invoice
- **Steps:**
  1. Full credit note
  2. Read the balance
  3. Reverse the payment (refund)
- **Expected:** Shows refund due until the payment is reversed; then settled.
- **Must be refused / negative:** No automatic refund; nothing changes on the payment row itself.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-012 · Branch currency locked by invoices `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/settings/branches`
- **Preconditions:** Branch with an issued invoice (and one with only a discarded draft)
- **Steps:**
  1. Settings > Locations > edit currency
- **Expected:** Refused: 'The currency cannot change once the location has invoices.'
- **Must be refused / negative:** Branch with only a discarded draft is not locked by invoices.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-013 · Invoice list filters and search `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** 20+ invoices
- **Steps:**
  1. Filter status draft/issued, payment pending/partial/paid/credited, date range, branch (all/current)
  2. Search number or bill-to name (2+ chars)
  3. Use '%' in search
- **Expected:** Server-filtered, newest first, 20 per page; '%' is searched literally; filters in URL so Back/Forward work.
- **Must be refused / negative:** Invalid filter in URL -> 'That filter isn't valid.' (no crash).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-014 · Print / save PDF (web) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoice-print/<id>`
- **Preconditions:** Issued invoice
- **Steps:**
  1. Open invoice > Print
  2. Use the browser print dialog
- **Expected:** /invoice-print/<id> shows only the invoice (no app chrome); business, branch, tax number, number, lines, tax, totals, payments, credit notes; client phone/email only for roles with view_contact.
- **Must be refused / negative:** Signed-out visitor -> /login; role without invoices.view -> nothing loads.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-015 · Native share (no PDF) `P1`  🔒 prod/device

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoice-print/<id>`
- **Preconditions:** Native app
- **Steps:**
  1. Invoice > share
- **Expected:** Share sheet with a plain-text summary.
- **Must be refused / negative:** No crash when share is cancelled.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-016 · Staff has no invoice access `P0`

- [ ] **Actor:** Staff (own scope) (`STF`) · **Screen:** `/invoices`
- **Preconditions:** Staff
- **Steps:**
  1. Type /invoices, /invoice-print/<id>
- **Expected:** No-access / not found; completed appointments show no invoice button.
- **Must be refused / negative:** API reads return nothing.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-017 · Invoice of another business by URL `P0`

- [ ] **Actor:** Signed-in user of another business (`OTHER`) · **Screen:** `/invoice-print/<id>`
- **Preconditions:** Signed in to B
- **Steps:**
  1. Open /invoice-print/<A invoice id> and /invoices?invoice=<id>
- **Expected:** Not found / nothing.
- **Must be refused / negative:** No amounts or names of A.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-018 · Package and product lines (add-ons on) `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Packages + inventory add-ons on
- **Steps:**
  1. Add package line (qty 2)
  2. Fix qty to 1, issue without client
  3. Add client, issue
  4. Add product line
- **Expected:** Qty 2 -> 'A package line is always quantity 1...'; no client -> 'Choose the client before issuing...'; issue creates the client package and drops product stock.
- **Must be refused / negative:** Product without enough stock -> 'Not enough stock...' and NOTHING is issued (package stays unsold too).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-019 · Money formats JPY and KWD `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Branches in JPY (0 decimals) and KWD (3 decimals)
- **Steps:**
  1. Create and issue invoices in each
  2. Pay partial amounts
- **Expected:** JPY shows no decimals (¥1,500); KWD shows 3 decimals (KWD 1.250); tax rounding half-up on minor units.
- **Must be refused / negative:** Typing decimals in JPY is not possible / refused; no float drift.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-020 · Draft not audited, issue/payment/credit/discard audited `P2`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `(DB)`
- **Preconditions:** After the actions above
- **Steps:**
  1. Read audit_logs (SQL)
- **Expected:** invoice.issued, payment_added, payment_reversed, credit_note_created, draft_discarded rows exist.
- **Must be refused / negative:** No audit row for creating a draft (by design).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### INV-021 · Concurrent issue keeps numbers gapless `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/invoices`
- **Preconditions:** Two browsers, two drafts in the same branch
- **Steps:**
  1. Press Issue in both at the same moment
- **Expected:** Two consecutive numbers, no duplicate, no gap.
- **Must be refused / negative:** Never two invoices with the same number.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
