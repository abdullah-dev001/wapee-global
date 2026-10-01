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
| `businesses` | name, **slug** (citext unique), country_code, currency, timezone, language, tax_number, tax_rate_bp, **plan**, **status**, **trial_ends_at**, plan_activated_at | Tenant root. `tax_rate_bp` = basis points (2000 = 20%). |
| `branches` | business_id, name, is_primary, **timezone**, **currency**, address, phone | One per business until Phase 9. timezone/currency override the business — **multi-branch adds no columns**. |
| `business_members` | business_id, user_id, status, invited_email, **invite_token_hash**, invite_expires_at, invited_by, joined_at | One user ↔ many businesses. Only the token *hash* is stored. |
| `roles` | business_id (**null = system role**), key, name, is_system | 4 system roles; custom roles (Phase 9) carry a business_id. |
| `role_permissions` | role_id, permission→permissions.key, **scope** | scope = own / branch / all. |
| `member_role_assignments` | member_id, role_id, **branch_id (null = all branches)** | The per-branch role. **branch_id is the whole multi-branch mechanism.** |
| `permissions` | key, area, min_plan, addon | 46-row catalogue from product doc §9. Read-only to the app. |
| `audit_logs` | business_id, actor_user_id, action, entity_type, entity_id, before/after jsonb | **Append-only**: no INSERT/UPDATE/DELETE policy exists. |
| `reserved_slugs` | slug | 112 rows, mirrors `src/config/reservedSlugs.ts`. Readable by anon so signup can check availability. |

Enums: `business_status` (trialing/active/inactive/suspended), `business_plan` (solo/team/business), `member_status` (invited/active/disabled), `permission_scope` (own/branch/all).

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
| `20261002080500_perf_split_for_all_policies.sql` | **NOT APPLIED** — see below |

## Known limits / TODO
- **`20261002080500_perf_split_for_all_policies.sql` is not applied.** Three tables (`roles`, `role_permissions`, `member_role_assignments`) have a `FOR ALL` write policy that also covers SELECT, so each read evaluates two permissive policies. The file splits them into INSERT/UPDATE/DELETE. It needs `DROP POLICY`, which the connector refuses; apply it with `supabase db push` once the CLI is signed in to the right account, or paste it into the SQL editor. **Rules are unchanged — this is performance only.**
- The CLI cannot link this project, so `supabase test db` cannot run the pgTAP file; the same assertions were executed through the connector instead.
- No signup RPC yet (`create_business_with_owner`) — next step.
- Plan/add-on gating (`min_plan`, `addon` on `permissions`) is stored but **not enforced**; that lands in Phase 8.

## Changelog
- 2026-10-02: Phase 1 schema: 10 tables, 46 permissions, 4 roles, all RLS + guards, advisors clean, 21 security tests passing.
