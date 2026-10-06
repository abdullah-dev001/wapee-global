# Plans, add-ons, feature gating, super admin (backend)
Status: **Phase 8A backend done, NO UI** · Last updated: 2026-10-06

## Business rules (decided with the user)
- Plans per location: **solo** (1 staff, 1 location), **team** (5 staff, 1 location), **business** (unlimited). Staff cap is **per location**: active, non-deleted staff assigned (`staff_branches`) to a branch. Inactive/soft-deleted staff do not count. A staff member in two locations counts in each.
- Features: core/website/reviews/booking_link all plans; commission, embed_widget, advanced_reports = team + business; multi_branch + branch_comparison = business only; custom_roles = business (included) or the add-on on team; waitlist removed. Add-ons (`packages, inventory, files_photos, forms_consent, client_portal, custom_roles`) are on only when a `business_addons` row is enabled. `default_roles` is a flag (false on solo) but NOT enforced anywhere yet.
- **Trial = Business-level with every add-on ON, no caps.** Trial ends = business inactive (status stays `trialing`, `trial_ends_at` in the past; no cron) and **every feature is false** until the super admin assigns a plan, activates, or extends the trial.
- **Downgrade over the limits is REFUSED** (`over_limit` + `staff_over_cap[{branch,active_staff,cap}]` / `branches_over{current,max}`); nothing changes. Same check on `set_business_status('active')`.
- Existing 3 businesses: all were `trialing`, plan null: they stay on trial (Business-level, all add-ons on), exactly as before.
- Prices are **placeholders** (solo 1500 / team 3900 / business 7900 USD monthly minor units, annual ~18% off; add-ons 800-1500). Super admin edits them; structure (caps, features) is migration-owned.

## Single source of truth (DB)
- `business_has_feature(business, key)` and `business_plan_limits(business)`: INTERNAL (service_role + SECURITY DEFINER callers; not granted to authenticated). Not active => false. Unknown key => false.
- `feature_gate_error(business, key)` => NULL or `{ok:false,code:'feature_unavailable',feature}`: first line of every Phase 10 module RPC. Example + tests in `18_*.sql`.
- `my_features(business)` (authenticated, members/super admin only): plan, status, trial, caps, active, `features{key:bool}`: **what the UI must read** (client `useFeature`/`can.ts` still use the old plan-tier + "add-on counts as ON" stub until the UI phase).
- Enforcement: trigger `staff_branches_enforce_cap` + `staff_profiles_enforce_cap` (assign / reactivate; raises `staff_cap_reached`, SQLSTATE P0001, advisory-locked per branch); `branches_enforce_limit` (insert / un-delete; `branch_limit_reached`); `roles_enforce_custom_roles_feature` (business roles; `feature_unavailable`); `widget_feature_enabled()` = `business_has_feature(.., 'embed_widget')` (Phase 7A seam is real; client `useWidgetFeatureEnabled` still returns true: UI task).

## Storage
`plans`, `addons`, `business_subscriptions` (WRITE target; `notes`/`assigned_by` hidden from members by column grants), `business_addons`, `industry_presets`. Trigger mirrors subscription -> `businesses.plan/status/trial_ends_at/plan_activated_at` (so `business_is_active()`, `can()`, client unchanged). `enforce_business_guard` now refuses direct changes to those columns for ANY API caller (even super admin) unless the mirror flag `wapee.plan_sync` is on; hand SQL as postgres is still allowed and would desync: update `business_subscriptions` instead.

## Super admin
- Flag only: `profiles.is_super_admin`, never a role. **2FA: every admin RPC requires a JWT with `aal = aal2`** (`admin_gate()`: `forbidden` / `mfa_required`). TOTP is still disabled in `supabase/config.toml` and there is no enrolment UI: enable `[auth.mfa.totp] enroll_enabled/verify_enabled` and build enrolment in the UI phase (or enrol through the Supabase API) before the first real use.
- RPCs (DEFINER, authenticated EXECUTE, anon none; return `{ok,code}`, validate before the single write, audit every call incl. reads): `list_businesses` (keyset created_at,id; status/plan filter; search >=2 chars, LIKE-escaped; first page audited only), `get_business_detail` (plan, add-ons, usage: active staff, branches, appointments this UTC month, issued invoices, SMS balance), `support_view_business` (read-only summary, no client PII, audited every call), `assign_plan` (assigns + activates; suspended stays suspended), `set_business_status` (active/inactive/suspended), `extend_trial` (1-90 days, from trialing or inactive), `set_addon`, `admin_add_sms_credits` / `admin_set_sms_rate` (6A, now behind `admin_gate`), `set_plan_prices`, `set_addon_prices`, `upsert_industry_preset` (validated terminology + starter fields), `remove_review` (status `removed`, un-features, reason required, customer words untouched).
- Audit actions: `admin.list_businesses|view_business|support_view|assign_plan|set_status|set_addon|extend_trial|set_plan_prices|set_addon_prices|upsert_industry_preset|remove_review`, plus `sms.credits_changed|rate_changed`. Admin notes are never copied into audit rows because **owners can read their own business's audit_logs** (they see that support viewed them, and review-removal reasons).
- **`is_super_admin()` itself now requires aal2** (migration `20261010120000`; `platform_flag()` is the bare flag, internal). Every one of the ~55 policies/guards that use it therefore treats an aal1 super admin as a stranger (tested: sees nothing in 14 tenant tables, only their own profile row). **Direct tenant reads by an aal2 super admin through RLS are NOT audited**: the audited path is `support_view_business` / `get_business_detail`. Use those; do not browse tables directly.
- Admin notes (`assign_plan` notes, `set_business_status` note, SMS credit/rate notes) are never written to `audit_logs` (tested with a marker string; owners read their own business's audit log). The `remove_review` **reason is stored in the audit row on purpose** and is owner-readable. SMS credit notes live in the SMS ledger (readable by `sms.send` holders).

## 2FA enrolment guide (super admin)
TOTP is enabled in `supabase/config.toml` (`[auth.mfa.totp]` true). **The hosted project is NOT changed by editing the file** (we deliberately do not run `supabase config push`: it would overwrite other hosted auth settings). Hosted projects have TOTP on by default; confirm in Dashboard -> Authentication -> Sign In / Providers -> Multi-Factor Authentication: "TOTP (App Authenticator)" enroll + verify = enabled.
1. Create the account (sign up in the app) and flag it with the SQL below. Do this first.
2. Install an authenticator app (1Password, Authy, Google Authenticator...).
3. Sign in to the app with email + password. The flagged account lands on the admin 2FA screen (`/admin/2fa`): press "Set up two-factor", scan the QR code (or type the secret), enter the 6-digit code, press Verify. Save the secret/recovery in your password manager: **there is no recovery flow**; losing the factor means removing it by hand (`delete from auth.mfa_factors where user_id = '<id>'` as postgres, then enrol again).
4. From then on every sign-in shows "Enter your 6-digit code" before any admin screen or RPC works (the session must reach `aal2`).
5. Without UI (fallback): with the user's access token, `POST {SUPABASE_URL}/auth/v1/factors` `{"factor_type":"totp","friendly_name":"admin"}` -> `id` + `totp.secret`; add the secret to the app; `POST /auth/v1/factors/{id}/challenge` -> `challenge id`; `POST /auth/v1/factors/{id}/verify` `{"challenge_id":..,"code":".."}` -> a new access token with `aal: aal2`.
6. Check: `select is_super_admin` is true AND a decoded access token shows `"aal":"aal2"`; `list_businesses()` returns `ok:true` (aal1 returns `mfa_required`).

## Creating the super admin (manual, exactly one)
Sign up normally, then in the SQL editor (the profile guard blocks the API):
```sql
alter table public.profiles disable trigger profiles_enforce_guard;
update public.profiles set is_super_admin = true where email = '<the account email>';
alter table public.profiles enable trigger profiles_enforce_guard;
```
Then enrol TOTP for that user (see above) so a session can reach `aal2`.

## Tests
`supabase/tests/18_plans_addons_super_admin.sql`: 341 assertions (all 13 RPCs refused for owner/manager/staff/other business/no-aal2/anon with state proven unchanged; feature matrix per plan; add-on on/off; trial expiry/extend/assign/suspend; staff cap 1/5/unlimited, inactive, reactivation; downgrade refusal; branch limit incl. soft delete; custom roles; widget; module example; audit stored values; list keyset/search; presets; review takedown; grants; delete cascade). Suite 17 now uses an aal2 helper for its admin calls (341). Regression 06-08, 10-14, 16, 17 unchanged and green.

## Known limits / TODO
- No UI at all (admin screens, plan picker, upgrade prompts, `/billing`); client gating still the old stub.
- `list_businesses` search covers name + slug only (no owner email).
- Staff cap counts per location; a staff profile with no location is not counted until assigned.
- **Solo "owner only" is not enforced** (a Solo business can still invite members; only the 1-staff cap applies).
- Appointments-this-month uses the UTC month.

## Changelog
- 2026-10-06: Phase 8A backend (3 migrations `20261010090000/100000/110000`, suite 18).
