# Account (change email / password, delete my account)
Status: done   ·   Phase: pre-launch batch 2   ·   Last updated: 2026-10-09

## What it does
Settings > **Account** (every signed-in person): change the sign-in email (Supabase confirm flow, pending state shown), change
the password (current + new, 8-72), and **Delete my account** (store data-deletion requirement). `/delete-account` is a public,
static explanation page (Play Console URL). Portal customers have no account and are not touched (they use the portal "My data").

## Business rules
- **Delete refused** (nothing written) when the person is the ONLY active Owner of a live business: the names are shown, the
  fix is "delete the business" (existing erase flow) or "add another Owner". A super admin cannot delete here. A business that is
  already soft-deleted does not block.
- **Delete does:** remove role assignments + memberships, `staff_profiles.member_id` -> NULL (FK; the staff profile and all past
  appointments stay), delete push tokens / preferences, anonymise the profile row, one `member.account_deleted` audit row per
  business (role names only, no email/name) + one `account.deleted` row (business null, entity = user id), then delete the auth
  user (sessions, identities, MFA go with it). Pending invites the person created are KEPT (they belong to the business).
- **Idempotent:** a second commit for a gone user answers `ok, already_deleted`; over HTTP the dead JWT gets 401.
- The `created_by` / `recorded_by` / `voided_by` columns of the append-only ledgers (packages, stock, consents, files, forms,
  commission_rules) are now PLAIN uuids (FK dropped): their triggers forbid UPDATE, so SET NULL was impossible. The uuid names
  nobody once the account is gone. Other `created_by` FKs (appointments, clients, roles...) go to NULL by their own SET NULL.
- **Change password:** current password verified on a throw-away client (`verifyPassword`, never touches the live session),
  then `updateUser({password})`, then `signOut({scope:'others'})` (this device stays). Audit `account.password_changed`.
- **Change email:** same password check, `updateUser({email}, {emailRedirectTo: /verify})`; `new_email` on the auth user drives
  the "waiting for confirmation" state + resend. A DB trigger copies a confirmed change to `profiles.email`. Audit
  `account.email_change_requested`. Supabase's built-in mailer is rate-limited: a 429 shows "Too many tries".
- Deletion password is verified INSIDE the Edge Function (sign-in on a client that stores nothing); the typed email must equal
  the account email.

## Files
| Path | Purpose |
|---|---|
| app/(app)/settings/account.tsx, delete-account.tsx | routes (thin) |
| app/(public)/delete-account.tsx | public page route (slug `delete-account` is reserved) |
| src/features/account/api/useAccount.ts | `useAccountMe`, `useChangePassword`, `useChangeEmail`, `useResendEmailChange`, `useDeleteBlockers`, `useDeleteAccount`, `AccountError` |
| src/features/account/components/ | `AccountScreen`, `ChangeEmailCard`, `ChangePasswordCard`, `DeleteAccountScreen`, `PublicDeleteAccountPage` |
| src/features/account/accountLogic.ts (+ test) | error-code -> i18n key map, `authErrorCode`, `emailsMatch` |
| src/features/account/schemas/account.schemas.ts | zod (new password = signup rules, must differ from current) |
| src/lib/supabase/verifyPassword.ts | throw-away password check |
| supabase/functions/account/index.ts | `{action:'delete', password, confirm_email}`, JWT required |

## Database
- RPCs: `account_delete_blockers()` (authenticated, own id only), `account_sole_owner_businesses(uuid)` + `account_delete_commit(uuid)` (service_role only; validate everything, then one transaction), `log_account_event('password_changed'|'email_change_requested')` (authenticated; 10 s dedupe).
- Trigger `on_auth_user_email_changed` -> `sync_profile_email()`.
- Migrations: `20261018090000_account_deletion`, `20261018100000_account_deletion_deleted_business`, `20261018110000_account_email_sync_and_audit`.
- Tests: `supabase/tests/33_account_deletion.sql` (33 assertions: every refusal leaves state identical, idempotent, others untouched, ledger rows kept, tenant delete still works); HTTP: `33_seed_account.sql` + `33_account_http.mjs` (15 checks incl. wrong password, sole owner, dead session) + `33_cleanup_account.sql`.

## Data & caching
- Keys `['account','me']`, `['account','delete-blockers']` (person-level, not business-scoped; the whole cache is cleared on sign-out). After deletion: local sign-out, `queryClient.clear()`, `/login`.

## Permissions & gating
- None (own account). The Edge Function takes only the caller's own id from the JWT.

## UI
- Verified in screenshots at 375 and 1440 (public page, Account, Delete incl. sole-owner state) and clicked end to end on web: password change (toast, other sessions out), wrong password message, delete -> `/login`. Android / iOS not run.
- Email change confirm link was not clicked (built-in mailer returned 429 on the test).

## Changelog
- 2026-10-09: account deletion + change password / email + public page + reserved slug (batch 2, tasks 1-2).
