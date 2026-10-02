# Database
Status: in progress · Phase: 1 · Last updated: 2026-10-02

## Project
- Supabase project **Wapee Global Development**, ref `rfuovquhultjydtswtqf`, Postgres 17, region ap-south-1.
- Applied through the **Supabase connector** (`apply_migration`). The local CLI is signed in to a different account and cannot link this project, so `supabase db push` and `supabase test db` are unavailable. Every migration file in `supabase/migrations/` matches what was applied.
- Extensions: `citext`, `pg_trgm`, `btree_gist` (ready for Phase 3 no-double-booking), `pgtap`, `uuid-ossp`, `pgcrypto`.

## Tables (10)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | id→auth.users, email, full_name, **is_super_admin**, default_business_id, locale | 1:1 with auth.users via trigger. `is_super_admin` set **only by hand in SQL**. |
| `businesses` | name, **slug** (citext unique), industry, language, **plan**, **status**, **trial_ends_at**, plan_activated_at, `default_country_code`, `default_currency`, `default_timezone` (all nullable) | Tenant root. The `default_*` columns are **PRE-FILL ONLY** for a new branch — never read them for tax, SMS rates, slots or reporting. |
| `branches` | business_id, name, is_primary, **country_code**, **currency**, **timezone** (all NOT NULL), address, phone, **tax_number**, **tax_rate_bp**, **invoice_prefix**, **invoice_next_no** | **Owns country, currency, timezone and tax** (decision 23). A business can have branches in different countries. `tax_rate_bp` = basis points (2000 = 20%). |
| `business_members` | business_id, user_id, status, invited_email, **invite_token_hash**, invite_expires_at, invited_by, joined_at | One user ↔ many businesses. Only the token *hash* is stored. |
| `roles` | business_id (**null = system role**), key, name, is_system | 4 system roles; custom roles (Phase 9) carry a business_id. |
| `role_permissions` | role_id, permission→permissions.key, **scope** | scope = own / branch / all. |
| `member_role_assignments` | member_id, role_id, **branch_id (null = all branches)** | The per-branch role. **branch_id is the whole multi-branch mechanism.** |
| `permissions` | key, area, min_plan, addon | 46-row catalogue from product doc §9. Read-only to the app. |
| `audit_logs` | business_id, actor_user_id, action, entity_type, entity_id, before/after jsonb | **Append-only**: no INSERT/UPDATE/DELETE policy exists. |
| `reserved_slugs` | slug | 112 rows, mirrors `src/config/reservedSlugs.ts`. Readable by anon so signup can check availability. |

Enums: `business_status` (trialing/active/inactive/suspended), `business_plan` (solo/team/business), `member_status` (invited/active/disabled), `permission_scope` (own/branch/all).

## Branch-owned settings (decisions 23–25)
A business can have branches in different countries, so the **branch** is the
source of truth for locale and money:

- **Timezone:** slot calculation, reminders and "today" use `branch.timezone`. There is no business timezone. `src/lib/time/` already takes an explicit zone on every function, so nothing assumes one per business.
- **Currency:** belongs to the branch. **Locked once the branch has an invoice or payment** — the trigger currently only audits the change; the hard block lands in Phase 5 when `invoices` and `invoice_payments` exist (TODO in `enforce_branch_currency_lock`).
- **Tax:** `tax_number` and `tax_rate_bp` are per branch, because tax is a property of the location.
- **Invoice numbering:** per branch, `prefix-000123`, gapless within the branch (decision 24, replaces the old per-business rule). `invoice_prefix` is required, unique within the business, and locked once numbering has started. `suggest_invoice_prefix()` derives one from the location name (first 3 letters, uppercased, suffixed if it collides).
- **Reports must never add different currencies** (decision 25). Group by currency and show separate totals ("£2,400 · Rs 180,000"). No conversion at launch: that needs dated exchange rates, and a wrong rate silently corrupts financial reports. Revisit with multi-branch in Phase 9.
- **SMS credits and rates depend on the BRANCH country**, not the business (§8.4, Appendix B). A message from a UK branch and one from a Pakistani branch cost different amounts. Note for Phase 6.

## RLS helpers
| Function | Returns |
|---|---|
| `is_super_admin()` | platform flag of the caller |
| `is_member(business_id)` | caller is an active member |
| `business_is_active(business_id)` | status active, **or** trialing and `trial_ends_at > now()` |
| `member_branch_ids(business_id)` | branches the caller holds a branch role in |
| `has_permission(business_id, branch_id, perm)` | permission held, honouring scope |
| `can(business_id, branch_id, perm)` | `business_is_active()` **AND** `has_permission()` — **use this for operational policies** |

All are `SECURITY DEFINER`, `STABLE`, `search_path = ''`. `anon` has no EXECUTE; trigger functions have none at all.

**Trial expiry needs no cron.** `business_is_active()` compares `trial_ends_at` to `now()` at query time, so access stops the second the trial ends.

## RLS policies (every table, 10/10)
- `profiles`: read/update own row; super admin reads all. Guard trigger blocks changing `is_super_admin`, `id`, `email`.
- `businesses`: read = member; update = `settings.business`. **Not** gated on `business_is_active`, so an expired trial can still reach settings and billing. No INSERT (signup RPC only), no DELETE (soft delete).
- `branches`: read = member; write = `can(settings.business)`.
- `business_members`: read = own row or fellow member; insert = `users.invite`; update = own row (accepting an invite) or `roles.manage`.
- `roles` / `role_permissions`: read = system roles + own business; write = custom roles only, needs `roles.manage`.
- `member_role_assignments`: read = member; write = `roles.manage`.
- `permissions`, `reserved_slugs`: read-only catalogues.
- `audit_logs`: read = super admin or `settings.business`. **No write policy at all.**

## Guard triggers (rules RLS alone cannot express)
- `enforce_profile_guard` — no self-promotion to super admin.
- `enforce_business_slug` — normalises the slug, rejects the reserved list.
- `enforce_business_guard` — a tenant cannot change its own `plan`, `status` or trial dates.
- `enforce_role_assignment_guard` — **you cannot grant a permission you do not hold.**
- `enforce_last_owner` — a business always keeps ≥1 active Owner.

## Default roles (product doc §9)
| Role | Grants | Scope |
|---|---|---|
| Owner | 46 (all) | all |
| Manager | 41 — no billing, roles.manage, website.publish, commission.manage_rules, sms.buy_credits | branch |
| Receptionist | 20 — no discounts, credit notes, revenue reports, staff management, settings | branch |
| Staff | 10 — own appointments, own schedule, own commission | own |

## Verification (2026-10-02)
21 security checks run against the live database, all passing: tenant isolation (owner A / owner B / staff / anon), cross-tenant writes affect 0 rows, staff cannot reach invoices/billing/roles, expired trial locks operational data but not settings, and all four escalation guards hold. Test file: `supabase/tests/01_rls_tenant_isolation.sql` (pgTAP; must be run through the SQL editor until the CLI can link).

**Advisors:** security = clean (0 errors). The 6 remaining SECURITY DEFINER warnings are intentional — those helpers only ever report on the caller's own access and `usePermission()` needs them. Performance = clean except the item below.

## Migrations
| File | What |
|---|---|
| `20261001182500_foundation_profiles.sql` | extensions, `set_updated_at`, profiles, new-user trigger, `is_super_admin()` |
| `20261001183000_businesses_branches.sql` | enums, reserved_slugs (112), businesses, branches, slug guard |
| `20261001184000_permissions_and_roles.sql` | permission catalogue (46), 4 system roles, grants |
| `20261001184500_members_assignments_audit_helpers.sql` | business_members, member_role_assignments, audit_logs, all RLS helpers |
| `20261001190000_phase1_rls_policies.sql` | every policy + the role/owner guard triggers |
| `20261001190500_fix_rls_and_function_grants.sql` | **fixed: RLS was missing on `business_members`**; revoked EXECUTE on trigger fns |
| `20261002080000_perf_rls_initplan_and_indexes.sql` | `(select auth.uid())` initplan fix, 2 FK indexes |
| `20261002080500_perf_split_for_all_policies.sql` | Split FOR ALL policies — **applied 2026-10-02 via `supabase db push`** |
| `20261002093000_create_business_with_owner.sql` | Signup RPC, `is_slug_available`, `write_audit_log` |
| `20261002094000_fix_role_guard_allow_first_owner.sql` | Narrowed escalation guard for the founding Owner |
| `20261002120000_branch_owns_locale_and_tax.sql` | **Branch owns country/currency/timezone/tax**; invoice series per branch; business columns renamed `default_*` |
| `20261002123000_lock_down_new_functions.sql` | Revoked anon EXECUTE on `suggest_invoice_prefix` |

## Known limits / TODO
- **`supabase test db` needs Docker**, which is not installed on this machine. The CLI is linked and `db push` / `gen types` work; the pgTAP files in `supabase/tests/` have been verified by running their assertions through the connector instead. Install Docker (or share the DB password for `psql`) to run them as a suite.
- **Leaked-password protection is OFF** (security advisor). It is a dashboard setting: Authentication → Policies → enable "Check against HaveIBeenPwned". Worth turning on before real users.
- Phase 5 must add the hard currency lock (block the change when invoices/payments exist) and the gapless per-branch numbering that consumes `invoice_next_no`.
- Plan/add-on gating (`min_plan`, `addon` on `permissions`) is stored but **not enforced**; that lands in Phase 8.

## Changelog
- 2026-10-02: **Branch now owns country, currency, timezone and tax** (decisions 23–25). Invoice numbering is per branch with a unique prefix. Business keeps `default_*` for pre-fill only. CLI linked; migration history repaired; pending performance migration applied.
- 2026-10-02: Phase 1 schema: 10 tables, 46 permissions, 4 roles, all RLS + guards, advisors clean, 21 security tests passing.
