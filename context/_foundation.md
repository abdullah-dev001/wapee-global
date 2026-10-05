# Foundation

Status: in progress · Phase: 0 · Last updated: 2026-10-01

## What it is

Project setup every feature builds on: Expo app, theme, providers, env, data layer, i18n, PWA, the base UI primitives and the responsive app shell. Auth and onboarding are built (see auth.md, onboarding.md); the remaining `(app)` routes are still "coming in phase N" placeholders.

## Stack (installed with `npx expo install`)

- Expo SDK **57** (expo 57.0.x, RN 0.86, React 19.2), Expo Router 57, TypeScript 6 strict (+ `noUncheckedIndexedAccess`).
- Router entry: `package.json` `main: expo-router/entry`. Web output **static** (SSR at build): no `window`/`document` at module level.
- Libraries: @tanstack/react-query, zustand, react-hook-form, zod 4, @hookform/resolvers, i18next, react-i18next, expo-localization, lucide-react-native (+ react-native-svg), @expo-google-fonts/dm-sans, expo-font, expo-splash-screen, date-fns, date-fns-tz, expo-status-bar, expo-navigation-bar, expo-system-ui, react-native-safe-area-context, react-native-screens, react-native-gesture-handler, react-native-reanimated 4 (+ react-native-worklets), react-native-keyboard-controller, @supabase/supabase-js, expo-secure-store, expo-notifications, expo-dev-client, expo-screen-orientation, @react-native-community/netinfo, react-native-web, react-dom.
- Dev: eslint 9 (flat) + eslint-config-expo + typescript-eslint (strict) + prettier + eslint-config-prettier.
- **Development build required** (keyboard-controller etc.); Expo Go not supported.
- Not installed yet: charts lib (ask), expo-haptics, expo-device.
- **expo-clipboard** (added 2026-10-02 for the one-time invite link) and **vitest** (dev, unit tests for pure logic). expo-clipboard is native: the dev build needs a rebuild.
- Env: `.env` exists locally (gitignored) with the real Supabase URL and publishable key, so the app talks to the live dev project.

## Files

| Path                                                                                                                     | Purpose                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| app.config.ts                                                                                                            | Expo config; name/slug/scheme/IDs from brand.ts; orientation; plugins; web static           |
| app/_layout.tsx                                                                                                          | Root providers + font loading + splash + SW registration                                    |
| app/+html.tsx                                                                                                            | Web HTML shell: viewport-fit=cover, iOS web-app meta, manifest, icons, base CSS             |
| app/(auth)/login.tsx · (app)/index.tsx · (public)/[slug]/index.tsx · (portal)/portal/index.tsx · (admin)/admin/index.tsx | Placeholder routes (`/login`, `/`, `/:slug`, `/portal`, `/admin`)                           |
| src/components/shared/PlaceholderScreen.tsx                                                                              | TEMPORARY placeholder; delete when real screens exist                                       |
| src/config/brand.ts                                                                                                      | Product name, slug, scheme, bundle ID `com.wapee.app`, URLs. Only place "Wapee" lives       |
| src/config/env.ts                                                                                                        | zod-validated public env; `env`, `isSupabaseConfigured`, `missingEnvKeys`, `warnAboutEnv()` |
| src/lib/theme/                                                                                                           | colors, typography, tokens, shadow(), useBreakpoint(), fonts, `theme` object                |
| src/lib/query/                                                                                                           | queryClient, staleTimes, createQueryKeys(), useAppFocusManager()                            |
| src/lib/supabase/                                                                                                        | client (`supabase`, `getSupabase()`), auth storage, auto refresh, **generated** database.types.ts |
| src/lib/i18n/                                                                                                            | i18next instance, resources, typed keys, RTL helpers                                        |
| src/lib/permissions/                                                                                                     | `can()`, `usePermission`, `useFeature`, `useVisibleNav`, current-scope store (see roles.md)  |
| src/config/permissions.ts                                                                                                | 46-permission catalogue mirroring the table: `PermissionKey`, `minPlan`, `addon`, plan order |
| src/lib/time/index.ts | **Fully implemented** (2026-10-05): all of Phase 0's skeleton plus `nowUtc`, `getDeviceTimeZone` (via `expo-localization`, stubbed in tests), `isValidTimeZone`, `zonedToUtc`/`utcToZoned`/`dayRangeUtc` (DST-safe via `date-fns-tz`'s `fromZonedTime`/`toZonedTime` — an ambiguous fall-back time resolves to the SECOND, standard-time occurrence, matching Postgres), `addMinutesUtc`, `formatDate`/`formatTime`/`formatDateTime`, `formatRelative`. |
| src/lib/money/index.ts | Partly implemented: `money`, `currencyExponent`, `parseMajorToMinor`, `formatMoney`, `formatMinorAsMajor`. Arithmetic helpers still skeletons. |
| src/lib/notImplemented.ts                                                                                                | Throw helper for skeletons                                                                  |
| src/lib/pwa/registerServiceWorker.ts                                                                                     | Registers /sw.js (web + production only), update hook                                       |
| public/sw.js                                                                                                             | Service worker stub (shell + static only)                                                   |
| public/icons/                                                                                                            | PWA placeholder icons (192/512, maskable 192/512, apple-touch 180, favicon 32)              |
| assets/images/                                                                                                           | Native icon, adaptive icon fg/monochrome, splash icon, favicon (placeholders)               |
| scripts/generate-web-manifest.mjs                                                                                        | Writes public/manifest.json from brand.ts (gitignored output)                               |
| src/components/ui/ | Base UI primitives (see "UI components") + barrel `index.ts` |
| src/components/shared/ | Reusable composites + barrel `index.ts`: `FormField`, `MoneyInput`, `SearchInput`, `TimePicker`, `DayHoursRow`, `DateRangePicker`, `StatusBadge`, `Avatar` |
| src/components/shared/scheduler/ | `StaffColumnsGrid` (hour ruler + N `StaffDayColumn`s), `HourRuler` — the Day/Week calendar grid (see `context/appointments-ui.md`) |
| src/lib/device/useTabletOrientation.ts | Android: release the portrait lock on tablet-sized screens |
| src/lib/query/useOnlineManager.ts | NetInfo -> TanStack `onlineManager` (native) |
| app/_gallery.tsx · src/dev/ComponentGallery.tsx | DEV-ONLY gallery at `/_gallery`; stripped from production builds; DELETE both when real screens exist |
| scripts/strip-dev-routes.mjs | Parks dev-only routes during `build:web`, restores them after |
| eslint.config.js · .prettierrc.json                                                                                      | Lint/format rules                                                                           |

## Theme (`src/lib/theme`, import `{ theme }`)

- `theme.colors`: all CLAUDE.md §5 tokens (+ lockedScrim, shadow tint `#111827`).
- Type (DESIGN_GUIDE §3), px: xxs10 xs11 sm12 md13 base14 lg15 xl16 2xl17 3xl18 4xl20 5xl22 6xl24 7xl28 8xl32. Line-heights: tight1.15 snug1.2 compact1.3 normal1.4 relaxed1.5 loose1.6. Tracking -0.02em body / -0.03em headings → `letterSpacing(size, 'tight'|'tighter')` in px.
- Weights = separate families: `DMSans_400Regular / 500Medium / 600SemiBold / 700Bold`. **Never set `fontWeight`** (Android falls back to system font).
- `theme.text.<variant>`: headline(+Mobile), pageTitle(+Mobile), authTitle, statValue(+Mobile), sectionTitle, dialogTitle, cardTitle, body, bodyStrong, paragraph, label, small, helper, caption, badge, buttonSm/Md/Lg, nav. No colour inside; add colour from `theme.colors`.
- `theme.spacing[n]` (px keys 0–48), `theme.layout` (page 24/16, card 24/18, sidebar 240, header 64, drawer 480, dialog 416, minTouchTarget 44), `radius` sm6 md8 lg12 xl16 full, `controlHeight` sm34 md41 lg48 input40, `iconSize` 14–22, `iconStroke` 1.75, `duration` 120/180/260, spinner 600, `opacity.disabled` 0.55, `zIndex` 30/40/50/60/70.
- `shadow('sm'|'md'|'lg'|'drawer')`: web boxShadow, iOS shadow*, Android elevation. `focusRing()` web only.
- `useBreakpoint()` → `{ breakpoint, width, isMobile, isTablet, isDesktop, isCompact }`; mobile <768, tablet 768–1023, desktop ≥1024. Static web render runs at width 0 (= mobile) until hydration.
- Fonts: `useAppFonts()` in root layout; splash stays until loaded (or error, logged).
- RN uses px, so the web app's "15px root on mobile" shrink is **not** applied.

## UI components (`src/components/ui`, import from `@/components/ui`)

Specs come from DESIGN_GUIDE §12 + CLAUDE.md §5. Every component works on iOS, Android and web; platform differences are handled inside the component, never in feature code.

| Component | Key props | Notes |
|---|---|---|
| `Text` | `variant`, `color`, `align` | The only text component. Always pick a variant; never set `fontWeight`. |
| `Button` | `variant` primary/secondary/ghost/danger, `size` sm/md/lg, `loading`, `disabled`, `fullWidth`, `startIcon` | Label is a plain string. Loading swaps the icon for a Spinner and blocks presses. |
| `Input` | `label`, `hint`, `error`, `required`, `prefix`, `endAdornment`, `editable` | ~40px tall (matches md Button). Error border beats focus. `editable={false}` = disabled look. |
| `Card` | `onPress`, `noPadding`, `featured` | Flat at rest. `onPress` adds hover border + md shadow (web). Padding 24 / 18 mobile. |
| `Badge` | `tone` neutral/success/warning/error/info/primary, `dot`, `icon` | Pill, 11px/600. |
| `Skeleton` | `width`, `height`, `radius` | Pulse 1→0.45→1 over 1.4s. Lists use these, never a spinner. |
| `Spinner` | `size`, `color`, `trackColor` | 600ms rotation. Buttons and small inline waits only. |
| `EmptyState` | `title`, `description`, `icon`, `action`, `compact` | Every list needs one (empty vs no-results). |
| `ErrorState` | `title`, `description`, `icon`, `onRetry`+`retryLabel`, `compact` | Failed query, with retry. `onRetry` and `retryLabel` travel together so it never invents text. |
| `Toggle` | `value`, `onValueChange`, `label`, `disabled` | 36×20 track, 14px thumb, animated 180ms. |
| `Select` | `options`, `value`, `onChange`, `label`, `hint`, `error`, `required` | Sheet-based picker, same on all platforms. Handles long lists (418 timezones) with FlatList. |
| `Tabs` | `items`, `value`, `onChange` | Underline style; strip scrolls horizontally. Generic over the value type. |
| `Dialog` | `open`, `onClose`, `title`, `message`, `confirm`, `cancelLabel`, `busy` | Centred, max 416px. Escape / Android back / scrim tap close it (`busy` blocks). |
| `Drawer` | `open`, `onClose`, `title`, `subtitle`, `footer` | 480px from the end edge; full-screen sheet on mobile. Footer pinned above the safe area. |
| `ToastProvider` + `useToast()` | `show({ message, tone, duration })` | Mounted in the root layout. `duration: 0` = manual dismiss. Max 3 visible, z-index 70. |
| `SegmentedControl` | `options`, `value`, `onChange`, `label`, `hint` | One-tap choice between 2–4 options. Preferred over `Select` for a small closed set (a Select is a sheet — three interactions for one choice — and hides the alternatives). **Scrolls horizontally**, never wraps, so a long translated label cannot break the single-row shape at 320px. |
| `Collapsible` | `title`, `subtitle`, `defaultOpen`, `headerAccessory` | Disclosure section. **UNMOUNTS children when closed**: a dozen controls behind `display:none` still cost render work, and a hidden focused input leaves the Android keyboard open over a section you cannot see. Chevron flips for RTL. |
| `NumberStepper` | `value`, `onChange`, `min`, `max`, `step`, `suffix`, `label`, `hint` | Bounded integer, − [ n ] +. **Typing is clamped on BLUR, not per keystroke** — clamping mid-typing makes "120" impossible to enter when the minimum is 15. The draft is `string \| null`, not an effect sync (`react-hooks/set-state-in-effect`). |

Shared internals: `useInteractionState()` (hover/focus/pressed; hover and focus ring are web-only) and `useOverlayDismiss()` (Escape + scroll lock on web, Android hardware back).

Conventions:
- Disabled and loading both render at `opacity 0.55` and block presses.
- Hover exists only on web; the focus ring is drawn only on web (`focusRing()`).
- Not built yet: Checkbox/Radio, Pagination, TimeSlotPicker, StepWizard, FormAlert, StatCard. **`PhoneInput` built 2026-10-04, `Avatar`/`StatusBadge` built 2026-10-05, `DataTable` built 2026-10-05 (in `components/shared`, not `components/ui` — it's a composite of `Text`/`Pressable`, not a base primitive)** — see `components/shared` below.
- **`Drawer` now avoids the keyboard** (fixed 2026-10-04): the body is a
  `KeyboardAwareScrollView` (same as `Screen`) and the footer rides a
  `KeyboardStickyView`, so a focused input near the bottom is never covered on
  Android or iOS. One fix in `Drawer` covers every form that puts inputs in one
  (ServiceForm, StaffForm, the schedule lists, CustomFieldEditor) without
  touching any of them. **The scroll view's `bottomOffset` is the footer's
  MEASURED height** (`onLayout`), not a guessed constant — the footer rises via
  a transform rather than shrinking the scroll area, so a guess too small
  leaves it covering the focused input (caught in the public-booking-page
  Android review).
- **`Select` (and `PhoneInput`'s own country sheet) call `Keyboard.dismiss()`
  before opening their sheet.** Without it, tapping the trigger while a text
  input is focused can leave the Android keyboard up, covering as much as 70%
  of the sheet's height.
- **Forms must use `useWatch({ control, name })`, never `watch()`** — `watch()` returns a fresh function each render and the React Compiler lint refuses it (`react-hooks/incompatible-library`).
- `useInteractionState` shows the focus ring only when the browser reports `:focus-visible`, so a mouse click leaves no ring while keyboard tabbing does.
- `useOverlayDismiss` holds `onDismiss` in a ref. Passing it an inline arrow used to re-run its effect every render ("Maximum update depth exceeded") once several overlays were mounted; the ref makes any caller safe.


## Shared composites (`src/components/shared`, import from `@/components/shared`)

| Component | Notes |
|---|---|
| `FormField` | Bridges react-hook-form to `Input`; translates i18n-key error messages. |
| `MoneyInput` | Stores **integer minor units**, never floats. Takes the **branch** currency and the locale; all parsing is in `lib/money`. Holds the raw text locally so a half-typed "12." is not reformatted mid-edit. |
| `SearchInput` | Debounced 300 ms, minimum 2 characters, reports only the debounced term so it can go straight into a query key (CLAUDE.md §6). |
| `TimePicker` | Minutes-from-midnight on a 15-minute step, built on `Select`. **No native date/time module**: it would need a rebuild, looks different per platform and has no web build. An off-step stored value stays selectable. |
| `DayHoursRow` | One weekday: open/closed toggle + interval list, so a split shift is two rows. Validates nothing itself — the DB holds the guarantees. |
| `Calendar` | **Month grid, hand-built, no dependency.** "Today" comes from the **branch timezone** (decision 23). RTL-ready via `row-reverse` + swapped arrows (not `I18nManager`, which needs a native reload). Weekday/month names from `Intl`. Supports `minDate`/`maxDate`, `disabledDates` and a selected range. **Reused by the Phase 3 public booking page.** Grid maths is a pure module (`calendarGrid.ts`) with 20 tests. |
| `DateRangePicker` | Calendar **dates**, not instants. Web keeps `<input type="date">` (browser calendar, keyboard, locale formatting for free); **native renders `Calendar`**. Tap picks start, then end; tapping below the start restarts the range. |
| `PhoneInput` (2026-10-04) | Country-code picker (own sheet, `src/config/dialCodes.ts` — 42 countries, **kept in step with** `create_booking`'s SQL fallback table) + a national-number `TextInput`. Reports/accepts real **E.164**, never a raw national number — `lib/config/e164.ts` holds the pure `toE164`/`fromE164` split (7 tests). Built for the public booking page's phone field; usable anywhere a phone number is collected. |
| `StatusBadge` (2026-10-05) | Appointment status → `Badge` tone + translated label, so the mapping lives in one place. |
| `Avatar` (2026-10-05) | Round initials circle for a person (client/staff). `BusinessAvatar` (DESIGN_GUIDE) stays the separate rounded-square variant for a business/logo — not built yet. |
| `DataTable` (2026-10-05) | Desktop/tablet table (DESIGN_GUIDE §12.15 — "the only table in the app" there, now the second). `minWidth` 44rem is the **floor, not the width**: the scroll view's `contentContainerStyle` has `flexGrow: 1` and the table `flex: 1`, so it stretches to the container and only scrolls horizontally when it genuinely does not fit. Without that it hugged 704px and stopped at ~60% of a 1440px page. Whole row clickable, no per-row actions; a column can `hideOnCompact`. Built for Clients, generic over any `{ id: string }` row. |

`src/components/shared/scheduler/` (2026-10-05, for the Calendar's Day/Week
grid — see `context/appointments-ui.md`): `StaffColumnsGrid` (hour ruler +
one `StaffDayColumn` per staff, shared vertical scroll) and `HourRuler`.
**`fillWidth`** (2026-10-05) makes the columns share the remaining width instead
of each taking `columnWidth`: mobile renders exactly one column, and a fixed
220px there left ~70px of dead space beside the grid on a phone. A caller using
`fillWidth` must NOT wrap the grid in a horizontal `ScrollView` — a flexing child
inside one collapses — so `DayView` renders a plain `View` on mobile and the
`ScrollView` only on tablet/desktop.
Appointment blocks lay out via `src/features/appointments/timeGrid.ts`'s
pure sweep-line column assignment (overlaps sit side by side).

Added in Phase 7B: `StarRating` / `StarRatingInput` (+ pure `starFlags`/`isRating` in `starFlags.ts`; the input is a 5-button radio group, >= 44px targets).

## Layout & shell (`src/components/layout`)

| Component | Role |
|---|---|
| `Screen` | Base of every screen: safe-area insets, status bar style, Android nav-bar button style, keyboard avoidance (`KeyboardAwareScrollView` + `KeyboardStickyView` footer), scroll, pull-to-refresh. Adds **no** page padding. |
| `PageContainer` | Page padding (24 / 16 mobile), optional max width, title + subtitle + count pill + actions. The page title lives here, never in the header. **Sized by its content; `flex: 1` only with the `fill` prop** (see below). |
| `usePagePadding()` | The same number `PageContainer` pads with (24 / 16 mobile). A screen that puts a `flex: 1` body BESIDE `PageContainer` must pad that body with this, or the body sits out of line with the page title. |
| `ConsumedInsetsProvider` / `useConsumedInsets` | Lets a bar above `Screen` (the trial banner on mobile) claim the top inset so `Screen` does not add it twice. |
| `AppShell` | Picks the layout by `useBreakpoint()`: mobile = no chrome (tabs come from the Tabs layout); tablet = header + off-canvas sidebar (Escape / Android back / scrim close it); desktop = fixed 240px sidebar + 64px header. |
| `Sidebar` | Teal 240px, lime active pill, items from `config/navigation`. Tablet variant shows a close button and closes on navigate. |
| `Header` | 64px surface bar: business name + user-menu placeholder; hamburger on tablet only. Shows a pending-approval chip (2026-10-05, `appointments.approve` holders only) that routes to `/calendar`. |
| `BottomTabBar` | Our own bar passed to Expo Router's `Tabs` via `tabBar`, so routing/history/state restoration stay native while the bar looks identical on Android, iOS and mobile web. Always adds `insets.bottom`; 44px targets; tab labels capped at `maxFontSizeMultiplier` 1.3. Calendar tab shows a small count dot (2026-10-05, same `appointments.approve` gate as `Header`'s chip) via a generic `badgeCount` prop on `TabButton`. **Normalizes `route.name`** (strips a trailing `/index`) before any config-driven lookup — a folder-based tab's real route name is `"<folder>/index"`, not the plain config name (2026-10-05, found via the Clients tab silently vanishing — see `_handoff.md` Traps). |
| `InstallHint` | Web-only dismissible "Install app" bar; iOS Safari shows "Share -> Add to Home Screen". Dismissal stored in localStorage. |
| `ServiceWorkerUpdater` | Registers the SW and shows the "Update available" toast with a Reload action. |

Navigation is driven entirely by **`src/config/navigation.ts`**: `navItems` (id, route, icon, `permission`, `phase`, `primary`). The sidebar, the bottom tabs and the More screen all read it through **`useVisibleNav()`**, so gating lives in one place. `permission` is typed `PermissionKey`, and plan/add-on gating comes from that key's catalogue entry (there is no separate `feature` field). **Gating is live** — see `context/roles.md`. Hiding is not the boundary: every `(app)` screen is wrapped in `RouteGuard`, which refuses a typed URL, and RLS refuses the data.

Routes: `/` redirects to `/today`. Tabs = Today, Calendar, Clients, More. Services, Staff, Invoices, Reports, Reviews and Settings are registered with `href: null` (reachable from More and the sidebar, never shown as a tab). `clients` and `settings` are both nested routes (a FOLDER, not a flat file: `clients/index.tsx` + `clients/[id].tsx`) — the `Tabs.Screen name="clients"` still resolves to `clients/index.tsx` automatically. **A folder shown in the bottom tab bar needs its OWN `clients/_layout.tsx` (a plain `Stack`)**, or Expo Router flattens every file in the folder into the PARENT Tabs navigator as sibling tab routes instead of nesting `[id]` inside a Stack — confirmed the hard way (see `_handoff.md` Traps): without it, the Clients tab itself disappeared from the bottom bar, because the folder screen's real `route.name` came through as `"clients/index"`, not `"clients"`. `settings/` has no `_layout.tsx` and gets away with it only because it is never shown in the bottom tab bar.

Back behaviour: `useOverlayDismiss` closes the off-canvas sidebar, dialogs and drawers on Android hardware back and on Escape (web) before the route pops. iOS swipe-back is the Stack default and stays on.

**`PageContainer` must NOT stretch when it has a sibling body.** It used to carry
`flex: 1` unconditionally. On the three screens that put a `flex: 1` body next to
it (Calendar, Clients, Today) the two flex siblings then split the height ~50/50,
so a container holding only a title and a tab strip took half the screen — the
big dead gap under the tabs — and the real content was squeezed into what was
left. `flex: 1` now comes only from the opt-in **`fill`** prop, for the case it
was written for: `PageContainer` as the ONLY child of a non-scrolling `Screen`
whose children need the full height. Inside a scrolling `Screen` it is never
needed (`scrollContent` already has `flexGrow: 1`). No call site currently needs
`fill`. Related: a `flex: 1` child INSIDE a scrolling `Screen` cannot grow and
only squeezes its own content (Today had this too).

**Screens inside the bottom tabs must pass `edges={['top']}` to `Screen`.** The tab bar already sits in the bottom inset and adds its own padding; keeping the default `['top','bottom']` pads it twice — barely visible on iOS, but a ~48px dead gap on Android with 3-button navigation.

**Android navigation bar naming is counter-intuitive and the TypeScript doc is wrong.** For both `expo-navigation-bar`'s plugin and its runtime `setStyle`, `'dark'` means *dark buttons on a light bar* (`windowLightNavigationBar=true`) — confirmed in `NavigationBarModule.kt` (`val hasLightBackground = style == "dark"`). The published `NavigationBarStyle` doc comment says the opposite. Our light screens therefore use `'dark'`. It only takes effect with button navigation and `enforceContrast: false`.

## Root providers (app/_layout.tsx, outer → inner)

GestureHandlerRootView → SafeAreaProvider → KeyboardProvider → I18nextProvider → QueryClientProvider → **ToastProvider** (+ `ServiceWorkerUpdater`) → StatusBar(dark) + Stack (headerShown false, background colour). Also: `useAppFocusManager()`, `useOnlineManager()`, `useTabletOrientation()`, `useSupabaseAutoRefresh()`, `applyDirection()`, `registerServiceWorker()`.

## Env

- `.env.example` (5 `EXPO_PUBLIC_*` keys). `.env*` gitignored except examples.
- Missing Supabase keys → one `console.warn` in dev, app still runs; `getSupabase()` throws `SupabaseNotConfiguredError` inside queryFns (shows as query error).
- **TODO:** `https://app.wapee.com` and `https://wapee.site` are **placeholders** (no domain bought). Update brand.ts defaults + .env when real.

## Data layer

- `queryClient` defaults: staleTime 30s, gcTime 5m, retry ≤2 (never 4xx), refetch on focus/reconnect; mutations no retry.
- `staleTimes`: static 5m, staticLong 10m, list 30s, listLong 60s, live 0, liveShort 15s.
- `createQueryKeys('feature')` → `all, scope(s), lists(s), list({businessId, branchId, filters, sort, search, pageSize}), details(s), detail(s, id)`; every key carries `{businessId, branchId}`.
- Supabase auth storage: native = SecureStore chunked (1800 chars, keys `<key>.n` + `<key>.<i>`); web = localStorage (SSR-safe). Native uses `processLock`; token refresh tied to AppState.

## i18n

- Instance `i18n` from `@/lib/i18n` (created with `createInstance`). Resources bundled, sync init. Language = first supported device language, else `en`.
- Namespaces: `common` (default). Add namespace: `locales/en/<ns>.json` + register in `resources.ts`. Keys are typed (`i18next.d.ts`).
- RTL: `getDirection/isRtl/applyDirection` (web sets `<html dir lang>`; native I18nManager, needs reload on change).

## Platform config

- IDs: iOS bundle + Android package `com.wapee.app`; scheme `wapee`.
- Orientation: phones portrait; iPad all (`UISupportedInterfaceOrientations~ipad`). Android: the activity is portrait, and `useTabletOrientation()` releases the lock at runtime when the larger screen edge is >= 768px.
- Android edge-to-edge always on (SDK 57); nav bar `style: dark`, `enforceContrast: false`; `predictiveBackGestureEnabled: false` until back handling is built.
- Splash: primary background `#024751` + W mark.

## PWA

- Manifest generated from brand: standalone, theme `#024751`, background `#f8fafb`, any + maskable icons.
- SW: caches shell (`/`, manifest, icons) + same-origin `/_expo/static/`, `/assets/`, `/icons/`. Never cross-origin (Supabase). Navigations network-first. Registered only on web in production builds.
- Update flow: `registerServiceWorker({ onUpdateAvailable })` posts `SKIP_WAITING` then reloads. Toast not wired yet.
- Not built yet: install hint / iOS "Add to Home Screen" instructions, Web Push.

## Scripts

start, web, ios (`expo run:ios`), android (`expo run:android`), lint (0 warnings), typecheck, **test** (`vitest run`), **test:watch**, format, format:check, build:web, manifest.
Unit tests live beside the code as `*.test.ts` and cover pure logic only (no RN renderer); `vitest.config.mts` stubs `lucide-react-native` so `config/navigation.ts` can be imported in Node.
`build:web` runs `generate-web-manifest` + `strip-dev-routes` first and restores the dev routes after, so `/_gallery` never ships (Metro does not tree-shake a `__DEV__` branch, so the route file must be absent at build time).

## Known limits / TODO

- Placeholder URLs (see Env). Placeholder icons.
- The gallery (`app/_gallery.tsx` + `src/dev/ComponentGallery.tsx`), `ComingSoonScreen` and `PlaceholderScreen` are temporary; delete them as real screens land. The gallery is reachable from More in dev.
- Header user menu is still a placeholder. Both Sign out buttons are now wired to `useSignOut()`.
- No business/branch switcher UI yet; `useScopeSelection` supports one (see roles.md).
- Tablet/desktop have no bottom tabs by design; the Tabs navigator still owns routing there, with the bar hidden.
- Toast look is Wapee's own design: DESIGN_GUIDE §12.23 has no toast (it only reserves z-index 70).
- Android not verified (no emulator on this machine).
- Adding a native module (as expo-screen-orientation did) means the dev build must be rebuilt with `npm run ios` / `npm run android`.

## Changelog
- 2026-10-08: Edge shared module `supabase/functions/_shared/outbox/` (templates, signed unsubscribe, job processor, providers) for Phase 6A; vitest now also runs `supabase/functions/**/*.test.ts`.
- 2026-10-07: Phase 7B — `StarRating`/`StarRatingInput`; `expo-image-picker` added (native module, plugin in `app.config.ts`, lazy-imported); `formatDuration` guarded against Hermes' wrong unit output (`sensibleUnitText`); nav item `website`.

- 2026-10-06 (Phase 5B): `app/+html.tsx` gained a print stylesheet (`@media print` flattens the fixed-height app shell; `[data-no-print]` hides toolbars). New standalone route `app/invoice-print/[id].tsx` (outside `(app)`). Reports nav icon is now `BarChart3`. No new shared UI primitive; invoice composites live in `src/features/invoices/`.

- 2026-10-05 (UI polish): **`PageContainer` no longer stretches by default** —
  the root cause of the dead vertical gap on Calendar, Clients and Today (two
  `flex: 1` siblings splitting the height). New opt-in `fill` prop; new
  `usePagePadding()` so a sibling body lines up with the page title instead of
  hard-coding `theme.layout.pagePadding` (which was 8px too wide on mobile).
  `DataTable` now stretches to its container; the scheduler grid gained
  `fillWidth` for the single mobile column. `DayView` gained `hideDateNav`
  (WeekView was stacking two date navigators) and its date label now shrinks
  instead of pushing the Today button off a 320px screen. Screenshot rule added
  to CLAUDE.md §4.

- 2026-10-05 (Phase 4 part B2): `DataTable` shared composite (Clients
  desktop view). First nested-route tab (`clients/index.tsx` +
  `clients/[id].tsx`) — the `settings/` pattern (a folder matching the tab
  name, no `_layout.tsx`) does NOT extend cleanly to a folder shown in the
  bottom tab bar: needed a new `clients/_layout.tsx` (`Stack`) and a
  `BottomTabBar` fix once this was click-tested and the Clients tab turned
  out to be missing entirely — see Traps in `_handoff.md` for the full
  story. `settings/` only got away without one because it is never shown
  in the bar.

- 2026-10-05: `lib/time` fully implemented (was partial — `zonedToUtc`/
  `utcToZoned`/`dayRangeUtc`/`formatDate`/`formatTime`/`formatDateTime`/
  `formatRelative`/`nowUtc`/`addMinutesUtc`/`getDeviceTimeZone`/
  `isValidTimeZone`), needed by the Phase 4 Calendar UI. `expo-localization`
  stubbed for vitest (pulls in react-native/Flow otherwise), same pattern as
  the existing `lucide-react-native` stub. `StatusBadge`, `Avatar`, and
  `components/shared/scheduler/` (the Day/Week calendar grid) added — see
  `context/appointments-ui.md`. `Header`/`BottomTabBar` gained a
  pending-approval badge.

- 2026-10-04: `SegmentedControl`, `Collapsible`, `NumberStepper` primitives; the
  reusable public booking components in `src/features/booking-public/components/`
  (ServiceList, StaffChoice, SlotGrid, BookingFormPreview) which step 5 reuses for
  the real public page.

- 2026-10-02: `Calendar` month grid (+ pure `calendarGrid` module, 20 tests) used by `DateRangePicker` on native; calendar-date helpers in `lib/time` (18 tests incl. date line, DST and leap years). Gallery shows all of them.
- 2026-10-02: Shared composites (MoneyInput, SearchInput, TimePicker, DayHoursRow, DateRangePicker) + `components/shared/index.ts`; money and minute-of-day helpers implemented with 31 tests.
- 2026-10-02: `ErrorState` primitive; vitest + `npm test`; expo-clipboard (needs a rebuild).
- 2026-10-02: `src/lib/permissions/` added and wired into navigation (`useVisibleNav`, `RouteGuard`); nav `feature` field dropped; sign out wired. See roles.md.
- 2026-10-01: Responsive shell (Screen, PageContainer, AppShell, Sidebar, Header, BottomTabBar), navigation config, app routes, PWA install hint + update toast.
- 2026-10-01: Base UI components (Button, Input, Card, Badge, Skeleton, Spinner, EmptyState, Toggle, Tabs, Dialog, Drawer, Toast) + dev gallery; reserved slugs; NetInfo online manager; tablet orientation.
- 2026-10-01: Phase 0 initial setup (project, libs, theme, providers, env, query, supabase client, i18n, PWA basics, placeholder routes).
