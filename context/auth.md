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
| On `/accept-invite` | always rendered — not redirected to onboarding or away from `(auth)`, because accepting is how an invited user gets their first business |
| No Supabase keys configured | renders through, so the dev warning and gallery still work |

`(auth)` and `(public)` are the only groups an unauthenticated visitor may open.
Business-level checks (no business → onboarding, inactive → lock screen) are added
in the onboarding and trial steps.

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
- `AuthGate` has no inactive-business branch yet; the trial lock screen adds it.
- **Creating an `auth.users` row by hand needs `''`, not NULL, in `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`.** GoTrue scans those columns as non-nullable strings, so a hand-made user fails sign-in with a 500 "Database error querying schema". Found 2026-10-02 with a SQL-inserted test user. Prefer the real `/auth/v1/signup` endpoint.

## Changelog
- 2026-10-02: `/accept-invite` added to the gate's always-allowed routes (see members.md).
- 2026-10-02: Auth screens, session provider and route guard. Verified end to end on web (signup → verify → login → session persists) and on iOS.
