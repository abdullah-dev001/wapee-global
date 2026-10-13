# QA Audit — Phase 6: Security and abuse

Mode: audit only, no fixes. **CODE-READ only** (continuing from Phases 1-5).

Notable context: the team ran its own internal security review in Phase 11A (`docs/security-review.md`, dated 2026-10-07), which already covers most of this phase's checklist — every table/RLS/grant, every SECURITY DEFINER function, storage buckets, Edge Functions, auth config, and Supabase advisors, with findings ranked and most already fixed. This phase's job was to (a) re-verify that review's fixes still hold in the current migration chain, (b) check anything dated after that review, and (c) independently probe the audit brief's specific items (SECURITY DEFINER functions without a `can()` check, deleted-user-with-live-session, suspended-login hook, super admin isolation).

A background exploration agent was additionally dispatched to search every `SECURITY DEFINER` function granted to `authenticated` for missing authorization checks; its findings are appended as **F6-S** below once it reports (see note at the end if it had not completed when this report was written).

---

## Findings

### F6-01 — Suspended-login hook is fail-open and requires manual dashboard activation, but the real authorization boundary is independent of it — **downgraded from initial concern to Low/informational**, CODE-READ
`custom_access_token_hook()` (`20261020110000_suspended_login_block.sql:30`) is explicitly fail-open by design ("a bug here must never lock everyone out" — any exception inside returns the event unchanged, issuing the token normally) and `_handoff.md` confirms it needs to be switched on manually in the Supabase dashboard (Auth > Hooks) on both dev and prod, with the comment "or only the client focus check protects."
- **This sounds more serious than it is**: `business_is_active()` (re-verified in Phase 1) returns `false` for `status = 'suspended'` (it only returns true for `active` or a live `trialing`), and `can()` requires `business_is_active()` for every operational permission. So a suspended business's members are **already blocked from every write and most reads by RLS/RPC, independent of whether the auth hook is enabled**. The hook's actual job is UX: immediately killing the session server-side so a suspended user is kicked to a sign-in screen rather than silently finding every button refused on their next click. If the hook is never enabled, a suspended user keeps a working session and can still open the app, but every operational action continues to be refused at the real boundary (RLS/`can()`).
- **Still worth flagging**: `settings.business`/`settings.billing` are in `ALWAYS_ALLOWED_WHEN_INACTIVE` (so the owner can pay/un-suspend) — need to confirm this allow-list applies identically to `suspended` as it does to a lapsed trial (both fail `business_is_active()` the same way, so by the code this should be consistent, but worth a live check since `suspended` carries different wording/support messaging than "trial ended").
- **Recommend**: add to the go-live checklist (if not already there) a one-line reminder that the Auth Hook toggle is a manual dashboard setting per project (dev AND prod) and is easy to forget since nothing in the codebase enforces or verifies it's on.

### F6-02 — `clients_v`'s SECURITY DEFINER + SECURITY BARRIER design is correctly implemented and consistent with the underlying table RLS — **no bug found, re-verified**
Compared `clients_v`'s `where` clause (`20261017090000_phase11b_clients_notes_lock.sql`) against `clients_select`'s current policy (`20261016150000_phase11a_rls_perf_clients.sql:41`) line by line: both use the identical set of helper functions (`perm_cover_business_ids`, `perm_branch_ids`, `scoped_client_ids`, `perm_business_ids` + `client_has_live_appt`, `own_client_ids`) in the same boolean structure. This is the same cross-tenant-leak class the team's own Phase 11A review found and fixed (a SECURITY DEFINER sub-select inside RLS seeing every row regardless of the caller's own RLS) — re-verified as still fixed, not regressed, and the view/table pair stay textually in sync as the security-review doc's "suite 31 fails until the view is changed too" claim implies they must.

### F6-03 — Public asset bucket path binding correctly derives the business id from the storage path, not a client-supplied parameter — **no bug found**
`website_assets_insert`/`_select`/`_delete` policies (`20261007120000_phase7_website_assets_bucket.sql`) all compute `(storage.foldername(name))[1]::uuid` from the object's own path and pass that into `can(..., 'website.edit')` — so a caller cannot claim permission for business A while writing into business B's folder prefix; the authorization target and the write target are the same value, read from the same trusted source (the path itself, which the `with check` also validates via `website_asset_path_ok`'s strict regex before anything else runs). No path-traversal or folder-confusion vector found.

### F6-04 — `is_slug_available`/`my_grants` anon-exposure fix (Phase 11A) correctly revokes before re-granting — **no bug found, re-verified**
`20261016120000_phase11a_security_hardening.sql` issues `revoke execute ... from anon, public` before `grant execute ... to authenticated` for both functions — confirmed this is not a grant-without-revoke gap (Postgres grants are additive, so if the earlier `20261002123000` migration's `grant ... to anon, authenticated` were never explicitly revoked, anon access would have survived silently). It is explicitly revoked. Fix holds in the current chain.

### F6-05 — Deleted-user-with-live-session cannot create orphan inserts — **no bug found, reasoned from cascade + RLS composition**
`profiles.id` cascades from `auth.users` deletion, and `business_members.user_id` cascades from `profiles` deletion (`20261001182500_foundation_profiles.sql`, `20261001184500_members_assignments_audit_helpers.sql:11`) — so deleting a user atomically removes their membership rows in the same transaction. Every dashboard RPC and RLS policy read this session checked gates on `can(business_id,...)`/`is_member(business_id)`, which join against `business_members` filtered by `user_id = auth.uid()` — not a bare "is this a valid JWT" check. Supabase JWTs are stateless until expiry, so a request with a still-valid-but-orphaned JWT could in principle reach a DEFINER function, but every such function re-derives membership from the (now-deleted) `business_members` row, which will simply not be found — correctly refusing the action rather than trusting `auth.uid()` alone. No RPC was found this session that trusts bare `auth.uid() is not null` as its only check (every one re-verifies membership/permission).

### F6-06 — Edge Function `verify_jwt` settings in `config.toml` correctly match each function's actual trust model — **no bug found, re-verified against the security-review doc's own table**
Re-read `supabase/config.toml` directly: every public-by-design function (`get_booking_page`, `get_slots`, `create_booking`, `manage_booking`, `get_website`, `get_review_request`, `submit_review`, `validate_widget`, `sign_form`, `portal`, `unsubscribe`, `send_outbox`) has `verify_jwt = false`, each backed by either a per-IP/key rate limiter or (`send_outbox`) a separate Vault-held worker token checked server-side (`outbox_worker_authorize`, digest-compared, null/length-safe — re-verified this session). Every dashboard-only function (`resend_manage_link`, `message_preview`, `client_files`, `gdpr`) has `verify_jwt = true`. This matches the security-review doc's own Edge Function table exactly and nothing has drifted since that review's date.

### F6-07 — Review-takedown and remove_review audit correctly preserve the customer's own words while removing platform visibility — **no bug found** (carried over confirmation from Phase 5's review-neutrality finding)
Not re-derived in depth this phase (already covered in Phase 5, F5-05) — noted here only because Phase 6's "super admin isolation" angle is relevant: `remove_review` is behind `admin_gate()` (aal2 + flag), audited, and does not delete the row (`status = 'removed'`), consistent with "every super admin action is logged" from doc §13.

---

## F6-S1, F6-S2 — Two SECURITY DEFINER functions, granted to `authenticated`, with no membership/scope check at all — **Medium**, CODE-READ, independently re-verified
A dispatched search of all 147 functions granted `EXECUTE ... TO authenticated` found two that take an arbitrary id and answer with zero check that the caller has any relationship to the business that id belongs to. Both independently re-read and confirmed by me (not taken on the subagent's word alone):

**F6-S1 — `public.client_has_live_appt(p_client_id uuid)`** (`20261016150000_phase11a_rls_perf_clients.sql:26`)
```sql
create or replace function public.client_has_live_appt(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointments a where a.client_id = p_client_id and a.deleted_at is null)
$$;
...
grant execute on function public.client_has_live_appt(uuid) to authenticated;   -- line 38, same file
```
Any signed-in user — including one with no business membership anywhere — can call `rpc/client_has_live_appt` with any guessed-or-enumerated client UUID and learn whether that client has ever had a live appointment, for any business on the platform. It is designed to be called only from inside `clients_select`'s own RLS expression and `clients_v`'s identical `where` clause (both already re-verified correct in F6-02) — but the direct grant at line 38 means it doesn't need to be reached that way. This is a **cross-tenant existence-oracle leak**, not a data leak in the strict sense (it returns a boolean, not PII), but it directly matches the exact bug class the team's own Phase 11A review (`docs/security-review.md`, finding M4) already found and fixed for `business_is_active(uuid)` and `suggest_invoice_prefix(uuid,text)` — "take any business id and answer without a membership check... the app never calls them: they are used inside DEFINER functions... so the API role does not need EXECUTE" — the same fix (revoke from `authenticated`, grant to `service_role` only) was never applied here, because this function was introduced in a later migration than M4's fix.

**F6-S2 — `public.client_package_used(p_client_package_id uuid)`** (`20261013110000_phase10a_package_and_inventory_rpcs.sql:17`)
```sql
create or replace function public.client_package_used(p_client_package_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select (count(*) filter (where kind = 'deduct') - count(*) filter (where kind = 'reversal'))::integer
  from public.session_usages where client_package_id = p_client_package_id;
$$;
revoke all on function public.client_package_used(uuid) from public, anon, authenticated;   -- line 22
...
grant execute on function public.client_package_used(uuid) to authenticated;                -- line 297, SAME FILE
```
This one is worth noting precisely because the author's own first instinct (line 22) was to lock it down to internal use only — then, 275 lines later in the same migration, re-granted it to `authenticated` (almost certainly so `list_client_packages`, which calls it as a column expression, would work for a dashboard caller — but `list_client_packages` is itself `SECURITY INVOKER`, relying entirely on `client_packages`' own RLS, so it never needed `client_package_used` to carry a separate `authenticated` grant). The net effect: any signed-in user can call `rpc/client_package_used` directly with any guessed/enumerated `client_package_id` and learn the exact number of sessions used on that package, for any business's client package, with zero membership check. Lower sensitivity than F6-S1 (a session-usage count, not PII or appointment existence), but the same unchecked-DEFINER-function pattern.

**Recommendation for both**: apply the exact fix already used for `business_is_active`/`suggest_invoice_prefix` in `20261016120000_phase11a_security_hardening.sql` — `revoke execute ... from authenticated` (and confirm `anon`/`public` already have nothing), leaving `service_role` only, since both functions are only ever meant to be called from inside other DEFINER functions/RLS expressions that already run as the table owner.

Everything else the search checked (`can_grant_at`, `my_grants`, `my_access_state`, `account_delete_blockers`, `gdpr_erase_client`, `create_form_request`, `reverse_session`, `get_basic_report`, and ~140 others) was confirmed to carry either an inline `auth.uid()`/membership check or delegate to a helper that does one (`forms_can_sign`, `addon_access`, `gdpr_allowed`, `report_windows`'s internal forbidden-check, etc.) — these are listed here as **verified, not skipped**, not as findings.

---

## Things that look intentionally limited (not bugs)
- Fail-open suspended-login hook (F6-01) — intentional design ("a bug here must never lock everyone out"), with the real security boundary living elsewhere (RLS/`can()`).
- `website-assets` bucket trusts Storage's declared content-type rather than sniffing bytes (unlike `client-files`, which does sniff) — explicitly accepted in the migration's own comment, lower stakes since it's a public image bucket, not private client data.
- Super admin direct-RLS reads are unaudited (only `support_view_business`/`get_business_detail` are) — explicitly accepted and documented in both `plans-super-admin.md` and the function's own comment.
- `invite_preview(token)` stays callable by `anon` with no rate limit — accepted (L7 in the security-review doc): the token is 256-bit random and hashed, and the function only needs to run pre-login.

## Severity summary (this phase's own findings; does not re-count Phase 1-5 cross-references)
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 0 | — |
| Medium | 2 | F6-S1, F6-S2 |
| Low | 1 | F6-01 (downgraded after reasoning through the actual boundary; recommend as a checklist reminder, not a code fix) |

## What could not be verified this phase
- Whether the Auth Hook is actually switched ON in the dev project's dashboard today (code-read only; this is a dashboard setting, not something in the repo) — `_handoff.md` flags this as still needing manual activation as of its last update.
- Whether `ALWAYS_ALLOWED_WHEN_INACTIVE` behaves identically for `suspended` vs. a lapsed `trialing` business in a live request (reasoned from `business_is_active()`'s code to be the same, not exercised live).
- Full RLS-per-role-per-table matrix (every tenant table × owner/manager/receptionist/staff/other-business/anon/authenticated-without-membership) — the audit brief's most exhaustive ask for this phase. This session re-verified several high-risk tables (`clients`, `client_packages`/session usages, `member_role_assignments`, `products`/`stock_movements`, storage buckets) in depth across Phases 2/3/6, but did not mechanically walk every tenant table × every role combination live. The team's own suites (28, 29, 30, 31) are reported as covering this; not re-run this session.
- Android/iOS binary review, Supabase platform internals, and an actual penetration test are explicitly out of scope per the security-review doc's own stated method, and remain out of scope here too.

## Top issues
1. **F6-S1** (Medium) — `client_has_live_appt(uuid)` is a SECURITY DEFINER function with no membership check, granted directly to `authenticated`: any signed-in user can probe any client UUID platform-wide for "does this client have a live appointment." Same bug class the team already found and fixed once (M4 in their own security review) for two other functions — just never applied to this one, introduced later.
2. **F6-S2** (Medium) — `client_package_used(uuid)` has the identical gap: a signed-in user can read any client package's exact session-usage count by id, platform-wide. Notably, the migration's own author revoked `authenticated` access at creation (line 22) and then re-granted it 275 lines later in the same file — almost certainly an oversight while wiring up `list_client_packages`, which didn't actually need the standalone grant since it already relies on RLS as `SECURITY INVOKER`.
3. **F6-01** (Low) — the suspended-login hook is a manual dashboard toggle with no code-side verification that it's on; recommend a go-live checklist line, not a migration.
4. Everything else this phase re-verified (the team's own Phase 11A fixes: `clients_v`/`clients_select` consistency, the anon-grant fix, the asset-path binding, Edge Function trust boundaries, deleted-user cascade safety, the worker-token comparison, and ~145 other DEFINER functions independently checked for a missing auth gate) held up with no regressions.
5. The exhaustive per-role RLS matrix across every tenant table remains the single largest unverified item from the original audit brief for this phase — recommend running the existing suites (28-31) live before launch if that hasn't happened recently, rather than treating this phase's code-read pass as a substitute.
