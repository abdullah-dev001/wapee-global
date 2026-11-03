# S14 — Add-ons 1: packages and inventory (40 min)

**Goal:** an add-on that is OFF is hidden and blocked; switching it off and on keeps data; packages and stock follow their rules.
**Logins / windows:** A = `team-owner`, `biz-owner` · B (Incognito) = `biz-mgr-ldn`, `biz-stf-nyc` · C (Safari) = `sa` · G = guest.
**Ready first:** S09 done (E2E Team Salon has NO add-ons on). E2E Multi Clinic has all add-ons. Work in branch **LDN** unless told otherwise (prices in £, tax 20 %).

## Add-ons OFF (E2E Team Salon)
1. A: log in as **team-owner**. Look for Packages, Inventory, a Files tab on a client, Forms, Data requests. Type `/packages`, `/inventory`, `/settings/forms`. G: open `/e2e-team/portal`.
   You should see: none in the menus; typed URLs "Not included in your plan"; the portal page "This page is not available". `[F15-01]`
   CLAUDE CHECK C-S14-01: one RPC per add-on → `feature_unavailable`; portal and sign endpoints answer generic not-found.
2. C: log in as **sa** → `e2e-team` → Add-ons → **Packages** → Switch on (note "S14"). A: reload → **Packages** → **New package** "S14 Team pack", 3 sessions, price 60.00, services Haircut → Save package.
   C: Switch Packages **off**. A: reload. C: Switch **on** again. A: reload Packages. C: Switch **off** at the end.
   You should see: menu item disappears while off; after switching on again "S14 Team pack" is back unchanged. `[F15-02]`
   CLAUDE CHECK C-S14-02: the package row is byte-identical before and after.

## Packages (E2E Multi Clinic, LDN)
3. A: log in as **biz-owner**, branch LDN → **Packages** → **New package**: Name **S14 Pack**, Sessions **5**, Bonus sessions **1**, Price **100.00**, Valid for **30** days, services **Haircut** and **Colour** → Save. 📱
   Invoices → New invoice → client **Ada Real** → **Add package** → S14 Pack → Create draft → **Issue** → Add payment in full (£120.00).
   You should see: the invoice line £100.00, tax £20.00; Ada's client page → **Packages**: "S14 Pack · 6 sessions (incl. 1 bonus) · Expires <sold date + 30 days>". `[F15-03]`
   CLAUDE CHECK C-S14-03: `client_packages` snapshot: 5 + 1 sessions, price = line net (10000), expiry = the London day after sold + 30.
4. Calendar (LDN) → New appointment **Ada Real**, Haircut, **Lena**, a future day 11:00 → Book. Open it → **Package sessions** → **Use a session** → S14 Pack → **Use session**. Try **Use a session** again on the same appointment. Then open a different client's LDN appointment (e.g. Ben Nomail's) and try S14 Pack there.
   You should see: "Session used from S14 Pack"; second use on the same appointment refused; another client's appointment does not offer Ada's package. `[F15-04]`
   CLAUDE CHECK C-S14-04: balance 5 left; using after expiry or beyond the balance is refused (suite 22), balance never below 0.
5. B: log in as **biz-mgr-ldn** → the same appointment → the used session → **Reverse** → Reason "S14 test" → **Return session**.
   You should see: "Returned" in History; balance back to 6; the original use is still listed. `[F15-05]`
   CLAUDE CHECK C-S14-05: 10-minute undo rule (creator can undo at 9 min, a receptionist cannot at 11 min) — suite 22.
6. G: `/e2e-multi/book?branch=LDN` → Haircut → Lena → a day **more than 2 days ahead** → **Ada Real** +1 202 555 0101 (no email this time) → Confirm; save the manage link as "Ada S14". B (biz-mgr-ldn): **Approve** it, then **Use a session** on it. G: open "Ada S14" → **Cancel booking** → Yes, cancel it.
   You should see: after the guest cancel, Ada's package shows the session returned. `[F15-06]`
7. A (biz-owner): on Ada's S14 Pack invoice → Credit note **Amount before tax 10.00** → Create. Then try **Credit the full remaining amount** (a session is used from step 4/6? if none is used, use one first).
   Then sell a second S14 Pack to **Cara Fake** (invoice, issue, no sessions used) → Credit the full remaining amount.
   You should see: partial credit changes nothing on the package; full credit with a used session refused (sessions already used); Cara's full credit → her package **Cancelled**. `[F15-07]`

## Inventory (E2E Multi Clinic, LDN)
8. A (biz-owner) → **Inventory** → **New product**: **S14 Shampoo**, Selling price 8.00, **Low-stock alert level 2**, **Opening stock 3** → Save product. Invoices → New invoice (client Ben Nomail) → **Add product** S14 Shampoo, Quantity **2** → Issue. Then another invoice with Quantity **2** → Issue.
   You should see: after the first, "1 in stock" / Low stock; the second issue refused (not enough stock) and that draft unchanged. `[F15-08]`
   CLAUDE CHECK C-S14-06: stock 1; no partial write from the refused issue.
   CLAUDE CHECK C-S14-07: exactly one `low_stock` email + `staff_low_stock` push for the 3 → 1 crossing. `[F15-10]`
9. B: log in as **biz-mgr-ldn** → Inventory → **Stock rules** → **Allow selling below zero** on. Issue the second draft again.
   You should see: issued; S14 Shampoo **−1** in stock. Turn the switch off after. `[F15-09]`
   CLAUDE CHECK C-S14-08: no second low-stock alert when going 1 → −1. `[F15-10]`
10. A: first Shampoo invoice → Credit note → **Credit the full remaining amount**.
    You should see: stock goes up by 2 (History shows a "Return" movement). `[F15-11]`
11. B: log in as **biz-stf-nyc** → type `/inventory`.
    You should see: "You don't have access to this". `[F15-12]`
    CLAUDE CHECK C-S14-09: as biz-stf-nyc, `products` returns 0 rows.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F15-01 | ☐ | ☐ | + C-S14-01 |
| F15-02 | ☐ | ☐ | + C-S14-02 |
| F15-03 | ☐ | ☐ | + C-S14-03 |
| F15-04 | ☐ | ☐ | + C-S14-04 |
| F15-05 | ☐ | ☐ | + C-S14-05 |
| F15-06 | ☐ | ☐ | |
| F15-07 | ☐ | ☐ | |
| F15-08 | ☐ | ☐ | + C-S14-06 |
| F15-09 | ☐ | ☐ | |
| F15-10 | C | | C-S14-07, C-S14-08 |
| F15-11 | ☐ | ☐ | |
| F15-12 | ☐ | ☐ | + C-S14-09 |
