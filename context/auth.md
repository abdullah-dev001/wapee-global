# Auth
Status: in progress · Phase: 1 · Last updated: 2026-10-02

## What it does
Email + password sign-up and sign-in with email verification, password reset, and
session handling. One user can belong to several businesses; the business they
land in comes from `profiles.default_business_id` (switcher arrives with onboarding).

## Business rules
- **Email + password only.** No social login yet (product doc §4 lists it as future).
- **Email verification is ON.** Supabase issues no session until the address is confirmed, so a new user waits on `/verify`.
- Password: minimum 8 characters (Supabase's own floor is 6), maximum 72 (bcrypt limit).
- Forgot-password **always reports success**, even for an unknown address, so the form cannot be used to discover which emails have accounts.
- Signing out clears the whole TanStack Query cache, so no tenant data survives a user switch.
- `is_super_admin` is a profile flag set only by hand in SQL; the app can never change it (DB trigger).

## Files
| Path | Purpose |
|---|---|
| app/(auth)/login.tsx | Sign in |
| app/(auth)/signup.tsx | Create account (owner self-serve) |
| app/(auth)/forgot-password.tsx | Request a reset link |
| app/(auth)/reset-password.tsx | Set a new password (opened from the email link) |
| app/(auth)/verify.tsx | Waiting screen + resend; redirects once confirmed |
| src/features/auth/SessionProvider.tsx | Session state, `useSession()`, cache clearing |
| src/features/auth/components/AuthGate.tsx | Route guard |
| src/features/auth/components/AuthLayout.tsx | Shared centred card (DESIGN_GUIDE §13.8) |
| src/features/auth/components/PasswordField.tsx | Password input with show/hide |
| src/features/auth/api/useAuthMutations.ts | login, signup, forgot, reset, resend, signOut |
| src/features/auth/schemas/auth.schemas.ts | zod schemas; messages are **i18n keys**, not sentences |
| src/components/shared/FormField.tsx | Bridges react-hook-form to `Input`, translates error keys |

## Routing rules (AuthGate)
| State | Goes to |
|---|---|
| Signed out, private route | `/login` |
| Signed in, email not verified | `/verify` |
| Signed in + verified, on an `(auth)` screen | `/` |
| Business inactive (trial over) | operational screens show the lock screen; `/settings`, `/billing`, `/more` still open — see [billing.md](billing.md). Applied by `RouteGuard`, not `AuthGate`. |
| On `/accept-invite` | always rendered — not redirected to onboarding or away from `(auth)`, because accepting is how an invited user gets their first business |
| Just accepted an invite, membership refetch still in flight | waits (spinner), not `/onboarding` — `shouldWaitForRejoin()` in `gateSettled.ts`, see members.md changelog 2026-10-12 |
| No Supabase keys configured | renders through, so the dev warning and gallery still work |

`(auth)` and `(public)` are the only groups an unauthenticated visitor may open.
Business-level checks (no business → onboarding, inactive → lock screen) are added
in the onboarding and trial steps.

**The routing DECISION is a pure function**, `authGateDecision()` in `gateSettled.ts`
(unit-tested directly, `gateSettled.test.ts`) — `AuthGate` only wires session/router/
query state into it. **The route tree (`children`) is never unmounted while a decision
is pending**: a `'wait'` result overlays the spinner on top instead of replacing the
tree. See the 2026-10-12 changelog entry below for why that distinction matters.

## Email (IMPORTANT, temporary)
Verification and reset emails are sent by **Supabase's built-in sender**. Two limits
to know while developing:
- **Rate limit:** a handful of emails per hour on the free tier. Hitting it returns a 429; wait rather than retrying.
- **Recipient limit:** the built-in sender will only deliver to addresses belonging to the Supabase **team members** of this project. Signing up with an unrelated address creates the user but **no email arrives**. For testing, confirm the user manually:
  `update auth.users set email_confirmed_at = now() where email = '…';`
- Supabase also rejects some domains outright (`.dev` test domains return 400 "Email address is invalid").

**Resend replaces this in Phase 6**, which removes all three limits.

## Redirect URLs
`redirectTo()` in `useAuthMutations.ts` builds them: `Linking.createURL(path)` on
native, `window.location.origin + path` on web. Every URL must also be listed in
the dashboard under **Authentication → URL Configuration → Redirect URLs**, or
the link bounces.

**Native URLs have THREE slashes** — `createURL` inserts an empty host. Printed
from the running app, not assumed:

| Platform | Verify | Reset |
|---|---|---|
| Native | `wapee:///verify` | `wapee:///reset-password` |
| Local web | `http://localhost:8090/verify` | `http://localhost:8090/reset-password` |

All four are configured in the dashboard. Add the real domain's two paths at launch.

## Data & caching
No queries yet; auth is all mutations. The session comes from Supabase's own
listener, not from a query. Storage: SecureStore (chunked) on native, localStorage
on web — see `src/lib/supabase/authStorage*.ts`.

## Permissions & gating
None yet. `usePermission()` / `useFeature()` land in the roles step.

## UI
`AuthLayout` (wordmark + 400px card + footer line) wraps every screen.
Mobile and desktop are the same centred card; only page padding changes.

## i18n
Namespace `common`, key `auth.*`. zod messages are keys like
`auth.errors.emailInvalid`, translated by `FormField`, so the schemas stay free of
display text and can be reused server-side.

## Known limits / TODO
- Email sender is temporary (see above).
- No "signed in but has no business" redirect yet → onboarding step.
- No trial-expired lock screen yet → trial step.
- Super admin 2FA is deferred to Phase 8 with the admin screens (agreed).
- Sign out buttons in the sidebar and More screen are still placeholders; they get wired to `useSignOut()` in the roles step.
- **Creating an `auth.users` row by hand needs `''`, not NULL, in `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`.** GoTrue scans those columns as non-nullable strings, so a hand-made user fails sign-in with a 500 "Database error querying schema". Found 2026-10-02 with a SQL-inserted test user. Prefer the real `/auth/v1/signup` endpoint.

## Changelog
- 2026-10-14: FIX feature-2 production bug — a password-recovery session (reset-link click) had no reliable way to reach `/reset-password`, and a 2FA-enrolled super admin never could at all. **Root cause, two layers**: (1) `authGateDecision()` had no concept of a recovery session, so its ordinary rules fired on it like any other signed-in session — a verified user with a business on `/reset-password` (an `(auth)` screen) tripped the `hasBusiness && isAuthGroup` rule and was bounced to `/` before ever seeing the form; this affected **every** user with a business, not only admins. (2) `AdminAccessGate`/`adminRedirect()` independently forced ANY aal1 super admin to `/admin/2fa` with no exemption for `/reset-password`, and `TwoFactorScreen`'s `onSuccess` always landed on `/admin` — stranding a 2FA admin with no way back to actually resetting the password (the exact reported symptom). **Fix**: `sessionState.ts`'s `nextSessionState()` now tracks a new `isPasswordRecovery` flag, set by the `PASSWORD_RECOVERY` auth event and sticky through same-user `SIGNED_IN`/`TOKEN_REFRESHED` (tab refocus) until `USER_UPDATED` (password actually saved) or sign-out — exposed as `useSession().isPasswordRecovery`. `authGateDecision()` gained a recovery rule that outranks every other one: a recovery session is sent to `/reset-password` from anywhere and is never redirected away from it once there. `adminRedirect()` gained an `isPasswordRecovery` input that short-circuits to no redirect, deferring entirely to `AuthGate`'s rule. `reset-password.tsx` itself now handles the one remaining real case: Supabase refuses `updateUser({password})` with `insufficient_aal` for an account with a verified TOTP factor at aal1 (which a recovery session always is) — the screen catches that specific code (`isInsufficientAalError()`, new in `authErrorKey.ts`) and asks for the 6-digit code inline (reusing the admin area's own `useTotpFactors`/`useVerifyTotp`, no duplicated MFA logic), then retries the same password once verified. Normal sign-in 2FA enforcement (`AdminGuard`, `is_super_admin()` requiring aal2 server-side) is untouched — this only changes what happens to a *recovery* session specifically. 23 new unit tests across `sessionState.test.ts`, `gateSettled.test.ts`, `adminLogic.test.ts`, `authErrorKey.test.ts` (reset-password itself has no component test harness in this repo — covered by the pure routing/error-mapping tests instead); 807/807 full suite green, tsc/lint clean. **"Change password" for a signed-in user already existed** (`src/features/account/components/ChangePasswordCard.tsx`, wired into `AccountScreen` — current-password check via `verifyPassword()`, `updateUser()`, revokes other sessions with `scope:'others'`, audited) — the task brief assumed it was missing; it was not touched. **Not verified live**: no browser tool this session, so the real reset-link flow (plain user and 2FA admin) was not clicked through — code-read only, reasoning from GoTrue's documented `PASSWORD_RECOVERY` event and `insufficient_aal` error code.
- 2026-10-14: FIX QA audit finding F1 (`docs/qa/features/01-signup-login.md`): `login.tsx`, `signup.tsx`, `reset-password.tsx`, `onboarding.tsx`, `verify.tsx` and `accept-invite.tsx` showed raw Supabase/Postgres `error.message` text, untranslated and (on signup) an account-enumeration leak. New `authErrorKey()` (`src/features/auth/authErrorKey.ts`, same reason-code pattern as `adminLogic.ts`'s `adminErrorKey`) maps a Supabase `AuthError`/Postgrest error's `code`/`status` to an i18n key (`auth.errors.*`): invalid credentials, email not confirmed, already registered, weak password (server-side), rate limited (incl. bare HTTP 429), network failure, expired/used link, and the `create_business_with_owner` slug-taken Postgres errcode (`23514`) — anything unrecognised falls back to the existing `auth.errors.generic`. `useAuthMutations.ts`'s `toError()` and `useCreateBusiness()` now preserve `code`/`status` on the thrown `Error` instead of collapsing to a bare message, which is what made the mapping possible. `accept-invite.tsx` keeps its deliberate "one generic message for most failures" design — forgot-password's enumeration-safe behaviour is untouched. 12 new unit tests (`authErrorKey.test.ts`); 792/792 suite green. **Not verified live**: no browser tool was available this session, so wrong-password and unconfirmed-email were not clicked through — code-read only (the mapper's codes come straight from `@supabase/auth-js`'s documented `ErrorCode` union, not guessed).
- 2026-10-12: FIX the REAL cause of the invite-accept cold-load bug (the fix below this entry was correct but did not fix it on production; full story in members.md changelog and `_handoff.md`). `AuthGate`/`AdminAccessGate` used to unmount their entire `children` (the whole `Stack`) and render a bare spinner while a decision was pending. That unmount made React Navigation lose its navigation state; on recovery it fell back to the default route and overwrote the real URL via its own internal `history.replace` — silently turning `/accept-invite?token=…#access_token=…` into `/` before any app code ever read it. Confirmed with a live browser trace against the dev project, not by further reading. Fix: both gates now ALWAYS render `children`, overlaying the spinner instead of replacing the tree. The decision logic itself moved into a pure, unit-tested `authGateDecision()` (`gateSettled.ts`/`gateSettled.test.ts`, 15 new cases) so this class of regression is covered without needing a browser. Verified end-to-end on the dev project with two independent throwaway invited users (real tokens via the Auth REST API, cold tab, cleared storage): both landed directly on the dashboard with the membership active, no `/onboarding` detour.
- 2026-10-12: FIX invite-accept routing bugs (full detail in members.md changelog): `useSignup` gained an optional `confirmRedirectPath` so the invite screen's signed-out signup returns email confirmation to `/accept-invite?token=…` instead of the generic `/verify` (token no longer lost); `AuthGate` gained `shouldWaitForRejoin()` so it waits for the membership refetch after an invite accept instead of deciding on the stale "zero businesses" value and flashing `/onboarding`.
- 2026-10-09: FIX tab-refocus reload. supabase-js re-emits `SIGNED_IN` on every tab refocus and `SessionProvider` ran `queryClient.clear()` on it, so every screen fell back to skeletons. Now `sessionState.ts` (`nextSessionState`, tested) clears the cache only when the user id changes or on `SIGNED_OUT`; same-user events keep the cache and the session object.
- 2026-10-09: `AuthLayout` side padding fixed (it sat on `Screen`'s content container, where `paddingStart/End: 0` overrode it, so the card touched the screen edges); padding now on an inner wrapper.
- 2026-10-02: Trial lock wired into `RouteGuard` (see billing.md).
- 2026-10-02: `/accept-invite` added to the gate's always-allowed routes (see members.md).
- 2026-10-02: Auth screens, session provider and route guard. Verified end to end on web (signup → verify → login → session persists) and on iOS.

## Suspended business blocks login (2026-10-20)
- Rule (`user_is_disabled`): not a super admin, has >=1 ACTIVE membership in a non-deleted business, and EVERY such business is `suspended`. Zero businesses (new signup / invitee) = allowed; a business without a subscription row = usable; `inactive` / expired trial = NOT disabled (lock screen only, owner reaches Billing).
- Server: `custom_access_token_hook` (Supabase Auth hook, **FAIL-OPEN**: any error returns the event) refuses sign-in AND refresh with 403 "This account is disabled. Contact support@wapee.online". **Hosted project: enable in Dashboard > Authentication > Hooks > Custom Access Token (Postgres function `public.custom_access_token_hook`)**; `config.toml` covers the local stack. `set_business_status('suspended')` calls `revoke_sessions_of_disabled_members` (deletes `auth.sessions` + `auth.refresh_tokens` only of members who are now disabled; super admins and multi-business users with any non-suspended business keep theirs) and writes audit `admin.sessions_revoked` (count only). Un-suspend revokes nothing. Already-issued access tokens live until expiry (default 1 h, unchanged).
- Client: `useAccessGuard` (mounted in `AuthGate`) runs `my_access_state()` on focus / reconnect (staleTime 30 s, no Realtime); disabled -> `signOut({scope:'local'})` + `useDisabledNotice`; the login screen shows `auth.accountDisabled` (also when the hook error comes back at sign-in).
- Known gap: removing a user's membership of their only active business while the rest are suspended does not purge sessions (the focus check and the hook catch it at the next refresh).
- Suite `35_suspended_login_block.sql` (66): rule per user type, hook allow/refuse + exact message + fail-open (bad uuid, empty event, broken rule function), purge, un-suspend, multi-business, super admin, other business, audit, grants.
- 2026-10-09: tab-switch hardening. Root cause of the reset was `queryClient.clear()` on supabase-js's same-user SIGNED_IN (fixed above); both `AuthGate` and `AdminAccessGate` then swapped the whole tree for a spinner. They now use `useGateSpinner` (`gateSettled.ts`): the full-screen spinner shows only on a user's FIRST load, never again for the same user, so no later pending flip can unmount screens (form input / popups). Tests: `gateSettled.test.ts`.
