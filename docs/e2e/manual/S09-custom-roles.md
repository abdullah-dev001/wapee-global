# S09 — Custom roles (25 min)

**Goal:** custom roles are only available where the plan allows, cannot give more than the creator has, take effect quickly, and are audited.
**Logins / windows:** A = `biz-owner`, `team-owner` · B (Incognito) = `biz-custom`, `m04` · C (Safari) = `sa` (super admin).
**Ready first:** S08 done (m04 is Staff in E2E Team Salon).

## Plan gate
1. A: log in as **team-owner** → **Settings** → look for **Roles and permissions**; type `/settings/roles`.
   You should see: "Not included in your plan" (Team without the Custom roles add-on). `[F14-01]`
   CLAUDE CHECK C-S09-01: `create_custom_role` as team-owner → `feature_unavailable`.
2. C: log in as **sa** → **Super admin** → Businesses → search `e2e-team` → open → Add-ons → **Custom roles** → **Switch on**, Internal note "S09 test" → confirm. A: reload Settings.
   You should see: "Add-on updated."; team-owner now sees **Roles and permissions** and can open it. `[F14-01]`

## Create, clone, defaults (E2E Multi Clinic)
3. A: log in as **biz-owner** → Settings → **Roles and permissions** → **New role**: Role name **S09 Desk**, Start from **Nothing (blank role)**. Tick **View appointments** = Branch, **Create appointments** = Branch, **View clients** = Branch → **Save role**. 📱
   You should see: "Role created"; in the matrix the add-on groups (Packages, Inventory, Files and forms) are visible (all add-ons on here) and there is **no SMS** group. `[F14-02]`
4. Press **Clone** on **Owner** → save as "Owner (copy)".
   You should see: a note that **Billing (Owner only)** was removed; everything else the same as Owner. `[F14-03]`
5. Open the default **Manager** role.
   You should see: **View** only, no Edit and no Delete. `[F14-05]`
   CLAUDE CHECK C-S09-02: REST insert/delete on the Manager role's permissions is refused; unchanged.
   CLAUDE CHECK C-S09-03: a role holder with Branch-level `roles.manage` cannot define a role with All-level revenue, nor assign at another branch (`can_define_at` / `can_grant_at`). `[F14-04]`

## Assign and delete
6. A: **Team** → **biz-custom** → Manage → change the role from "Front desk lite" to **S09 Desk** @ **LDN** → Save change. B: log in as **biz-custom** (or click around if already in), wait up to 60 s.
   You should see: menu shows only Today, Calendar, Clients (no Invoices, no Services); Calendar shows LDN only. `[F14-06]`
   CLAUDE CHECK C-S09-04: as biz-custom the API returns LDN appointments only.
7. A: Settings → Roles → **S09 Desk** → **Delete**. Then Delete again choosing **Give them this role instead** = "Front desk lite".
   You should see: first refused "in use" with the count (1 person); second "Role deleted" and biz-custom now has Front desk lite. `[F14-07]`
   CLAUDE CHECK C-S09-05: audit `role.created`, `role.updated`, `role.deleted`, `role.assigned`, `role.unassigned` with before/after. `[F14-08]`
8. Delete "Owner (copy)" (not in use).

## Add-on switched off keeps people working (E2E Team Salon)
9. A: log in as **team-owner** → Roles → **New role** "S09 Team role": View appointments = Own, View clients = Own → Save. **Team** → **m04** → Manage → **Add a role** → S09 Team role @ New York.
   C (sa): E2E Team Salon → Add-ons → Custom roles → **Switch off** (note "S09 off").
   B: log in as **m04** → Calendar works as before. A: try to edit S09 Team role.
   You should see: m04 still works; editing the role is refused / Roles shows "Not included in your plan". `[F14-09]`
   (Leave Custom roles OFF: S14 needs E2E Team Salon without add-ons.)
10. CLAUDE CHECK C-S09-06: an owner cannot remove their own Owner role by assigning themselves a custom role (suite 41). `[F14-10]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F14-01 | ☐ | ☐ | + C-S09-01 |
| F14-02 | ☐ | ☐ | |
| F14-03 | ☐ | ☐ | |
| F14-04 | C | | C-S09-03 |
| F14-05 | ☐ | ☐ | + C-S09-02 |
| F14-06 | ☐ | ☐ | + C-S09-04 |
| F14-07 | ☐ | ☐ | |
| F14-08 | C | | C-S09-05 |
| F14-09 | ☐ | ☐ | |
| F14-10 | C | | C-S09-06 |
