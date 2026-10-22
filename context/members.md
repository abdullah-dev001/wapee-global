# Members & add by email
Status: done · Phase: 1 (reworked 2026-10-23) · Last updated: 2026-10-23

## What it does
Shows everyone in the business (active members and pending adds) and lets someone with
`users.invite` **add a person by email** with a role, a branch and (optionally) an unlinked staff
profile. There is no link or token: the database stores a pending membership bound to that email
and sends a plain "you were added" email (link to `/login` only). When someone later signs in with
that exact email **and the email is verified** (Google, or a confirmed email/password account),
they join automatically with the role the adder chose. The old token-in-URL invite links were
retired on 2026-10-23.

## Business rules
- **The role is chosen and assigned at ADD time**, while the adder is the caller, so the escalation guard (`enforce_role_assignment_guard` / `can_grant_at`) judges the adder. `add_member_by_email` also pre-checks `can_grant_at` for every permission of the role, so a refusal is a returned code (`cannot_grant`), not a raise.
- **Unverified emails never join.** `claim_pending_memberships` reads `auth.users.email` and `email_confirmed_at` on the server; nothing from the JWT or the client.
- **Pending adds expire after 30 days** (`business_members.invite_expires_at`, column default). "Send the email again" re-adds: renews 30 days, sends a new email, replaces the role.
- **Re-adding the same address replaces the pending add** (upsert on the `(business_id, invited_email)` partial unique index). Re-adding a pending add whose current role the caller could not grant is refused (`cannot_modify_higher_role`).
- **An existing account joins too** (any business), on its next app load or focus. `default_business_id` is set only when empty, so someone already in another business is joined but **cannot reach the new business until a business switcher exists** (known gap, user decision 2026-10-23).
- **No enumeration**: the answer is identical whether or not the email has a Wapee account. Only "already a member of THIS business" (`already_member`) is reported; the adder sees the list anyway.
- **Rate limited** (`rate_limit_rules` endpoint `member_add`): 30 adds per business per hour, 200 per adder per day. Every failure after the counter is a RETURN, so the counter survives.
- **Audit**: `member.added_by_email`, `member.joined_by_email` (with provider), `invite.revoked` (cancel), `staff.linked` (`via: add_by_email`).
- Joining never creates a business, so no trial starts and onboarding is never shown to someone who was added.
- Old `/accept-invite?token=…` links show a "sign in with that email" page and strip the token from the address bar. Old pending invites became pending adds (same rows).

## Files
| Path | Purpose |
|---|---|
| app/(app)/members.tsx | Team list + "Add person" drawer |
| app/(auth)/accept-invite.tsx | RETIRED link page: explains, Sign in / Create account, strips `?token` |
| src/features/members/api/useMembers.ts | `useMembers`, `useRoles`, `useAddMember`, member admin mutations |
| src/features/members/api/useClaimPendingMemberships.ts | Claim on verified session (+ focus); waits for the membership refetch before resolving |
| src/features/members/api/useAssignableRoles.ts | Filters the role picker to what the adder may grant at that branch |
| src/features/members/components/AddMemberForm.tsx | Add-by-email form (email, role, branch, staff profile) |
| src/features/members/components/MemberManageDrawer.tsx | Roles per location, remove, resend email, cancel pending add |
| src/features/members/components/MemberList.tsx | Rows with status badges (active / pending / expired / disabled) |
| src/features/members/memberAddErrorKey.ts | Maps `add_member_by_email` codes to i18n keys (pure) |
| src/features/members/schemas/addMember.schemas.ts | zod schema (reuses `emailSchema`) |
| supabase/functions/_shared/outbox/memberAdded.ts | The `member_added` email (no token; `/login` link) |

## Database
- `add_member_by_email(business_id, email, role_id, branch_id?, staff_id?) → {ok, member_id, expires_at} | {ok:false, code}`. Codes: `forbidden`, `rate_limited`, `invalid_email`, `unknown_role`, `feature_unavailable`, `unknown_branch`, `cannot_grant`, `already_member`, `cannot_modify_higher_role`, `unknown_staff`, `staff_has_login`. `authenticated` only.
- `claim_pending_memberships() → {ok, joined: uuid[]}`. `authenticated` only; idempotent.
- `revoke_invite(member_id)` (Phase 9B) still cancels a pending add.
- RETIRED (EXECUTE revoked, kept in schema): `invite_member`, `accept_invite`, `invite_preview`, table `invite_accept_attempts`.
- Outbox event `member_added`: recipient = the pending row's `invited_email`, resolved at send time; `outbox_guard` drops it as stale once the add is joined, cancelled or expired.
- Migrations: `20261026100000_member_add_by_email.sql`, `20261026110000_retire_invite_tokens.sql` (older invite migrations listed in git history).

## Data & caching
- `memberKeys.list({ businessId })`, staleTime `list` (30 s). Adding invalidates `memberKeys.lists` and `['staff']`.
- `roleKeys.list({ businessId })`, staleTime `static`.
- `['members','claim', userId]`, staleTime `listLong`, `retry: false`, refetch on focus. When it joined something it awaits the invalidation of `['businesses','mine']`, `['profile','me',userId]`, grants, role labels and features before resolving. `AuthGate` waits on its FIRST result (`waitForClaim`).

## Permissions & gating
- Reading the list: `staff.view`. Adding / resending / cancelling: `users.invite`. Linking a staff profile also needs `staff.manage` over it (checked in the RPC).

## UI
- Same screen on mobile and desktop; the add form is a `Drawer`. Statuses: Active, Pending (warning + clock), Expired, Disabled.
- Toasts: added, email sent again, cancelled; the joining user sees "You have joined a team" once.

## i18n
Namespace `common`, keys `members.*` (`members.invite.*` keeps its key names for the add form, `members.accept.*` is the retired page, `members.claim.*` the join toasts).

## Verification (2026-10-23, dev)
- SQL: suite 50 (74), 04 rewritten (12), 21 (113), 37 (57), 42 (9), plus outbox suites 12/17/18/19/22/24/26/29/34/38 green after the outbox function rewrite.
- Live browser on dev with throwaway fixtures: old link → retired page, token stripped (1440 + 375); add by email (stored lowercased, Pending, 30 days); verified existing account signs in → `/login` → `/today` (no onboarding), Staff; unconfirmed account refused at sign-in and NOT joined, joined right after confirming; resend and cancel at 375 and 1440; audit rows; no business/trial created for joiners.
- `member_added` email: processed by the deployed `send_outbox`; Resend refused the `.test` address (`dead: rejected`). Real inbox delivery not yet proven.

## Known limits / TODO
- No business switcher: an existing member of another business is joined but cannot open the new business (user decision: switcher is a later task).
- Real inbox delivery of `member_added` needs a verified Resend domain or the Resend account owner's address.
- Exact email match only (`googlemail.com` vs `gmail.com`, `+tag` do not match).
- An adder who later loses their permission keeps their pending adds (they expire in 30 days or can be cancelled).
- The members list is not paginated.
- Drop the retired invite functions / `invite_accept_attempts` in a later cleanup (needs sign-off).

## Changelog
- 2026-10-23: Invite links REPLACED by add staff by email (`20261026100000`, `20261026110000`): pending membership bound to the email, joined by `claim_pending_memberships` only for a verified email, `member_added` email (no token), `/accept-invite` retired, `AuthGate` waits for the first claim. Removed `inviteUrl.ts`, `inviteAcceptPath.ts`, `inviteMemberErrorKey.ts`, `useInviteMember`/`useAcceptInvite`/`useInvitePreview`, `useSignup`'s `confirmRedirectPath`.
- 2026-10-14: QA audit (feature 5, roles) found `useAssignableRoles`'s `branchId` filter was accepted but unused (dead parameter), so `InviteMemberForm`'s and `MemberManageDrawer`'s role pickers offered a role for ANY branch the caller could grant it at SOMEWHERE, not specifically the branch being targeted — a branch-scoped Manager could pick a role+branch combo the server (`can_grant_at`) would refuse, confirmed live with a real multi-branch fixture. Fixed: the hook now actually filters by the branch argument (new `heldRankAtBranch()` in `rolesLogic.ts`), and both forms pass their own LIVE branch selection (not just the caller's starting scope) and reset a role choice that stops being valid when the branch changes. Full detail in [roles.md](roles.md).
- 2026-10-14: QA audit (feature 4) + fix. Verified live against dev: `can_grant_at`'s scope-ranking is in fact what `enforce_role_assignment_guard`/`assign_member_role`/`remove_member_role` call (not the older, non-scope-aware `has_permission`), so a Manager genuinely cannot grant or strip a permission at a higher scope than they hold themselves. `check_staff_cap` counts `staff_profiles`, not `business_members`/logins, confirmed by reading it — inviting a team member never touches it unless they are also assigned to a bookable branch as staff. Last-owner protection (UPDATE + DELETE + the `business_members` soft-delete/deactivate path) was already fixed in a prior QA round (`20261023090000_fix_last_owner_update_guard.sql`) and is still correct. `invite_preview`'s anon exposure is minimal by design (business name + invited email only, requires the raw unguessable token, indistinguishable failure for bad/used/expired) and was reconfirmed unaffected by the later anon-grant lockdown migrations. A member removed from a business keeps a technically-valid JWT until it expires, but RLS re-checks `business_members`/`member_role_assignments` live on every request, so data access is cut immediately regardless — the only residual gap is the cached member list in the UI, which can show a stale row for up to its 30s staleTime (same caching rule as everywhere else, not a bug). **Fixed**: `InviteMemberForm.tsx`, `MemberManageDrawer.tsx`'s resend action, and `members.tsx`'s list-error state all showed raw Supabase/Postgres `error.message` — same class of bug as features 1-3. New `inviteMemberErrorKey()` maps `invite_member`'s raised errcodes (`42501`/`22023`/`23505`) to `members.errors.*` i18n keys; `members.tsx` now shows the existing generic `auth.errors.generic` key instead of the raw list-query message (the same raw-message pattern exists on EVERY OTHER list screen in the app — `services.tsx`, `staff.tsx`, etc. — flagged as a separate, bigger, cross-cutting fix, not touched here to stay in scope). **Reported, not fixed** (user's explicit choice): the invite link's token lives in a URL query parameter, unlike every other sensitive link in the app (booking-manage, review, portal all use a fragment specifically to keep the token out of server logs/browser history) — see Known limits. **Tests**: suites 04 (20/20, run live for the FIRST TIME via the Supabase CLI + `run_pgtap.py`, resolving the long-standing "never run" gap), 21 (113/113), 41 (18/18) all re-verified against dev; 6 new unit tests for the new mapper; 818/818 full suite green; tsc/lint clean. No migration.
- 2026-10-12: FIX the actual production cause of the cold-load bug below — the token/auto-join fix WAS correct and necessary but did not fix production by itself (confirmed `c704f52` was already live and the bug still happened). Found by reproducing it in a real browser against the dev project (not more code reading): `AuthGate` unmounted its entire children (the whole route `Stack`) to show a loading spinner, which made React Navigation lose its navigation state and fall back to the default route, overwriting the real URL via its own `history.replace` — silently turning `/accept-invite?token=…#access_token=…` into `/` before the invite screen's code ever ran. Full detail and the fix in auth.md's changelog. Verified end-to-end in a real browser: two independent throwaway invited users, real tokens, cold tab, both landed on the dashboard joined, no `/onboarding` detour.
- 2026-10-12: FIX — a signed-out invitee's confirmation email used to send them to the generic `/verify` screen (token lost), and `AuthGate` then redirected a verified-but-not-yet-joined user to `/onboarding` instead of back to the invite — reproduced on production. Fixed two places: (1) `useSignup` takes an optional `confirmRedirectPath`; the accept screen passes `inviteAcceptPath(token)` so `emailRedirectTo` points at `/accept-invite?token=…` instead of `/verify` (owner self-serve signup is unaffected, no `confirmRedirectPath` passed, still defaults to `/verify`). supabase-js's PKCE URL cleanup only strips `code`/its own flow-id param, so `token` survives in the URL across confirmation (checked in `auth-js`'s source, not assumed). (2) The accept screen now auto-accepts (no "Join" button) the moment a signed-in session matches the invited email — covers both "just confirmed" and "already had an account". Also fixed the separate "/onboarding flashes before correcting" bug for the same root cause: accepting invalidates `['businesses','mine']`, and `AuthGate` was deciding on the stale pre-invalidation "zero businesses" value while the refetch was still in flight. New `shouldWaitForRejoin()` (`auth/gateSettled.ts`) makes the gate wait instead, scoped to only when away from onboarding/accept-invite so it can never hang a legitimate zero-business user. See auth.md. Tests: `gateSettled.test.ts` (shouldWaitForRejoin), `inviteAcceptPath.test.ts` (token survives URL-building, including special characters). Not run in a browser this round (needs the dev owner's login and a way to receive the confirmation email — Supabase's built-in sender only delivers to project team members); verified by tsc/lint/unit tests and a full code read-through of supabase-js's own URL-cleanup behavior instead.
- 2026-10-22: invite form can pick an unlinked staff profile (`invite_member(..., p_staff_id)`); the profile is linked to the invited member row and survives accept unchanged. See staff.md.
- 2026-10-07: Phase 9B closed the gaps: manage drawer (add / change / remove role per location, remove member, resend invite, cancel invite) on `assign_member_role`, `remove_member_role`, `remove_member`, `revoke_invite`, `invite_member`. Still: other people show as "Unknown" (profiles RLS). See plan-features-ui.md.
- 2026-10-02: Invite flow built: `invite_member`, `accept_invite`, `invite_preview`, rate limiting, team screen, accept screen, `ErrorState` primitive.
