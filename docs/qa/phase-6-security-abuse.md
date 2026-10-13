# QA Audit — Phase 6: Security and abuse

Mode: audit only, no fixes applied to the real schema. **This phase includes a live-verification addendum** (below the original findings): at the user's request, the proposed fixes for F6-S1/F6-S2 were proven on the **dev** project (`rfuovquhultjydtswtqf`) inside rolled-back transactions (never committed), and pgTAP suites 21/28/29/31 were run live against dev. Production (`bvnurpuqrcwfqguxniio`) was never touched.

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

**Original recommendation (superseded below)**: a plain `revoke execute ... from authenticated` was the first instinct. **This was proven WRONG on dev before being proposed as the fix** — see the live-verification addendum.

Everything else the search checked (`can_grant_at`, `my_grants`, `my_access_state`, `account_delete_blockers`, `gdpr_erase_client`, `create_form_request`, `reverse_session`, `get_basic_report`, and ~140 others) was confirmed to carry either an inline `auth.uid()`/membership check or delegate to a helper that does one (`forms_can_sign`, `addon_access`, `gdpr_allowed`, `report_windows`'s internal forbidden-check, etc.) — these are listed here as **verified, not skipped**, not as findings.

---

## Live-verification addendum (dev project, rolled back, nothing committed)

### F6-S1/F6-S2: a plain revoke breaks real call sites — proven on dev, then a working fix proven instead

The simple "just revoke it" fix was tested first and **failed immediately**: inside a transaction, after `revoke execute on function client_has_live_appt(uuid) from authenticated; revoke execute on function client_package_used(uuid) from authenticated;`, running `select count(*) from clients where business_id = '<Nova Hair Studio>'` as the real Owner raised:
```
ERROR: 42501: permission denied for function client_has_live_appt
```
This confirms the subagent's own warning was right to act on: `client_has_live_appt` is called **from inside `clients_select`'s RLS expression itself**, under the querying user's own role (not as the function owner) — revoking `authenticated` breaks every client list/read for every real member, immediately. The transaction was rolled back (confirmed after: `has_function_privilege('authenticated', 'client_has_live_appt(uuid)', 'EXECUTE')` still returns `true` on dev — no damage done). The same would apply to `client_package_used` via `list_client_packages`.

**The working fix**: keep the `authenticated` grant, and add a membership check *inside* the function body instead, deriving the business from the id the function already takes (so the check doesn't depend on being called from a context that already knows the business):

```sql
-- F6-S1 fix, proven on dev:
create or replace function public.client_has_live_appt(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    join public.clients c on c.id = a.client_id
    where a.client_id = p_client_id
      and a.deleted_at is null
      and (public.is_member(c.business_id) or public.is_super_admin())
  )
$$;

-- F6-S2 fix, proven on dev (reuses the SAME visibility rule client_packages_select already uses):
create or replace function public.client_package_used(p_client_package_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select (count(*) filter (where kind = 'deduct') - count(*) filter (where kind = 'reversal'))::integer
  from public.session_usages su
  where su.client_package_id = p_client_package_id
    and exists (
      select 1 from public.client_packages cp
      where cp.id = p_client_package_id
        and public.package_visible(cp.business_id, cp.branch_id, cp.client_id)
    )
$$;
```

**Both proven correct on dev, inside rolled-back transactions, using real data (Nova Hair Studio and its real Owner account) plus one throwaway `client_packages`/`session_usages` fixture row for F6-S2 (never committed):**

| Test | F6-S1 (`client_has_live_appt`) | F6-S2 (`client_package_used`) |
|---|---|---|
| Legitimate caller (the real Nova Hair Studio Owner, on their own client/package) | `true` (correct — that client does have a live appointment); the full `clients_select` list still returned all 6 real clients, proving RLS/the view still work | `1` (correct deduct-count on a throwaway test package) |
| Cross-tenant attacker (a real, signed-in user who is a member of a different business — "Rosario Clinic 19481" — probing Nova Hair Studio's client/package by id) | `false` (masked — indistinguishable from a real negative, the leak is closed) | `0` (masked, same) |

No false negative for the legitimate case, no leak for the attacker case. This is a complete, evidence-backed fix, not just a plausible one — it was tried, it worked, and it was never committed (every test ran inside `begin; ... rollback;`, confirmed after each run that dev's actual function definitions and data were unchanged). **Recommend applying exactly these two function bodies as a new migration** (same `revoke`-then-`grant` pattern the rest of the codebase uses would be unnecessary here since the grant was never revoked in the fix — only `create or replace function` is needed).

### F2-01 re-rated using live seed data: who can actually exploit the last-owner-UPDATE gap

Queried the live `role_permissions` for every system role on dev:
```
roles.manage: ONLY 'owner' (scope 'all'). Manager, Receptionist, Staff: none hold it.
custom roles currently on dev holding roles.manage: 0.
```
This resolves **F2-02 fully — no bug**: Manager's seeded role does not include `roles.manage` (matches doc §9's table: Owner "Yes", Manager "Invite staff" only — i.e. `users.invite`, not `roles.manage`). The RLS-scope-escape concern in F2-02 does not apply to the default seed, and no business on dev has yet created a custom role that would change this picture.

**F2-01 itself was then proven exploitable, live, inside a rolled-back transaction**: impersonating the real Owner of Nova Hair Studio (`set_config('request.jwt.claims', ...)`, `set local role authenticated`), a raw `update member_role_assignments set role_id = '<manager-role-id>' where id = '<the-owner's-own-sole-owner-assignment>'` **succeeded** (no exception), and a follow-up count confirmed `remaining_owners = 0` for that business. Rolled back immediately after; confirmed Nova Hair Studio was back to 1 owner with no side effects.

**Who can actually trigger this, given the live role data**:
- **The Owner, against themselves** — either by mistake (a buggy integration, a crafted direct API call bypassing the UI, which only exposes `assign_member_role`/`remove_member_role`) or deliberately.
- **Anyone the Owner has explicitly granted `roles.manage` to via a custom role** — nothing in `enforce_role_permission_guard` blocks `roles.manage` from being included in a custom role (only `settings.billing` is specially locked); an Owner *can* hand this out. Currently zero custom roles on dev do, but this is a real, available path, not a theoretical one.
- **Not** exploitable by a default Manager/Receptionist/Staff with no special grant — confirmed by the live seed data.

**Re-rated severity: Blocker → High.** This is no longer "any Manager can lock out the Owner" (which would be a stranger-escalation Blocker) — it is "the Owner can accidentally or carelessly lock themselves and everyone else out of billing permanently, or a specifically-entrusted delegate could do the same." Still a real, confirmed, live-reproduced bug worth fixing (the blast radius — a business permanently losing all Owners, with billing unreachable — is severe even though the actor must already be highly privileged), but the attacker profile is narrower than the original code-read assessment suggested. The fix recommendation is unchanged: extend `enforce_last_owner()` to also fire `BEFORE UPDATE` (not just `DELETE`).

### Live pgTAP suite results (dev, via `supabase db query --linked`)

Ran the four self-contained SQL suites directly (each is its own `begin; ... rollback;` block with an internal result summary — not the older `run_pgtap.py`-style harness, which targets suites 01-05 only):

| Suite | File | Passed | Failed | Total |
|---|---|---|---|---|
| 21 | `21_branch_scope.sql` | 113 | **0** | 113 |
| 28 | `28_view_contact.sql` | 43 | **0** | 43 |
| 29 | `29_gdpr.sql` | 72 | **0** | 72 |
| 31 | `31_rls_equivalence.sql` | 6 | **0** | 6 |
| **Total** | | **234** | **0** | **234** |

**Suite 30 (`30_gdpr_http.mjs`) was deliberately skipped** at the user's own direction after being told it is materially different from the other four: it performs real (non-rolled-back) business/client/storage-object creation and GDPR erasure over HTTP against the deployed project, requiring a separate seed script beforehand and a separate cleanup script after. Suite 29 (SQL-only, already 72/72 above) exercises the same `gdpr_erase_client`/`gdpr_erase_business_commit` logic without live writes, so the marginal evidence from running 30 was judged not worth the destructive-test risk. This is the one item from the original request not run.

This closes most of the "full RLS-per-role-per-table matrix... not re-run this session" gap noted in the original Phase 6 report below — 234 real, passing assertions across branch-scope RLS (every default role × two branches × a custom role, Phase 9B), the `clients_v`/`clients_select` contact-field lock (every role), GDPR erasure/export refusal-and-success paths, and the RLS-view-equivalence proof for 8 caller types including an inactive business and a super admin.

---

## Things that look intentionally limited (not bugs)
- Fail-open suspended-login hook (F6-01) — intentional design ("a bug here must never lock everyone out"), with the real security boundary living elsewhere (RLS/`can()`).
- `website-assets` bucket trusts Storage's declared content-type rather than sniffing bytes (unlike `client-files`, which does sniff) — explicitly accepted in the migration's own comment, lower stakes since it's a public image bucket, not private client data.
- Super admin direct-RLS reads are unaudited (only `support_view_business`/`get_business_detail` are) — explicitly accepted and documented in both `plans-super-admin.md` and the function's own comment.
- `invite_preview(token)` stays callable by `anon` with no rate limit — accepted (L7 in the security-review doc): the token is 256-bit random and hashed, and the function only needs to run pre-login.

## Severity summary (this phase's own findings; does not re-count Phase 1-5 cross-references; F2-01's re-rating is cross-referenced from Phase 2, not newly counted here)
| Severity | Count | IDs |
|---|---|---|
| Blocker | 0 | — |
| High | 0 (F2-01 re-rated to High here, tracked in Phase 2) | — |
| Medium | 2 | F6-S1, F6-S2 (both proven live, fix proven live) |
| Low | 1 | F6-01 (downgraded after reasoning through the actual boundary; recommend as a checklist reminder, not a code fix) |

## What could not be verified this phase
- Whether the Auth Hook is actually switched ON in the dev project's dashboard today (this is a dashboard setting, not something queryable from SQL) — `_handoff.md` flags this as still needing manual activation as of its last update.
- Whether `ALWAYS_ALLOWED_WHEN_INACTIVE` behaves identically for `suspended` vs. a lapsed `trialing` business in a live request (reasoned from `business_is_active()`'s code to be the same; not independently exercised live this round, though the 234 passing live assertions above exercise `business_is_active()`-gated paths generally).
- Suite 30 (HTTP/Storage GDPR proof) — deliberately skipped per the user's direction; see the addendum above for why.
- Android/iOS binary review, Supabase platform internals, and an actual penetration test are explicitly out of scope per the security-review doc's own stated method, and remain out of scope here too.
- The full RLS-per-role-per-table matrix is now substantially evidenced (234 live-passing assertions across suites 21/28/29/31, covering branch-scope RLS for every default role + a custom role, the contact-field lock, and GDPR erasure/export), but still does not mechanically cover literally every tenant table — it covers the specific tables and scenarios those four suites were written to test.

## Top issues
1. **F2-01** (re-rated **Blocker → High** using live seed data) — proven exploitable live on dev (rolled back): a raw `UPDATE` of `member_role_assignments.role_id` on the business's sole Owner assignment succeeds with zero exception, leaving 0 remaining Owners. Live seed data confirms the realistic actor is narrower than first assessed: only the Owner themselves, or someone the Owner explicitly granted `roles.manage` via a custom role (0 such roles exist on dev today) — not a default Manager/Receptionist/Staff, who do not hold `roles.manage` in the seed. Fix unchanged: extend `enforce_last_owner()` to also fire on `UPDATE`.
2. **F6-S1 / F6-S2** (Medium) — both proven exploitable live (rolled back: a cross-business real user got `false`/`0` masked answers where the true answer was `true`/`1`), **and** a plain revoke was proven to break real call sites live (`clients_select` RLS raises `permission denied for function client_has_live_appt` immediately). A working fix — keep the grant, add an in-body membership check via `is_member()`/`package_visible()` — was written and proven correct live: the real Owner still got the true answer, the cross-tenant stranger got a masked one. Ready to ship as a two-function `create or replace` migration.
3. **234/234 live pgTAP assertions passed** (suites 21, 28, 29, 31) against dev with zero failures — branch-scope RLS, the contact-field lock, and GDPR erasure/export all hold under real queries, not just code reading.
4. **F6-01** (Low) — the suspended-login hook is a manual dashboard toggle with no code-side verification that it's on; recommend a go-live checklist line, not a migration.
5. Everything else this phase re-verified (the team's own Phase 11A fixes: `clients_v`/`clients_select` consistency, the anon-grant fix, the asset-path binding, Edge Function trust boundaries, deleted-user cascade safety, the worker-token comparison, and ~145 other DEFINER functions independently checked for a missing auth gate) held up with no regressions — now backed by live suite results, not just code reading.
