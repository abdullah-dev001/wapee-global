# S07 — Invoices and money (40 min)

**Goal:** invoices are created, taxed, numbered without gaps, paid, credited and never changed after issue; each branch has its own currency, tax and series.
**Logins / windows:** A = `team-owner`, `biz-owner` · B (Incognito) = `team-rec`, `team-mgr`, `team-stf1`, `oth-owner`.
**Ready first:** S05 done (Cara Fake's Haircut today is **Completed**). E2E Team Salon has **no invoices yet** (first number will be TEA-000001).
**Tax:** E2E Team Salon = **8.88 %** (not 8.875 %, bug B-001). Expected sums below use 8.88 %, rounded half-up.

## Drafts and lines (E2E Team Salon)
1. B: log in as **team-rec** → Calendar → Cara Fake's completed Haircut → **Create invoice**.
   You should see: "Draft invoice created" with one line **Haircut 1 × $25.00**, client Cara Fake. `[F07-01]`
   CLAUDE CHECK C-S07-01: draft price = appointment snapshot (2500); appointment linked to the invoice.
2. In the draft: **Edit draft** → **Add service** → **S02 Blow-dry** ($25.00). **Add free-text line** "S07 Extra", Quantity **3**, Unit price 2.00 → **Save draft**. Then set that line's quantity to **0**, Save; then **10000**, Save. Finally **Remove line** on "S07 Extra" and Save.
   You should see: qty 3 saves; 0 and 10000 refused with a message; after removing, lines = Haircut + Blow-dry, Subtotal **$50.00**. `[F07-02]`
3. Still team-rec: look for **Discount** on a line.
   You should see: no discount control for the Receptionist. `[F07-03]`
   CLAUDE CHECK C-S07-02: a discount via the API as team-rec is refused; the draft is unchanged.
4. B: log in as **team-mgr** → **Invoices** → open the draft → Edit draft → Blow-dry **Discount** 2.50 with no reason → Save; then **Discount reason** "S07 loyalty" → Save draft.
   You should see: without reason refused; with reason saved. Preview: Subtotal $50.00, Discounts −$2.50, After discounts **$47.50**, Tax (8.88%) **$4.22**, Total **$51.72**. `[F07-03]` `[F07-04]`

## Numbering
5. Still team-mgr: **New invoice** with no lines → **Create draft** → **Issue invoice**. Then another **New invoice** with a free-text line price **0.00** → Issue.
   You should see: the empty one refused (no items); the zero one refused (zero total). `[F07-05]`
6. Discard the zero-total draft (**Discard draft** → Discard). Then open Cara's $51.72 draft → **Issue invoice** → **Issue**.
   You should see: "Draft discarded"; then "Invoice **TEA-000001** issued". `[F07-05]` `[F07-06]`
7. **Calendar** → New appointment for **Ada Real**, Haircut, Lee, today 2 hours ago → Mark completed → Create invoice → Issue.
   You should see: **TEA-000002** (no gap after the discarded draft; the empty draft from step 5 does not take a number either). `[F07-06]`
   CLAUDE CHECK C-S07-03: numbers 1 and 2, no gap, no duplicate.
   CLAUDE CHECK C-S07-04 (writes test drafts; asks first): two drafts issued at the same moment get consecutive numbers (suite 15). `[F07-07]`

## Tax snapshot
8. A: log in as **team-owner** → **Settings → Business location** → Tax rate **10**, Tax number **E2E-TEA-NEW** → Save. Open TEA-000001.
   You should see: TEA-000001 still shows Tax (8.88%) $4.22 and tax number **E2E-TEA-TAX**. Put Tax rate back to **8.88** and tax number **E2E-TEA-TAX**. `[F07-04]`
   CLAUDE CHECK C-S07-05: TEA-000001 stores `tax_rate_bp` 888, tax 422, total 5172; branch back to 888.

## Payments and credit notes
9. B: log in as **team-rec** → TEA-000001 → **Add payment**: Cash **20.00** → save. Then Card **31.72**. Then try Cash **1.00**. Then try a payment with **Date paid** = tomorrow.
   You should see: after 20.00 "Part paid", Balance due $31.72; after 31.72 "Paid"; 1.00 refused (more than the balance); tomorrow refused. `[F07-09]`
10. B: log in as **team-mgr** → TEA-000001 → **Credit note** → Amount before tax **10.00** → Create. Then Credit note → **Credit the full remaining amount** → Create.
    You should see: **TEA-CN-000001** net $10.00 + tax $0.89 = $10.89; **TEA-CN-000002** net $37.50 + tax $3.33 = $40.83; together exactly $51.72; state **Credited** and "Refund due". `[F07-10]`
11. Still team-mgr: in Payments press **Reverse** on the Card 31.72 → Amount 31.72, Reason "S07 refund" → **Reverse payment**. Then try to reverse the reversal row.
    You should see: "Payment reversed" and a **Reversal** row; the reversal itself cannot be reversed ("Only a payment can be reversed."). `[F07-10]`
    CLAUDE CHECK C-S07-06: credit notes, reversal row and totals; no rounding drift.
    CLAUDE CHECK C-S07-07: direct UPDATE / DELETE on invoices, items, payments and credit notes is refused and rows are byte-identical. `[F07-11]`
12. B (team-rec): Calendar → Cara's completed Haircut → try **Create invoice** again.
    You should see: no second invoice (it offers **View invoice** / refuses) — also after full credit. `[F07-12]`
13. Still team-rec: TEA-000002 → **Print / share** → Print. Use the browser's print preview (⌘P), then cancel.
    You should see: number, issue date, address "1 E2E Ave, New York", tax number, lines, totals; only the invoice is printed (no side menu). Copy the address bar (`/invoice-print/<id>`) for step 16. `[F07-15]`
14. team-rec → Clients → **Cara Fake**.
    You should see: Invoices list with TEA-000001 and its state badge (Credited). `[F07-18]`
15. B: log in as **team-mgr** → Cara's completed Haircut → **Reopen**.
    You should see: refused because it has an invoice. `[F05-14]`
16. B: log in as **team-stf1** → type `/invoices`. Then log in as **oth-owner** and paste the `/invoice-print/<id>` address from step 13.
    You should see: staff gets the lock / "You don't have access to this"; the other business gets "That invoice could not be found." `[F07-17]`
    CLAUDE CHECK C-S07-08: audit rows `invoice.issued`, `payment_added`, `payment_reversed`, `credit_note_created`, `draft_discarded`. `[F07-16]`

## Several branches (E2E Multi Clinic)
17. A: log in as **biz-owner**. Branch **LDN**: Invoices → New invoice → client **S05 London**, Add service Haircut (£25.00) → Create draft → Issue. Branch **NYC**: New invoice → client Ada Real, Haircut ($25.00) → Issue. Branch **TYO**: New invoice → client S05 Tokyo, Haircut (¥3,000) → Issue.
    You should see: **LDN-000001** £25.00 + Tax (20%) £5.00 = **£30.00**, tax no. E2E-LDN-TAX; **NYC-000001** $25.00 + Tax (8.88%) $2.22 = **$27.22**; **TYO-000001** ¥3,000 + Tax (10%) ¥300 = **¥3,300** (no ".00"). `[F07-08]` `[F12-04]` `[F07-14]`
    CLAUDE CHECK C-S07-09: integer minor units with the right currency per branch; JPY stored as 3300. `[F19-09]`
18. On LDN-000001: Credit note → Credit the full remaining amount.
    You should see: **LDN-CN-000001** (credit notes have their own series). `[F07-08]`
19. Settings → **Locations** → **NYC** → Edit: change Currency to EUR, save; then Invoice prefix to "NY2", save.
    You should see: both refused, "Locked: invoices were issued"; NYC unchanged. `[F07-13]`
20. LDN: Clients → **S05 London** (has invoice LDN-000001, no upcoming visits) → **Erase personal data** → type the name → confirm. Open LDN-000001.
    You should see: client Erased; the invoice still exists with the name blanked. `[F06-09]`
    CLAUDE CHECK C-S07-10: invoice amounts unchanged, `bill_to_name` blanked.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F07-01 | ☐ | ☐ | + C-S07-01 |
| F07-02 | ☐ | ☐ | |
| F07-03 | ☐ | ☐ | + C-S07-02 |
| F07-04 | ☐ | ☐ | + C-S07-05 |
| F07-05 | ☐ | ☐ | |
| F07-06 | ☐ | ☐ | + C-S07-03 |
| F07-07 | C | | C-S07-04 |
| F07-08 | ☐ | ☐ | |
| F07-09 | ☐ | ☐ | |
| F07-10 | ☐ | ☐ | + C-S07-06 |
| F07-11 | C | | C-S07-07 |
| F07-12 | ☐ | ☐ | |
| F07-13 | ☐ | ☐ | |
| F07-14 | ☐ | ☐ | + C-S07-09 |
| F07-15 | ☐ | ☐ | |
| F07-16 | C | | C-S07-08 |
| F07-17 | ☐ | ☐ | |
| F07-18 | ☐ | ☐ | |
| F12-04 | ☐ | ☐ | |
| F19-09 | ☐ | ☐ | + C-S07-09 |
| F05-14 (invoiced part) | ☐ | ☐ | |
| F06-09 (invoice part) | ☐ | ☐ | + C-S07-10 |
