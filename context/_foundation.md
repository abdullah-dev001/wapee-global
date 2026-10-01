# Foundation

Status: in progress · Phase: 0 · Last updated: 2026-10-01

## What it is

Project setup every feature builds on: Expo app, theme, providers, env, data layer, i18n, PWA, the base UI primitives and the responsive app shell. No feature screens yet (every route is a "coming in phase N" placeholder).

## Stack (installed with `npx expo install`)

- Expo SDK **57** (expo 57.0.x, RN 0.86, React 19.2), Expo Router 57, TypeScript 6 strict (+ `noUncheckedIndexedAccess`).
- Router entry: `package.json` `main: expo-router/entry`. Web output **static** (SSR at build): no `window`/`document` at module level.
- Libraries: @tanstack/react-query, zustand, react-hook-form, zod 4, @hookform/resolvers, i18next, react-i18next, expo-localization, lucide-react-native (+ react-native-svg), @expo-google-fonts/dm-sans, expo-font, expo-splash-screen, date-fns, date-fns-tz, expo-status-bar, expo-navigation-bar, expo-system-ui, react-native-safe-area-context, react-native-screens, react-native-gesture-handler, react-native-reanimated 4 (+ react-native-worklets), react-native-keyboard-controller, @supabase/supabase-js, expo-secure-store, expo-notifications, expo-dev-client, expo-screen-orientation, @react-native-community/netinfo, react-native-web, react-dom.
- Dev: eslint 9 (flat) + eslint-config-expo + typescript-eslint (strict) + prettier + eslint-config-prettier.
- **Development build required** (keyboard-controller etc.); Expo Go not supported.
- Not installed yet: charts lib (ask), expo-haptics, expo-device.

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
| src/lib/supabase/                                                                                                        | client (`supabase`, `getSupabase()`), auth storage, auto refresh, placeholder types         |
| src/lib/i18n/                                                                                                            | i18next instance, resources, typed keys, RTL helpers                                        |
| src/lib/time/index.ts · src/lib/money/index.ts                                                                           | SKELETONS: typed signatures, bodies throw `notImplemented()`                                |
| src/lib/notImplemented.ts                                                                                                | Throw helper for skeletons                                                                  |
| src/lib/pwa/registerServiceWorker.ts                                                                                     | Registers /sw.js (web + production only), update hook                                       |
| public/sw.js                                                                                                             | Service worker stub (shell + static only)                                                   |
| public/icons/                                                                                                            | PWA placeholder icons (192/512, maskable 192/512, apple-touch 180, favicon 32)              |
| assets/images/                                                                                                           | Native icon, adaptive icon fg/monochrome, splash icon, favicon (placeholders)               |
| scripts/generate-web-manifest.mjs                                                                                        | Writes public/manifest.json from brand.ts (gitignored output)                               |
| src/components/ui/ | Base UI primitives (see "UI components") + barrel `index.ts` |
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
| `Toggle` | `value`, `onValueChange`, `label`, `disabled` | 36×20 track, 14px thumb, animated 180ms. |
| `Tabs` | `items`, `value`, `onChange` | Underline style; strip scrolls horizontally. Generic over the value type. |
| `Dialog` | `open`, `onClose`, `title`, `message`, `confirm`, `cancelLabel`, `busy` | Centred, max 416px. Escape / Android back / scrim tap close it (`busy` blocks). |
| `Drawer` | `open`, `onClose`, `title`, `subtitle`, `footer` | 480px from the end edge; full-screen sheet on mobile. Footer pinned above the safe area. |
| `ToastProvider` + `useToast()` | `show({ message, tone, duration })` | Mounted in the root layout. `duration: 0` = manual dismiss. Max 3 visible, z-index 70. |

Shared internals: `useInteractionState()` (hover/focus/pressed; hover and focus ring are web-only) and `useOverlayDismiss()` (Escape + scroll lock on web, Android hardware back).

Conventions:
- Disabled and loading both render at `opacity 0.55` and block presses.
- Hover exists only on web; the focus ring is drawn only on web (`focusRing()`).
- Not built yet: Select, Checkbox/Radio, Segmented control, Pagination, DataTable, SearchInput, PhoneInput, DatePicker, TimeSlotPicker, MoneyInput, Avatar, Collapsible, StepWizard, FormAlert, StatCard.
- `useInteractionState` shows the focus ring only when the browser reports `:focus-visible`, so a mouse click leaves no ring while keyboard tabbing does.


## Layout & shell (`src/components/layout`)

| Component | Role |
|---|---|
| `Screen` | Base of every screen: safe-area insets, status bar style, Android nav-bar button style, keyboard avoidance (`KeyboardAwareScrollView` + `KeyboardStickyView` footer), scroll, pull-to-refresh. Adds **no** page padding. |
| `PageContainer` | Page padding (24 / 16 mobile), optional max width, title + subtitle + count pill + actions. The page title lives here, never in the header. |
| `AppShell` | Picks the layout by `useBreakpoint()`: mobile = no chrome (tabs come from the Tabs layout); tablet = header + off-canvas sidebar (Escape / Android back / scrim close it); desktop = fixed 240px sidebar + 64px header. |
| `Sidebar` | Teal 240px, lime active pill, items from `config/navigation`. Tablet variant shows a close button and closes on navigate. |
| `Header` | 64px surface bar: business name + user-menu placeholder; hamburger on tablet only. |
| `BottomTabBar` | Our own bar passed to Expo Router's `Tabs` via `tabBar`, so routing/history/state restoration stay native while the bar looks identical on Android, iOS and mobile web. Always adds `insets.bottom`; 44px targets; tab labels capped at `maxFontSizeMultiplier` 1.3. |
| `InstallHint` | Web-only dismissible "Install app" bar; iOS Safari shows "Share -> Add to Home Screen". Dismissal stored in localStorage. |
| `ServiceWorkerUpdater` | Registers the SW and shows the "Update available" toast with a Reload action. |

Navigation is driven entirely by **`src/config/navigation.ts`**: `navItems` (id, route, icon, `permission`, `feature`, `phase`, `primary`). The sidebar, the bottom tabs and the More screen all read it, so gating (`can()`, `useFeature()`) can be added in one place later. `permission`/`feature` are declared but **not enforced yet** — no auth or plans exist in Phase 0.

Routes: `/` redirects to `/today`. Tabs = Today, Calendar, Clients, More. Services, Staff, Invoices, Reports, Reviews and Settings are registered with `href: null` (reachable from More and the sidebar, never shown as a tab).

Back behaviour: `useOverlayDismiss` closes the off-canvas sidebar, dialogs and drawers on Android hardware back and on Escape (web) before the route pops. iOS swipe-back is the Stack default and stays on.

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

start, web, ios (`expo run:ios`), android (`expo run:android`), lint (0 warnings), typecheck, format, format:check, build:web, manifest.
`build:web` runs `generate-web-manifest` + `strip-dev-routes` first and restores the dev routes after, so `/_gallery` never ships (Metro does not tree-shake a `__DEV__` branch, so the route file must be absent at build time).

## Known limits / TODO

- Placeholder URLs (see Env). Placeholder icons.
- The gallery (`app/_gallery.tsx` + `src/dev/ComponentGallery.tsx`), `ComingSoonScreen` and `PlaceholderScreen` are temporary; delete them as real screens land. The gallery is reachable from More in dev.
- Header user menu and both Sign out buttons are placeholders (Phase 1).
- Tablet/desktop have no bottom tabs by design; the Tabs navigator still owns routing there, with the bar hidden.
- Toast look is Wapee's own design: DESIGN_GUIDE §12.23 has no toast (it only reserves z-index 70).
- Android not verified (no emulator on this machine).
- Adding a native module (as expo-screen-orientation did) means the dev build must be rebuilt with `npm run ios` / `npm run android`.

## Changelog

- 2026-10-01: Responsive shell (Screen, PageContainer, AppShell, Sidebar, Header, BottomTabBar), navigation config, app routes, PWA install hint + update toast.
- 2026-10-01: Base UI components (Button, Input, Card, Badge, Skeleton, Spinner, EmptyState, Toggle, Tabs, Dialog, Drawer, Toast) + dev gallery; reserved slugs; NetInfo online manager; tablet orientation.
- 2026-10-01: Phase 0 initial setup (project, libs, theme, providers, env, query, supabase client, i18n, PWA basics, placeholder routes).
