# QA Audit — Feature 1: Signup, Email Confirmation, Login, Logout

Date: 2026-10-14 · Branch: `dev` · Audit type: code review + unit tests only (read-only, no browser).

This audit traces owner self-signup, login, logout, session restore, and the
invite-link signup flow (for comparison), against the actual current code —
not against `context/_handoff.md`'s notes, which are verified below rather
than trusted blindly.

**Update 2026-10-14: F1 fixed.** All 6 call sites now use a new `authErrorKey()`
helper (`src/features/auth/authErrorKey.ts`) that maps the Supabase/Postgrest
error's `code`/`status` to an `auth.errors.*` i18n key, same pattern as
`adminLogic.ts`'s `adminErrorKey`. The duplicate-email signup case (F2) was
resolved per the product decision taken with this fix: show a friendly,
specific "that email already has an account" message rather than full
enumeration-safe masking (forgot-password's stronger "always claim success"
behaviour is intentionally untouched, as is `accept-invite.tsx`'s own
generic-failure design for its other cases). See `context/auth.md`'s
2026-10-14 changelog entry for the full file list and test counts.

---

## 1. Scope & files involved

**Routes**
- `app/(auth)/_layout.tsx` — group Stack + `NoIndexHead`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/onboarding.tsx`
- `app/(auth)/verify.tsx`
- `app/(auth)/reset-password.tsx`
- `app/(auth)/forgot-password.tsx`
- `app/(auth)/accept-invite.tsx` (invite-based join, different flow)
- `app/index.tsx` — redirects to `/today`
- `app/_layout.tsx` — root: `SessionProvider` > `AdminAccessGate` > `AuthGate` > `Stack`

**Auth feature code**
- `src/features/auth/sessionState.ts` / `.test.ts`
- `src/features/auth/SessionProvider.tsx`
- `src/features/auth/gateSettled.ts` / `.test.ts`
- `src/features/auth/accountDisabled.ts` / `.test.ts`
- `src/features/auth/index.ts`
- `src/features/auth/schemas/auth.schemas.ts`
- `src/features/auth/components/PasswordField.tsx`
- `src/features/auth/components/AuthLayout.tsx`
- `src/features/auth/components/AuthGate.tsx`
- `src/features/auth/components/RouteGuard.tsx`
- `src/features/auth/api/useAccessGuard.ts`
- `src/features/auth/api/useAuthMutations.ts`
- `src/features/admin/components/AdminAccessGate.tsx`
- `src/features/admin/adminLogic.ts` (pure 2FA/aal2 + redirect logic, `.test.ts`)
- `src/features/onboarding/api/useBusiness.ts` (`useMyBusinesses`, `useCreateBusiness`, `useSlugAvailable`)

**Supabase client / storage**
- `src/lib/supabase/client.ts` — client config (`persistSession`, `detectSessionInUrl`, `processLock`)
- `src/lib/supabase/authStorage.ts` (web: `localStorage`)
- `src/lib/supabase/authStorage.native.ts` (native: chunked `SecureStore`)
- `src/lib/supabase/useSupabaseAutoRefresh.ts` (native foreground refresh)

**Members/invite (traced for comparison only)**
- `src/features/members/inviteUrl.ts`, `inviteAcceptPath.ts` (+ test)
- `src/features/members/components/InviteMemberForm.tsx`
- `src/features/members/schemas/invite.schemas.ts`
- `src/features/members/api/useMembers.ts`

**SQL / migrations read in full**
- `20261001182500_foundation_profiles.sql` — `profiles`, `handle_new_user`, `enforce_profile_guard`, `is_super_admin()`, RLS
- `20261001190500_fix_rls_and_function_grants.sql` — enables RLS on `business_members`, locks down helper grants
- `20261002093000_create_business_with_owner.sql` — signup transaction, `is_slug_available`, `write_audit_log`
- `20261010120000_phase8a_super_admin_requires_aal2.sql` — `platform_flag()`, `is_super_admin()` now requires aal2, `admin_gate()`
- `20261018090000_account_deletion.sql` — `account_delete_blockers`, `account_delete_commit`
- `20261018110000_account_email_sync_and_audit.sql` — `sync_profile_email` trigger, `log_account_event`
- `20261020110000_suspended_login_block.sql` — `user_is_disabled`, `custom_access_token_hook`, `revoke_sessions_of_disabled_members`, `my_access_state`, `set_business_status`

**Edge Functions**
- `supabase/functions/account/index.ts` — account deletion (password re-verify + typed email confirm, service-role commit)

**Service worker**
- `public/sw.js`

**i18n**
- `src/lib/i18n/locales/en/common.json` (`auth.*` namespace)

**Existing SQL test suites**
- `supabase/tests/04_invite_flow.sql` — **never run** (no Docker on this machine; per `context/members.md`/`_handoff.md`, confirmed still the case, no Docker found)
- `supabase/tests/35_suspended_login_block.sql` — 66 assertions (per handoff; not re-run in this session, read-only audit, see §6)

**Unit tests run for real** — see §6.

---

## 2. Flow traces

### 2.1 Owner self-signup → confirmation email → link → first screen → onboarding
1. `signup.tsx` submits `useSignup()` → `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: redirectTo('/verify') } })` (`src/features/auth/api/useAuthMutations.ts:59-75`).
2. Supabase inserts `auth.users`; `handle_new_user()` trigger (AFTER INSERT) creates the matching `public.profiles` row (`20261001182500_foundation_profiles.sql:103-126`). **CODE-READ.**
3. No session yet (`data.session` is null while email confirmation is required) → `signup.tsx:32-33` routes to `/verify?email=...`.
4. `verify.tsx` shows a waiting screen + resend button; a `useEffect` watches `useSession()` and once `isAuthenticated && isEmailVerified` it `router.replace('/')` (`app/(auth)/verify.tsx:28-30`).
5. Opening the email link signs the user in client-side (Supabase `detectSessionInUrl` on web, `20261001...client.ts:23`); `onAuthStateChange` fires `SIGNED_IN`; `SessionProvider` updates `session`; `isEmailVerified` flips true (`Boolean(session?.user.email_confirmed_at)`, `SessionProvider.tsx:79`).
6. `AuthGate`'s pure decision function, `authGateDecision()` (`gateSettled.ts:81-127`), now sees `isAuthenticated && isEmailVerified`, `hasBusiness = false` (fresh signup, `useMyBusinesses()` returns `[]`), not on onboarding/accept-invite → redirects to `/onboarding`.
7. `onboarding.tsx` → `useCreateBusiness()` → RPC `create_business_with_owner` (one transaction: business + branch + Owner `member_role_assignments` + `profiles.default_business_id` + 14-day trial + audit row). Validates everything (one-trial-per-person, slug availability) **before any insert** — correct ordering per CLAUDE.md §5 (`20261002093000...sql:88-168`). **VERIFIED (code-read, logic traced statement by statement).**
8. On success, invalidates `['businesses','mine']`; `AuthGate` re-evaluates, `hasBusiness` becomes true, redirects away from `(auth)` to `/` → `app/index.tsx` redirects to `/today`.

No gaps found in this path. The known cold-load bug (AuthGate unmounting children) is fixed and unit-tested (`gateSettled.test.ts`); confirmed the current `AuthGate.tsx` (lines 64-74) always renders `children` and overlays the spinner — matches the handoff's description exactly. **VERIFIED by reading the current file, not by trusting the handoff note.**

### 2.2 Login — correct / wrong credentials
- `useLogin()` is a thin wrapper: `supabase.auth.signInWithPassword` → `toError(error)` throws `new Error(error.message)` on failure (`useAuthMutations.ts:45-52`).
- Wrong credentials: Supabase returns `Invalid login credentials` (or similar) as `error.message`; `login.tsx:36-41` shows it **verbatim, in English, untranslated** (see §4 Finding F1).
- Correct credentials: `onSuccess: () => router.replace('/')`; the session listener in `SessionProvider` has already updated state by the time this fires (mutation awaits the SDK call, which resolves after `onAuthStateChange` has typically already fired for `signInWithPassword`). `AuthGate` then redirects per `authGateDecision()`.

### 2.3 Login — unconfirmed email
- Supabase's own behavior: `email_confirmed_at` stays null, but **whether `signInWithPassword` succeeds for an unconfirmed user depends on the project's "Confirm email" setting** — `context/auth.md` states confirmation is ON, meaning Supabase refuses sign-in until confirmed (typical GoTrue behavior: "Email not confirmed" error). **UNVERIFIED over HTTP** (no live test performed this session); CODE-READ only confirms the client-side fallback: if a session *were* issued pre-confirmation, `AuthGate` would redirect such a user to `/verify` (`gateSettled.ts:114-116`), which is correct defense-in-depth either way.

### 2.4 Login — suspended business
- Server: `custom_access_token_hook` runs on sign-in and token refresh (not just the dashboard RLS). If `user_is_disabled(uid)` is true, it returns `{error: {http_code: 403, message: 'This account is disabled. Contact support@wapee.online'}}` (`20261020110000...sql:30-41`). **The hook is FAIL-OPEN**: any exception inside returns the event unchanged (line 39-40 `exception when others then return event`), and this is only enforced **if the Supabase Dashboard > Authentication > Hooks > Custom Access Token hook is manually switched on** — confirmed by reading the migration; nothing in it self-registers the hook. **This matches the handoff's claim exactly — VERIFIED against current code, not assumed.**
- Client-side double-check: `useAccessGuard()` (mounted inside `AuthGate`, always runs while authenticated) calls RPC `my_access_state()` on focus/reconnect (staleTime 30s) and signs out locally (`scope: 'local'`) the moment it reads `disabled: true` (`useAccessGuard.ts:18-41`). This is a real second layer — if the dashboard hook is OFF, a suspended user can still complete a fresh sign-in (slips past the hook) but gets caught and force-signed-out within 30s of the first focus/reconnect, **not instantly at the login screen**. **CODE-READ, logic confirmed; not verified live** (would need the hook toggled off against a real suspended fixture — out of scope for a read-only audit).
- `login.tsx` shows `auth.accountDisabled` when `isAccountDisabledError(error)` matches `/account is disabled/i` against the hook's own error message (`accountDisabled.ts:4-8`, `login.tsx:38-40`) — this is the one login-error case that IS correctly translated and intentional, unlike the generic path (contrast with Finding F1).

### 2.5 Login — expired trial
- Not blocked at login at all, by design: `authGateDecision()` doesn't look at business status. The lock is applied downstream by `RouteGuard` → `ActiveBusinessGate` (`RouteGuard.tsx:14-32`), which the login flow does not touch. `/settings`, `/billing`, `/more` stay reachable per `context/auth.md`/`billing.md`. **CODE-READ**, matches documented design — not a bug, an intentional separation.

### 2.6 Login — user with no business / several businesses
- No business: `authGateDecision()` sends to `/onboarding` (confirmed above).
- Several businesses: `useMyBusinesses()` returns every active membership (RLS-scoped select, no manual filter, `useBusiness.ts:46-72`); `hasBusiness` is simply `.length > 0`. The actual "land in business X" choice reads `profiles.default_business_id` per `context/auth.md:7` — **not traced further** (out of scope: that's the business-switcher feature, not signup/login).

### 2.7 Login — super admin with 2FA
- `AdminAccessGate` sits **outside** `AuthGate` in `app/_layout.tsx:61-62` wrapping it. For a flagged super admin, `useAdminAccess()` reads the JWT `aal` claim; `adminAccess()` returns `needs_2fa` when flagged but aal1 (`adminLogic.ts:87-95`); `adminRedirect()` forces `/admin/2fa` until aal2 (`adminLogic.ts:102-114`). Crucially, `is_super_admin()` itself was redefined to require `aal2` in the JWT (`20261010120000...sql:16-21`), so **even if the client-side gate were bypassed, every RLS policy and RPC using `is_super_admin()` (≈55 call sites per the migration's own comment) refuses an aal1 super-admin session server-side too** — real defense in depth, not just UI gating. **VERIFIED (code-read of both the client gate and the DB function).**

### 2.8 Logout
- `useSignOut()`: best-effort `disablePush()` (push token cleanup, swallowed on failure so it can never trap a signed-in session) then `supabase.auth.signOut()` (`useAuthMutations.ts:111-123`).
- `SessionProvider`'s `onAuthStateChange` listener receives `SIGNED_OUT`; `nextSessionState()` returns `clearCache: true` whenever `event === 'SIGNED_OUT'` (`sessionState.ts:25`); `SessionProvider.tsx:64` then calls `queryClient.clear()`. **VERIFIED**: query cache clearing on logout is real and unit-tested (`sessionState.test.ts`), not just a comment.

### 2.9 Session restore after browser restart
- `SessionProvider` calls `supabase.auth.getSession()` once on mount (`SessionProvider.tsx:50-55`), reading from `authStorage` (web: `localStorage`, native: chunked `SecureStore`). `loading` starts `true` only `if (isSupabaseConfigured)` and flips false once resolved. `AuthGate` renders `'wait'` (spinner overlay, tree never unmounted) until `loading` is false (`gateSettled.ts:103`). **VERIFIED by code read**; not click-tested in a real browser (no browser tool available this session).

### 2.10 Session expiry / refresh
- Web: Supabase's own `autoRefreshToken: !isServer` (`client.ts:20`) — handled internally by `supabase-js`, standard behavior, not reimplemented here.
- Native: `useSupabaseAutoRefresh()` starts/stops `auth.startAutoRefresh()`/`stopAutoRefresh()` on `AppState` change (foreground/background), per Supabase's own documented recommendation (`useSupabaseAutoRefresh.ts`). **CODE-READ**, matches the library's recommended pattern.

### 2.11 Two tabs
- `supabase-js` re-emits `SIGNED_IN`/`TOKEN_REFRESHED` on every tab refocus for the *same* user. `nextSessionState()` explicitly keeps this silent (no cache clear, same session object returned when the access token is unchanged) — this was a **real bug fixed on 2026-10-09** per the changelog, and the fix is present and unit-tested (`sessionState.test.ts`, confirmed passing). **VERIFIED.**
- `AuthGate`/`AdminAccessGate` additionally use `useGateSpinner()` so a later "pending" flip for the *same* user id never re-shows the full-screen spinner (`gateSettled.ts:9-16`, tested). **VERIFIED.**

### 2.12 Deleted user with a live session
- `account_delete_commit(p_user_id)` (service_role only, called from the `account` Edge Function after password re-verification) does, in one transaction: removes `member_role_assignments`, `business_members`, `push_tokens`/`push_preferences`, anonymises `profiles` (email → `deleted-<uuid>@deleted.invalid`, `deleted_at = now()`), writes an audit row, then **`delete from auth.users where id = p_user_id`** (`20261018090000_account_deletion.sql:128-138`). Deleting the `auth.users` row cascades to `auth.sessions`/`auth.refresh_tokens`/`auth.identities`/MFA factors via Supabase's own schema (standard GoTrue FK `ON DELETE CASCADE`), which kills any live session **at the database level** — not just locally. **CODE-READ**; the cascade behavior itself is Supabase/GoTrue-internal schema (not redefined in this repo), so the FK's existence was not independently re-verified by inspecting `auth.*` table DDL in this session — reasonable to trust (standard GoTrue schema) but flagged as **UNVERIFIED (assumed from standard GoTrue schema, not re-checked against the live project's actual `auth.sessions` FK definition)**.
- The Edge Function (`supabase/functions/account/index.ts`) validates in the correct order per CLAUDE.md §5: typed-email match → RPC blockers (sole owner) → password re-verify (throwaway sign-in) → commit. Idempotent on retry (a second call gets `401` because the JWT no longer verifies). **VERIFIED (full file read).**

### 2.13 Signup from landing page vs. invite link
These are genuinely different flows, confirmed by reading both:

| | Landing-page signup | Invite-link signup |
|---|---|---|
| Entry | `/signup` | `/accept-invite?token=…` |
| Email | user-chosen, editable | **fixed by the token**, not editable (`accept-invite.tsx:166-170`) |
| `emailRedirectTo` | `/verify` (default) | `inviteAcceptPath(token)` — keeps the token through confirmation (`accept-invite.tsx:144`, `useAuthMutations.ts:21`) |
| Post-confirm | `/verify`'s effect sends to `/` once verified | same screen auto-accepts via a `useEffect` watching `sameAccount` (no button) (`accept-invite.tsx:79-84`) |
| First business | created by `create_business_with_owner` (new business + trial) | **joins an existing business** via `accept_invite(token)` (membership + role already assigned at invite time) |
| Gate behavior | redirected to `/onboarding` while `hasBusiness` is false | **never** redirected to onboarding while on this screen (`ONBOARDING_ROUTE`/`ACCEPT_INVITE_ROUTE` both excluded in `gateSettled.ts:121`), and `shouldWaitForRejoin()` makes the gate wait rather than race the stale "zero businesses" cache during the accept (`gateSettled.ts:41-48`) |

Both correctly end up signed in with at least one business; the invite path's extra wait-state handling (`shouldWaitForRejoin`) exists specifically because this comparison surfaced a real, now-fixed bug (the 2026-10-12 cold-load incident, confirmed still fixed in current code). **VERIFIED.**

---

## 3. Edge cases checked

| Case | Status | Finding |
|---|---|---|
| Duplicate email signup | CODE-READ | No special handling anywhere in the signup path (`grep` for `already_registered`/`email_exists` returns nothing); Supabase's raw "User already registered" error surfaces via `error.message` in `signup.tsx:34`. See F2 (account enumeration). |
| Weak password | VERIFIED | `passwordSchema` enforces 8–72 chars client-side (`auth.schemas.ts:18-22`); Supabase's own floor (6) and bcrypt ceiling (72) are respected. Server-side, Supabase re-validates on its own minimum; no project-level stronger policy was found configured in this repo (strength beyond length is Supabase Pro-gated — `leaked-password protection` noted as unavailable on the Free plan per `_handoff.md` "Open items", unrelated to this feature but worth noting it is NOT a regression, it's a known/accepted gap). |
| Resend confirmation email | VERIFIED | `useResendVerification()` calls `auth.resend({ type: 'signup', ... })` (`useAuthMutations.ts:98-109`); `verify.tsx` wires success/error toasts. Error path again shows raw `error.message` (F1). |
| "Email rate limit exceeded" handling | CODE-READ / gap | No code anywhere maps Supabase's 429 rate-limit response to a friendly message — it would surface via the same raw-`error.message` path as every other auth error (F1). `context/auth.md` documents the rate limit as a known *development-environment* limitation (Supabase's built-in mailer), expected to be resolved by Resend in Phase 6 — but Phase 6 is marked done elsewhere in the handoff for notifications; **it was not verified whether auth emails (signup confirm / password reset) still route through Supabase's built-in mailer or have moved to Resend** — this needs a direct check, flagged under §8. |
| Confirmation link reused | UNVERIFIED | Standard Supabase behavior (token consumed on first use) was not independently re-tested live this session; no app code re-implements or weakens this. |
| Confirmation link expired | UNVERIFIED | Same — relies entirely on Supabase's own link TTL; not tested live. |
| Wrong/unlisted redirect URL | CODE-READ | `redirectTo()` builds `window.location.origin + path` on web / `Linking.createURL(path)` natively (`useAuthMutations.ts:32-38`); `context/auth.md:64-78` documents that every one of these must be separately whitelisted in the Supabase dashboard — this is a **manual, out-of-repo configuration step**, not verifiable by code reading; if a new preview/deploy origin is added without a matching dashboard entry, the link silently bounces. Noted as a known operational trap, not a code bug. |
| Cold load of a route with `#access_token=` in the hash | VERIFIED | This is exactly the class of bug the 2026-10-12 fix addressed. Current `AuthGate`/`AdminAccessGate` never unmount `children` (confirmed by reading both files directly, not from the handoff alone) — the specific failure mode (`useLinking.js`'s `onStateChange` rewriting the URL) cannot recur through this mechanism anymore. **Not re-verified in a live browser this session** (no browser tool); verification rests on the previous session's recorded live-browser trace plus this session's static confirmation that the fix is still present in the code. |

---

## 4. UI / i18n findings

- **Loading states**: present and consistent — `AuthGate`/`AdminAccessGate` overlay spinners (never blank), `accept-invite.tsx` shows a centred `Spinner` while `preview.isPending`, `RouteGuard` shows a skeleton while permissions load. **VERIFIED (code read)**.
- **Empty/error states**: `accept-invite.tsx`'s `InviteProblem` component is a proper empty/error state with a way back (`Back to login`). The core login/signup/reset/onboarding screens show inline error banners (red box + text) rather than a dedicated `ErrorState` component — acceptable for a form-level error, consistent across all four screens.
- **F1 — Untranslated / raw error messages (High, see §7)**: `login.tsx:40`, `signup.tsx:34`, `reset-password.tsx:35`, `onboarding.tsx:132`, `verify.tsx:44`, `accept-invite.tsx:157` all pass Supabase/Postgres `error.message` straight to the user. This directly contradicts CLAUDE.md's "zero hard-coded user strings" / i18n rule. The i18n file already defines `auth.errors.generic` (`common.json`) but **it is never referenced anywhere in the codebase** (confirmed by `grep -rn "errors.generic"` across `src/` and `app/` — zero hits). The admin area (`adminLogic.ts`'s `ADMIN_ERROR_KEYS` / `unwrapAdminResult`) demonstrates the correct pattern already exists elsewhere in this codebase, making this an inconsistency rather than a missing capability.
- Keyboard/autofill attributes: correctly set across the board — `autoComplete="email"`/`"current-password"`/`"new-password"`/`"name"`, matching `textContentType`, `keyboardType="email-address"`, `returnKeyType` chaining into `onSubmitEditing`. **VERIFIED by reading every screen.**
- Mobile/desktop layout: `AuthLayout` is a single centred-card layout reused by every screen (`context/auth.md:88-90`: "Mobile and desktop are the same centred card; only page padding changes") — **plausible from code structure, but NOT independently verified visually this session** (no browser/simulator tool available). Explicitly not claiming visual verification.
- i18n coverage otherwise: all labels/placeholders/titles across login/signup/forgot/reset/verify/onboarding/accept-invite use `t('auth.*' | 'onboarding.*' | 'members.*')` keys — no other hard-coded user-facing strings were found in these files besides the `error.message` cases above.

---

## 5. Security findings

- **No account enumeration on password reset**: `forgot-password.tsx` always renders the "Check your email" success state regardless of whether `forgot.mutate` actually found an account (`forgot-password.tsx:29-42`); the i18n copy itself says "If an account exists for {{email}}…" (`common.json`, `auth.forgot.sentBody`). **VERIFIED — this is done correctly.**
- **F2 — Account enumeration via signup (Medium, see §7)**: unlike forgot-password, `signup.tsx` has no equivalent masking; a duplicate-email signup attempt will surface Supabase's distinguishing error text (via the F1 raw-message path), letting an attacker test which emails already have accounts. CODE-READ, not reproduced live.
- **No secrets/tokens logged**: `grep -n "console.log"` across `src/features/auth` and `app/(auth)` returns zero hits. **VERIFIED.**
- **Session storage**: web uses `localStorage` (raw JWT, Supabase's own default pattern — not encrypted at rest, standard tradeoff for SPA auth, not flagged as a bug); native uses chunked `expo-secure-store` (Keychain/Keystore-backed, appropriately more protected). **VERIFIED by reading both adapters.**
- **`profiles` RLS**: `profiles_select_own` — own row OR `is_super_admin()` (now aal2-gated); `profiles_update_own` — own row only, both `using` and `with check`; no INSERT policy (rows only via trigger) and no DELETE policy (cascades from `auth.users`). The `enforce_profile_guard` trigger additionally blocks any attempted change to `is_super_admin`, `id`, or `email` from an authenticated session (only a service-role/superuser connection can flip the flag). **VERIFIED by reading `20261001182500_foundation_profiles.sql` in full — this matches CLAUDE.md's RLS rules correctly.**
- **Query cache cleared on logout**: confirmed in code (`sessionState.ts:25`, `SessionProvider.tsx:64`) and in the passing unit tests. **VERIFIED.**
- **PWA service worker**: `public/sw.js`'s fetch handler explicitly skips cross-origin requests (`if (url.origin !== self.location.origin) return`) — Supabase API calls go straight to network, never touch the cache. Only same-origin navigations (network-first, falling back to the cached app shell when offline) and content-hashed static assets (`/_expo/static/`, `/assets/`, `/icons/`) are cached. **VERIFIED — no private/API data is cached.**
- **Suspended-login fail-open hook**: confirmed verbatim in the migration (§2.4) — this is a known, already-decided tradeoff (manual dashboard toggle required), not a newly discovered bug. Flagging again here only because the task explicitly asked to verify, not assume, it.
- **Super admin 2FA enforcement**: confirmed enforced at the database function level (`is_super_admin()` requires aal2 in the JWT, not just a UI gate) — stronger than "known, already-decided trade-off," this is genuinely defense-in-depth. **VERIFIED.**

---

## 6. Test results

Ran directly (not estimated, not from memory):

```
$ npx vitest run src/features/auth/sessionState.test.ts src/features/auth/gateSettled.test.ts \
    src/features/auth/accountDisabled.test.ts src/features/members/inviteAcceptPath.test.ts
 Test Files  4 passed (4)
      Tests  37 passed (37)
```

```
$ npx vitest run        # full suite, once, per task instructions
 Test Files  68 passed (68)
      Tests  780 passed (780)
   Duration  5.02s
```

**`supabase/tests/04_invite_flow.sql` and `35_suspended_login_block.sql` were NOT run this session** — no Docker is installed on this machine (confirmed: this matches the long-standing note in `context/members.md`/`_handoff.md`); running pgTAP suites requires either Docker or a live database connection via the Supabase connector, neither of which this read-only audit used. This is a pre-existing, documented limitation, not something newly discovered.

---

## 7. Findings by severity

### High
- **F1 — Auth error messages are raw, untranslated Supabase/Postgres text, not i18n keys.**
  Files: `app/(auth)/login.tsx:40`, `app/(auth)/signup.tsx:34`, `app/(auth)/reset-password.tsx:35`, `app/(auth)/onboarding.tsx:132`, `app/(auth)/verify.tsx:44`, `app/(auth)/accept-invite.tsx:157`.
  Verification: **VERIFIED** (read every file; confirmed `auth.errors.generic` exists in `src/lib/i18n/locales/en/common.json` but has zero references via `grep -rn "errors.generic" src/ app/`).
  Impact: violates CLAUDE.md's "zero hard-coded user strings" rule; non-English users see English technical error text; could leak internal error phrasing (e.g. Postgres/GoTrue wording) to end users.
  Smallest fix: add a small mapper (mirroring `adminLogic.ts`'s `ADMIN_ERROR_KEYS` pattern) that maps known Supabase auth error codes/messages (invalid credentials, user already registered, rate limited, weak password) to `auth.errors.*` i18n keys, falling back to `auth.errors.generic`; apply at each of the 6 call sites. No DB migration needed — pure client-side TypeScript + i18n JSON.

### Medium
- **F2 — Signup duplicate-email path is not enumeration-safe (unlike forgot-password).**
  Files: `app/(auth)/signup.tsx:28-36` (consequence of F1's raw-message display combined with no duplicate-email branch).
  Verification: **CODE-READ** (confirmed no `already_registered`/`email_exists` handling anywhere via repo-wide grep); **not reproduced live** (would require an actual duplicate signup attempt against the dev project).
  Impact: lets an attacker enumerate registered emails via the signup form, inconsistent with the deliberate masking already implemented for forgot-password.
  Smallest fix: once F1's mapper exists, either (a) map the "already registered" code to a generic message that does not confirm existence (weakest UX, strongest privacy) or (b) accept the product tradeoff of a clear "that email is taken" message (common SaaS pattern) — **this is a product decision, not something to silently fix**: flag per CLAUDE.md §4 ("STOP and ask... product behaviour"). No migration needed.

### Low
- **F3 — Unverified claim: whether auth emails (signup confirmation, password reset) still route through Supabase's built-in rate-limited mailer or have moved to Resend.**
  Verification: **UNVERIFIED** — `context/auth.md` documents the Supabase built-in sender as "temporary... Resend replaces this in Phase 6," and `_handoff.md`'s Phase 6 entries describe Resend wiring for *notifications* (`send_outbox`), but this audit did not find explicit code routing `auth.signUp`/`resetPasswordForEmail`'s emails through anything other than Supabase's own mailer (those are GoTrue-internal, not app-triggered sends — Resend cannot intercept them without a custom SMTP/webhook setup in the Supabase dashboard, which is an out-of-repo config). Likely still on Supabase's built-in mailer with its original rate limits; worth a direct confirmation rather than assuming Phase 6 covered it.
  Smallest fix: none in code — a documentation/configuration check (dashboard SMTP settings), not a migration.
- **F4 (informational, not a defect) — `localStorage` session storage on web is unencrypted at rest.**
  Verification: **VERIFIED** (`authStorage.ts`). This is Supabase's own standard pattern for web SPA session storage and is not being flagged as something to fix — noted for completeness per the task's explicit ask to check storage. No action recommended.

### Intentional / already-decided (not defects)
- Suspended-login hook is fail-open and requires a manual dashboard toggle (`context/_handoff.md`, confirmed against current migration code in §2.4/§5).
- Super admin 2FA is enforced both client-side (`AdminAccessGate`) and server-side (`is_super_admin()` requires aal2) — decided and shipped per `_handoff.md` Phase 8A/8B.
- Expired-trial lock is deliberately not a login-time block (`RouteGuard`/`ActiveBusinessGate` downstream), matching the documented design in `context/auth.md`/`billing.md`.
- `supabase/tests/04_invite_flow.sql` has never run (no Docker) — pre-existing, documented limitation, re-confirmed this session.
- Android is never run here (per CLAUDE.md §12) — no Android-specific claims made in this report.

---

## 8. What could not be verified

- No browser or simulator tool was available this session. **Every UI/flow claim above is CODE-READ, not click-tested.** Specifically not verified live: actual confirmation-email delivery and link behavior, wrong-password error rendering in a real browser, the suspended-login hook's live behavior with the dashboard toggle on/off, the deleted-user cascading-session behavior against the live `auth.sessions` schema, two-tab behavior in a real browser, and the "cold load with `#access_token=` in the hash" scenario (previously verified live in a prior session per the handoff, not re-verified now).
- `supabase/tests/04_invite_flow.sql` and `35_suspended_login_block.sql` were not executed (no Docker).
- Whether auth emails have moved off Supabase's built-in mailer (F3) was not conclusively determined from code alone.
- Whether `auth.sessions`/`auth.refresh_tokens` actually cascade-delete from `auth.users` in this specific Supabase project version was assumed from standard GoTrue schema, not independently queried.
- Mobile vs. desktop visual layout of `AuthLayout` was not visually confirmed (no screenshots taken this session — screenshots were explicitly out of scope for a code-only audit, and the task's own framing allowed stating this rather than claiming verification).

---

## 9. Next step recommendation

1. Decide (product owner, not engineering) how duplicate-email signup should behave (F2) — this gates the exact fix for F1 at that one call site.
2. Build the i18n error-key mapper for auth errors (F1), mirroring the existing `adminLogic.ts` pattern, and wire it into all 6 call sites — small, no migration, no schema change.
3. Separately confirm (dashboard check, not code) whether signup/reset emails are still on Supabase's built-in mailer or have been moved to a custom SMTP/Resend setup (F3), and update `context/auth.md`'s "temporary" note accordingly either way.
4. When Docker or a live-browser session is available, re-run `35_suspended_login_block.sql` and do one live click-through of: wrong password, duplicate signup, and the suspended-login path with the dashboard hook both on and off, to convert the CODE-READ/UNVERIFIED items above into VERIFIED.
