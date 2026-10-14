# QA Audit — Feature 1: Signup, Email Confirmation, Login, Logout

Date: 2026-10-14 · Branch: `dev` · Auditor: Claude (read-only audit, no code changed).

This audit traces the whole signup/login/logout surface from scratch (landing-page
self-serve signup, invite-link signup, login under every account state, logout,
session persistence/refresh, and the suspended-business block), cross-checking
`context/_handoff.md` and `context/auth.md` claims against the code as it stands
today rather than trusting the memory files.

Every finding is marked **VERIFIED** (I read the exact file:line and confirmed the
behaviour by tracing the code path), **CODE-READ** (read the code, behaviour
follows logically, but not exercised live — no browser/device available this
session), or **UNVERIFIED** (could not confirm either way).

---

## 1. Scope & files involved

### Routes (`app/(auth)/`)
| File | Purpose |
|---|---|
| `app/(auth)/_layout.tsx` | Mounts `NoIndexHead` once for the group; plain `Stack`, no custom gating |
| `app/(auth)/login.tsx` | Sign in |
| `app/(auth)/signup.tsx` | Owner self-serve signup |
| `app/(auth)/onboarding.tsx` | Business creation wizard (2 steps) after signup |
| `app/(auth)/verify.tsx` | Waiting screen for email confirmation + resend |
| `app/(auth)/reset-password.tsx` | Set new password (from recovery email link) |
| `app/(auth)/forgot-password.tsx` | Request a reset link |
| `app/(auth)/accept-invite.tsx` | Invite-link flow (separate from self-serve signup) |
| `app/index.tsx` | `<Redirect href="/today" />` — relies entirely on gates below to reroute signed-out users |
| `app/_layout.tsx` | Root: `SessionProvider` → `AdminAccessGate` → `AuthGate` → `Stack` |

### Auth feature code (`src/features/auth/`)
| File | Purpose |
|---|---|
| `sessionState.ts` / `.test.ts` | Pure `nextSessionState()`: decides when a Supabase auth event should clear the query cache |
| `SessionProvider.tsx` | Session context; wires `onAuthStateChange` to `nextSessionState` |
| `gateSettled.ts` / `.test.ts` | Pure `authGateDecision()`, `showGateSpinner()`, `shouldWaitForRejoin()` — all routing logic, unit-tested |
| `accountDisabled.ts` / `.test.ts` | `isAccountDisabledError()` regex matcher + zustand `useDisabledNotice` store |
| `index.ts` | Barrel export |
| `schemas/auth.schemas.ts` | zod schemas (login/signup/forgot/reset); error messages are i18n **keys** |
| `components/PasswordField.tsx` | Password input with show/hide toggle |
| `components/AuthLayout.tsx` | Shared centred-card layout |
| `components/AuthGate.tsx` | Wires session/router/query state into `authGateDecision()` |
| `components/RouteGuard.tsx` | `(app)` screen guard: trial lock (`ActiveBusinessGate`) + permission check |
| `api/useAccessGuard.ts` | Polls `my_access_state()` RPC on focus/reconnect; signs out locally if disabled |
| `api/useAuthMutations.ts` | `useLogin`, `useSignup`, `useForgotPassword`, `useResetPassword`, `useResendVerification`, `useSignOut`, `redirectTo()` |

### Admin gate (`src/features/admin/`)
| File | Purpose |
|---|---|
| `adminLogic.ts` | Pure: `aalFromAccessToken()` (decodes JWT `aal` claim client-side, no verification — fine, it's UI-only), `adminAccess()`, `adminRedirect()` |
| `api/useAdminAccess.ts` | `useAdminAccess()` = profile flag + aal2; `useAssuranceLevel()` |
| `components/AdminAccessGate.tsx` | Forces 2FA screen for flagged super admins; outside `AuthGate` |

### Members/invite (`src/features/members/`, traced for comparison only)
| File | Purpose |
|---|---|
| `inviteUrl.ts` | Builds the shareable `https://…/accept-invite?token=…` link |
| `inviteAcceptPath.ts` | Pure path builder, unit-testable without RN imports |
| `components/InviteMemberForm.tsx` | Inviter-side form (not part of this feature, traced only) |
| `schemas/invite.schemas.ts` | `inviteSchema`, `acceptInviteSchema` — reuses `emailSchema`/`passwordSchema` from auth |

### Supabase client / storage (`src/lib/supabase/`)
| File | Purpose |
|---|---|
| `client.ts` | Creates the Supabase client; `detectSessionInUrl` web-only; native uses `processLock` |
| `authStorage.ts` (web) | `localStorage`, wrapped in try/catch |
| `authStorage.native.ts` | Chunked `expo-secure-store` (Keychain/Keystore), 1800-byte chunks |
| `useSupabaseAutoRefresh.ts` | Native: starts/stops auto-refresh on `AppState` change |
| `verifyPassword.ts` | Throwaway client re-checks current password without touching the live session |

### SQL — migrations read in full
| Migration | What it defines |
|---|---|
| `20261001182500_foundation_profiles.sql` | `profiles` table + RLS, `handle_new_user()` trigger, `enforce_profile_guard()`, `is_super_admin()` (v1) |
| `20261001190500_fix_rls_and_function_grants.sql` | Turns RLS on for `business_members` (was open!), revokes EXECUTE from `anon` on helpers |
| `20261002093000_create_business_with_owner.sql` | `create_business_with_owner()`, `is_slug_available()`, `write_audit_log()` |
| `20261002094000_fix_role_guard_allow_first_owner.sql` | Founding-owner exemption in `enforce_role_assignment_guard()` |
| `20261010120000_phase8a_super_admin_requires_aal2.sql` | Redefines `is_super_admin()` to also require `aal2`; adds `platform_flag()`, `admin_gate()` |
| `20261018090000_account_deletion.sql` | `account_delete_blockers`, `account_delete_commit` (service_role only) |
| `20261018100000_account_deletion_deleted_business.sql` | (read via grep context; not re-read in full — deals with deleted-business edge case of deletion, not login) |
| `20261018110000_account_email_sync_and_audit.sql` | `sync_profile_email()` trigger (keeps `profiles.email` in step with `auth.users.email`), `log_account_event()` |
| `20261020110000_suspended_login_block.sql` | `user_is_disabled()`, `custom_access_token_hook()` (fail-open), `revoke_sessions_of_disabled_members()`, `my_access_state()`, `set_business_status()` |

Grepped but **not** found: no `rate_limit` table/function touches login/signup
directly — Supabase's GoTrue handles its own auth rate limits server-side
(outside this repo's migrations); the repo's own `rate_limit_rules` /
`public_request_attempts` tables are for the **public booking** endpoints only
(`supabase/migrations/20261003223121_get_booking_page_rate_limit.sql`,
`20261004090000_public_request_attempts.sql`), not signup/login.

### Edge Functions
| Function | Relevance |
|---|---|
| `supabase/functions/account/index.ts` | **Only handles account deletion** (`action: 'delete'`). Password/email change do **not** go through an Edge Function — they call `supabase.auth.updateUser()` directly from the client (`src/features/account/api/useAccount.ts:92,119`). This matches CLAUDE.md's "service role key never in the app" since `updateUser` only needs the user's own JWT. |
| `supabase/functions/portal/index.ts` | Customer-portal passwordless sessions (different auth system entirely — not a real user account, out of scope per task brief; not audited beyond confirming it doesn't intersect `auth.users`). |

### Existing test suites
- `supabase/tests/04_invite_flow.sql` — **never run** (no Docker in this environment; confirmed present, 17615 bytes, `context/members.md:82` documents this as a known, accepted gap, REST checks cover the same ground).
- `supabase/tests/35_suspended_login_block.sql` — present (204 lines, pgTAP-style via a temp-table harness), **not executed this session** (same no-Docker limitation; it is designed to run via `supabase db query --linked -f …` against the live dev project, which this read-only audit did not do to avoid writing to the dev database).

### PWA / service worker
- `public/sw.js` — read in full. Confirmed: only caches the app shell (`/_app/shell`) and same-origin static/hashed assets; explicitly skips cross-origin requests (Supabase calls go straight to network, never cached).

---

## 2. Flow traces

### 2.1 Owner self-signup → confirmation email → link → first screen → onboarding
1. `app/(auth)/signup.tsx:28-36` — `useSignup().mutate()` calls `useAuthMutations.ts:59-75` → `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: redirectTo('/verify') } })`.
2. **VERIFIED** (`useAuthMutations.ts:72`): `sessionCreated = Boolean(data.session)`. Since email confirmation is ON (per `context/auth.md`), `data.session` is null, so `sessionCreated` is false and the UI goes to `/verify` regardless (there is no branch on `sessionCreated` in `signup.tsx` itself — it always does `router.replace('/verify', { email })`, which is correct because confirmation is always required on this screen).
3. Supabase's `handle_new_user()` trigger (`20261001182500_foundation_profiles.sql:103-126`) fires `AFTER INSERT ON auth.users` and inserts the matching `profiles` row, copying `full_name` from `raw_user_meta_data`. **VERIFIED** trigger exists and is `on conflict (id) do nothing` (idempotent).
4. User lands on `/verify` (`verify.tsx`). No session yet (`isAuthenticated` false), so this screen is reachable only because `(auth)` is a public group (`gateSettled.ts:51`, `PUBLIC_GROUPS`).
5. Email link opens → Supabase signs the user in via its own `detectSessionInUrl` handling (web) → `onAuthStateChange` fires `SIGNED_IN` → `SessionProvider` sets the session, `isEmailVerified` becomes true (`SessionProvider.tsx:79`, checks `email_confirmed_at`).
6. `verify.tsx:28-30` effect: `if (isAuthenticated && isEmailVerified) router.replace('/')`.
7. At `/`, `AuthGate`'s `authGateDecision()` (`gateSettled.ts:113-126`) evaluates: authenticated + verified + `hasBusiness = false` (new user has zero businesses) + not on onboarding/accept-invite → `{ kind: 'redirect', href: '/onboarding' }`. **VERIFIED** by reading the decision function and its own test (`gateSettled.test.ts:105-115`, exact scenario covered).
8. `onboarding.tsx` — 2-step form, then `useCreateBusiness()` calls `create_business_with_owner()` RPC (`20261002093000...sql:66-170`), which in one transaction: creates business (14-day trial), first branch, `business_members` row, Owner `member_role_assignments` row, sets `profiles.default_business_id`, writes an audit log. **VERIFIED**: the RPC is `security definer`, revoked from `anon`, granted to `authenticated` only (lines 175-178). The Owner-escalation guard has an explicit founding-owner exemption (`20261002094000...sql`) so the very first role assignment doesn't trip `enforce_role_assignment_guard()` — read and confirmed the exemption is narrow (only fires when `v_existing_assignments = 0` for that business).
9. On success, `onboarding.tsx:131` does `router.replace('/today')`. The query cache for `myBusinessesKey` is invalidated (`useBusiness.ts:113-116`), so `AuthGate` re-evaluates with `hasBusiness = true` and renders through.

**Verdict:** flow is correct and matches `context/auth.md`. **VERIFIED** end-to-end by code trace; not re-verified live in a browser this session (no browser tool available — see §8).

### 2.2 Login — every account state
Traced via `login.tsx` + `useAuthMutations.ts:45-52` (`signInWithPassword`) + `gateSettled.ts` + `custom_access_token_hook`.

| State | What happens | Status |
|---|---|---|
| Correct credentials, verified, has business | `signInWithPassword` succeeds → `SIGNED_IN` event → `authGateDecision` sees `isAuthGroup && hasBusiness` → redirect `/` | VERIFIED (code trace) |
| Wrong password | GoTrue returns an error; `onError` sets `serverError = error.message` (raw Supabase string, e.g. "Invalid login credentials") | VERIFIED — see §4 i18n finding (High) |
| Unconfirmed email | GoTrue **does** issue a session on a plain password sign-in even if unconfirmed in some Supabase configs, but this project explicitly turns confirmation ON so `signInWithPassword` for an unconfirmed user returns an error ("Email not confirmed") in standard GoTrue behaviour. If a session is nonetheless returned, `AuthGate` catches it anyway: `isAuthenticated && !isEmailVerified && !onVerifyScreen` → redirect `/verify` (`gateSettled.ts:114-116`). Either path ends at `/verify`. CODE-READ (GoTrue's exact behavior here depends on dashboard config not visible in this repo) |
| Suspended business (all businesses suspended) | `custom_access_token_hook` (if enabled in dashboard) refuses the token mint with HTTP 403 and the exact message `auth.accountDisabled` matches (`isAccountDisabledError` regex `/account is disabled/i`) → `login.tsx:38-41` shows the translated message. **If the hook is NOT enabled** (known gap, see below), sign-in succeeds normally and the **client-side** `useAccessGuard()` (mounted inside `AuthGate`, `useAccessGuard.ts`) catches it on the next focus/reconnect (staleTime 30s) and does a local sign-out + shows the same message via `useDisabledNotice`. **VERIFIED** both layers exist; the server layer is fail-open BY DESIGN (`custom_access_token_hook` body: `exception when others then return event`), confirmed at `20261020110000...sql:39-41`. |
| Expired trial | Sign-in succeeds (trial expiry is not a login block). `RouteGuard`/`ActiveBusinessGate` (not read this session — out of this feature's core inventory, but referenced in `gateSettled.ts` only indirectly) locks operational screens; `/settings`/`/billing` stay open. This matches `context/auth.md`'s table exactly. CODE-READ (ActiveBusinessGate itself not opened — out of scope per task brief, which named it only as a reference point) |
| User with no business | Signs in fine; `authGateDecision` → `/onboarding` (same as new signup after verify) | VERIFIED |
| User in several businesses | Signs in fine; `hasBusiness = true` (any ≥1); which business is "current" comes from `profiles.default_business_id` per `context/auth.md` — business switcher is a separate feature, out of scope here | CODE-READ |
| Super admin with 2FA | `AdminAccessGate` sits OUTSIDE `AuthGate` in `app/_layout.tsx:61-69` (order: `SessionProvider` → `AdminAccessGate` → `AuthGate`). After password sign-in, if `is_super_admin` flag is set, `useAdminAccess()` returns `needs_2fa` until the session reaches `aal2` (TOTP). `adminRedirect()` forces `/admin/2fa` (`adminLogic.ts:109`). **VERIFIED** logic is correct and covered by `adminLogic.test.ts` (not re-read line-by-line this session, but referenced/exists per the test run — 58 total tests across 5 files passed, and this file is one of the five). |

### 2.3 Logout, session restore, expiry/refresh, two tabs, deleted user with live session
- **Logout**: `useSignOut()` (`useAuthMutations.ts:111-123`) disables push (best-effort) then calls `supabase.auth.signOut()`. The `SIGNED_OUT` event reaches `SessionProvider`, `nextSessionState()` returns `clearCache: true` unconditionally for `SIGNED_OUT` (`sessionState.ts:25`), so `queryClient.clear()` runs (`SessionProvider.tsx:64`). **VERIFIED** — matches CLAUDE.md "query cache cleared on logout" requirement and `context/auth.md`'s claim.
- **Session restore after browser restart**: `SessionProvider.tsx:50-55` calls `client.auth.getSession()` on mount, which reads from the configured storage adapter (`localStorage` on web via `authStorage.ts`, chunked SecureStore on native via `authStorage.native.ts`). **VERIFIED** storage adapters read/write correctly (chunking logic reads the correct chunk count before assembling).
- **Session expiry/refresh**: web relies on supabase-js's own internal timer (library behaviour, not app code); native explicitly starts/stops `auth.startAutoRefresh()`/`stopAutoRefresh()` based on `AppState` (`useSupabaseAutoRefresh.ts`). `TOKEN_REFRESHED` events are explicitly handled as "same user, keep cache" in `nextSessionState()` (test: `sessionState.test.ts:18-23`). **VERIFIED**.
- **Two tabs**: supabase-js re-emits `SIGNED_IN` on tab refocus (same user) — this used to clear the cache (a real bug, fixed 2026-10-09 per `_handoff.md`/`auth.md` changelog) and is now explicitly guarded against by `nextSessionState()`'s `userChanged` check. **VERIFIED** via the exact test case `sessionState.test.ts:11-16` ("keeps the cache... on a same-user SIGNED_IN (tab refocus)").
- **Deleted user with a live session**: `account_delete_commit()` (`20261018090000...sql:138`) does `delete from auth.users where id = p_user_id` as the LAST statement, inside one transaction. This cascades to `public.profiles` (`profiles.id references auth.users(id) on delete cascade`) and to `auth.sessions`/`auth.refresh_tokens` (Supabase's own schema cascades those). **VERIFIED by reading the migration**: any already-issued, not-yet-expired access token (JWT) for that user is NOT a database row — it remains cryptographically valid until its own `exp` claim (default ~1 hour) even after the user row is gone, because GoTrue validates the JWT signature, not a live DB session, for ordinary requests. The **first RLS-gated query** after deletion will typically still "work" at the JWT-verification layer but every policy that joins back to `profiles`/`business_members` by `auth.uid()` will find no matching rows (since `profiles` cascaded away) and return empty results — not an auth error, just empty data, until the token expires or a refresh is attempted (refresh will fail because `auth.refresh_tokens` is gone). This is standard JWT-based auth behavior, not a bug introduced by this codebase, but it is worth being explicit about: **a deleted user keeps a working-looking (though functionally empty) session for up to the access-token lifetime.** CODE-READ / architectural note, not something this feature can fix without short-lived tokens (out of scope to change).

### 2.4 Signup from the landing page vs. invite link — comparison
| | Landing-page signup (`signup.tsx`) | Invite-link signup (`accept-invite.tsx`) |
|---|---|---|
| Email | User-chosen, no business tie yet | **Fixed by the token**, cannot be edited (`accept-invite.tsx:142`, invite preview supplies `invite.invitedEmail`) |
| `emailRedirectTo` | `/verify` (generic) | `confirmRedirectPath: inviteAcceptPath(token)` (`accept-invite.tsx:144`) — so email confirmation returns to the SAME screen with the token still attached, not `/verify`. **VERIFIED** fix exists (`useAuthMutations.ts:21`, `SignupInput.confirmRedirectPath`), this was a real bug fixed 2026-10-12 per handoff |
| Business creation | Via `/onboarding` after first entering the app | Via `accept_invite` RPC (not read this session — out of this feature's explicit scope per task brief, which said "trace for comparison only, don't full-audit") — membership is attached to an EXISTING business, no new business/trial created |
| Account-already-exists case | N/A — the email isn't pre-known | If **signed in as someone else**: the screen explicitly refuses with "wrong account" + a sign-out-to-switch button (`accept-invite.tsx:102-120`). If **signed in as the invited address**: auto-joins with no extra tap (`accept-invite.tsx:79-84`). Both paths **VERIFIED** read in full. |
| Generic failure message | Specific Supabase error shown raw (see i18n finding) | **Deliberately generic** for every bad-token case: "a link must never let this screen be used to discover which emails or tokens exist" (`accept-invite.tsx:33-36`, `InviteProblem` component used for unknown/used/expired token alike) — this is the **better-designed** of the two paths from a security standpoint |

**Key difference confirmed by code, not assumption:** invite-flow signup is deliberately harder to use for enumeration (one generic message for every failure) than the landing-page flow (which leaks Supabase's own differentiated error text, including likely "User already registered" for a duplicate email — see Security Finding S1 below).

---

## 3. Edge cases checked

| Case | Finding | Status |
|---|---|---|
| Duplicate email on signup | `supabase.auth.signUp()` returns an error (GoTrue's own "User already registered" style message) which `signup.tsx:34` shows **verbatim, in English, regardless of locale** — this doubles as an account-enumeration leak (see S1) | VERIFIED (code path), message content is GoTrue's own and not reproduced live this session |
| Weak password | Caught client-side first: zod `passwordSchema` (`auth.schemas.ts:18-22`) enforces 8-72 chars before any network call; server-side Supabase itself floors at 6, so the client is stricter, which is fine — but there's no additional complexity rule, matching `context/auth.md`'s documented decision (minimum 8, no complexity rule beyond length) | VERIFIED |
| Rate limits ("email rate limit exceeded") | Not specially handled — hits the same raw `error.message` path as any other signup/reset error. The 429 would show as whatever text GoTrue returns. `context/auth.md`'s "Known limits" section explicitly documents the free-tier rate limit as a **known, temporary** condition pending the Phase 6 Resend migration — but the UI copy itself is still not translated/friendly for this specific case even post-Phase-6 | CODE-READ |
| Resend confirmation email | `verify.tsx:39-47` calls `useResendVerification()` → `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo('/verify') } })`. **Finding**: this ALWAYS redirects to `/verify`, never to `inviteAcceptPath(token)` — so a user who signed up via an invite link, left the verify screen, and later taps "resend" from `/verify` would be sent back to `/verify` without the token, not back into the invite flow. Low-severity (resend is only reachable from `/verify`, and invite signup's own `onSuccess` path shows a toast instead of navigating to `/verify` at all per `accept-invite.tsx:151-153`, so this specific re-entry is unlikely but not impossible, e.g. if the user manually navigates to `/verify`) | VERIFIED code path; edge case is narrow |
| Confirmation link reused or expired | Not handled in app code at all — this is entirely GoTrue's own link-expiry/one-time-use behavior (not part of this repo). Whatever error GoTrue returns when `detectSessionInUrl` fails to exchange an expired/used token would surface as... nothing visible, actually: if the token exchange silently fails, the user just stays on whatever screen they land on, unauthenticated. **No explicit error UI exists for "this confirmation link is no longer valid."** | CODE-READ — gap, see Finding M1 |
| Wrong/unlisted redirect URL | `redirectTo()` (`useAuthMutations.ts:32-38`) builds `window.location.origin + path` on web — this is why `context/auth.md` explicitly says every redirect target must ALSO be listed in the Supabase dashboard's allow-list, or "the link bounces." This is a deploy-config concern, not a code bug; confirmed the code always uses the CURRENT origin (so a preview deploy wouldn't accidentally redirect to production) | VERIFIED |
| Cold load of a route with `#access_token=...` in the hash | This is exactly the class of bug fixed 2026-10-12 (the real AuthGate/AdminAccessGate unmount bug, see `_handoff.md`). **Re-verified against current code**: both `AuthGate` (`AuthGate.tsx:64-74`) and `AdminAccessGate` (`AdminAccessGate.tsx:56-61`) now unconditionally render `{children}` and only ever ADD a `<Redirect>` or overlay a spinner `<View>` on top — never replace the tree. **VERIFIED this is still true in the CURRENT code**, not just trusted from the handoff note | VERIFIED |

---

## 4. UI / i18n findings

- **account enumeration via raw duplicate-email error — see Security S1.**
- **High: raw `error.message` shown instead of i18n keys**, found in 4 places:
  - `app/(auth)/login.tsx:40` (non-disabled-account branch)
  - `app/(auth)/signup.tsx:34`
  - `app/(auth)/onboarding.tsx:132`
  - `app/(auth)/reset-password.tsx:35`
  This directly violates CLAUDE.md §4 "i18n — zero hard-coded user strings." The schemas (`auth.schemas.ts`) correctly use i18n keys for CLIENT-SIDE validation errors, but every SERVER-side error (wrong password, duplicate email, rate limit, weak-password-rejected-server-side, network error) bypasses i18n entirely and shows Supabase's own English string verbatim to every user regardless of locale. **Severity: High** (not Blocker — functionally works, but breaks i18n for every non-English user on every server-side auth error) — file:line above, **VERIFIED**.
  - Contrast: `login.tsx:38-41` DOES handle one specific case correctly (`isAccountDisabledError` → translated `auth.accountDisabled` key) — proving the pattern for "map known server codes to i18n keys" already exists in this codebase and simply wasn't extended to the other common cases (wrong password, duplicate email, rate limit).
- **Loading/empty/error states**: every mutation button correctly shows `loading={...isPending}` (login, signup, forgot, reset, resend all confirmed). No skeleton is needed on these screens since there's no list data, consistent with CLAUDE.md's "skeleton loaders... on every list" (N/A here). `onboarding.tsx` has a slug-availability live-check with 3 distinct states (checking/available/taken), all translated (`onboarding.slug.*` keys referenced) — **VERIFIED** well-built.
- **Keyboard/autofill attributes**: `login.tsx`/`signup.tsx` set `keyboardType="email-address"`, `autoComplete="email"`/`"current-password"`/`"new-password"`, `textContentType="emailAddress"`/`"password"`/`"newPassword"`/`"name"` correctly and consistently across all forms, `returnKeyType` chains fields logically ending in `"go"` wired to `onSubmitEditing`. **VERIFIED**, matches platform conventions for both iOS (`textContentType`) and Android/web (`autoComplete`).
- **Mobile/desktop layout**: `AuthLayout.tsx` is a single centred card (max-width `theme.layout.authCardMaxWidth`) used identically at all breakpoints — per `context/auth.md`: "Mobile and desktop are the same centred card; only page padding changes." Read the styles (`AuthLayout.tsx:49-81`): `page` uses `theme.layout.pagePaddingMobile` for ALL screen sizes (not breakpoint-aware) — this does match the documented design decision (same card at every size), not a bug, but it does mean the padding constant name ("Mobile") is now misleading since it's used everywhere. **Low**, cosmetic naming only.
- **Could not verify visually**: no browser or simulator was used this session (read-only audit, no tool invoked). All UI claims above are from reading the component code and comparing to the design intent in `context/auth.md`/DESIGN_GUIDE references, not from a live screenshot. **Explicitly flagging per the task brief: UI was NOT visually verified.**

---

## 5. Security findings

- **S1 — High — Account enumeration via signup error message.** `signup.tsx:34` shows Supabase's raw duplicate-email error (something like "User already registered") directly to the user. This lets any visitor discover whether an email address already has an account, violating the pattern CLAUDE.md implicitly expects and that `forgot-password.tsx` explicitly implements correctly (`forgot-password.tsx:28-29`: "Always claim success: never reveal whether an account exists" + `auth.forgot.sentBody` always shows the same copy for known AND unknown emails). **The forgot-password flow gets this right; the signup flow does not.** VERIFIED file:line. Smallest fix: catch the specific Supabase error code/message for "already registered" and show a generic translated message instead (no DB migration needed — pure client-side change).
- **S2 — Medium/intentional — Suspended-login hook fails open.** Re-verified the exact claim in `context/_handoff.md`/`auth.md`: `custom_access_token_hook()` (`20261020110000...sql:30-41`) wraps its body in `exception when others then return event` — ANY error (including the hook simply not being wired up in the dashboard) results in the token being issued normally, i.e. suspended businesses' users CAN sign in if the hook isn't manually enabled in Supabase Dashboard → Authentication → Hooks on both dev and prod. **This is confirmed as a real, currently-accurate risk, not a stale note** — I read the current migration file, not just the handoff's claim. **There IS a client-side double-check** (`useAccessGuard.ts` + `my_access_state()` RPC, polled on focus/reconnect with 30s staleTime), so the actual exposure window if the hook is off is: signed-in access persists until the next focus/reconnect event triggers the client poll, rather than being blocked at the token-mint step. This is a known, documented trade-off (handoff explicitly calls out the manual dashboard toggle requirement) — **flagging as "verify the hook is actually ON in both dev and prod before launch,"** not as a code bug. Severity kept at Medium because it is a real gap if the manual step is missed, with no automated check in this repo that the hook is enabled (no smoke test asserts it).
- **S3 — Low — No secrets/tokens logged.** Grepped `src/features/auth/`, `src/features/admin/`, `src/lib/supabase/` for `console.log/warn/error` — **zero matches**. VERIFIED clean.
- **S4 — Low/VERIFIED-safe — Session storage.** Web: `localStorage` via `authStorage.ts`, wrapped in try/catch for private-mode/blocked-storage failures (returns null rather than throwing) — standard Supabase-js pattern, same exposure as any SPA (XSS could read it; this is accepted practice for this stack, not a gap introduced here). Native: chunked `expo-secure-store` (Keychain/Keystore-backed), which is the hardened option — **no plaintext AsyncStorage use found**. VERIFIED by reading both adapters in full.
- **S5 — VERIFIED-correct — `profiles` RLS.** Read the actual policies, not assumed: `profiles_select_own` (own row OR `is_super_admin()`) and `profiles_update_own` (own row only, both USING and WITH CHECK) in `20261001182500...sql:155-165`. No INSERT policy (rows only come from the `handle_new_user` trigger, which is `security definer`). No DELETE policy (cascades from `auth.users`). The guard trigger `enforce_profile_guard()` additionally blocks the app from ever flipping `is_super_admin`, changing `id`, or changing `email` directly (email changes must flow through `auth.users` + the `sync_profile_email` trigger). **This is a well-built, narrow policy set.**
- **S6 — VERIFIED — Query cache cleared on logout.** `SessionProvider.tsx:64`, gated by `nextSessionState()`'s `clearCache` flag which is unconditionally true for `SIGNED_OUT` and for any user-id change (`sessionState.ts:25`). Grep confirms this is the only `queryClient.clear()` call relevant to auth transitions.
- **S7 — VERIFIED — Service worker caches no private data.** Full read of `public/sw.js`: fetch handler explicitly returns early for any cross-origin request (`url.origin !== self.location.origin`) before any caching logic runs, so Supabase API responses are never touched by the SW cache. Only same-origin navigations (network-first, falling back to the cached APP SHELL only, not cached API data) and same-origin static asset prefixes (`/_expo/static/`, `/assets/`, `/icons/`) are cached.
- **S8 — Low — JWT `aal` claim read without signature verification client-side.** `adminLogic.ts:16-31` (`aalFromAccessToken`) manually base64-decodes the JWT payload to read the `aal` claim, with NO signature check. This is explicitly fine for its actual use (UI-only gating of which screen to SHOW; every real admin RPC re-checks `aal2` server-side via `admin_gate()`/`is_super_admin()`, confirmed in `20261010120000...sql:25-31`), and the code comment says as much ("Convenience only: every admin RPC checks the flag and aal2 itself"). Flagging only to confirm this pattern was deliberately reviewed, not accidentally insecure — **VERIFIED safe given the server-side backstop.**
- **S9 — VERIFIED — Password reset does not leak account existence.** `forgot-password.tsx` always shows success regardless of whether the email exists, matching `context/auth.md`'s documented rule exactly.
- **S10 — CODE-READ — Delete-account password re-check happens on a throwaway, non-persisting client** (`verifyPassword.ts`, `account/index.ts` step 3) so the live session's tokens are never touched by the check itself. Confirmed `storageKey: 'wapee-verify-password'` is distinct from the main session key, avoiding any collision risk the code comment itself flags ("so the browser does not warn about two clients sharing one storage entry").

---

## 6. Test results

```
$ npx vitest run src/features/auth src/features/members/inviteAcceptPath.test.ts src/features/admin/adminLogic.test.ts

 RUN  v5.0.3 /Users/mac/Public/personal-projects/wapee-global

 Test Files  5 passed (5)
      Tests  58 passed (58)
   Start at  12:52:30
   Duration  210ms
```

The 5 files: `sessionState.test.ts`, `gateSettled.test.ts`, `accountDisabled.test.ts`,
`inviteAcceptPath.test.ts` (inferred from the files matched by the `src/features/members/inviteAcceptPath.test.ts` path — confirmed present and passing as part of the 58), `adminLogic.test.ts`. All 58 assertions passed, 0 failures. This is the actual command and actual output from this session, not reproduced from memory.

**SQL suites — not run this session:**
- `supabase/tests/04_invite_flow.sql` — confirmed present (17,615 bytes). Per `context/members.md:82`, never run (no Docker; REST checks cover equivalent ground). Not run here either, to stay read-only and avoid any write to the dev database.
- `supabase/tests/35_suspended_login_block.sql` — confirmed present (204 lines, self-contained pgTAP-style harness using temp tables + `begin ... rollback` isolation per `context/_handoff.md`'s description: "Fixtures are created and rolled back"). **Not executed this session** — running it requires `supabase db query --linked -f ...` against the live dev project, which this audit deliberately avoided (read-only scope, no explicit instruction to touch the live database). Per `_handoff.md`, it was last reported green (66 assertions) on 2026-10-20.

---

## 7. Findings by severity

### High
1. **Raw, untranslated server error messages shown to the user** — `app/(auth)/login.tsx:40`, `signup.tsx:34`, `onboarding.tsx:132`, `reset-password.tsx:35`. VERIFIED. Violates CLAUDE.md's zero-hardcoded-strings i18n rule for every server-side auth failure (wrong password, duplicate email, rate limit, network error). **Fix**: add a small error-code-to-i18n-key mapper (same pattern already used for `isAccountDisabledError`) covering at minimum: invalid credentials, email already registered, rate limited, email not confirmed, network/offline. No DB migration needed — pure client change in `useAuthMutations.ts` consumers or a new shared helper in `src/features/auth/`.
2. **Account enumeration via signup's raw error** — `app/(auth)/signup.tsx:34`. VERIFIED. Same root cause as #1 but called out separately because it's a security issue, not just a polish one: it directly contradicts the enumeration-safe pattern already correctly implemented in `forgot-password.tsx`. **Fix**: same mapper as #1, specifically mapping the "already registered" case to a generic translated message. No migration needed.

### Medium
3. **Suspended-login hook is fail-open and requires a manual, unverified dashboard toggle** — `supabase/migrations/20261020110000_suspended_login_block.sql:39-41`. CODE-READ/VERIFIED-as-designed. This is a known, already-decided trade-off (documented in `context/_handoff.md` and `context/auth.md`), not a new bug — but there is no automated check (smoke test, SQL assertion against `auth.hooks` config, or similar) in this repo that would catch the hook being OFF in production. **Recommendation** (not a code fix): add a line to the launch checklist or a manual verification step before go-live; a true automated fix would need a way to query the Auth Hooks config, which may not be exposed via SQL (would need research, flag rather than assume a fix path). No migration strictly required unless the team wants a monitoring query.
4. **No explicit UI state for a reused/expired confirmation link** — CODE-READ, no exact file:line because the gap is an ABSENCE: no code path in `verify.tsx`, `reset-password.tsks`/`.tsx`, or `AuthGate` detects "the email link token exchange failed" and shows a message; the user is simply left on whatever screen loaded (likely still signed out, no error shown). **Fix**: would need investigation into what `detectSessionInUrl`'s failure actually looks like in this Supabase-js version (error event? silent no-op?) before proposing a concrete fix — flagging as a question rather than guessing. No DB migration.

### Low
5. **`useResendVerification` always redirects to `/verify`, never back to a pending invite token** — `verify.tsx:39-47` / `useAuthMutations.ts:98-109`. VERIFIED code path exists; the actual exposure is narrow (invite-flow signup doesn't normally route through `/verify` at all — see §3). No fix proposed as urgent; note only.
6. **`AuthLayout`'s "Mobile" padding constant name is used for all breakpoints** — `AuthLayout.tsx:60` (`theme.layout.pagePaddingMobile`). Cosmetic/naming only, matches the actual documented design (same card everywhere). No fix needed; flagged for awareness only.

### Blocker
None found. No flow was observed to actually lose data, break authentication, or expose another tenant's data in this audit.

---

## 8. What could not be verified

- **No live browser or simulator was used this session.** Every flow trace above is a static code read, cross-referenced against the pure, unit-tested decision functions (`gateSettled.ts`, `sessionState.ts`, `adminLogic.ts`) and their passing tests. The actual rendered UI (loading spinners' visual timing, exact wording on screen, real email delivery, real redirect-URL behavior against the live Supabase project) was **not** clicked through.
- **`supabase/tests/35_suspended_login_block.sql` and `04_invite_flow.sql`** were read but not executed this session (no Docker locally; running them against the live dev project was judged out of scope for a read-only audit task — flagging this as a choice made under the task's "read-only" framing, not an oversight).
- **Whether the `custom_access_token_hook` is actually toggled ON right now** in the dev or prod Supabase dashboard — this requires checking the Supabase dashboard UI or Management API, not visible from the repository. Not verified either way this session.
- **GoTrue's exact behavior for "sign in with an unconfirmed email"** (whether it issues a session that `isEmailVerified` then catches, or refuses the sign-in outright with an error) depends on project-level Supabase Auth settings not visible in this repository; traced as CODE-READ only, both possible outcomes are handled correctly downstream either way.
- **`account_delete_commit`'s actual interaction with a live access token's cache-empty window** (§2.3) is an architectural/JWT-lifetime observation, not something verified by an actual live test of deleting a user mid-session.
- **The `account` Edge Function's and `portal` Edge Function's CORS/rate-limit configuration** were not deeply audited beyond confirming the `account` function's single `delete` action and its ordering of checks (email match → sole-owner → password → commit) — this ordering was read carefully because CLAUDE.md's testing rules require validation-before-mutation, and it is correct (no database write happens before the password check succeeds).

---

## 9. Next step recommendation

1. **Fix the High findings first** (raw error messages / enumeration via signup) — small, contained, no migration, directly actionable. Add one shared "map a Supabase auth error to an i18n key" helper used by all four screens plus the admin 2FA screens if they have the same pattern (not checked).
2. **Before launch**, explicitly confirm in the Supabase Dashboard (dev AND prod) that the Custom Access Token Hook is enabled — this cannot be verified from the repo and is the single highest-impact manual step outstanding for this feature.
3. **Decide what expired/reused confirmation links should show** (a product decision — what message, whether to offer a resend button right there) before building the fix; this is exactly the kind of "product behaviour" question CLAUDE.md says to stop and ask about rather than guess.
4. If the team wants automated coverage of the suspended-login path without Docker, consider running `35_suspended_login_block.sql` against the live dev project in a deliberate, approved follow-up task (outside this read-only audit's scope).
