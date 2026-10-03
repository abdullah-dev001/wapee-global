# CLAUDE.md — Wapee

You are building **Wapee**, an international appointment-booking SaaS (salons, clinics, barbers, pet grooming, consultants, etc.).
One **Expo** codebase → **Android app**, **iOS app** and **web that installs as a PWA**.
Release order: Android (Play Store) + PWA first; iOS App Store later when budget allows. **The code must be production-perfect for iOS from day one** — publishing on iOS later must need zero rework. Every screen is built and checked for Android, iOS and web (mobile + tablet + desktop).
Backend: **Supabase**.

Source of truth docs (read the relevant section before starting a task):
- `docs/Wapee_Product_Overview_v2.md` — what the product does, every rule and decision
- `docs/Wapee_Build_Plan.md` — phases and their order
- `docs/DESIGN_GUIDE.md` — full design system
- `context/` — one file per built feature with its current state (see §13). **Read the feature's context file instead of scanning its code.**
If code and these docs disagree, **stop and ask**. Do not silently pick one.

---

## 1. Working rules (STRICT — follow every time)

0. **Read context first.** Before touching a feature, read `context/<feature>.md` (and `context/_index.md`). Open the actual code only for the files you need to change, or if the context file is missing or looks wrong.
1. **Todo list first.** Before writing any code, create a todo list for the task (TaskCreate / TodoWrite). Break it into small steps. **The last todo of every task is always "Update context file(s)".**
2. **One task at a time.** Mark it in progress, finish it, verify it, mark it complete, then move to the next. Never start several at once.
3. **Stop on real doubt, not on small things.**
   - **STOP and ask** (short question + your recommended option, then wait) when it affects: product behaviour, data model / migrations, permissions / security, money, UI flow, adding a dependency not listed here, or anything destructive or hard to undo. Never guess on these.
   - **Do NOT stop** for small technical choices covered by this file or by an obvious best practice (file names, internal helper structure, config details, lint fixes). Pick the recommended option, keep going, and list these choices in the end-of-task report.
   - Group your questions: ask them together in one message at the start of a task, not one at a time mid-task.
4. **Stay in scope.** Do only what the task asks. No extra features, no "while I'm here" refactors. If you notice something else that should change, list it at the end as a suggestion.
5. **Reuse before you create.** Before making any component, hook, util or query, search the codebase for an existing one. Extend it if needed instead of duplicating.
6. **Verify before marking done.** Type-check (`npx tsc --noEmit`), lint, and run/check the affected screen or function. For DB changes, confirm the migration applied and types were regenerated.
7. **End of task report** (short): what changed (files), migrations added, anything left open, suggested next step.
8. **Always talk to the user in simple, clear English.** Keep it short and to the point.
9. Never delete data, drop tables/columns, or run destructive commands without explicit confirmation.
10. Never commit secrets (.env, keys, service role, tokens). Follow the Git workflow in §15 exactly.

---

## 2. Tech stack (do not add libraries without asking)

| Area | Choice |
|---|---|
| App | Expo (SDK latest stable), **Expo Router**, React Native Web, TypeScript **strict** |
| Backend | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions (Deno) |
| Server state / caching | **@tanstack/react-query** |
| Local UI state | Zustand (only for small client-only state: UI prefs, current branch). Never store server data in Zustand. |
| Forms | react-hook-form + zod (same zod schema used for validation everywhere possible) |
| i18n | i18next + react-i18next + expo-localization |
| Icons | lucide-react-native only (stroke 1.75, sizes 14/16/18/20/22) |
| Font | DM Sans via @expo-google-fonts/dm-sans |
| Dates | date-fns + date-fns-tz (all timezone math through one util module) |
| Email | Resend (from Edge Functions only) |
| SMS | Twilio (from Edge Functions only) |
| Push | Android + iOS: Expo push (FCM / APNs). PWA/web: Web Push with VAPID. |
| Safe areas / system UI | react-native-safe-area-context, expo-status-bar, expo-navigation-bar, react-native-keyboard-controller (or KeyboardAvoidingView — ask) |
| Charts | one library that works on web + native (ask before choosing) |

Need a new dependency? **Ask first**, say why, and name the alternative.

---

## 3. Folder structure

```
app/                      # Expo Router routes only (thin: compose features, no business logic)
  (auth)/                 # login, signup, reset
  (app)/                  # authenticated dashboard (tabs on mobile, sidebar on tablet/desktop)
  (public)/[slug]/        # public business website + booking flow
  (portal)/               # client portal add-on
  (admin)/                # super admin
src/
  components/ui/          # reusable design-system primitives (Button, Input, Card, ...)
  components/layout/      # AppShell, Screen (safe areas + keyboard + status/nav bar), Sidebar, BottomTabs, Header, PageContainer
  components/shared/      # reusable composites (DataTable, ListView, FilterBar, Pagination, EmptyState, ConfirmDialog...)
  features/<feature>/     # e.g. appointments, clients, services, invoices
    api/                  # query + mutation hooks, query keys
    components/           # feature-specific components
    schemas/              # zod schemas
    types.ts
  lib/
    supabase/             # client, generated types (database.types.ts)
    query/                # queryClient, key factory helpers, defaults
    i18n/                 # setup + locales/<lang>/*.json
    theme/                # tokens, theme object, shadow(), useBreakpoint()
    time/                 # ALL timezone/date helpers
    money/                # ALL money formatting/arithmetic (minor units)
    permissions/          # can(), usePermission()
    push/                 # expo + web push registration
  hooks/                  # generic hooks (useDebounce, useBreakpoint, ...)
  config/brand.ts         # product name, URLs — the ONLY place the name "Wapee" lives
supabase/
  migrations/             # every DB change, timestamped .sql
  functions/              # Edge Functions
  seed.sql                # dev seed data only
  tests/                  # RLS / SQL tests
public/                   # PWA: manifest.json, icons, service worker
docs/                     # product docs (read-only unless asked)
context/                  # living feature context files (see §13)
  _index.md               # list of all features + status + one-line summary
  _foundation.md          # theme, shell, shared components, query setup, helpers
  _database.md            # all tables, key columns, RLS helper functions, migration list
  <feature>.md            # one per feature: auth, roles, services, staff, booking-engine, calendar, clients, invoices, ...
```

Rules: routes in `app/` stay thin. Business logic lives in `features/`. No file over ~300 lines; split it.

---

## 4. Platform and layout rules

### Breakpoints (from `useBreakpoint()` only)
| Width | Name | Layout |
|---|---|---|
| < 768 | mobile | **Bottom tab bar** (Today, Calendar, Clients, More), single column, full-screen sheets |
| 768–1023 | tablet | **Sidebar** (collapsible), two columns where useful |
| ≥ 1024 | desktop | **Fixed 240px sidebar + 64px header**, multi-column, 480px right drawer |

- **Mobile is the primary design.** Build and check every screen at mobile width first.
- **Android app, iOS app and mobile web must look and behave the same.** Same screens, same bottom tabs, same sheets. No "desktop-ish" leftovers on a phone browser.
- Tablet/desktop (incl. iPad and Android tablets) switch to the sidebar layout. Same features, layout only changes. Support portrait and landscape on tablets.
- Never branch on `Platform.OS` for layout. Use breakpoint. Use `Platform.select` / `Platform.OS` only for real platform differences (system UI, push, hover, service worker, haptics).
- Touch targets ≥ 44px on mobile.

### Screen edges, system bars, devices (STRICT — must be perfect on every phone)
- **Every screen uses the shared `Screen` / `PageContainer` layout component** that handles safe areas. Never hard-code top/bottom padding for notches or nav bars.
- Use `useSafeAreaInsets()` (react-native-safe-area-context) — never fixed values. `SafeAreaProvider` at the root.
- **iOS:** notch, Dynamic Island and home indicator → top + bottom insets. Bottom tab bar and bottom sheets/sticky buttons sit above the home indicator.
- **Android:** app runs **edge-to-edge**. Handle all three cases correctly:
  1. **3-button navigation bar** (back/home/recents) → bottom inset ≈ 48px, content and tab bar must not hide behind it.
  2. **Gesture navigation** (thin bar) → small bottom inset.
  3. **No visible nav bar** → inset 0.
  The bottom tab bar, sticky action buttons, sheets, FABs and toasts all add `insets.bottom`. Navigation bar colour/button style set with expo-navigation-bar to match the screen (light background → dark buttons).
- Status bar: expo-status-bar, style matches each screen background (dark icons on light screens, light icons on the primary-colour areas). Translucent; content never under it unintentionally.
- **Android hardware/gesture back** must work everywhere: closes sheet/dialog/drawer first, then goes back; on a root tab it exits (or confirms) — never a dead back press. Unsaved form → confirm before leaving.
- **iOS swipe-back** gesture enabled on stack screens; disabled only where data would be lost (then confirm).
- **Keyboard:** inputs never hidden by the keyboard on either platform. Forms scroll to the focused field; sticky submit buttons move above the keyboard; tap outside dismisses. Correct `keyboardType`, `autoComplete`, `textContentType` (iOS) and `returnKeyType` for every input.
- **Font scaling:** layouts must not break with large system font sizes (Android + iOS accessibility). Use `maxFontSizeMultiplier` only on tight UI like tab labels and badges.
- **Small and large screens:** test from ~320px wide (small Android / iPhone SE) up to large phones; no horizontal overflow, no cut text (use `numberOfLines` + ellipsis where needed).
- Orientation: phones portrait-locked; tablets allow both.
- Lists use `FlatList`/`FlashList` with `contentContainerStyle` bottom padding = tab bar height + `insets.bottom`.
- Pull-to-refresh on lists (native), haptics on key actions (iOS + Android, no-op on web).
- Date/time pickers, sheets and modals must feel native on both platforms (use the shared components, which handle platform differences internally).
- **PWA standalone on iPhone:** use `viewport-fit=cover` and `env(safe-area-inset-*)` so the web app respects the notch and home indicator just like the native app.

### Testing matrix (check before marking a UI task done)
| Target | Check |
|---|---|
| Android phone | 3-button nav, gesture nav, small screen, large font, hardware back, keyboard |
| iOS phone | notch/Dynamic Island, home indicator, SE-size screen, swipe-back, keyboard |
| Mobile web / PWA | Chrome Android + Safari iOS, installed (standalone) and in-browser |
| Tablet | iPad / Android tablet, portrait + landscape, sidebar layout |
| Desktop web | ≥1024 sidebar layout, hover, keyboard focus |
If you could not check a target, say so in the task report.

**Android cannot be run on this machine (no emulator, no storage for Android Studio).** Until the user says otherwise, every UI task must end with a written **Android code review** of the changed files, and the report must list the result. Check by reading the code:
- All bottom spacing (tab bar, sticky buttons, sheets, FABs, toasts) uses `insets.bottom`; nothing assumes 0 on Android.
- Layout works with edge-to-edge and a 3-button nav bar (about 48px inset), gesture nav, and no nav bar.
- Hardware back is handled (overlays close first, root tab behaviour, unsaved-form confirm) via the shared hook.
- Keyboard: focused input is never covered; sticky submit moves above the keyboard.
- Text uses the per-weight DM Sans font names (no `fontWeight` that makes Android fall back to the system font); no clipped text with large font scale.
- No iOS-only or web-only API is called without a `Platform` guard; no `boxShadow`/hover-only logic leaking to native; shadows go through `shadow()` (elevation on Android).
- Any new native module is listed, because it needs a rebuild.
Do not claim "works on Android". Say "reviewed in code, not run". When the user can run an Android build (real phone via EAS build, or an emulator later), the Android column of the matrix gets tested for real.

### PWA (required)
- Web build must be installable: `manifest.json` (name from brand config, `display: "standalone"`, `theme_color: "#024751"`, `background_color: "#f8fafb"`, all icon sizes incl. maskable + apple-touch-icon), service worker registered.
- Service worker caches **app shell and static assets only**. Never cache Supabase API responses or private files in the service worker (private data). Data caching is TanStack Query's job.
- Show an "Install app" hint; on iOS Safari show "Share → Add to Home Screen" instructions (iOS has no install prompt).
- Handle app updates: new service worker → show "Update available" toast → reload.

### Push notifications
- One table `push_subscriptions` (user_id, business_id, platform, token / web-push subscription JSON, device info, last_seen_at).
- Android + iOS apps: Expo push token (FCM / APNs). Ask permission at a sensible moment (after a user action), handle "denied" gracefully on both. Web/PWA: Web Push with VAPID keys (public key in app config, private key in Edge Function secrets).
- `platform` values in the table: `android`, `ios`, `web`.
- iOS web push works **only when installed to home screen (iOS 16.4+)** — ask for permission only after a user action, never on page load, and show a clear message if not installed.
- All sending goes through one Edge Function (`send-push`) that routes by platform and removes dead subscriptions.

---

## 5. Design system (STRICT)

Full spec: `docs/DESIGN_GUIDE.md`. All values live in `src/lib/theme/`. **Never hard-code a colour, font size, spacing, radius or shadow in a component.** Always `theme.*`.

### Colours
```
primary          #024751   primary-hover #013640   primary-light #e6f0f2
secondary (lime) #d8ff29   secondary-hover #c4eb1a secondary-light #f6ffd6
background       #f8fafb   surface #ffffff         surface-hover #f3f4f6
border           #e5e7eb   border-subtle #f0f0f0
text-primary     #111827   text-secondary #6b7280  text-muted #9ca3af
text-on-primary  #ffffff   text-on-secondary #024751
sidebar-bg #024751  sidebar-text #a8c5ca  sidebar-active #d8ff29  sidebar-active-text #024751  sidebar-hover #035f6e
success #10b981 / light #ecfdf5 / border #a7f3d0
warning #f59e0b / light #fffbeb / border #fde68a
error   #ef4444 (hover #dc2626) / light #fef2f2 / border #fecaca
info    #3b82f6 / light #eff6ff / border #bfdbfe
overlay rgba(0,0,0,0.5)
```
### Type, shape, motion
- Font **DM Sans** everywhere. Letter-spacing -0.02em body, -0.03em headings.
- Radius: sm 6, md 8, lg 12, xl 16, full 9999.
- Shadows via `shadow(level)` helper (sm, md, lg, drawer) → iOS shadow*, Android elevation, web boxShadow.
- Motion: 120 / 180 / 260 ms, ease. Animate colour/opacity only.
- Spacing: page padding 24 (16 mobile), card padding 24 (18 mobile).
- Z-index: header 30, sidebar 40, overlay 50, drawer 60, toast 70.
- **No dark mode.**

### Component specs (must match)
- **Button:** variants primary, secondary (lime), ghost, danger; sizes sm 34 / md 41 / lg 48; radius 8; disabled opacity 0.55; loading state built in.
- **Input:** label above (13px / 600), 1px border, radius 8, ~40px height, focus = primary border + 3px `primary-light` ring, error = red border + message below.
- **Card:** white, 1px border, radius 12, flat.
- **Badge:** pill, 11px / 600, tinted (status colours).
- **Drawer:** 480px from right on desktop; full-screen sheet on mobile.
- **Dialog:** max width 26rem (416px).
- **Tabs:** underline style. **Segmented control**. **Toggle:** 36×20.
- **Loading:** skeleton loaders for lists/cards. **Never** a full-screen spinner for lists. One spinner style, 600ms rotation.
- **Empty states** on every list. **Error states** with retry on every query.
- Hover styles only on web. Visible keyboard focus ring on web.

### Reusable component rules
- Every UI primitive lives in `src/components/ui/` and is used everywhere. **No one-off styled buttons/inputs/cards inside features.**
- Reusable composites in `src/components/shared/`: `ListView` (infinite/paginated), `DataTable` (desktop), `FilterBar`, `SearchInput` (debounced), `Pagination`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `FormField`, `PhoneInput` (country code), `DatePicker`, `DateRangePicker`, `TimeSlotPicker`, `MoneyInput`, `StatusBadge`, `Avatar`, `Sheet/Drawer` (responsive).
- Lists: on mobile render as cards/rows (`ListView`); on desktop the same data may render as `DataTable`. Same hook, same query.
- Props typed, variants via props (not copy-paste). Each primitive must work on **Android, iOS and web**, and handle platform differences inside the component (never in feature code).
- New reusable component needed? Build it once in `ui/` or `shared/`, then use it.

---

## 6. Data layer: Supabase, caching, pagination (STRICT)

### Migrations (every DB change = a file)
1. Write the SQL in `supabase/migrations/<YYYYMMDDHHMMSS>_<short_name>.sql` **first**.
2. Apply **exactly that SQL** to the Supabase project (Supabase connector `apply_migration` with the same name, or `supabase db push`).
3. Regenerate types into `src/lib/supabase/database.types.ts`.
4. Run Supabase security + performance advisors and fix what they report.
- **Never** change schema with `execute_sql` or the dashboard. `execute_sql` is for read-only checks.
- Never edit an already-applied migration. Fix with a new migration.
- Each migration includes: tables, indexes, constraints, **RLS enabled + policies**, triggers, grants — together.
- Destructive changes (drop / rename / type change) → ask first.

### Database rules
- Every tenant table: `business_id` (and `branch_id` where it belongs), `created_at`, `updated_at`, `deleted_at` (soft delete), `created_by` where useful.
- **RLS ON for every table, no exceptions.** Policies use helper SQL functions (e.g. `is_member(business_id)`, `has_permission(business_id, branch_id, 'appointments.edit')`). Security lives in the DB; UI hiding is never the boundary.
- Times stored as `timestamptz` in **UTC**. Business/branch `timezone` (IANA) column. Slot math in Postgres/Edge Functions respects DST.
- Money: integer **minor units** (`amount_minor bigint`) + `currency` (ISO 4217). Never floats.
- **No double-booking** enforced in Postgres with exclusion constraints (staff + time range; resource + time range).
- Financial records (invoices, payments, commission, session usage) are **immutable**: corrections via credit notes / reversal rows.
- **Country, currency, timezone, address and tax settings belong to the BRANCH** (one business can have branches in different countries). The business only keeps `default_*` values to pre-fill new branches. Slot maths, reminders and "today" always use the branch timezone. A branch's currency cannot change once it has any invoice or payment.
- Invoice numbers: `<branch prefix>-<number>`, **sequential per branch with no gaps** (done in DB). Branch prefix is unique within the business and cannot change after the first invoice.
- Reports and combined views never add amounts of different currencies: group by currency (no conversion at launch).
- Audit log rows for: role changes, financial actions, soft deletes, super admin access.
- Index every foreign key and every column used in filters/sorting. Use `pg_trgm` index for text search.
- Complex reads/writes that need atomicity or heavy joins → Postgres function (RPC) or Edge Function, not chained client calls.
- Secrets (Twilio, Resend, VAPID private key, service role) only in Edge Function secrets. Service role key **never** in the app.

### Server-side pagination, filtering, sorting, search
- **All** pagination, filters, sorting and search happen **on the server**. Never fetch a full table and filter in JS.
- Default page size 20 (max 100). Use keyset/cursor pagination for large or fast-growing lists (appointments, invoices, messages, audit log); `range()` + exact count only where a page-number UI needs it.
- Search: debounced 300ms, minimum 2 chars, server-side (`ilike` with trgm index or full-text).
- Filters and sort live in the URL search params on web (shareable, back button works) and in the query key.
- Select only needed columns (no `select('*')` in list queries).

### Caching with TanStack Query
- Every server read goes through a hook in `features/<x>/api/` using `useQuery` / `useInfiniteQuery`. **No Supabase calls inside components.**
- **Query key factory** per feature, always scoped by business (and branch):
  `appointmentKeys.list({ businessId, branchId, filters, sort })`, `appointmentKeys.detail(id)`.
- Default `staleTime` by data type (set in `lib/query`):
  - static-ish (services, staff, settings, roles, plan): 5–10 min
  - lists (clients, invoices): 30–60 s
  - live (calendar, today): 0–15 s + Realtime
- Use `placeholderData: keepPreviousData` for paginated lists (no flicker between pages).
- Mutations: invalidate **exactly** the affected keys (or `setQueryData` for precise updates). Optimistic updates only for simple toggles/status, with rollback on error.
- **Realtime** (appointments, calendar) updates/invalidates the cache; it never replaces the query.
- Prefetch the next page and likely next screen where cheap.
- On logout or business switch: clear the query cache.
- Every query handles loading (skeleton), empty, and error (retry) states.

---

## 7. Permissions
- Permission = `area.action` + scope (Own / Branch / All). Catalogue in product doc §9.
- Enforced in 3 places: **RLS**, **Edge Function checks**, **UI** (`usePermission('invoices.discount')` to hide/disable). All three, every time.
- Plan + add-on gating: `useFeature('commission')`. If an add-on is off, its screens, menu items and routes are hidden and blocked.

## 8. i18n
- **Zero hard-coded user-facing strings.** Everything via `t('feature.key')`, in `src/lib/i18n/locales/<lang>/<namespace>.json`. English is base.
- Use i18next plurals and interpolation; never build sentences by concatenating strings.
- Dates, numbers, currency via `Intl` helpers in `lib/time` and `lib/money` with the business locale.
- RTL-ready: use `start`/`end` (not left/right) for padding, margins, positions; flip directional icons.
- Product name only from `config/brand.ts`.

## 9. Forms
- react-hook-form + zod. Schema in `features/<x>/schemas/`. Server (Postgres constraints / Edge Function) validates again.
- Show field errors under the field, disable submit while submitting, toast on success/error.
- Phone: `PhoneInput` with country code, store E.164. Email optional unless the doc says otherwise.

## 10. Code quality
- TypeScript strict. **No `any`**, no `@ts-ignore` without a comment explaining why.
- Use generated Supabase types; never hand-write DB row types.
- Naming: components `PascalCase.tsx`, hooks `useXxx.ts`, utils `camelCase.ts`, SQL `snake_case`.
- Functional components only. Keep components small; extract logic into hooks.
- No `console.log` left in committed code.
- No inline style objects with raw values; use theme.
- Handle every error path; never swallow errors silently.

## 10a. Testing rules (STRICT)

**Every mutating RPC needs a test proving the original data survives EVERY
failure path.** Not just the happy path, and not just "it returned an error" —
assert that the row is still exactly as it was.

**Validation must finish before any mutation.** In PL/pgSQL a `RETURN` does
**not** roll anything back; only an exception does. So this is broken:

```sql
update appointments set status = 'cancelled' where id = v_id;  -- "free the slot"
...
if slot_is_taken then
  return jsonb_build_object('ok', false, 'code', 'slot_unavailable');  -- BUG
end if;
```

That shape shipped once in `reschedule_booking`: every failure path cancelled the
customer's booking and then reported failure, so a guest tapping a slot that had
just gone would have lost their appointment. It was caught by **one** assertion
("the original booking is untouched after a failed reschedule"), which is why
that assertion is now mandatory rather than optional.

The pattern to follow:

1. Read and validate everything first — permissions, state, windows, capacity.
2. Return every failure **before** the first write.
3. Mutate once, as late as possible, ideally in a single statement.
4. If a check genuinely needs the new state to exist, use the exclusion
   constraint as the backstop and catch its exception — do not mutate to make a
   query come out right. (`reschedule_booking` excludes the row from its own
   collision check with `a.id <> v_id` instead.)

Also:
- A public RPC behind a rate limiter must **return** `{ok:false,code}`, never
  raise, or the raise rolls back the counter it just incremented (the
  `accept_invite` trap).
- Assert on **stored values**, not only on return codes. `create_booking`
  discarded its own answer normalisation and the return code looked fine.
- Test every new trigger against `delete from businesses`; a guard written for a
  tenant action also fires for the cascade that deletes the tenant.

## 11. Security checklist (every feature)
- [ ] RLS policies written and tested for each role (owner, manager, receptionist, staff, other business)
- [ ] Permission checked in Edge Function / RPC
- [ ] Public endpoints rate-limited, return only needed fields
- [ ] Private files via short-lived signed URLs
- [ ] Sensitive client fields gated by `clients.view_sensitive`
- [ ] No secrets in client code

## 13. Context files (STRICT)

Purpose: any future session understands a feature by reading **one short file**, not the whole code.

**When:**
- New feature started → create `context/<feature>.md` from the template below and add it to `context/_index.md`.
- Any change to a feature (code, DB, rules, UI) → update its context file **in the same task**, before marking the task done.
- Any migration → also update `context/_database.md`.
- New shared component / hook / util → add it to `context/_foundation.md`.
- A task is **not done** until its context files match the code.

**Rules:**
- Always the **current** state. Rewrite outdated lines; do not append "update:" notes. History belongs in the Changelog section only (one line per change, newest first, max ~15 lines).
- Short and factual: bullets, tables, file paths. No code dumps (a function signature or tiny snippet is fine).
- Target under ~200 lines per file. If bigger, split the feature (e.g. `invoices.md` + `invoices-tax.md`).
- If you find the context file wrong while working, fix it and tell the user.

**Template — `context/<feature>.md`:**
```md
# <Feature name>
Status: planned | in progress | done   ·   Phase: <n>   ·   Last updated: <YYYY-MM-DD>

## What it does
2–5 lines, user-facing behaviour.

## Business rules
- Rules from the product doc as actually implemented (limits, defaults, edge cases).

## Files
| Path | Purpose |
|---|---|
| app/(app)/clients/index.tsx | list screen |
| src/features/clients/api/useClients.ts | list query (server-side search + filters) |

## Database
- Tables: name → key columns
- RLS: who can read/write what
- RPC / Edge Functions: name(params) → returns, what it does
- Migrations: filenames

## Data & caching
- Query keys, staleTime, which mutations invalidate what, realtime channels
- Pagination type, available filters/sort

## Permissions & gating
- Permissions used, plan/add-on required

## UI
- Screens and main reusable components used; mobile vs desktop differences

## i18n
- Namespace(s)

## Known limits / TODO
- Open items, deferred parts, open questions for the user

## Changelog
- YYYY-MM-DD: one line
```

**`context/_index.md` format:**
```md
| Feature | File | Status | Phase | Summary |
|---|---|---|---|---|
| Clients | clients.md | done | 4 | Client list, profile, notes, history |
```

## 15. Git workflow (STRICT)

- Remote: `origin` = `https://github.com/abdullah-dev001/wapee-global.git` (private).
- Two long-lived branches: **`dev`** (all daily work) and **`main`** (stable, only receives merges from `dev`).
- **Work only on `dev`.** Never commit directly to `main`. Never force-push. Never rewrite pushed history.
- **Commit after every completed task** (after verification passes and context files are updated), then push: `git push origin dev`. One focused commit per task; if a task has clearly separate parts, several commits are fine.
- Commit messages: Conventional Commits, short and clear, e.g. `feat(ui): add Button, Input and Card components`, `fix(web): clip spinner ring`, `chore: initial Expo setup`, `db: add businesses and members tables`. Body only when needed.
- Before every commit: run `git status`, check that no secret, `.env`, build output (`ios/`, `android/`, `dist/`, `node_modules/`) or generated file is staged. Typecheck and lint must pass.
- DB changes: the migration file and the regenerated types are committed in the same commit as the code that uses them.
- **Merging `dev` → `main` happens only when the user says so.** Then: make sure `dev` is pushed and clean, `git checkout main && git pull origin main && git merge --no-ff dev -m "merge: dev into main (<short summary>)" && git push origin main && git checkout dev`. Tell the user what was merged.
- Never delete branches, tags or remote history without explicit confirmation.
- If a push fails (auth, conflict, protected branch), stop and tell the user. Do not work around it.

## 14. Do NOT
- Do not build anything listed as out of scope in the product doc (waitlist, custom domain/SSL, online payments, dark mode, drag-and-drop calendar, recurring or multi-service bookings, marketing email).
- Do not hard-code colours, strings, the product name, timezones or currencies.
- Do not fetch everything and filter client-side.
- Do not change the DB without a migration file.
- Do not create a component that already exists.
- Do not continue past a doubt — ask.
- Do not finish a task without updating its context file(s).
- Do not commit to `main`, force-push, or push secrets.