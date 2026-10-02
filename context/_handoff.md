# Handoff
Last updated: 2026-10-02 · Branch: `dev` · All work is pushed.

## Done
- **Phase 0:** Expo SDK 57 app (iOS/Android/web+PWA), theme from DESIGN_GUIDE, 13 UI primitives, responsive shell (bottom tabs / sidebar / header), i18n, PWA install hint + update toast.
- **Phase 1 so far:** full schema (10 tables, RLS on all, 46 permissions, 4 system roles, guard triggers), auth screens + session + route guard, onboarding wizard + `create_business_with_owner`, branch-owned country/currency/timezone/tax, per-branch invoice series.
- Verified on web (375/768/1280) and the iOS simulator. 30+ SQL security assertions pass against the live database. Advisors clean except the item below.

## Next, in order
1. **`usePermission` / `useFeature` wired into `src/config/navigation.ts`.** Each `NavItem` already declares `permission` and `feature`; nothing reads them yet, so every item is visible to everyone. See `context/roles.md`.
2. **Invite flow** — `users.invite`, hashed token, accept screen. Schema is ready (`business_members.invite_token_hash`, `invite_expires_at`).
3. **Trial lock screen** — `AuthGate` needs an inactive-business branch; `business_is_active()` already returns false the moment a trial expires.

## Open items
- **Leaked-password protection is OFF.** Dashboard → Authentication → enable the HaveIBeenPwned check. Do this before real users.
- **`supabase test db` needs Docker**, not installed. The pgTAP files in `supabase/tests/` are verified by running their assertions through the Supabase connector instead. Docker (or the DB password for `psql`) would let them run as a suite.
- **Android has never been run** — no emulator on this machine. Every UI task ends with a written Android code review instead (CLAUDE.md §4). Test on a real device via EAS build when possible.
- **Email is Supabase's built-in sender**: rate-limited, and it only delivers to project team members. Confirm test users with SQL (see `context/auth.md`). Resend replaces it in Phase 6.
- Placeholder domains (`app.wapee.com`, `wapee.site`) and placeholder app icons.

## Traps to remember
- **Hermes has no `Intl.Locale` and no `Intl.supportedValuesOf`.** They work in Node and browsers and are `undefined` on device. Country/currency/timezone lists are a build-time snapshot: `node scripts/generate-locale-data.mjs`.
- **`expo-navigation-bar` 'dark' means dark buttons on a LIGHT bar** — the published TypeScript doc says the opposite. Verified in `NavigationBarModule.kt`. Do not "fix" it.
- **Adding a native module needs a rebuild** (`npm run ios`), not just a reload. `expo-screen-orientation` once crashed the app with "Cannot find native module" until rebuilt.
- **Check the fix is in the served bundle before judging a test.** A `CI=1` dev server does not hot-reload, so a passing-looking failure may be stale code. Restart with `--clear` after edits.
- **Never pass an inline arrow where a hook keeps the callback in its effect deps.** `Select` did this with `useOverlayDismiss` and caused "Maximum update depth exceeded". The hook now holds it in a ref; prefer `useCallback` at call sites anyway.
- **Screens inside the bottom tabs must pass `edges={['top']}` to `Screen`**, or the bottom inset is applied twice (~48px dead space on Android 3-button nav).
- The Supabase **connector refuses `DROP`**; use `supabase db push` for anything destructive.

## Commands
```sh
npm run web                 # web dev server (add --clear after edits if stale)
npx expo start --web --port 8090 --non-interactive --clear
npm run ios                 # build + run the iOS dev build (needed after a native module)
npx expo start --port 8092 --non-interactive   # dev server for an installed build

supabase db push            # apply pending migrations (CLI is linked)
supabase migration list     # local vs remote history
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
node scripts/generate-locale-data.mjs          # refresh country/currency/timezone lists

npm run typecheck && npm run lint && npx prettier --check .
```

Supabase project: `rfuovquhultjydtswtqf` (Wapee Global Development).
Confirm a test user: `update auth.users set email_confirmed_at = now() where email = '…';`
