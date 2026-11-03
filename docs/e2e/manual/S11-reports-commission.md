# S11 — Reports and commission (40 min)

**Goal:** commission is earned only on full payment and reversed on credit; reports match the money, never add different currencies, and are visible only to the right people.
**Logins / windows:** A = `team-owner`, `biz-owner`, `solo-owner` · B (Incognito) = `team-rec`, `team-mgr`, `team-stf1`, `biz-mgr-ldn`.
**Ready first:** S07 done. E2E Team Salon is on Team (commission included). Tax 8.88 %.

## Commission rules and earning (E2E Team Salon)
1. A: log in as **team-owner** → **Commission** → **Rules** → **Sam**: **Per service** Haircut → **Set rule**: Type Percent **40**, Starts **Today** → Save rule. Colour → Type **Amount per unit** 5.00 → Save. **Default rule** → Percent **10** → Save.
   B: log in as **team-mgr** → Commission → Rules.
   You should see: "Rule saved" ×3 and a History per rule; the Manager can see rules but not **Set rule**. `[F13-01]`
2. B: log in as **team-rec** → Calendar → New appointment **S11 Comm A** (+1 202 555 0160), Haircut, **Sam**, today 1 hour ago → Mark completed → Create invoice → Issue → Add payment Cash **27.22** (25.00 + 2.22 tax).
   You should see: invoice Paid. A (owner) → Commission → **Team report**: Sam earned **$10.00** (40 % of $25.00, before tax). `[F13-02]`
   CLAUDE CHECK C-S11-01: one `commission_entries` row, 1000 minor, kind earned.
3. B (team-rec): same for **S11 Comm B** (+1 202 555 0161) but pay only **13.61**. Check Commission. Then pay the remaining **13.61**.
   You should see: nothing for Comm B while part paid; $10.00 appears after the final payment. `[F13-03]`
4. B: log in as **team-mgr** → Comm A's invoice → Credit note → Amount before tax **12.50** → Create. Then Credit note → Credit the full remaining amount.
   You should see: Commission shows "Taken back" −$5.00, then another −$5.00: Comm A nets to **$0.00**. `[F13-04]`
   CLAUDE CHECK C-S11-02: reversal rows sum to −1000, no drift.
5. Commission as **team-stf1** (Sam), **team-mgr**, **team-rec**.
   You should see: Sam: **My earnings** only (his own lines); Manager: **Team report** with everyone; Receptionist: no Commission menu (typed `/commission` locked). `[F13-05]`
   CLAUDE CHECK C-S11-03: as team-stf1, reading Lee's commission returns nothing.
6. A (owner): Rules → Sam → Haircut → Set rule Percent **50**, Starts Today → Save. B (team-rec): **S11 Comm C** (+1 202 555 0162), Sam, Haircut, completed, invoice, pay **27.22** in full.
   You should see: Comm C earns **$12.50**; Comm B's $10.00 unchanged. `[F13-06]`
7. A: log in as **solo-owner** → type `/commission`.
   You should see: "Not included in your plan". `[F13-07]`
   CLAUDE CHECK C-S11-04: `set_commission_rule` as solo-owner → `feature_unavailable`; a paid Solo invoice creates no earned commission.
   CLAUDE CHECK C-S11-05 (writes; asks first): two final payments at the same moment create exactly one set of entries (suite 20). `[F13-08]`

## Basic reports
8. A: log in as **team-owner** → **Reports** → **Today**, then **This month**. 📱
   You should see: Revenue (before tax), Invoiced (incl. tax), Tax, Credit notes, Collected — in $; Appointments counts; Top services. `[F08-01]`
   CLAUDE CHECK C-S11-06: every number matches the database for New York's today / this month.
9. Reports as **team-rec** and **team-stf1** (typed `/reports`), then as **biz-mgr-ldn**.
   You should see: Rec / Staff: no menu, lock state; Manager@LDN: LDN figures only (no NYC / TYO). `[F08-02]`
10. A: log in as **biz-owner** → Reports (all locations) → This month. Then Settings → **Advanced reports** → Location **All locations** → Revenue.
    You should see: separate GBP, USD and JPY figures; no total that adds them. `[F08-03]`

## Advanced reports
11. A: log in as **team-owner** → Settings → **Advanced reports**. Try **Week**, **Month**, **Previous period** / **Next period**, then **Custom** From 2026-01-01 To 2026-12-31 → Apply; then To 2027-01-02 (367 days) → Apply.
    You should see: "vs previous" figures; the 366-day range works; 367 days refused ("The date range is too long."). `[F08-04]`
12. This month: open **Revenue**, **Team**, **Services**, **Clients**, **Appointments**.
    You should see: Net revenue, Collected, Discounts given, Tax, Credit notes, by payment method (Cash), Team incl. commission, Most booked / Highest earning, New / Returning clients, Retention, Completed / Cancelled / No-show. `[F08-05]`
    CLAUDE CHECK C-S11-07: these values match hand-computed SQL for this month.
13. Look for **Locations** / **Compare locations** in E2E Team Salon; then as **biz-owner**.
    You should see: Team: no Locations section; Business: shown with one row per location. `[F08-06]`
    CLAUDE CHECK C-S11-08: section `branches` as team-owner → `feature_unavailable`.
14. A (biz-owner) → LDN: Clients → New client named `=HYPERLINK("http://x.test","S11")` (+44 7700 900161). Invoice for it (Haircut) → Issue → pay in full. Advanced reports → **Clients** (and **Revenue**) → **Download CSV**. Open the file in Numbers / Excel.
    You should see: "File downloaded"; the odd name appears as plain text (starts with `'`), not a clickable link; a currency column on each row. `[F08-07]`
15. **Print view** on one section, then ⌘P → Save as PDF.
    You should see: a clean print page (no menus), readable PDF. `[F08-08]`
16. A (team-owner) → Advanced reports → **Email** → **Weekly summary** on, **Send at** = the next whole hour (New York) → Save.
    You should see: "Schedule saved". Weekly summaries go out on **Mondays** at that hour (monthly on the 1st): check again next Monday. `[F08-09]`
    CLAUDE CHECK C-S11-09: after Monday's run, one `report_summary` row per eligible person (All-scope advanced reports; revenue only with revenue permission) and the payload emptied after sending. (The owner's plus-address is refused by the DEV mail sender: a `dead/rejected` row still counts.)
17. A: log in as **solo-owner** → type `/settings/advanced-reports`.
    You should see: "Not included in your plan". `[F08-10]`
    CLAUDE CHECK C-S11-10: `get_advanced_report` as solo-owner → `feature_unavailable`.
18. CLAUDE CHECK C-S11-11: LDN weekly report for 22–28 Mar 2027 and 29 Mar–4 Apr 2027 starts Monday 00:00 London and ends Sunday 24:00 London, no lost or double hour (uses Cara's 29 Mar booking). `[F08-11]`
19. A (biz-owner, Packages add-on on) → Advanced reports: look for a **Packages** section.
    You should see: none — **KG-07** (known gap). `[F08-12]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F08-01 | ☐ | ☐ | + C-S11-06 |
| F08-02 | ☐ | ☐ | |
| F08-03 | ☐ | ☐ | |
| F08-04 | ☐ | ☐ | |
| F08-05 | ☐ | ☐ | + C-S11-07 |
| F08-06 | ☐ | ☐ | + C-S11-08 |
| F08-07 | ☐ | ☐ | |
| F08-08 | ☐ | ☐ | |
| F08-09 | ☐ | ☐ | + C-S11-09 (next Monday) |
| F08-10 | ☐ | ☐ | + C-S11-10 |
| F08-11 | C | | C-S11-11 |
| F08-12 | KG-07 ☐ | ☐ | |
| F13-01 | ☐ | ☐ | |
| F13-02 | ☐ | ☐ | + C-S11-01 |
| F13-03 | ☐ | ☐ | |
| F13-04 | ☐ | ☐ | + C-S11-02 |
| F13-05 | ☐ | ☐ | + C-S11-03 |
| F13-06 | ☐ | ☐ | |
| F13-07 | ☐ | ☐ | + C-S11-04 |
| F13-08 | C | | C-S11-05 |
