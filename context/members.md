# Members & invites
Status: done (Phase 1 scope) · Phase: 1 · Last updated: 2026-10-14

## What it does
Shows everyone in the business — active members and pending invites — and lets
someone with `users.invite` invite a new person with a role and a branch. The
invite is a link that works once and expires after 7 days. The invitee opens it,
creates their account (or signs in, if they already have one) and joins.

## Business rules
- **The role is chosen and assigned at INVITE time, not on accept.** `enforce_role_assignment_guard` checks `auth.uid()`, so the only moment "you cannot grant a permission you do not hold" can be enforced is while the inviter is the caller. The invitee never picks their own role.
- **Only the token hash is stored** (sha256 hex). The raw token is returned once by `invite_member()` and shown once in the UI; it cannot be read again. Losing it means sending a fresh invite.
- **Invites expire after 7 days** (`business_members.invite_expires_at`, column default).
- **Single use**: accepting clears `invite_token_hash`, so the link dies.
- **Re-inviting the same address replaces the pending invite** (upsert on the `(business_id, invited_email)` partial unique index), so there is never more than one live token per address and the old link stops working.
- **The invitee must be SIGNED IN with the invited address.** A link alone never attaches a membership to whatever account happens to be open. An existing account joining a second business keeps its first membership untouched.
- **Every failure is the same generic message** — unknown, used, expired, wrong account are indistinguishable, so the screen cannot be used to discover which emails or tokens exist.
- **Rate limited**: 10 accept attempts per token hash per hour, then `54000 Too many attempts`.
- A person who is already an active member cannot be re-invited (`23505`).
- The role must be a system role or one owned by this business; a branch must belong to this business.

## Files
| Path | Purpose |
|---|---|
| app/(app)/members.tsx | Team list + invite drawer |
| app/(auth)/accept-invite.tsx | Opens `/accept-invite?token=…`; three cases (signed out / right account / wrong account) |
| src/features/members/api/useMembers.ts | `useMembers`, `useRoles`, `useInviteMember`, `useAcceptInvite`, `useInvitePreview`, `InviteNotValidError` |
| src/features/members/api/useAssignableRoles.ts | Filters the role picker to what the inviter may actually grant |
| src/features/members/components/InviteMemberForm.tsx | Invite form + the one-time link with a copy button |
| src/features/members/components/MemberList.tsx | Rows with status badges (active / invited / expired / disabled) |
| src/features/members/inviteUrl.ts | Builds the shareable https link (never a `wapee://` deep link) |
| src/features/members/inviteMemberErrorKey.ts | Maps `invite_member`'s raised Postgres errcodes to i18n keys (pure, no RN import, unlike the `{ok,code}` RPCs' `roleErrorKey` in `src/features/roles/rolesLogic.ts`) |
| src/features/members/inviteAcceptPath.ts | Pure `inviteAcceptPath(token)` (no react-native import, unit-testable) — the in-app `/accept-invite?token=…` path, also used as `confirmRedirectPath` so a signed-out invitee's email confirmation returns here, not to `/verify` |
| src/features/members/schemas/invite.schemas.ts | zod schemas; reuses `emailSchema` / `passwordSchema` from auth |
| src/components/ui/ErrorState.tsx | **New shared primitive**: failed-query state with retry |

## Database
- `invite_member(business_id, email, role_id, branch_id) → (out_member_id, out_token, out_expires_at)` — creates the `invited` row **and** the role assignment, returns the raw token once. Needs `users.invite` via `can()`. `authenticated` only.
- `accept_invite(token) → uuid` — the signed-in invitee joins; returns the business id, or **NULL for every failure**. `authenticated` only.
- `invite_preview(token) → (business_name, invited_email, expires_at)` — so the accept screen can name the business before sign-in. **`anon` may call it**; returns nothing for a bad, used or expired token.
- `invite_accept_attempts(token_hash, attempts, …)` — rate-limit counter. RLS on, **no policy**: only the SECURITY DEFINER function touches it.
- Migrations: `20261002160000_invite_flow.sql`, `20261002161000_invite_grants_lockdown.sql`, `20261002162000_fix_invite_member_ambiguous_column.sql`, `20261002163000_fix_invite_rate_limit.sql`.

### Why `accept_invite` returns NULL instead of raising
`raise exception` rolls the transaction back, **including the rate-limit INSERT** —
the counter stayed empty and the throttle never tripped (found in testing). Postgres
has no autonomous transactions, so failures became return values. Only "not signed
in" and the throttle itself raise.

## Data & caching
- `memberKeys.list({ businessId })`, staleTime `list` (30 s). Inviting invalidates `memberKeys.lists`.
- `roleKeys.list({ businessId })`, staleTime `static` (5 min).
- `['invite-preview', token]`, staleTime `liveShort`, `retry: false`.
- Accepting invalidates `['businesses','mine']` **and** `grantKeys.forBusiness(businessId)` — the user is suddenly in a business they were not in.

## Permissions & gating
- Reading the list: `staff.view` (the nav item's permission). Inviting: `users.invite` — so a Manager who may invite but not manage roles still works.
- The role picker is filtered by `useAssignableRoles`, which drops any role carrying a permission the inviter lacks. **The guard trigger is still the boundary**; this only avoids offering something that would fail.

## UI
- Mobile and desktop are the same screen; the invite form is a `Drawer` (480px on desktop, full-screen sheet on mobile).
- The one-time link is selectable text plus a copy button (`expo-clipboard`), because email delivery is Phase 6.
- Statuses: Active (success), Invited (warning + clock), Expired (error), Disabled (neutral).

## i18n
Namespace `common`, keys `members.*` (and `nav.members`).

## Verification (2026-10-02)
Verified **end to end through the real REST API** with real signed-in users
(owner, staff, manager) — 21 checks, all passing:
- invite returns a token; only a sha256 hash is stored; expiry ≈7 days; the role is assigned at invite time
- `anon` can preview a live invite but **cannot** accept (401); `anon` cannot call `invite_member` (401)
- wrong signed-in account → generic refusal; expired → generic refusal; reused → generic refusal
- an **existing account joined a second business** and kept its first membership; status `active`, token hash cleared, `joined_at` set
- a spent or expired token previews as empty
- Staff (no `users.invite`) refused; **Manager can invite Staff but is blocked from inviting an Owner** (`You cannot grant "commission.manage_rules" …`)
- rate limit: attempts 1–10 return null, 11 and 12 throttle; the counter persists

Two real bugs were found and fixed this way: the ambiguous `member_id` column and
the rate limit that never counted.

## Known limits / TODO
- ~~`supabase/tests/04_invite_flow.sql` has never been run~~ **Run live against dev 2026-10-14** via `python3 supabase/tests/run_pgtap.py supabase/tests/04_invite_flow.sql` (the Supabase CLI linked to dev, no Docker needed) — **20/20 pass**. Suites 21 (`21_branch_scope.sql`, 113/113) and 41 (`41_last_owner_update_guard.sql`, 18/18) also re-run clean via `supabase db query --linked -f <file>` (their own self-contained harness, not pgTAP).
- **Invite token is a URL query parameter (`/accept-invite?token=...`), unlike every other sensitive link in this codebase.** `booking-manage`, the review link, and the portal link all deliberately use a URL FRAGMENT (`tokenFragment.ts`'s own doc comment: "never the query string ... so it is never sent to a server or written to an access log"). The invite link is the one exception — found during the 2026-10-14 audit (feature 4), reported rather than fixed per the user's explicit choice: fixing it means reworking how `/accept-invite` reads the token AND how it survives the email-confirmation round trip for a signed-out invitee (a path that already needed a hard-won fix once, 2026-10-12 changelog below) — real regression risk for a security-hardening change, not a quick swap. Mitigations already in place narrow the actual exposure: single-use (cleared on accept), 7-day expiry, rate-limited (10 attempts/hour), HTTPS-only. **Proposed smallest fix, NOT applied**: reuse `tokenFragment.ts`'s `parseTokenFromFragment`/`stripTokenFromUrl` for `/accept-invite`, and change `inviteAcceptPath()`/`confirmRedirectPath` to build a fragment instead of a query string — needs careful re-verification that Supabase's own `#access_token=...&type=signup` fragment (appended by the email-confirmation redirect) does not collide with a `#token=...` fragment already there.
- **No email yet.** The inviter copies the link and sends it (Resend, Phase 6).
- No revoke-invite or resend-invite button, no remove-member, no change-role UI. `enforce_last_owner` already protects the final Owner.
- `expo-clipboard` is a **new native module** — the dev build must be rebuilt.
- The members list is not paginated (CLAUDE.md §6 wants server-side paging); fine for Phase 1 team sizes, needs `ListView` when teams grow.

## Changelog
- 2026-10-14: QA audit (feature 5, roles) found `useAssignableRoles`'s `branchId` filter was accepted but unused (dead parameter), so `InviteMemberForm`'s and `MemberManageDrawer`'s role pickers offered a role for ANY branch the caller could grant it at SOMEWHERE, not specifically the branch being targeted — a branch-scoped Manager could pick a role+branch combo the server (`can_grant_at`) would refuse, confirmed live with a real multi-branch fixture. Fixed: the hook now actually filters by the branch argument (new `heldRankAtBranch()` in `rolesLogic.ts`), and both forms pass their own LIVE branch selection (not just the caller's starting scope) and reset a role choice that stops being valid when the branch changes. Full detail in [roles.md](roles.md).
- 2026-10-14: QA audit (feature 4) + fix. Verified live against dev: `can_grant_at`'s scope-ranking is in fact what `enforce_role_assignment_guard`/`assign_member_role`/`remove_member_role` call (not the older, non-scope-aware `has_permission`), so a Manager genuinely cannot grant or strip a permission at a higher scope than they hold themselves. `check_staff_cap` counts `staff_profiles`, not `business_members`/logins, confirmed by reading it — inviting a team member never touches it unless they are also assigned to a bookable branch as staff. Last-owner protection (UPDATE + DELETE + the `business_members` soft-delete/deactivate path) was already fixed in a prior QA round (`20261023090000_fix_last_owner_update_guard.sql`) and is still correct. `invite_preview`'s anon exposure is minimal by design (business name + invited email only, requires the raw unguessable token, indistinguishable failure for bad/used/expired) and was reconfirmed unaffected by the later anon-grant lockdown migrations. A member removed from a business keeps a technically-valid JWT until it expires, but RLS re-checks `business_members`/`member_role_assignments` live on every request, so data access is cut immediately regardless — the only residual gap is the cached member list in the UI, which can show a stale row for up to its 30s staleTime (same caching rule as everywhere else, not a bug). **Fixed**: `InviteMemberForm.tsx`, `MemberManageDrawer.tsx`'s resend action, and `members.tsx`'s list-error state all showed raw Supabase/Postgres `error.message` — same class of bug as features 1-3. New `inviteMemberErrorKey()` maps `invite_member`'s raised errcodes (`42501`/`22023`/`23505`) to `members.errors.*` i18n keys; `members.tsx` now shows the existing generic `auth.errors.generic` key instead of the raw list-query message (the same raw-message pattern exists on EVERY OTHER list screen in the app — `services.tsx`, `staff.tsx`, etc. — flagged as a separate, bigger, cross-cutting fix, not touched here to stay in scope). **Reported, not fixed** (user's explicit choice): the invite link's token lives in a URL query parameter, unlike every other sensitive link in the app (booking-manage, review, portal all use a fragment specifically to keep the token out of server logs/browser history) — see Known limits. **Tests**: suites 04 (20/20, run live for the FIRST TIME via the Supabase CLI + `run_pgtap.py`, resolving the long-standing "never run" gap), 21 (113/113), 41 (18/18) all re-verified against dev; 6 new unit tests for the new mapper; 818/818 full suite green; tsc/lint clean. No migration.
- 2026-10-12: FIX the actual production cause of the cold-load bug below — the token/auto-join fix WAS correct and necessary but did not fix production by itself (confirmed `c704f52` was already live and the bug still happened). Found by reproducing it in a real browser against the dev project (not more code reading): `AuthGate` unmounted its entire children (the whole route `Stack`) to show a loading spinner, which made React Navigation lose its navigation state and fall back to the default route, overwriting the real URL via its own `history.replace` — silently turning `/accept-invite?token=…#access_token=…` into `/` before the invite screen's code ever ran. Full detail and the fix in auth.md's changelog. Verified end-to-end in a real browser: two independent throwaway invited users, real tokens, cold tab, both landed on the dashboard joined, no `/onboarding` detour.
- 2026-10-12: FIX — a signed-out invitee's confirmation email used to send them to the generic `/verify` screen (token lost), and `AuthGate` then redirected a verified-but-not-yet-joined user to `/onboarding` instead of back to the invite — reproduced on production. Fixed two places: (1) `useSignup` takes an optional `confirmRedirectPath`; the accept screen passes `inviteAcceptPath(token)` so `emailRedirectTo` points at `/accept-invite?token=…` instead of `/verify` (owner self-serve signup is unaffected, no `confirmRedirectPath` passed, still defaults to `/verify`). supabase-js's PKCE URL cleanup only strips `code`/its own flow-id param, so `token` survives in the URL across confirmation (checked in `auth-js`'s source, not assumed). (2) The accept screen now auto-accepts (no "Join" button) the moment a signed-in session matches the invited email — covers both "just confirmed" and "already had an account". Also fixed the separate "/onboarding flashes before correcting" bug for the same root cause: accepting invalidates `['businesses','mine']`, and `AuthGate` was deciding on the stale pre-invalidation "zero businesses" value while the refetch was still in flight. New `shouldWaitForRejoin()` (`auth/gateSettled.ts`) makes the gate wait instead, scoped to only when away from onboarding/accept-invite so it can never hang a legitimate zero-business user. See auth.md. Tests: `gateSettled.test.ts` (shouldWaitForRejoin), `inviteAcceptPath.test.ts` (token survives URL-building, including special characters). Not run in a browser this round (needs the dev owner's login and a way to receive the confirmation email — Supabase's built-in sender only delivers to project team members); verified by tsc/lint/unit tests and a full code read-through of supabase-js's own URL-cleanup behavior instead.
- 2026-10-22: invite form can pick an unlinked staff profile (`invite_member(..., p_staff_id)`); the profile is linked to the invited member row and survives accept unchanged. See staff.md.
- 2026-10-07: Phase 9B closed the gaps: manage drawer (add / change / remove role per location, remove member, resend invite, cancel invite) on `assign_member_role`, `remove_member_role`, `remove_member`, `revoke_invite`, `invite_member`. Still: other people show as "Unknown" (profiles RLS). See plan-features-ui.md.
- 2026-10-02: Invite flow built: `invite_member`, `accept_invite`, `invite_preview`, rate limiting, team screen, accept screen, `ErrorState` primitive.
