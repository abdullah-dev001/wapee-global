# Wapee Design System Guide

An exact specification of the Wapee **dashboard / auth / admin** UI, taken from the source. Every value below is quoted from the code and cites its file. Paths are relative to the repo root.

**Scope.** This guide covers the owner dashboard (`/dashboard`), the auth pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`), the staff admin (`/admin`) and the shared component library in `src/components/*.jsx`. The public **tenant portfolio** pages (`src/components/portfolio/**`, `src/pages/portfolio/**`) use a separate theme that each owner configures (their own colour, font and radius, from `src/lib/portfolioTheme.js`). Those pages appear only where they share tokens or where they disagree with the system.

**Units.** Sizes are given in `rem` as written in the code. The root font size is the browser default (16px) on tablet and desktop, and **15px under 768px** (`src/globals.css:224-226`), so every rem value shrinks by 6.25% on mobile. Where a px value is shown in brackets it assumes 16px.

---

## 1. Stack & Sources

| Concern | What is used | Source |
|---|---|---|
| Build | Vite 8 + `@vitejs/plugin-react` | `package.json`, `vite.config.js` |
| UI | React 19 (`react` ^19.2.8), react-router ^8.3.0 | `package.json` |
| Language | JavaScript (`.jsx`), no TypeScript | `CLAUDE.md` |
| CSS framework | Tailwind CSS v4 (`tailwindcss` ^4.3.3) via `@tailwindcss/vite` | `package.json`, `vite.config.js:3,8` |
| Tailwind config | **No `tailwind.config.*` file.** v4 CSS-first config: `@import 'tailwindcss'` plus one `@theme inline` block | `src/globals.css:1`, `src/globals.css:150-164` |
| Tailwind utility usage | **None.** `className=` appears 0 times in `src/`. Tailwind supplies only its preflight reset. All styling is React inline `style={{}}` reading CSS variables | grep of `src/` |
| Component library | **None** (no shadcn/ui, no `components.json`, no MUI or Radix). All components are hand-written in `src/components/` | repo scan |
| CSS-in-JS | None (no styled-components or emotion) | `package.json` |
| Fonts | Google Fonts `<link>` in `index.html` (DM Sans; plus 8 portfolio fonts) | `index.html:8-21` |
| Icons | `lucide-react` ^1.32.0 (primary); `react-icons` ^5.7.0 (only `FaInstagram`, `FaFacebookF`, `FaTiktok`) | `package.json`; `src/pages/dashboard/portfolio/ContactEditor.jsx:6`, `src/pages/admin/ProAccessRequestCard.jsx:6`, `src/components/portfolio/ContactSection.jsx:6` |
| Animation library | **None** (no framer-motion). CSS `@keyframes` in `globals.css` plus inline `transition` | `src/globals.css:333-521` |
| Charts | **None.** No chart library is installed | `package.json` |
| Forms | Formik ^2.4.9 + Yup ^1.7.1 | `package.json` |

### Every styling source file

| File | Role |
|---|---|
| `index.html` | Font `<link>`s, `theme-color` meta `#024751` (`index.html:24`) |
| `src/globals.css` | **The only stylesheet.** All tokens (`:root`), the `@theme inline` bridge, base reset, scrollbar, focus, keyframes, reduced motion |
| `src/lib/breakpoints.js` | Breakpoint numbers + `matchMedia` strings |
| `src/hooks/useBreakpoint.js` | `{ isMobile, isTablet, isCompact, isDesktop }` |
| `src/lib/portfolioTheme.js` | Owner-selectable portfolio fonts and radii (tenant pages only) |
| `src/components/*.jsx` | Every component's styles, inline |
| `src/assets/*.svg` | Logo wordmarks (`primary-logo-trimmed.svg`, `secondary-logo-trimmed.svg`) |

---

## 2. Color Tokens

**Dark mode: NOT DEFINED IN CODE.** No `prefers-color-scheme`, `.dark`, `data-theme` or `darkMode` appears anywhere in `src/`. Only a light theme exists. `TimeField` forces `colorScheme: 'light'` (`src/pages/dashboard/settings/BusinessHoursSection.jsx:194`).

All tokens are declared in `:root` in `src/globals.css`. The table gives each value exactly as written (lower-case hex).

### Brand: `src/globals.css:11-16`

| Token | Value | Used for |
|---|---|---|
| `--color-primary` | `#024751` | Primary button bg, focus border on inputs, active tab text and underline, active page button, toggle "on", step circles, links ("Create an account", "Forgot password?"), StatCard icon colour, global `:focus-visible` outline |
| `--color-primary-hover` | `#013640` | Primary button hover bg and border |
| `--color-primary-light` | `#e6f0f2` | Input focus ring (`0 0 0 3px`), StatCard icon tile bg, avatar fallback bg, `primary` Badge bg and border, ImageUpload drag-over bg, compact UpgradeBanner bg, featured card ring, landing hero gradient start |
| `--color-secondary` | `#d8ff29` | Secondary button bg. Lime accent |
| `--color-secondary-hover` | `#c4eb1a` | Secondary button hover |
| `--color-secondary-light` | `#f6ffd6` | ProUpsellPage check-bullet circle bg (`src/components/ProUpsellPage.jsx:119`) |

### Surface: `src/globals.css:19-23`

| Token | Value | Used for |
|---|---|---|
| `--color-background` | `#f8fafb` | `body` bg, dashboard/admin/auth page bg, scrollbar thumb border |
| `--color-surface` | `#ffffff` | Cards, header, drawer, inputs, dialogs, table container, page buttons, Toggle thumb |
| `--color-surface-hover` | `#f3f4f6` | Ghost button hover, disabled input bg, skeleton blocks, neutral badge bg, table row hover, image placeholder bg, EmptyState icon circle, count pill |
| `--color-border` | `#e5e7eb` | Default 1px border on everything; Toggle "off" track; scrollbar thumb |
| `--color-border-subtle` | `#f0f0f0` | Inner dividers: card action row (`CatalogItemCard.jsx:142`), table row separators (`AdminBusinessesPage.jsx:124`), settings dividers (`ProfileSection.jsx:24`), upsell price row |

### Text: `src/globals.css:26-30`

| Token | Value | Used for |
|---|---|---|
| `--color-text-primary` | `#111827` | Body text (`body` colour), labels, titles, values |
| `--color-text-secondary` | `#4b5563` | Subtitles, hints, descriptions, inactive tabs, page-button numbers |
| `--color-text-muted` | `#6b7280` | Input prefix, chevrons and icons in inputs, table headers, timestamps, placeholders of empty media, "or" divider, ghost hover border |
| `--color-text-on-primary` | `#ffffff` | Text on primary/danger fills; sidebar hover text |
| `--color-text-on-secondary` | `#024751` | Text on lime fills |

> **Contrast (Phase 11, WCAG AA 4.5:1).** `text-muted` was `#9ca3af` (2.5:1 on white) and failed AA for helper text, timestamps and table headers. It is now `#6b7280` (4.8:1 on white, 4.6:1 on `--color-background`); `text-secondary` moved to `#4b5563` (7.6:1) so the two stay visibly different. Status colours (`success` / `warning` / `error` / `info`) are for fills, borders and icons; as small TEXT on their light tints they are 2.1-3.4:1, so text uses `successText #047857`, `warningText #92400e`, `errorText #b91c1c`, `infoText #1d4ed8` (5.2-6.8:1). The `Text` and `Badge` components apply this automatically.

### Sidebar: `src/globals.css:33-37`

| Token | Value | Used for |
|---|---|---|
| `--color-sidebar-bg` | `#024751` | Owner sidebar bg |
| `--color-sidebar-text` | `#a8c5ca` | Inactive nav item text, close icon, account email, logout |
| `--color-sidebar-active` | `#d8ff29` | Active nav item bg (lime pill); dark-tone avatar initial colour |
| `--color-sidebar-active-text` | `#024751` | Active nav item text |
| `--color-sidebar-hover` | `#035f6e` | Nav item hover bg; account-section top border; dark-tone avatar bg |

### Status: `src/globals.css:40-52`

| Status | Base | `-light` (bg) | `-border` | Other |
|---|---|---|---|---|
| Success | `--color-success: #10b981` | `#ecfdf5` | `#a7f3d0` | — |
| Warning | `--color-warning: #f59e0b` | `#fffbeb` | `#fde68a` | — |
| Error | `--color-error: #ef4444` | `#fef2f2` | `#fecaca` | `--color-error-hover: #dc2626` |
| Info | `--color-info: #3b82f6` | `#eff6ff` | `#bfdbfe` | — |

There is no `--color-success-hover`, `--color-warning-hover` or `--color-info-hover`. Only error has a hover shade, because only the `danger` button needs one.

### Misc: `src/globals.css:55-62`

| Token | Value | Used for |
|---|---|---|
| `--color-overlay` | `rgba(0, 0, 0, 0.5)` | Scrim behind drawers, dialogs and the mobile sidebar |
| `--color-locked-scrim-top` | `rgba(248, 250, 251, 0.72)` | Top of the gradient over the blurred Pro analytics teaser |
| `--color-locked-scrim-bottom` | `rgba(248, 250, 251, 0.92)` | Bottom of the same gradient (`src/pages/dashboard/AnalyticsTeaser.jsx:251`) |

### Portfolio loader (tenant splash only): `src/globals.css:66-84`

`--portfolio-loader-bg: #1a1a1a` · `--portfolio-loader-track: rgba(255, 255, 255, 0.12)` · `--portfolio-loader-sweep: linear-gradient(90deg, rgba(216, 255, 41, 0) 0%, rgba(216, 255, 41, 0.85) 50%, rgba(216, 255, 41, 0) 100%)` · `--portfolio-loader-glow: radial-gradient(60rem 32rem at 50% 42%, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0) 70%)`

### Hard-coded colours outside the tokens (admin shell)

The staff admin shell deliberately uses a slate palette so it can't be mistaken for an owner dashboard (`src/components/admin/AdminLayout.jsx:15-18`). These colours are **literal hex values with no tokens**:

| Value | Used for | Source |
|---|---|---|
| `#0F172A` | Admin sidebar bg; active nav text | `AdminLayout.jsx:69,146`; `AdminAccountSection.jsx` |
| `#1E293B` | Admin dividers; logout hover bg | `AdminLayout.jsx:189`; `AdminAccountSection.jsx:19,87` |
| `#94A3B8` | Admin nav text, icons | `AdminLayout.jsx:104,146,198`; `AdminAccountSection.jsx:80,92` |
| `#64748B` | Admin account label | `AdminAccountSection.jsx:25` |
| `#E2E8F0` | Admin account name | `AdminAccountSection.jsx:39` |
| `#FCA5A5` | Admin logout error text | `AdminAccountSection.jsx:57` |
| `#FFFFFF` | "Wapee Admin" wordmark, count badge text | `AdminLayout.jsx:92,171` |
| `#D8FF29` | Admin active nav bg (same value as `--color-secondary`) | `AdminLayout.jsx:147` |

Google's brand colours `#4285F4 #34A853 #FBBC05 #EA4335` appear only inside the Google "G" SVG (`src/components/GoogleAuthButton.jsx:6-9`).

### Opacity variants (not tokens; literal in components)

| Value | Meaning | Source |
|---|---|---|
| `0.55` | Disabled/loading Button, disabled Toggle, disabled PageButton | `Button.jsx:93`, `Toggle.jsx:13`, `Pagination.jsx:116` |
| `0.45` | Disabled pagination arrow | `Pagination.jsx:143` |
| `0.5` | Disabled TagInput "+" button | `TagInput.jsx:163` |
| `0.6` | List or table fading during a background refetch | `CatalogPage.jsx:180`, `AdminBusinessesPage.jsx:96` |
| `0.45` (keyframe) | Skeleton pulse low point | `globals.css:339` |

### Chart colours: NOT DEFINED IN CODE

The only chart-like graphic is the decorative bar strip in the blurred teaser. Its bars are `--color-primary-light`, and the tallest bar is `--color-primary` (`AnalyticsTeaser.jsx:115-118`).

---

## 3. Typography

### Font family

```css
--font-sans: 'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;   /* src/globals.css:106 */
```

Applied on `body` (`globals.css:195`). `button, input, select, textarea` use `font-family: inherit; font-size: inherit; color: inherit` (`globals.css:269-276`).

**Loading** (`index.html:8-13`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,400&display=swap" rel="stylesheet" />
```

That loads a variable font: optical size 9–40, weights 300–700 upright, and italic 400. `display=swap`.

Rendering: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale` (`globals.css:198-199`).

Portfolio-only fonts (also loaded in `index.html:18-21`): Inter, Poppins, Playfair Display, Roboto, Montserrat, Lato, Nunito, Raleway (`src/lib/portfolioTheme.js:16-26`).

### Letter spacing: always tight

| Token | Value | Applied to |
|---|---|---|
| `--tracking-tight` | `-0.02em` | `body` default (`globals.css:197`); written inline on almost every text element (261 occurrences) |
| `--tracking-tighter` | `-0.03em` | All `h1`–`h6` (`globals.css:261`); big numbers (StatCard value, Revenue total, prices in the upsell); landing h1 (25 occurrences) |
| `--portfolio-tracking-label` | `0.08em` | Portfolio uppercase labels only |

`h1…h6, p, span, a, li, label, button, input, select, textarea, table { letter-spacing: inherit; }` (`globals.css:235-252`).

### Weights

Base headings: `h1–h6 { margin: 0; letter-spacing: var(--tracking-tighter); font-weight: 600; }` (`globals.css:254-263`).

Usage counts across dashboard, admin, auth and shared components: **600 → 90**, **700 → 18**, **500 → 9** (plus 14 as the inactive half of a ternary), **400 → 1**. Weight 300 is loaded but never used.

| Weight | Role |
|---|---|
| 400 | Body (browser default), table body cells, `/ month` suffix |
| 500 | Inactive tabs, nav items, page numbers, segmented options, tag chips, logout |
| 600 | **The default for anything labelled**: headings, labels, buttons, badges, active nav, table headers |
| 700 | Numbers: StatCard value, prices on cards, Revenue total, step-circle numerals, "Wapee Admin", count badge |

### Font-size scale (as used)

There are **no font-size tokens**; sizes are literal rems. Frequency across the dashboard, admin, auth and shared components:

| rem | px @16 | Count | Role |
|---|---|---|---|
| `0.625rem` | 10 | 1 | Smallest mobile label |
| `0.6875rem` | 11 | 16 | Badge text, sidebar email, admin count badge |
| `0.75rem` | 12 | 62 | Helper/error text, table header, count pill, card action buttons, FormDivider, SaveIndicator, timestamps |
| `0.8125rem` | 13 | **92 (most used)** | Labels, small button, subtitles in drawers, StatCard label, pagination, tab-like options, FormAlert, EmptyState description |
| `0.875rem` | 14 | 50 | **Input text**, md button, nav item, tab, page subtitle, table body, dialog message |
| `0.9375rem` | 15 | 11 | lg button, card title (`h3`), EmptyState title, header business name |
| `1rem` | 16 | 28 | Card section heading (`h2`), drawer/dialog title, price on card |
| `1.0625rem` | 17 | 5 | UpgradeBanner title |
| `1.125rem` | 18 | 2 | Mobile upsell title, PlanCard name |
| `1.25rem` | 20 | 3 | Mobile page title, mobile StatCard value |
| `1.375rem` | 22 | 3 | Auth card title, upsell title, upsell price |
| `1.5rem` | 24 | — | **Page title (desktop)**, StatCard value (desktop) |
| `1.75rem` / `2rem` | 28 / 32 | — | Revenue headline (mobile / desktop), legal page title |
| `1.625rem` / `2.25rem` | 26 / 36 | — | Landing section heading (mobile / desktop) (`SectionHeading.jsx:34`) |
| `2.125rem` / `3.25rem` | 34 / 52 | — | Landing hero h1 (mobile / desktop) (`HeroSection.jsx:54`) |

### Element → type spec

| Element | Size | Weight | Line-height | Tracking | Colour | Source |
|---|---|---|---|---|---|---|
| Page title `h1` | `1.5rem` (mobile `1.25rem`) | 600 (base) | normal | tighter (base) | text-primary | `PageHeader.jsx:26` |
| Page subtitle | `0.875rem` | 400 | normal | tight | text-secondary, `marginTop 0.25rem` | `PageHeader.jsx:50-55` |
| Card section title `h2` | `1rem` | 600 | normal | tighter (base) | text-primary, `marginBottom 1rem` (or `0.75rem` on Reports) | `OverviewPage.jsx:128`, `ReportsPage.jsx:137` |
| Settings section title `h2` + description | `1rem` / `0.8125rem` | 600 / 400 | — | — | primary / secondary; heading `marginBottom 0.25rem`, block `marginBottom 1.25rem` | `ProfileSection.jsx:74-78` |
| Drawer / dialog title `h2` | `1rem` | 600 | normal | **tight** (overrides base) | text-primary | `Drawer.jsx:79-84`, `ConfirmDialog.jsx:85-89` |
| Auth title `h1` | `1.375rem` | 600 | normal | tighter | text-primary, `marginBottom 0.375rem` | `AuthLayout.jsx:28` |
| Card item title `h3` | `0.9375rem` | 600 | normal | tight | text-primary | `CatalogItemCard.jsx:61-66` |
| Body / input text | `0.875rem` | 400 | normal (textarea `1.5`) | tight | text-primary | `Input.jsx:97`, `Textarea.jsx:62-64` |
| Field label | `0.8125rem` | 600 | normal | tight | text-primary | `Input.jsx:42-47` |
| Helper text | `0.75rem` | 400 | normal | tight | text-secondary | `Input.jsx:130-134` |
| Error text | `0.75rem` | 400 | normal | tight | error | `Input.jsx:119-123` |
| Button text | `0.8125rem` / `0.875rem` / `0.9375rem` (sm/md/lg) | 600 | `1.2` | tight | per variant | `Button.jsx:33-37,87-90` |
| Badge | `0.6875rem` | 600 | `1.3` | tight | per tone | `Badge.jsx:27-30` |
| Table header | `0.75rem` UPPERCASE | 600 | normal | tight | text-muted | `AdminBusinessesPage.jsx:174-182` |
| Table cell | `0.875rem` | 400 (600 when `strong`) | normal | tight | primary / secondary (`muted`) | `AdminBusinessesPage.jsx:193-199` |
| Stat value | `1.5rem` (mobile `1.25rem`) | 700 | `1.15` | tighter | text-primary | `StatCard.jsx:57-61` |
| Stat label | `0.8125rem` (mobile `0.75rem`) | 400 | normal | tight | text-secondary, `marginTop 0.125rem` | `StatCard.jsx:71-74` |
| Revenue headline | `2rem` (mobile `1.75rem`) | 700 | `1.15` | tighter | primary (muted when empty) | `ReportsPage.jsx:91-95` |
| Price on card | `1rem` | 700 | normal | tight | text-primary; compare price `0.8125rem` muted line-through | `CatalogItemCard.jsx:81-97` |
| Section/caps label | `0.75rem`–`0.8125rem` UPPERCASE | 600 | — | tight | text-muted | `FormDivider.jsx:10-14`, `AdminLayout.jsx:237-241` |
| Long-form paragraph (dialog/empty) | `0.875rem` / `0.8125rem` | 400 | `1.55` / `1.5` | tight | text-secondary | `ConfirmDialog.jsx:99-102`, `EmptyState.jsx:58-62` |

**Line-height tokens: NOT DEFINED IN CODE.** Literal values used: `1.5` (11), `1.6` (9), `1.55` (7), `1.45` (7), `1.3` (3), `1.2` (3), `1.15` (3), `1.65` (2), `1.4` (2), `1.1` (1). `--portfolio-body-line-height: 1.6` exists for portfolio only (`globals.css:97`).

**h4–h6, small and caption** have no specific styles beyond the base `h1–h6` rule.

---

## 4. Spacing

**Spacing scale: NOT DEFINED IN CODE** as tokens. Spacing uses literal rems, and in practice it falls on a quarter-rem grid with some eighth steps.

Gap values in use (frequency): `0.5rem` (64) · `0.75rem` (67) · `1rem` (41) · `0.625rem` (35) · `0.375rem` (35) · `0.875rem` (12) · `1.25rem` (10) · `0.25rem` (11) · `0.125rem` (5) · `1.5rem` (4) · `0.3125rem` (3) · `0.1875rem` (2).

So the effective scale is: **0.125 · 0.1875 · 0.25 · 0.3125 · 0.375 · 0.5 · 0.625 · 0.75 · 0.875 · 1 · 1.25 · 1.5 · 2 · 2.5 · 3 rem**.

### Layout tokens: `src/globals.css:129-138`

| Token | Value | Mobile override (`<768px`, `globals.css:214-216`) |
|---|---|---|
| `--page-padding` | `1.5rem` | `var(--page-padding-mobile)` = `1rem` |
| `--card-padding` | `1.5rem` | `var(--card-padding-mobile)` = `1.125rem` |
| `--sidebar-width` | `240px` | — |
| `--header-height` | `64px` | — |
| `--drawer-width` | `480px` | (Drawer goes `100%` via JS on mobile) |

### Standard spacing by context

| Context | Value | Source |
|---|---|---|
| Page content padding | `var(--page-padding)` all sides | `DashboardLayout.jsx:37` |
| Header horizontal padding | `0 var(--page-padding)` | `Header.jsx:37` |
| Card padding | `var(--card-padding)` | `Card.jsx:16` |
| Inner card body (item cards, skeleton) | `1rem` | `CatalogItemCard.jsx:58`, `CardGridSkeleton.jsx:32` |
| PageHeader → content | `marginBottom: 1.5rem`; title/action gap `1rem` (mobile `0.875rem`) | `PageHeader.jsx:19-21` |
| Filter bar → grid | `marginBottom: 1.25rem` (catalog), `1rem` (admin); internal gap `0.75rem` | `CatalogPage.jsx:95`, `AdminBusinessesPage.jsx:50-52` |
| Form field gap | **`1rem`** (flex column) | `LoginPage.jsx:64`, `CatalogDrawer.jsx:230`, `ProfileSection.jsx:82` |
| Label → control → helper | `0.375rem` | `Input.jsx:38` |
| Two-up field grid | `repeat(auto-fit, minmax(min(100%, 10rem), 1fr))`, gap `1rem` | `CatalogDrawer.jsx:266-267` |
| Card grid gutter | `1rem` | `CatalogPage.jsx:178` |
| Stat grid gutter | `1rem` (mobile `0.75rem`), `marginBottom 1.5rem` | `OverviewPage.jsx:97-98` |
| Section grid gutter | `1.5rem` (mobile `1rem`) | `OverviewPage.jsx:122`, `ReportsPage.jsx:132` |
| Stacked settings cards | `1.5rem` | `SettingsPage.jsx:13` |
| In-card divider | `margin: 1.25rem 0` | `ProfileSection.jsx:24` |
| Button group gap | `0.5rem` | `Drawer.jsx:132`, `ConfirmDialog.jsx:113` |
| Drawer header / body / footer padding | `1.125rem 1.25rem` / `1.25rem` / `1rem 1.25rem` | `Drawer.jsx:72,125,134` |
| Dialog padding | `1.5rem`, internal gap `0.625rem`, actions `marginTop 0.75rem` | `ConfirmDialog.jsx:78-81,117` |
| Pagination | `marginTop: 1.5rem`, gap `0.375rem` | `Pagination.jsx:38-40` |
| Tabs → panel | `marginBottom: 1.5rem` | `Tabs.jsx:19` |
| Auth page stack | gap `1.5rem` (logo / card / footer); card header `marginBottom 1.5rem` | `AuthLayout.jsx:17,27` |

---

## 5. Radius

`src/globals.css:111-115`

| Token | Value | px | Count | Used by |
|---|---|---|---|---|
| `--radius-sm` | `0.375rem` | 6 | 11 | Skeleton lines, StatCard value skeleton, colour-swatch input, teaser bar tops |
| `--radius-md` | `0.5rem` | 8 | **64 (most used)** | **Buttons, inputs, selects, textareas**, nav items, page buttons, card action buttons, FormAlert, BusinessAvatar, StatCard icon tile, image preview, drawer close button, segmented options |
| `--radius-lg` | `0.75rem` | 12 | 21 | **Cards**, dialogs, table container, collapsibles, item cards, skeleton cards, ImageUpload drop zone, UpgradeBanner, segmented-control track |
| `--radius-xl` | `1rem` | 16 | 2 | Landing page only (`FinalCtaSection.jsx:22`, `PortfolioMockup.jsx:23`) |
| `--radius-full` | `9999px` | — | 34 | Badges, count pills, tag chips, Toggle track and thumb, header user avatar, EmptyState/upsell icon circles, step circles, spinners, scrollbar thumb |

**Base radius = `--radius-md` (0.5rem / 8px)** for controls, and **`--radius-lg` (0.75rem / 12px)** for containers.

| Component | Radius |
|---|---|
| Buttons | md |
| Inputs / select / textarea / time | md |
| Cards | lg |
| Modals (ConfirmDialog, UpgradeDialog) | lg |
| Drawer | **0** (none set; flush to the viewport edge) |
| Badges / pills / tags | full |
| Avatars | user initial: full (`Header.jsx:117`); business avatar: **md** (`BusinessAvatar.jsx:25`) |
| Dropdowns | NOT DEFINED IN CODE (native `<select>` popup) |
| Tooltips | NOT DEFINED IN CODE (native `title` attribute only) |

Literal radii outside the tokens: `0.125rem` (11 times), `2px` (3), `1px` (2) and `999px` (1). All of them are in the miniature preview drawings in portfolio editors (`CardStylePicker.jsx`, `ReviewsEditor.jsx`, `SpacerEditor.jsx`, `HeroEditor.jsx`).

Portfolio owner radius presets: none `0`, small `0.25rem`, medium `0.75rem` (default), large `1.5rem` (`src/lib/portfolioTheme.js:37-42`).

---

## 6. Borders

- **Width:** `1px` everywhere. Exceptions: `2px` for the active tab underline (`Tabs.jsx:46`), the spinner rings (`Button.jsx:46`, `PageLoader.jsx:36`) and the `:focus-visible` outline.
- **Style:** `solid`. Exception: `dashed` on the ImageUpload drop zone (`ImageUpload.jsx:145`) and the upsell placeholder panel (`ProUpsellPage.jsx:189`).
- **Colours:**
  - default: `--color-border` (`#e5e7eb`)
  - inner dividers: `--color-border-subtle` (`#f0f0f0`)
  - focused control: `--color-primary`
  - invalid control: `--color-error`
  - ghost button hover: `--color-text-muted`
  - hoverable card hover: `--color-primary`
  - sidebar account divider: `--color-sidebar-hover`
- **Shorthand vs longhand:** components whose border colour changes on hover use longhand (`borderWidth: '1px', borderStyle: 'solid', borderColor`), because React warns when the shorthand and longhand are mixed (`Button.jsx:8-12`, `Card.jsx:10-14`).
- Header: `borderBottom: 1px solid var(--color-border)` (`Header.jsx:33`). Drawer header and footer: bottom and top borders in `--color-border` (`Drawer.jsx:73,135`).

---

## 7. Shadows / Elevation

`src/globals.css:118-121`. All shadows use a tint of `#111827` (`rgba(17, 24, 39, …)`), not pure black.

| Token | Value | Used for |
|---|---|---|
| `--shadow-sm` | `0 1px 2px 0 rgba(17, 24, 39, 0.05)` | Auth card (`AuthLayout.jsx:26`), Toggle thumb (`Toggle.jsx:57`) |
| `--shadow-md` | `0 4px 6px -1px rgba(17, 24, 39, 0.07), 0 2px 4px -2px rgba(17, 24, 39, 0.05)` | Hoverable Card on hover (`Card.jsx:23`); highlighted PlanCard; selected picker tiles |
| `--shadow-lg` | `0 10px 15px -3px rgba(17, 24, 39, 0.08), 0 4px 6px -4px rgba(17, 24, 39, 0.05)` | ConfirmDialog, UpgradeDialog, mobile sidebar overlay |
| `--shadow-drawer` | `-8px 0 24px -4px rgba(17, 24, 39, 0.12)` | Drawer (`Drawer.jsx:59`) |

**Focus ring (a shadow, not a token):** `0 0 0 3px var(--color-primary-light)`, on Input, Textarea and Select while focused and not in error (`Input.jsx:61`, `Textarea.jsx:69`, `Select.jsx:71`). The same ring marks featured catalog cards (`CatalogItemCard.jsx:31`).

**Default elevation is flat.** Cards have **no** shadow at rest; they rely on the 1px border alone.

---

## 8. Breakpoints & Container Widths

`src/lib/breakpoints.js:10-22`

```js
export const BREAKPOINTS = { mobile: 768, tablet: 1024 }
export const MEDIA = {
  mobile:  '(max-width: 767.98px)',
  tablet:  '(min-width: 768px) and (max-width: 1024px)',
  desktop: '(min-width: 1024.02px)',
  compact: '(max-width: 1024px)',   // mobile + tablet — sidebar collapses
}
```

| Name | Range | Hook flag |
|---|---|---|
| Mobile | `< 768px` | `isMobile` |
| Tablet | `768px – 1024px` | `isTablet` |
| Desktop | `> 1024px` | `isDesktop` (= `!isCompact`) |
| Compact | `≤ 1024px` | `isCompact` |

The only CSS media query is `@media (max-width: 767.98px)` (`globals.css:213`). Everything else branches in JS through `useBreakpoint()` (`src/hooks/useBreakpoint.js`), which is built on `useSyncExternalStore` + `matchMedia`.

**Container max-width tokens: NOT DEFINED IN CODE.** Literal max-widths in use:

| Value | Where |
|---|---|
| `25rem` | Auth card (`AuthLayout.jsx:26`) |
| `26rem` | ConfirmDialog / UpgradeDialog panel |
| `22rem` | EmptyState description |
| `24rem` | UpgradeBanner message |
| `48rem` | Settings column (`SettingsPage.jsx:13`) |
| `52rem` | ProUpsellPage card |
| `64rem` | Landing / public nav content |
| `40rem` | Landing hero text column |
| none | Dashboard content area fills the width |

---

## 9. Motion

### Duration tokens: `src/globals.css:124-126`

| Token | Value | Used for |
|---|---|---|
| `--transition-fast` | `120ms ease` | Button bg/border/opacity; input border and ring; nav hover; tabs; pagination; card actions |
| `--transition-base` | `180ms ease` | Card hover border/shadow; Toggle; Collapsible chevron; list refetch fade; sidebar slide; overlay fade-in; step-wizard colours |
| `--transition-slow` | `260ms ease` | Drawer slide-in |

All easing in the dashboard is **`ease`**. There are no cubic-beziers in the dashboard; the one cubic-bezier is the portfolio loader sweep.

### Keyframes: `src/globals.css`

| Name | Definition | Use |
|---|---|---|
| `wapee-pulse` (`:333`) | opacity 1 → 0.45 → 1 | **Skeletons**: `wapee-pulse 1.4s ease-in-out infinite` (17 uses) |
| `wapee-fade-in` (`:343`) | opacity 0 → 1 | Overlays/scrims: `wapee-fade-in var(--transition-base)` |
| `wapee-slide-in-right` (`:352`) | translateX(100%) → 0 | Drawer: `var(--transition-slow)` |
| `wapee-spin` (`:361`) | rotate → 360deg | Spinners: `600ms linear infinite`; SaveIndicator `900ms linear infinite` |
| `wapee-row-in` (`:455`) | opacity 0 + translateY(-0.25rem) → in | New variant/add-on rows: `var(--transition-base)` |
| `wapee-loader-sweep`, `wapee-loader-mark`, `wapee-scroll-hint`, `wapee-chat-*` | — | Portfolio / chat only |

### Interaction effects

- **Hover:** a colour swap only, with no transform and no lift. Buttons darken to their `-hover` shade; ghost buttons gain the `surface-hover` bg and a `text-muted` border; hoverable cards get a `primary` border and `shadow-md`; table rows get the `surface-hover` bg; nav items get the `sidebar-hover` bg and white text.
- **Press / active states: NOT DEFINED IN CODE.** No `:active`, `onMouseDown` or scale-on-press exists in the dashboard.
- **Page transitions: NOT DEFINED IN CODE.** Lazy routes show `PageLoader`, which fades in after a `150ms` delay so a fast load never flashes a spinner (`PageLoader.jsx:25-28`).
- **Modal:** the scrim and panel fade in together (`wapee-fade-in 180ms`); there is no scale.
- **Drawer:** slides from the right (`260ms ease`); its scrim fades (`180ms`).
- **Mobile sidebar:** `transform: translateX(-100%) ↔ 0` over `var(--transition-base)` (`Sidebar.jsx:115-116`).
- **Background refetch:** the list drops to `opacity: 0.6` with `transition: opacity var(--transition-base)` and is never unmounted.

### Reduced motion (`globals.css:523-553`)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Z-index

`src/globals.css:141-145`

| Token | Value | Used by |
|---|---|---|
| `--z-header` | `30` | Dashboard header |
| `--z-sidebar` | `40` | Owner sidebar on desktop |
| `--z-overlay` | `50` | Scrims (drawer, mobile sidebar, admin sidebar) |
| `--z-drawer` | `60` | Drawer panel; mobile sidebar panel; admin sidebar; **ConfirmDialog and UpgradeDialog** (no modal token exists) |
| `--z-toast` | `70` | **Defined but unused**, because there is no toast component |

The portfolio uses literal values: `2` (carousel controls), `20` (PortfolioNav), `30` (FloatingCartButton), `40`/`41` (CartDrawer scrim/panel), `45` (ItemDetailPage bar).

---

## 11. Icons

- **Library:** `lucide-react`. Import named components, e.g. `import { Plus } from 'lucide-react'`. A custom inline SVG is used for the Select chevron (`Select.jsx:94-114`: 16×16, `strokeWidth="2"`, path `m6 9 6 6 6-6`).
- **Stroke width:** **`1.75` is the default** (62 uses). `2` (46) is used for small UI glyphs: pagination chevrons, search clear, button icons on list pages, 11px badge icons. `2.5` (7) is used for tiny check/× marks. `1.5` (2) is the image placeholder; `1.25` (1) is the 40px upsell illustration.
- **Sizes:** `16` (28) inside buttons; `15` (28) for search and sidebar icons; `14` (26) for card actions, logout and the lock. `22` is used in the StatCard (desktop), EmptyState and Lock circles, and the hamburger. `18` is used for the drawer close and collapsible chevron, `20` for the sidebar close and upload, `11` inside badges, and `13` for SaveIndicator and upsell checks.
- **Colour:** icons inherit `currentColor`. Decorative icons in inputs are `--color-text-muted`. Icons in tiles are `--color-primary` on `--color-primary-light`. Empty-state icons are muted on `surface-hover`. Status icons use `--color-success` / `--color-error`.
- **Accessibility:** every decorative icon gets `aria-hidden="true"`.
- **Sidebar nav icons:** the owner nav is **text-only**, except "Reviews" (a `Star` at 15px). Locked items show a trailing `Lock` icon (14px, opacity `0.75`, or `0.55` when active) (`Sidebar.jsx:84,240-256`).

---

## 12. Components

Every component styles itself inline with `style={{}}`. Hover is tracked either with `useState` (Button, inputs) or with `onMouseEnter`/`onMouseLeave` that mutate `e.currentTarget.style` (Card, nav, tabs, rows).

### 12.1 Button: `src/components/Button.jsx`

It is the only button component. Props: `variant`, `size`, `type`, `loading`, `disabled`, `fullWidth`, `startIcon`, `style`.

**Base:**
```js
display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
borderRadius: 'var(--radius-md)', fontWeight: 600, letterSpacing: 'var(--tracking-tight)',
lineHeight: 1.2, whiteSpace: 'nowrap',
transition: 'background-color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast)',
cursor: isInactive ? 'not-allowed' : 'pointer', opacity: isInactive ? 0.55 : 1,
borderWidth: '1px', borderStyle: 'solid'
```

**Variants** (`Button.jsx:14-31`):

| Variant | Default | Hover |
|---|---|---|
| `primary` | bg `--color-primary`, text `--color-text-on-primary`, border `--color-primary` | bg + border `--color-primary-hover` |
| `secondary` | bg `--color-secondary`, text `--color-text-on-secondary`, border `--color-secondary` | bg + border `--color-secondary-hover` |
| `ghost` (= outline) | bg `transparent`, text `--color-text-primary`, border `--color-border` | bg `--color-surface-hover`, border `--color-text-muted` |
| `danger` (= destructive) | bg `--color-error`, text `--color-text-on-primary`, border `--color-error` | bg + border `--color-error-hover` |

**Sizes** (`Button.jsx:33-37`), with computed heights at 16px root (line-height 1.2 + 2px border):

| Size | Padding | Font | Height |
|---|---|---|---|
| `sm` | `0.5rem 0.875rem` | `0.8125rem` | ≈ 33.6px |
| `md` (default) | `0.6875rem 1.125rem` | `0.875rem` | ≈ 40.8px |
| `lg` | `0.875rem 1.5rem` | `0.9375rem` | ≈ 48px |

**States:**
- **Hover:** variant hover colours, suppressed while inactive.
- **Focus-visible:** the global `outline: 2px solid var(--color-primary); outline-offset: 2px` (`globals.css:324-327`).
- **Active/pressed:** NOT DEFINED IN CODE.
- **Disabled:** `opacity 0.55`, `cursor not-allowed`, and the native `disabled` attribute.
- **Loading:** the same look as disabled, plus `aria-busy`, and a spinner replaces `startIcon`.

**Spinner** (`Button.jsx:39-55`): `0.875em` square, `2px solid currentColor` with a transparent top, `radius-full`, `wapee-spin 600ms linear infinite`.

```jsx
<Button variant="primary" size="md" startIcon={<Plus size={16} strokeWidth={2} aria-hidden="true" />}>
  Add product
</Button>
```

**Icon buttons.** There is no IconButton component. Inline icon buttons follow this pattern: `2rem × 2rem` (header hamburger `2.25rem`), `radius-md`, transparent bg, colour `text-secondary` (`text-primary` for the hamburger), and **no hover style** (`Drawer.jsx:104-122`, `Header.jsx:48-65`).

**Card action button** (`CatalogItemCard.jsx:158-191`): padding `0.375rem 0.625rem`, `0.75rem`/600, `1px solid --color-border`, `radius-md`, transparent bg → `surface-hover` on hover. Text is `text-secondary`, or `--color-error` for Delete.

**Links.** Inline links use `color: var(--color-primary); fontWeight: 600` with no underline (`a { text-decoration: none }`, `globals.css:285-288`), e.g. `LoginPage.jsx:58,96-100`. Hover state: NOT DEFINED IN CODE.

**Google button.** A ghost Button, full width, with a 16px multi-colour G (`GoogleAuthButton.jsx`). It is currently disabled with a "Coming soon" title.

### 12.2 Input: `src/components/Input.jsx`

Props: `label`, `error`, `hint`, `prefix`, `endAdornment`, `required`, `disabled`, `style`, `containerStyle`, plus native props. The label sits **above** the field.

```
<div column gap 0.375rem>
  <label 0.8125rem/600 text-primary>Label <span error ml 0.125rem>*</span></label>
  <div wrapper: flex, bg surface, 1px border, radius-md, overflow hidden, ring>
    [prefix: pl 0.75rem, 0.875rem, text-muted, nowrap]
    <input padding 0.625rem 0.75rem (pl 0.125rem when prefixed), 0.875rem, no border/outline, transparent bg>
    [endAdornment: pr 0.75rem, flex center]
  </div>
  <span error|hint 0.75rem>
</div>
```

| State | Wrapper border | Ring (box-shadow) | Background |
|---|---|---|---|
| Default | `--color-border` | none | `--color-surface` |
| Focus | `--color-primary` | `0 0 0 3px var(--color-primary-light)` | surface |
| Error | `--color-error` (overrides focus) | none | surface |
| Disabled | `--color-border` | none | `--color-surface-hover`, `cursor: not-allowed` |

- **Transition:** `border-color var(--transition-fast), box-shadow var(--transition-fast)`.
- **Height:** 0.625rem × 2 padding + 0.875rem text at normal line-height + 2px border ≈ **40px**, which lines up with the md Button.
- **Placeholder style: NOT DEFINED IN CODE.** The browser default placeholder colour applies (Tailwind preflight sets `::placeholder` to `color-mix(in oklab, currentColor 50%, transparent)`; this comes from the framework, not project code).
- **Error message:** rendered with `role="alert"`, `id={inputId}-error` and wired through `aria-describedby`. An error replaces the hint.
- **Required:** a red `*` with `marginLeft: 0.125rem`.

**Variants built on Input:**

- **Email:** `type="email"`. The signup flow adds `endAdornment={<EmailStatusAdornment status=… />}`: checking = 0.875rem spinner (`2px solid --color-border`, top `--color-primary`, 600ms); available = `CheckCircle` 16 / 2 in success; invalid or taken = `XCircle` 16 / 2 in error (`EmailStatusAdornment.jsx`).
- **Password (show/hide):** `type={visible ? 'text' : 'password'}` with `endAdornment={<PasswordRevealButton />}`, which shows an `Eye`/`EyeOff` icon (16 / 1.75) in text-muted. The button has `tabIndex -1` and `aria-pressed` (`PasswordRevealButton.jsx`).
- **Search:** `SearchInput.jsx`. Prefix `Search` 15 / 1.75; clear button `X` 14 / 2 in text-muted, shown only when there is a value; container `flex: '1 1 14rem'`. Debounce 400ms is handled by the caller.
- **Number:** a plain `Input type="number"` (`CatalogDrawer.jsx:273` etc.). No custom stepper.
- **Phone:** a plain `Input type="tel"` (`BusinessProfileSection.jsx:89`). There is **no country-code phone component**.
- **Prefix/slug:** `prefix="wapee.com/"` (onboarding slug step).

### 12.3 Textarea: `src/components/Textarea.jsx`

Same contract as Input. Default `rows = 4`, padding `0.625rem 0.75rem`, `0.875rem`, `lineHeight: 1.5`, `resize: vertical`, width 100%. Border, ring and disabled states are identical to Input.

### 12.4 Select: `src/components/Select.jsx`

A native `<select>` with `appearance: none`, padding `0.625rem 2.25rem 0.625rem 0.75rem` and `cursor: pointer`. Border, ring and disabled states are the same as Input. It has a custom chevron at `right: 0.75rem`, vertically centred, `pointerEvents: none`, text-muted. Takes `options=[{value,label}]` or children; `placeholder` renders a disabled empty option. The option popup is native and unstyled.

### 12.5 Toggle / Switch: `src/components/Toggle.jsx`

A real `<input type="checkbox" role="switch">` sits invisibly over a drawn track.

| Part | Spec |
|---|---|
| Track | `2.25rem × 1.25rem` (36×20), `radius-full`; off `--color-border`, on `--color-primary`; `transition: background-color var(--transition-base)` |
| Thumb | `0.875rem` (14px) circle, `top 0.1875rem`, `left 0.1875rem` → `1.1875rem` when on; bg surface; `shadow-sm`; `transition: left var(--transition-base)` |
| Label | `0.875rem`, text-primary, gap `0.625rem` |
| Disabled | `opacity 0.55`, `cursor not-allowed` |
| Focus | Global `:focus-visible` on the hidden input (the outline lands on an invisible element, so a visible focus indicator on the track is NOT DEFINED IN CODE) |

### 12.6 Tag input: `src/components/TagInput.jsx`

- **Chips:** padding `0.25rem 0.375rem 0.25rem 0.625rem`, `0.8125rem`/500, bg surface-hover, `1px` border, `radius-full`. The remove control is `1.125rem` round with an `X` (12 / 2.5) in text-muted.
- **Field:** raw `<input>` with padding `0.625rem 0.75rem`, `radius-md`, border `--color-primary` on focus. It has **no focus ring**.
- **Add button:** `2.5rem` wide square, `Plus` 16 / 2, opacity `0.5` when empty. Enter adds a tag; blur commits.

### 12.7 Colour field: `src/components/ColorField.jsx`

Wrapper padding `0.3125rem 0.5rem`, `1px` border (error colour when invalid), `radius-md`. Native colour swatch `2rem × 2rem` with `radius-sm`, plus an uppercase hex text field at `0.8125rem`. No focus style.

### 12.8 Time input: `BusinessHoursSection.jsx:172-199`

Native `<input type="time">` with padding `0.4375rem 0.5rem`, `0.875rem`, `1px` border (error when invalid), `radius-md`, `maxWidth 9rem`, `colorScheme: light`, `outline: none`. **No focus style.**

### 12.9 File upload: `src/components/ImageUpload.jsx`

- **Drop zone:** padding `1rem`, gap `1rem`, `1px dashed` border (error / primary while dragging / border), `radius-lg`, bg surface or `primary-light` while dragging, transition `--transition-fast`.
- **Preview tile:** `4rem` square, `radius-md`, `1px` border, surface-hover bg, `Upload` icon 20 / 1.75 in muted.
- **Copy:** "Drag an image here, or" at `0.8125rem` secondary, followed by `Button size="sm" variant="ghost"` (Browse / Replace) and a ghost Remove button with a `Trash2` icon (14 px).
- **Validation:** type and size checks happen client-side before upload.

### 12.10 Checkbox / Radio / Combobox / Date picker: NOT DEFINED IN CODE

- **Checkbox and radio:** the dashboard has no styled checkbox or radio. The only checkbox is the hidden one inside Toggle (plus a portfolio-side `AddonSelector`). Radio-like selection uses the segmented control (12.20).
- **Combobox and date picker:** do not exist. Time uses the native picker.

### 12.11 Forms: layout and validation

- **Library:** Formik + Yup. The schema is a named `const` above the component (`loginSchema`, `LoginPage.jsx:14-17`). `<form noValidate>`.
- **Layout:** `display: flex; flexDirection: column; gap: 1rem`. Paired fields use the auto-fit grid (`minmax(min(100%, 10rem), 1fr)`, gap `1rem`). In drawers, forms are full width.
- **Field errors:** shown under the field once it has been touched (`error={formik.touched.x && formik.errors.x}`).
- **Server errors:** `formik.setStatus()` → a `<FormAlert>` at the **top** of the form.
- **Submit area:** in auth forms, a full-width `size="lg"` primary button. In drawers, the Drawer footer holds right-aligned ghost **Cancel** + primary **Save** (`CatalogDrawer.jsx:219-226`). In settings cards, a right-aligned primary button with `marginTop 1.25rem` (`BusinessHoursSection.jsx:163-167`).

```jsx
<form noValidate onSubmit={formik.handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
  {formik.status && <FormAlert>{formik.status}</FormAlert>}
  <Input label="Email" type="email" required {...formik.getFieldProps('email')}
         error={formik.touched.email && formik.errors.email} />
  <Button type="submit" fullWidth size="lg" loading={formik.isSubmitting}>Sign in</Button>
</form>
```

### 12.12 FormAlert (inline alert): `src/components/FormAlert.jsx`

Variants `error` | `success` | `warning` (there is **no info variant**). Background `--color-{v}-light`, border `1px solid --color-{v}` (the full-strength colour, not `-border`), text `--color-{v}`, `radius-md`, padding `0.625rem 0.75rem`, `0.8125rem`, `lineHeight 1.45`, `role="alert"`.

### 12.13 Card: `src/components/Card.jsx`

```js
backgroundColor: 'var(--color-surface)',
borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)',
borderRadius: 'var(--radius-lg)', padding: 'var(--card-padding)',
transition: 'border-color var(--transition-base), box-shadow var(--transition-base)'
// hoverable: hover → borderColor var(--color-primary), boxShadow var(--shadow-md)
```

No shadow at rest. A section heading inside a card is an `h2` at `1rem` with `marginBottom 1rem`.

**List item card** (`CatalogItemCard.jsx`) is a hand-built card with `padding 0` and `overflow hidden`:
- `4 / 3` media area on surface-hover, or an `ImageIcon` 24 / 1.5 when there is no image.
- Body padding `1rem`, column gap `0.625rem`.
- Title row: `h3` plus a status Badge with a dot.
- Price row, then a badge row (gap `0.375rem`, `marginTop auto`).
- Action row: `paddingTop 0.75rem`, `borderTop 1px solid --color-border-subtle`, Edit and Delete buttons.
- Featured state: border `primary-light` plus a `0 0 0 3px var(--color-primary-light)` ring.

### 12.14 StatCard (KPI): `src/components/StatCard.jsx`

A Card laid out as a flex row, align centre, gap `1rem` (mobile `0.75rem`), `height: 100%`.
- **Icon tile:** `2.75rem` square (mobile `2.25rem`), `radius-md`, bg `primary-light`, icon `primary` at 22px (mobile 18), stroke 1.75.
- **Value:** `1.5rem`/700/`1.15`/tighter (mobile `1.25rem`).
- **Label:** `0.8125rem` secondary (mobile `0.75rem`), `marginTop 0.125rem`.
- **Loading:** the value is replaced by a `3.5rem × 1.75rem` `radius-sm` surface-hover block pulsing at `1.4s`.

```jsx
<StatCard icon={ShoppingBag} label="Total Orders" value="0" />
```

### 12.15 Table: `src/pages/admin/AdminBusinessesPage.jsx:94-205`

This is the only table in the app.
- **Container:** `overflowX auto`, `radius-lg`, `1px solid --color-border`, bg surface. It fades to `0.6` opacity on refetch.
- **Table:** `width 100%`, `borderCollapse collapse`, **`minWidth 44rem`**, so it scrolls horizontally on mobile.
- **Header cell:** left-aligned, padding `0.75rem 1rem`, `0.75rem`/600, text-muted, **UPPERCASE**, nowrap. Header bg is the same surface (no tint).
- **Row:** `borderTop 1px solid --color-border-subtle`, `cursor pointer`, hover bg `surface-hover`. The whole row is clickable and opens a drawer.
- **Body cell:** padding `0.75rem 1rem`, `0.875rem`, 400, or 600 for `strong`; colour `text-secondary` for `muted`; nowrap.
- **Zebra striping:** NOT DEFINED IN CODE.
- **Row actions:** none; clicking the row opens a detail Drawer.
- **Empty state:** EmptyState (12.24). The loading state is a Card with "Loading businesses…" text, not a skeleton.
- **Column hiding:** the "City" column is hidden when `isCompact`.

### 12.16 Badge / status pill: `src/components/Badge.jsx`

```js
display: 'inline-flex', alignItems: 'center', gap: '0.3125rem', padding: '0.1875rem 0.5rem',
fontSize: '0.6875rem', fontWeight: 600, lineHeight: 1.3, borderRadius: 'var(--radius-full)',
border: `1px solid ${border}`, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis'
```

| Tone | Text | Bg | Border |
|---|---|---|---|
| `neutral` (default) | `--color-text-secondary` | `--color-surface-hover` | `--color-border` |
| `success` | `--color-success` | `--color-success-light` | `--color-success-border` |
| `warning` | `--color-warning` | `--color-warning-light` | `--color-warning-border` |
| `error` | `--color-error` | `--color-error-light` | `--color-error-border` |
| `info` | `--color-info` | `--color-info-light` | `--color-info-border` |
| `primary` | `--color-primary` | `--color-primary-light` | `--color-primary-light` |

- **Dot:** with `dot`, a `0.375rem` `currentColor` circle is added.
- **Icons:** go inside as children at 11px / stroke 2.
- **Status mapping:**
  - Active → success + dot; Inactive → neutral + dot.
  - Category → primary; duration → info.
  - Plans (`PlanBadge.jsx:11-14`): free → neutral, pro → primary.

**Count pill** (PageHeader, `PageHeader.jsx:31-41`): `0.75rem`/600 secondary, bg surface-hover, `1px` border, `radius-full`, padding `0.125rem 0.5rem`.

**Admin nav count badge:** min-width `1.25rem`, padding `0 0.375rem`, `0.6875rem`/700, line-height `1.25rem`, white on `--color-warning`, `radius-full`, `99+` cap (`AdminLayout.jsx:155-176`).

### 12.17 Modal / Dialog: `src/components/ConfirmDialog.jsx`

- **Overlay:** `fixed inset 0`, `z --z-drawer`, bg `--color-overlay`, flex-centred, padding `1rem`, `wapee-fade-in var(--transition-base)`. Clicking the overlay cancels (unless loading).
- **Panel:** `width 100%`, `maxWidth 26rem`, surface, `radius-lg`, `1px` border, `shadow-lg`, padding `1.5rem`, column gap `0.625rem`.
- **Content:** title `1rem`/600; message `0.875rem` secondary, `lineHeight 1.55`.
- **Actions:** right-aligned, gap `0.5rem`, `flexWrap wrap`, `marginTop 0.75rem`. Ghost Cancel, then a `tone` Button (default `danger`).
- **Behaviour:** Escape closes. Body scroll is locked through `body[data-scroll-locked='true'] { overflow: hidden }` (`globals.css:230-232`).

**UpgradeDialog** (`UpgradeDialog.jsx`): the same overlay. The panel (`maxWidth 26rem`, `radius-lg`, `shadow-lg`) wraps an `UpgradeBanner`, with a ghost "Not now" button centred `0.75rem` below.

### 12.18 Drawer / Sheet: `src/components/Drawer.jsx`

- **Scrim:** `fixed inset 0`, `--color-overlay`, `z --z-overlay`, fade-in 180ms, click closes.
- **Panel:** `fixed top/right/bottom 0`, width `var(--drawer-width)` (480px), or **`100%` on mobile**, `maxWidth 100%`, surface, `shadow-drawer`, `z --z-drawer`, flex column, `wapee-slide-in-right var(--transition-slow)`. No radius.
- **Header:** padding `1.125rem 1.25rem`, `borderBottom 1px --color-border`. Title `1rem`/600, optional subtitle `0.8125rem` secondary with `marginTop 0.125rem`. Close button `2rem` square, `radius-md`, `X` icon 18 / 1.75 in secondary, `marginRight -0.25rem`.
- **Body:** `flex 1`, `overflowY auto`, padding `1.25rem`.
- **Footer** (optional, pinned): padding `1rem 1.25rem`, `borderTop 1px`, flex end, gap `0.5rem`, wrap.
- **Behaviour:** Escape closes, body scroll locks, `role="dialog" aria-modal`. Create and Edit share one drawer.

### 12.19 Tabs: `src/components/Tabs.jsx`

- **Strip:** flex, gap `0.25rem`, `borderBottom 1px --color-border`, `marginBottom 1.5rem`, `overflowX auto`, `scrollbarWidth none`.
- **Tab:** padding `0.75rem 1rem`, `0.875rem`. Inactive: 500, text-secondary, hover text-primary. Active: 600, `--color-primary`, with a `borderBottom 2px solid --color-primary` and `marginBottom -1px` so it overlaps the strip border.
- **Transition:** colour and border `--transition-fast`.

### 12.20 Segmented control: `src/pages/dashboard/reports/DateRangeSelector.jsx`

- **Track:** `role="radiogroup"`, flex wrap, gap `0.375rem`, padding `0.3125rem`, `radius-lg`, surface, `1px` border. Width `fit-content`, or `100%` on mobile.
- **Option:** `role="radio"`, padding `0.5rem 0.875rem`, `radius-md`, `0.8125rem`. Unselected: 500, text-secondary on transparent; hover surface-hover + text-primary. Selected: 600, white on `--color-primary`.

### 12.21 Breadcrumbs: NOT DEFINED IN CODE

### 12.22 Pagination: `src/components/Pagination.jsx`

- **Nav:** flex centred, gap `0.375rem`, wrap, `marginTop 1.5rem`. Renders nothing when there are ≤ 1 pages.
- **Page button:** `minWidth 2rem`, `height 2rem`, padding `0 0.5rem`, `0.8125rem`, `radius-md`.
  - Inactive: 500, text-secondary, surface bg, border.
  - Active: 600, white text, primary bg and border, `aria-current="page"`.
  - Disabled: opacity `0.55`.
- **Arrow button:** `2rem` square, `ChevronLeft`/`ChevronRight` 16 / 2, secondary, surface bg, border, `radius-md`, opacity `0.45` when disabled.
- **Ellipsis:** `…` in text-muted, padding `0 0.125rem`.
- **Window:** ≤ 7 pages shows all; otherwise `1 … c-1 c c+1 … N`.
- **Mobile:** numbers are replaced by "Page X of Y" at `0.8125rem` secondary.
- Hover state on page buttons: NOT DEFINED IN CODE (a transition is declared, but no hover handler exists).

### 12.23 Toasts / Notifications / Tooltips / Popovers / Dropdown menus: NOT DEFINED IN CODE

- **Toasts:** none in the dashboard. `--z-toast: 70` is reserved. Feedback uses inline FormAlert, SaveIndicator, or a button label swap ("Link copied").
- **Tooltips:** only native `title` attributes (e.g. `Sidebar.jsx:198`, `GoogleAuthButton.jsx:21`).
- **Dropdown menus:** native `<select>` only. A `role="menu"` exists only in the portfolio nav (`PortfolioNav.jsx:251`).

**SaveIndicator** (`SaveIndicator.jsx`): inline-flex, gap `0.375rem`, `0.75rem`/500.
- Saving: muted, with a `Loader` icon (13 px) spinning at 900ms, label "Saving…".
- Saved: success colour, with a `Check` icon (13 / 2.5), label "All changes saved".
- Error: error colour, with a `CircleAlert` icon (13), label "Not saved".

### 12.24 Empty state: `src/components/EmptyState.jsx`

- **Layout:** column, centred, gap `0.5rem`, padding `2.5rem 1rem`, or `1.5rem 1rem` when `compact`.
- **Icon circle:** `2.75rem`, `radius-full`, bg surface-hover, icon muted at 22 / 1.75, `marginBottom 0.25rem`. Default icon `Inbox`.
- **Text:** title `0.9375rem`/600; description `0.8125rem` secondary, `maxWidth 22rem`, `lineHeight 1.5`.
- **Action:** `marginTop 0.75rem`.
- **Two uses on list pages:** "empty" (nothing ever created: feature icon plus a primary Add button) and "no results" (`SearchX` icon plus a ghost "Clear filters" button) (`CatalogPage.jsx:139-171`).

### 12.25 Loading states

- **Skeleton grid** (`CardGridSkeleton.jsx`): the same grid as the real list (`repeat(auto-fill, minmax(min(100%, 17rem), 1fr))`, gap `1rem`). Each card has a `1px` border, `radius-lg`, surface bg, and pulses at `wapee-pulse 1.4s ease-in-out infinite`. Inside: a `4/3` surface-hover media block, then padding `1rem`, gap `0.625rem` and three lines (`70%×0.875rem`, `40%×0.75rem`, `55%×0.75rem`, `radius-sm`, surface-hover). **Lists use skeletons, never spinners.**
- **Page loader** (`PageLoader.jsx`): a `1.75rem` ring (`2px solid --color-border`, top `--color-primary`, 600ms), centred in a `16rem` min-height box. It fades in after `150ms`.
- **Inline spinners:** in Button (currentColor) and the email check (0.875rem).
- **Refetch:** the existing list fades to `opacity 0.6` and stays mounted.

### 12.26 Error states

- Page-level load failure: a `FormAlert variant="error"` above the grid (`CatalogPage.jsx:129-135`).
- Field-level: error border, red helper text.
- Upload: error border, red text.

A dedicated error-page component (other than `NotFoundPage`) is NOT DEFINED IN CODE.

### 12.27 Avatars

- **User initial** (`Header.jsx:113-130`): `2rem` circle, bg `primary-light`, text `primary`, `0.8125rem`/600.
- **BusinessAvatar** (`BusinessAvatar.jsx`): default `28px` square with **`radius-md`**, initial at `size × 0.45` px / 600. The light tone is `primary-light` / `primary`; the dark tone (on the sidebar) is `sidebar-hover` / `sidebar-active`. With a logo, the image fills with `object-fit: cover`.

### 12.28 Collapsible: `src/components/Collapsible.jsx`

- **Container:** `1px` border, `radius-lg`, surface, overflow hidden.
- **Header button:** padding `0.875rem 1rem`, title `0.875rem`/600, subtitle `0.75rem` secondary. `ChevronDown` 18 / 1.75 in muted rotates 180° over `--transition-base`.
- **Body:** padding `0 1rem 1rem`, column gap `0.875rem`.

### 12.29 Step wizard: `src/components/StepWizard.jsx`

- **Layout:** outer column gap `2rem`.
- **Step circle:** `1.75rem`, `radius-full`, `0.75rem`/700. Done or current: primary bg, primary border, white text (done shows `✓`). Upcoming: surface bg, border, muted text.
- **Label:** `0.8125rem`, 600 current / 500 other. Text-primary when current, muted otherwise. Only the current label shows on mobile.
- **Connector:** `1px` high, `minWidth 1rem`, primary when done, border colour otherwise.
- **Footer:** ghost Back on the left, a spacer, primary Continue on the right, gap `0.75rem`.

### 12.30 Upgrade / locked states

- **UpgradeBanner, default** (`UpgradeBanner.jsx:77-147`): padding `3rem 1.25rem`, surface, `1px` border, `radius-lg`, centred, gap `0.625rem`. `3rem` Lock circle (primary-light / primary, icon 22). Title `1.0625rem`/600; message `0.875rem` secondary, `lineHeight 1.55`, `maxWidth 24rem`. Primary Button with a `Sparkles` icon.
- **UpgradeBanner, compact:** padding `0.75rem 0.875rem`, `radius-md`, bg and border `primary-light`, Lock 16 in primary, text `0.8125rem` primary, `Button size="sm"`.
- **ProUpsellPage** (`ProUpsellPage.jsx`): Card with `maxWidth 52rem`, padding `2.5rem 2rem` (mobile `1.5rem 1.25rem`). Two-column grid `minmax(0,1fr) minmax(0,14rem)`, gap `2rem`. Check bullets are `1.25rem` secondary-light circles with a primary `Check` (13 / 2.5). The price row has `borderTop` `--color-border-subtle`. The placeholder panel is `1px dashed`, bg `--color-background`.
- **AnalyticsTeaser:** fake content under `filter: blur(5px)`, overlaid with `linear-gradient(to bottom, var(--color-locked-scrim-top), var(--color-locked-scrim-bottom))` (`AnalyticsTeaser.jsx:67,251`).

### 12.31 Calendar / Scheduler: NOT DEFINED IN CODE

Business hours are a list of seven rows: a Toggle per day, two native time inputs joined by the word "to", or "Closed all day" (`BusinessHoursSection.jsx`).

### 12.32 Charts: NOT DEFINED IN CODE

There is no library. The Reports page shows an EmptyState where a chart would go (`ReportsPage.jsx:114-124`).

---

## 13. Layout & Dashboard

### 13.1 Shell: `src/components/DashboardLayout.jsx`

```jsx
<div style={{ minHeight: '100%', backgroundColor: 'var(--color-background)' }}>
  <Sidebar />   {/* fixed, left */}
  <Header />    {/* fixed, top, offset by sidebar on desktop */}
  <main style={{ marginLeft: isCompact ? 0 : 'var(--sidebar-width)', paddingTop: 'var(--header-height)',
                 height: '100vh', overflowY: 'auto' }}>
    <div style={{ padding: 'var(--page-padding)' }}><Outlet /></div>
  </main>
</div>
```

The content area has **no max-width**; it fills the remaining width. Its background is `--color-background` (`#f8fafb`). The `<main>` element is the scroll container.

### 13.2 Sidebar: `src/components/Sidebar.jsx`

- **Width:** `var(--sidebar-width)` = **240px**, `maxWidth 85vw`. **There is no collapsed or icon-rail width**: on compact screens the sidebar is fully off-canvas.
- **Position:** `fixed top 0 left 0 bottom 0`, bg `--color-sidebar-bg` (`#024751`), flex column. `z` is `--z-sidebar` on desktop and `--z-drawer` when compact.
- **Logo area:** height `var(--header-height)` (64px), padding `0 1.25rem`, holding `<Logo size="md" variant="light" />` (1.5rem tall lime wordmark). On compact screens a close `X` (20 / 1.75) sits at the right: `2rem` square, colour `sidebar-text`.
- **Nav:** `flex 1`, `overflowY auto`, padding `0.5rem 0.75rem 0.75rem`, column gap `0.125rem`.
- **Section labels: NOT DEFINED IN CODE.** The nav is one flat list: Overview, Products/Services, Categories, Orders/Appointments, Customers, Inventory, Discounts, Portfolio, Reviews, Reports, Billing, Settings (+ Admin for staff).
- **Nav item** (`Sidebar.jsx:203-217`): padding `0.625rem 0.875rem`, `radius-md`, `0.875rem`, tight tracking, flex space-between, gap `0.5rem`.

  | State | Bg | Text | Weight |
  |---|---|---|---|
  | Default | transparent | `--color-sidebar-text` `#a8c5ca` | 500 |
  | Hover | `--color-sidebar-hover` `#035f6e` | `--color-text-on-primary` `#ffffff` | 500 |
  | Active | `--color-sidebar-active` `#d8ff29` (a lime pill) | `--color-sidebar-active-text` `#024751` | 600 |
  | Locked | as above, plus a trailing `Lock` 14px icon (opacity 0.75, or 0.55 when active) | | |

  The active indicator is the **filled lime pill**; there is no side bar or border. Transition: `background-color var(--transition-fast), color var(--transition-fast)`.
- **Account section** (`SidebarAccountSection.jsx`): padding `0.75rem`, `borderTop 1px solid --color-sidebar-hover`.
  - BusinessAvatar 28px in the dark tone.
  - Name `0.8125rem`/600 white; email `0.6875rem` sidebar-text; both ellipsised.
  - Logout button: `width 100%`, padding `0.625rem 0.875rem`, `radius-md`, `0.8125rem`/500 sidebar-text, `LogOut` icon 14. Hover is the same as a nav item.

### 13.3 Header: `src/components/Header.jsx`

- **Position:** `fixed top 0`, `left` = `var(--sidebar-width)` on desktop or `0` when compact, `right 0`. Height **64px**, bg surface, `borderBottom 1px --color-border`, padding `0 var(--page-padding)`, gap `0.75rem`, `z --z-header`.
- **Left:**
  - Compact: hamburger (`Menu` 22 / 1.75, `2.25rem` button, `marginLeft -0.5rem`, text-primary), then `<Logo size="sm" />` (1.125rem tall teal wordmark).
  - Desktop: BusinessAvatar (28px) plus the business name at `0.9375rem`/600, ellipsised.
- **Right:** the user's display name at `0.875rem` secondary (desktop only), then the `2rem` initial avatar.
- There is no search, notifications or settings menu in the header.

### 13.4 Page header pattern: `src/components/PageHeader.jsx`

- **Row:** title block on the left, action on the right, `alignItems flex-start`, gap `1rem`, `marginBottom 1.5rem`.
- **Title:** `h1` at `1.5rem`, with an optional count pill (gap `0.625rem`) and a subtitle at `0.875rem` secondary.
- **Mobile:** stacks into a column with `alignItems: stretch` and gap `0.875rem`. The action stretches full width; list pages pass `fullWidth` Buttons.

### 13.5 Grid layouts

| Grid | Definition | Source |
|---|---|---|
| List card grid | `repeat(auto-fill, minmax(min(100%, 17rem), 1fr))`, gap `1rem` (columns follow available width, not fixed breakpoints) | `CatalogPage.jsx:177` |
| Stat row | desktop `repeat(4, minmax(0, 1fr))`; compact (tablet + mobile) `repeat(2, minmax(0, 1fr))`; gap `1rem` / `0.75rem` | `OverviewPage.jsx:96-98` |
| Overview body | desktop `minmax(0, 2fr) minmax(0, 1fr)` (main + side column); compact `minmax(0, 1fr)`; gap `1.5rem` / `1rem`; `alignItems start` | `OverviewPage.jsx:121-123` |
| Reports | revenue Card full width, then `repeat(2, minmax(0, 1fr))` (compact: 1 col) | `ReportsPage.jsx:131` |
| Settings | single column, gap `1.5rem`, `maxWidth 48rem` | `SettingsPage.jsx:13` |
| Form 2-up | `repeat(auto-fit, minmax(min(100%, 10rem), 1fr))`, gap `1rem` | `CatalogDrawer.jsx:266` |

**List page anatomy** (`CatalogPage.jsx`): PageHeader (title + count + Add button) → filter bar (SearchInput `flex 1 1 14rem` + Selects, gap `0.75rem`, `marginBottom 1.25rem`) → optional error FormAlert → Skeleton | EmptyState | NoResults | Grid → Pagination → Drawer → ConfirmDialog.

### 13.6 Responsive behaviour

| Element | Desktop (> 1024) | Tablet (768–1024) | Mobile (< 768) |
|---|---|---|---|
| Sidebar | fixed 240px, always visible | off-canvas overlay | off-canvas overlay |
| Sidebar open | — | slides in (`translateX`), scrim `--color-overlay`, `shadow-lg`, body scroll locked, Escape/scrim/link tap closes | same |
| Header | offset 240px, business name + user name | full width, hamburger + logo | same |
| Page padding | 1.5rem | 1.5rem | 1rem |
| Card padding | 1.5rem | 1.5rem | 1.125rem |
| Root font size | 16px | 16px | **15px** |
| Drawer | 480px | 480px | 100% |
| PageHeader | row | row | stacked |
| Stat cards | 4 col | 2 col | 2 col |
| Pagination | numbers | numbers | "Page X of Y" |
| Table | — | City column hidden | horizontal scroll (`minWidth 44rem`) |

`body { overflow-x: hidden }` (`globals.css:202`). `img, svg, video { max-width: 100% }` (`globals.css:206-210`). Long strings use `overflowWrap: 'anywhere'`.

### 13.7 Admin shell: `src/components/admin/AdminLayout.jsx`

It has the same structure, with these differences:
- The sidebar bg is `#0F172A` (slate), with a "Wapee Admin" text mark (`0.9375rem`/700 white) instead of the logo.
- Inactive nav text is `#94A3B8`. Active is a `#D8FF29` pill with `#0F172A` text. There are **no hover styles**.
- The header is **not fixed** (it scrolls with the page) and shows the label "Platform administration" (`0.8125rem`/600 muted, uppercase).
- The scrim has **no fade animation**.

### 13.8 Auth pages: `src/components/AuthLayout.jsx`

- **Page:** `minHeight 100vh`, flex column centred both ways, gap `1.5rem`, padding `var(--page-padding)`, bg `--color-background`.
- **Stack, top to bottom:**
  - `<Logo size="lg" />` (2rem tall, teal) linking to `/`.
  - A **Card**: `width 100%`, `maxWidth 25rem` (400px), `boxShadow var(--shadow-sm)`. Inside, title `h1` at `1.375rem`, subtitle at `0.875rem` secondary, then `marginBottom 1.5rem`, then the form.
  - A footer line at `0.875rem` secondary with a primary/600 link ("New to Wapee? **Create an account**").
- **Login form order** (`LoginPage.jsx`): FormAlert (server error) → Email → Password (with reveal) → right-aligned "Forgot password?" link (`0.8125rem`/600 primary, `marginTop -0.25rem`) → full-width `lg` primary "Sign in" → `FormDivider` "OR" → Google ghost button.
- **FormDivider** (`FormDivider.jsx`): two `1px` `--color-border` rules with a centred label (`0.75rem`/600 uppercase muted), gap `0.75rem`.

---

## 14. Design Principles: what makes this UI feel the way it does

These observations come from the code above.

1. **One deep teal, one electric lime, and grey everywhere else.** `#024751` carries every primary action, focus state and active marker. Lime `#d8ff29` appears only in a few precise places: the active sidebar pill, the secondary button, the logo, the loader sweep. Everything else is cool grey (`#111827 / #6b7280 / #9ca3af` on `#f8fafb / #ffffff`). Status colours appear only inside tinted pills and alerts, never as large fills.
2. **The dark sidebar frames a pale workspace.** A saturated teal rail against an almost-white canvas and white cards gives the app its identity without decorating the content area.
3. **Borders instead of shadows.** Every surface is defined by a 1px `#e5e7eb` border. Cards rest flat, and shadow appears only for things that float (dialogs, the drawer, the mobile sidebar) or on hover feedback.
4. **Tight type, compact sizes.** DM Sans with `-0.02em` tracking on everything and `-0.03em` on headings and numbers. The working size is 13–14px (`0.8125rem` is the most used size, then `0.875rem`). Page titles are only 24px. Weight 600 does most of the hierarchy work, and size changes are small.
5. **Two radii.** 8px (`radius-md`) for anything you click or type into, 12px (`radius-lg`) for anything that contains. Fully round only for pills, dots and avatars.
6. **Quiet, quick motion.** 120/180/260ms with `ease`, colour changes only, no lift, scale or bounce, and full support for reduced motion. Lists dim to 60% while refreshing instead of flashing a spinner.
7. **Focus is the brand colour.** Inputs focus with a primary border plus a 3px pale-teal ring. Everything else uses a 2px primary outline offset by 2px.
8. **Honest empty states.** Every list has a skeleton that matches its grid, an "empty" state and a separate "no results" state. Each is a muted icon in a grey circle, a 15px title, a 13px description and one action.
9. **Responsive layout comes from intrinsic CSS first.** Auto-fill grids, `flex-wrap`, `minmax(0, 1fr)` and `min(100%, …)` do most of the work. JS breakpoints are used only where the structure changes (the sidebar becoming an overlay, the drawer going full screen, the header stacking).
10. **Inline styles plus tokens.** No utility classes and no stylesheets per component. Each component is a self-contained style object that reads `var(--…)`. To change the look you edit `:root` and nothing else (except the admin slate).

---

## 15. Inconsistencies Found

| # | Issue | Details | Most-used / canonical |
|---|---|---|---|
| 1 | **Admin shell bypasses tokens** | `AdminLayout.jsx` and `AdminAccountSection.jsx` hardcode 8 hex values (§2), including `#D8FF29`, which duplicates `--color-secondary`. This conflicts with the CLAUDE.md "never hardcode hex" rule | Tokens everywhere else |
| 2 | Hardcoded brand hex | `VariantGroupEditor.jsx:221` fallback `'#024751'` duplicates `--color-primary` | `--color-primary` |
| 3 | Card-grid breakpoints | CLAUDE.md: "3 cols → 2 at ≤1100px → 1 at ≤768px". Code: `repeat(auto-fill, minmax(min(100%, 17rem), 1fr))`, so the column count depends on content width, not those breakpoints | Code (auto-fill) |
| 4 | StatCard columns | CLAUDE.md: "4 cols desktop → 2 cols mobile". Code: 2 cols for **all compact screens** (tablet too) (`OverviewPage.jsx:96`) | Code |
| 5 | Focus treatment differs per control | Input/Textarea/Select: primary border + 3px `primary-light` ring with `outline: none`. TagInput: border only, no ring. TimeField and ColorField: `outline: none` and **no focus style at all**. Buttons and links: global 2px outline | Ring (3 components) for fields |
| 6 | Disabled opacity | `0.55` (Button, Toggle, PageButton), `0.45` (pagination arrows), `0.5` (TagInput add) | `0.55` |
| 7 | Spinner speed | `600ms` (Button, PageLoader, email check) vs `900ms` (SaveIndicator) | `600ms` |
| 8 | **PageLoader animation string** | `'wapee-fade-in var(--transition-base) ease both'` expands to `wapee-fade-in 180ms ease ease both`, which has two timing functions. That is invalid in the `animation` shorthand, so the browser likely drops the declaration and the loader, which starts at `opacity: 0`, may never appear (`PageLoader.jsx:25`). Not checked in a browser | — |
| 9 | Drawer slide speed | Dashboard Drawer `--transition-slow` (260ms); portfolio CartDrawer `--transition-base` (180ms) | 260ms for dashboard |
| 10 | Shadow tint | Tokens use `rgba(17, 24, 39, …)`. Portfolio components use literal `rgba(0, 0, 0, …)` shadows (9 places), e.g. CartDrawer `-8px 0 24px rgba(0, 0, 0, 0.12)` vs `--shadow-drawer: -8px 0 24px -4px rgba(17, 24, 39, 0.12)` | Tokens |
| 11 | Literal durations in portfolio | `0.2s`, `0.25s`, `0.3s`, `0.4s`, `700ms`, fade-ins of `150ms`, `0.2s`, `0.4s`, `0.6s`, none of which are tokens | Dashboard uses tokens only |
| 12 | Radius literals | `0.125rem` (11), `2px` (3), `1px` (2) and `'999px'` (1, vs `--radius-full: 9999px`) in editor preview drawings | Tokens |
| 13 | Unused or missing z-index | `--z-toast` defined, never used. Dialogs reuse `--z-drawer` (no modal token). Portfolio uses literal `2/20/30/40/41/45` | Tokens |
| 14 | Avatar shape | User avatar is round (`radius-full`); BusinessAvatar is a rounded square (`radius-md`) | Intentional per component |
| 15 | FormAlert vs Badge borders | FormAlert uses the full-strength status colour as its border; Badge uses the `-border` light shade. FormAlert has no `info` variant although `--color-info-*` tokens exist | — |
| 16 | `primary` Badge border | Border = `--color-primary-light`, the same as its bg, so the border is invisible | — |
| 17 | Section-heading spacing | Card `h2` uses `marginBottom: 1rem` (Overview) vs `0.75rem` (Reports) | `1rem` |
| 18 | Admin vs owner shell | Admin header is not fixed, admin nav has no hover state, admin scrim has no fade | Owner shell |
| 19 | CLAUDE.md vs globals.css | CLAUDE.md lists hex in upper case and omits `--color-*-light`, `--color-*-border`, `--color-error-hover`, scrims, radius, shadow, transition and z tokens; `globals.css` is the superset. The values that do appear in both match exactly | `globals.css` |
| 20 | Tailwind | CLAUDE.md allows the `tracking-tight` class; `@theme inline` exposes font, tracking, radius and shadow. But **no `className` is used anywhere**, so the `@theme` block is currently inert | Inline styles |
| 21 | Loaded but unused | DM Sans weight 300 and italic 400 are loaded; neither is used in the dashboard | — |
| 22 | Pagination hover | `transition` is declared on page buttons but no hover handler exists | — |

---

## 16. Not Defined in Code

- Dark mode (any form)
- Font-size tokens, line-height tokens, spacing-scale tokens, container max-width tokens
- Focus-ring token (the ring is a literal `0 0 0 3px var(--color-primary-light)`)
- Input placeholder colour (browser / Tailwind preflight default)
- Pressed/`:active` states on any control
- Hover states for: inline links, icon buttons (drawer close, hamburger), pagination page buttons, admin nav
- Visible focus indicator on the Toggle track
- Checkbox and radio components (dashboard)
- Combobox / autocomplete, date picker, date-range picker, phone input with country code
- Toasts / snackbars (`--z-toast` reserved only)
- Tooltips (only native `title`), popovers, dropdown menus (outside the portfolio)
- Breadcrumbs
- Table zebra striping, sortable headers, row action menus, table skeleton
- Chart library and chart colour palette
- Calendar / scheduler view
- Collapsed (icon-only) sidebar width
- Sidebar section labels / groups
- Page transition animations
- Modal enter scale/slide (only fade)
- Skeleton shimmer (pulse only)
- `--color-success-hover`, `--color-warning-hover`, `--color-info-hover`
- `info` variant of FormAlert
- Header contents beyond identity (no search, notifications, user menu)

---

## Appendix A: CSS variables, verbatim (`src/globals.css:9-146`)

```css
:root {
  /* Brand */
  --color-primary: #024751;
  --color-primary-hover: #013640;
  --color-primary-light: #e6f0f2;
  --color-secondary: #d8ff29;
  --color-secondary-hover: #c4eb1a;
  --color-secondary-light: #f6ffd6;

  /* Surface */
  --color-background: #f8fafb;
  --color-surface: #ffffff;
  --color-surface-hover: #f3f4f6;
  --color-border: #e5e7eb;
  --color-border-subtle: #f0f0f0;

  /* Text */
  --color-text-primary: #111827;
  --color-text-secondary: #4b5563;
  --color-text-muted: #6b7280;
  --color-text-on-primary: #ffffff;
  --color-text-on-secondary: #024751;

  /* Sidebar */
  --color-sidebar-bg: #024751;
  --color-sidebar-text: #a8c5ca;
  --color-sidebar-active: #d8ff29;
  --color-sidebar-active-text: #024751;
  --color-sidebar-hover: #035f6e;

  /* Status */
  --color-success: #10b981;
  --color-success-light: #ecfdf5;
  --color-success-border: #a7f3d0;
  --color-warning: #f59e0b;
  --color-warning-light: #fffbeb;
  --color-warning-border: #fde68a;
  --color-error: #ef4444;
  --color-error-hover: #dc2626;
  --color-error-light: #fef2f2;
  --color-error-border: #fecaca;
  --color-info: #3b82f6;
  --color-info-light: #eff6ff;
  --color-info-border: #bfdbfe;

  /* Misc */
  --color-overlay: rgba(0, 0, 0, 0.5);

  /* Scrim laid over blurred locked content (the Pro analytics teaser). A
     translucent tint of --color-background, so the blur beneath reads as
     deliberately obscured rather than as a rendering fault. Light at the top
     to leave a hint of the shape, denser at the bottom for text contrast. */
  --color-locked-scrim-top: rgba(248, 250, 251, 0.72);
  --color-locked-scrim-bottom: rgba(248, 250, 251, 0.92);

  /* Portfolio loader — shown before a tenant's theme is known, so these are
     deliberately neutral and must never be derived from --portfolio-*. */
  --portfolio-loader-bg: #1a1a1a;
  --portfolio-loader-track: rgba(255, 255, 255, 0.12);
  /* The sweep is the one place the brand lime appears — a plain white bar on
     near-black looked generic. Transparent ends keep it from stamping. */
  --portfolio-loader-sweep: linear-gradient(
    90deg,
    rgba(216, 255, 41, 0) 0%,
    rgba(216, 255, 41, 0.85) 50%,
    rgba(216, 255, 41, 0) 100%
  );
  /* Off-centre and very low contrast: enough to lift the mark off the flat
     backdrop without reading as a visible blob. */
  --portfolio-loader-glow: radial-gradient(
    60rem 32rem at 50% 42%,
    rgba(255, 255, 255, 0.055) 0%,
    rgba(255, 255, 255, 0) 70%
  );
  --portfolio-loader-fade: 300ms;
  --portfolio-content-fade: 150ms;

  /* Portfolio rhythm and type scale.
     These are layout, not palette — an owner customises colour, font and
     radius, never the spacing system, so they live here rather than in
     themeVariables(). The mobile half is set in the media query below. */
  --portfolio-section-gap: 5rem; /* 80px between major sections */
  --portfolio-section-inline: 1.25rem;
  /* Fluid rather than a fixed size + a mobile override below: a section
     heading now scales continuously with viewport width instead of jumping
     at the 768px breakpoint. */
  --portfolio-heading: clamp(1.75rem, 4vw, 2.5rem);
  --portfolio-hero-title: 3.5rem; /* 56px, fullscreen hero only */
  --portfolio-body-line-height: 1.6;
  /* Uppercase labels (category tags, badges) need positive tracking — the
     tight default that suits mixed case cramps small caps. */
  --portfolio-tracking-label: 0.08em;
  --portfolio-reveal-distance: 20px;
  --portfolio-reveal-duration: 500ms;
  --portfolio-card-lift: 200ms ease;

  /* Typography */
  --font-sans: 'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --tracking-tight: -0.02em;
  --tracking-tighter: -0.03em;

  /* Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px 0 rgba(17, 24, 39, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(17, 24, 39, 0.07), 0 2px 4px -2px rgba(17, 24, 39, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(17, 24, 39, 0.08), 0 4px 6px -4px rgba(17, 24, 39, 0.05);
  --shadow-drawer: -8px 0 24px -4px rgba(17, 24, 39, 0.12);

  /* Transition */
  --transition-fast: 120ms ease;
  --transition-base: 180ms ease;
  --transition-slow: 260ms ease;

  /* Layout */
  --sidebar-width: 240px;
  --header-height: 64px;
  --page-padding: 1.5rem;
  --card-padding: 1.5rem;

  /* Responsive — see the Responsiveness section in CLAUDE.md.
     Breakpoints: mobile < 768px, tablet 768–1024px, desktop > 1024px. */
  --page-padding-mobile: 1rem;
  --card-padding-mobile: 1.125rem;
  --drawer-width: 480px;

  /* Z-index scale */
  --z-header: 30;
  --z-sidebar: 40;
  --z-overlay: 50;
  --z-drawer: 60;
  --z-toast: 70;
}
```

## Appendix B: Tailwind v4 theme config, verbatim (`src/globals.css:1, 150-164`)

There is no `tailwind.config.js`. This is the entire Tailwind configuration:

```css
@import 'tailwindcss';

/* Expose the variables above to Tailwind's utility generator so
   `tracking-tight`, `font-sans`, `rounded-lg` etc. resolve to our tokens. */
@theme inline {
  --font-sans: var(--font-sans);

  --tracking-tight: var(--tracking-tight);
  --tracking-tighter: var(--tracking-tighter);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);

  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
}
```

Vite plugin (`vite.config.js`): `plugins: [react(), tailwindcss()]` with `import tailwindcss from '@tailwindcss/vite'`.

## Appendix C: Base layer, verbatim (`src/globals.css:170-327`)

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; }
[data-anchor] { scroll-margin-top: 2rem; }

body {
  margin: 0;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  letter-spacing: var(--tracking-tight);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

img, svg, video { max-width: 100%; }

@media (max-width: 767.98px) {
  :root {
    --page-padding: var(--page-padding-mobile);
    --card-padding: var(--card-padding-mobile);
    --portfolio-section-gap: 3rem;
    --portfolio-hero-title: 2rem;
  }
  html { font-size: 15px; }
}

body[data-scroll-locked='true'] { overflow: hidden; }

h1, h2, h3, h4, h5, h6, p, span, a, li, label, button, input, select, textarea, table {
  letter-spacing: inherit;
}
h1, h2, h3, h4, h5, h6 { margin: 0; letter-spacing: var(--tracking-tighter); font-weight: 600; }
p { margin: 0; }
button, input, select, textarea { font-family: inherit; font-size: inherit; color: inherit; }
button { cursor: pointer; border: none; background: none; padding: 0; }
a { color: inherit; text-decoration: none; }
ul, ol { margin: 0; padding: 0; list-style: none; }

*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: var(--radius-full);
  border: 2px solid var(--color-background);
}
*::-webkit-scrollbar-thumb:hover { background-color: var(--color-text-muted); }

:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

@keyframes wapee-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes wapee-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes wapee-slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes wapee-spin { to { transform: rotate(360deg); } }
@keyframes wapee-row-in {
  from { opacity: 0; transform: translateY(-0.25rem); }
  to   { opacity: 1; transform: translateY(0); }
}
```

(The comments are condensed in Appendix C; Appendix A is verbatim, comments included.)

## Appendix D: Font link, verbatim (`index.html:8-13`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,400&display=swap"
  rel="stylesheet"
/>
```
