# Plan features UI (Phase 9B): roles, members, commission, locations, advanced reports
Status: **built, web verified at 375 and 1440** · Last updated: 2026-10-07 · Backend: `plan-features.md`

## Screens (all gated by `my_features()` through `RequireFeature`; off = the calm "Not included in your plan" state, no prices)
| Route | Needs | What |
|---|---|---|
| `/settings/roles` | `roles.manage` + feature `custom_roles` | Default roles (view / clone), custom roles (create / edit / clone / delete). Matrix grouped by area, scope None/Own/Branch/All per permission; scopes above what YOU hold are not offered, billing is locked "Owner only". Delete asks for a replacement role when people hold it. |
| `/members` (existing) | `roles.manage` / `users.invite` | **Manage** drawer per person: add / change / remove a role per location, remove from business, and for a pending invite: new link (re-invite) or cancel. The role picker is scope-aware (`useAssignableRoles`). |
| `/commission` (nav item) | `commission.view_own` + feature `commission` | Tabs by permission: **My earnings** (own only: month totals + ledger), **Team report** (`view_all`), **Rules** (`manage_rules`: staff -> default + per service, percent / flat / none, effective-from, history). Text explains the full-payment rule. |
| `/settings/branches` | `settings.business` + feature `multi_branch` | Locations: add / edit (country, currency, time zone, address, tax, invoice prefix with lock hint) / archive / restore / make main; **Overview** tab: combined view per month, totals PER currency, never added across currencies. |
| Branch switcher | any member with >1 live location | `BranchSwitcher` in the header (tablet/desktop) and at the top of More (mobile). Sets the current branch that Calendar, Clients, Invoices and Reports already read. Archived branches are dropped from `useMyBusinesses`, and a stale selection falls back to the primary. |
| `/settings/advanced-reports` | `reports.view_advanced` + feature `advanced_reports` | Week / Month / Custom (<= 366 days), previous-period comparison with deltas, sections Revenue (per currency, daily bars, by method, discounts), Team, Services, Clients, Appointments, Locations (feature `branch_comparison`), and **Email** (weekly / monthly schedule, hour, recipient rule shown). CSV (web download with UTF-8 BOM; native share sheet), print view `/report-print` (web print / save as PDF). Linked from Reports. |

## Code map
`src/features/roles` (rolesLogic + permissionLabels generated from the catalogue, api, matrix/editor/dialog), `src/features/members` (manage drawer + hooks), `src/features/commission`, `src/features/branches` (branchLogic, api, form, screen, switcher), `src/features/advanced-reports` (periodLogic mirrors `report_period`, reportTypes parsers, reportLogic deltas + CSV, sections, controls, schedule tab, print screen). Shared: `src/lib/supabase/rpcResult.ts` (`unwrapRpc` -> `RpcError{code,extra}` for `{ok:false,code}` RPCs), `src/lib/i18n/stepIcons.ts` (RTL chevrons), `src/lib/files/saveTextFile.ts`, `src/components/shared/MonthStepper.tsx`. Every reason code has its own message (typed maps `ROLE_ERROR_KEYS`, `BRANCH_ERROR_KEYS`, `COMMISSION_ERROR_KEYS`, `REPORT_ERROR_KEYS`; unit-tested).

## Rules worth knowing
- The UI only hides what the database would refuse; it is never the boundary.
- Query keys: `roles`/`members` (scope by business), `branches`, `commission`, `advanced-report`, `report-schedules`; every role/branch/member mutation invalidates grants, features and the business list.
- Dates are local dates; the server turns them into each branch's own day boundaries (DST-exact).
- CSV cells starting with = + - @ are neutralised; numbers are plain major units per row currency.

## Verified (2026-10-07, web, throwaway users deleted by recorded id; the 3 original businesses untouched)
Owner: roles (list, edit drawer, view, create, delete dialog), members manage + cancel invite, locations (list, form, create, archive, overview), commission (rules + save a rule, team report), advanced reports (revenue / team / email, CSV downloaded and read, print view), Settings hub, More with switcher. At 375 and 1440. Stylist: own earnings only. Solo owner: calm not-included state on roles, locations, advanced reports and commission.
**Not clicked / not run:** the Manager and Receptionist logins; role edit save with a changed scope; delete-with-replacement; change role / remove member / resend invite; restore, make-main and the refusal messages of branches; flat and "no commission" rule types; the schedule toggles and hour select; custom date range; RTL; hardware back; iOS and Android (reviewed in code only).

## Known limits / TODO
- Mobile has no switcher on Today/Calendar (More only).
- (Fixed 2026-10-07) The Team list now shows teammates' names through `list_business_member_names` (`useMembers`).
- Native export shares the CSV text (no attachment); a real PDF/attachment needs expo-print + expo-sharing.
- The matrix renders 46 segmented controls (fine on web; not profiled on a low-end Android).
- A dev-only React warning about `accessibilityElementsHidden` on lucide icons appears on web (pre-existing pattern in the Settings hub).

## Changelog
- 2026-10-22: **Business location** (`/settings/location`, `LocationScreen`): Solo / Team owners (and any `settings.business` holder on a plan without `multi_branch`) see the branch summary and edit it with the same `BranchFormDrawer` the Locations screen uses; hub card shown only while `multi_branch` is off. No migration: `update_branch` was never plan-gated and keeps refusing unsafe currency / time zone / prefix changes (`currency_locked|in_use`, `timezone_in_use`, `prefix_locked`); `create_branch` / `archive_branch` stay behind `multi_branch`, and the branch limit trigger still blocks a second location. Suite `40_single_branch_edit.sql` (30). The edit drawer itself was not clicked (summary screens screenshot-checked).
- 2026-10-07: Team names fixed (`useMembers` merges `list_business_member_names`); the permission matrix hides add-on permissions while the add-on is off.
- 2026-10-07: Phase 9B UI built.
