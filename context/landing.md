# Marketing landing page (+ /refund)
Status: done · Phase: pre-launch · Last updated: 2026-10-10

## What it does
- `/` (on the one origin `https://wapee.online`) is a static, pre-rendered marketing page: header, hero, who it's for, how it works, features, pricing (plans + add-ons + compare table), FAQ, CTA band, footer (Terms, Privacy, Refund, support email).
- `/` is the static landing page for EVERY visitor (signed in or not; no redirect). Auth-aware header: an inline `<head>` script (`authSession.ts`, types stripped, no network, no SDK) reads `sb-<ref>-auth-token` from localStorage (also chunks / `base64-` / `{currentSession}`); a valid, NOT expired session sets `html[data-auth="in"]` and `window.__landingUser`. CSS then shows the signed-in variants (name + "Dashboard" in header and mobile menu; hero + final CTA "Go to Dashboard" to `/today`) and hides "Log in" / "Start free trial"; secondary CTAs stay. An inline script right after the header fills `[data-user-name]` with textContent. Expired (even with a refresh token) / malformed / no JS = signed out. Native app: `app/index.tsx` still redirects to `/today`; in-app (client-side) navigation to `/` does too. PWA `start_url` stays `/today`.
- `/refund`: Refund Policy, DRAFT for lawyer review, same look as /privacy and /terms (reseller name is a placeholder).

## Business rules
- **No price in code.** Plans and add-ons come at runtime from `get_public_pricing()` (GET, anon key). Skeleton while loading, friendly error + retry + support email on failure, noscript note. A unit test fails on any price literal in the landing source, strings or build script.
- Plan cards / compare table are built from `plans.features` = the SAME flags `business_has_feature()` gates on. `embed_widget` is never shown (off at launch; `HIDDEN_FEATURES`). Add-on availability: `addons.available_plans` (null = every plan); a plan whose features flag the add-on key includes it (custom roles: Team add-on, included in Business).
- Yearly toggle shows annual / 12 per month + "Billed X per year"; "N months free" is computed and only shown when every plan agrees. Business shows "per location" when `priced_per_branch`.
- Honesty: no SMS, widget, online payments, custom domain, waitlist, testimonials, logos, stats or compliance claims (tested on the rendered text).
- Launch prices (dev, set by the migration; USD/month, yearly = 10x): Solo 15 (1 staff), Team 39 (5 staff/location), Business 79 per location; add-ons Packages 9, Inventory 9, Files & Photos 9, Forms & Consent 12, Client portal 12, Custom roles 10.

## Files
| Path | Purpose |
|---|---|
| scripts/build-landing.mjs | `--check-env` in `prebuild:web` (fails clearly without the Supabase env vars); runs in `postbuild:web`: moves Expo's `dist/index.html` to `dist/_app/shell.html`, writes `index.html`, `refund.html`, `assets/landing/landing.<hash>.js` + DM Sans ttf, `privacy.html` + `terms.html` (from `legal/*.html`), `robots.txt`, `sitemap.xml`. Needs `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` (reads `.env`). |
| src/features/landing/i18n/en.json | All page strings (English base; not loaded into the app bundle) |
| src/features/landing/pricingModel.ts | Pure, import-free: parse RPC payload, format, yearly maths, plan highlights, compare rows, add-on availability |
| src/features/landing/landingClient.ts | Browser script: fetch prices, render cards/tables, toggle, mobile menu, JSON-LD offers |
| src/features/landing/authSession.ts | Pure session reader (`readStoredSession`, `readSignedIn`, `truncateName`, max 18 chars), inlined into `<head>`; tests in `authSession.test.ts`, `landingAuth.test.ts` (runs the real head script against a fake browser) |
| src/features/landing/motionClient.ts | Browser script (inlined after landingClient): header `is-scrolled`, reveal once (`.reveal` > `.is-visible`), `[data-motion].in-view` while on screen, `html.page-hidden` |
| src/features/landing/render/heroVisual.ts | Hero product visual (HTML/CSS/SVG, sized in em from a container-query font size) + its 8 s timeline CSS |
| src/features/landing/render/motion.ts | Motion + polish CSS: wordmark, header blur, hero glow + dot grid + marker, heading accent, hovers, reveals, step/icon/CTA loops, pause rules |
| src/features/landing/render/*.ts | String templates: `page.ts` (landing + refund), `chrome.ts` (head/header/footer), `sections.ts`, `pricingSection.ts`, `illustrations.ts` (original SVG), `icons.ts`, `styles.ts` (CSS from theme tokens), `context.ts` |
| src/features/landing/*.test.ts | Model tests, rendered-HTML tests (SEO tags, no price, links, honesty, redirect), price-literal guard |

## Database
- `get_public_pricing()` → `{plans:[key,name,staff_cap,max_branches,priced_per_branch,features,price_monthly_minor,price_annual_minor,currency], addons:[key,name,available_plans,price_monthly_minor,price_annual_minor,currency]}`; active rows only; SECURITY DEFINER, STABLE, anon + authenticated. Tables stay closed to anon.
- New columns: `plans.priced_per_branch`, `addons.price_annual_minor`, `addons.available_plans` (edited in /admin/platform; see plans-super-admin.md).
- Migration `20261021090000_public_pricing.sql`; suite `supabase/tests/36_public_pricing.sql` (42).

## Hosting
- Vercel (`vercel.json`, see _foundation.md Hosting): real files first, then every path rewrites to `/_app/shell`. `public/sw.js` (v2) caches and falls back to `/_app/shell`, not `/`. `/_sitemap` (Expo's route list) is deleted from the output. Manifest `start_url` is `/today` (`id` stays `/`).
- Reserved slugs: `pricing`, `features`, `refund` and (2026-10-10) every top-level app route (`today`, `members`, `website`, `icons`...; migration `20261021100000`). `reservedSlugs.test.ts` keeps client + DB in sync and derives every top-level path from `app/`, `public/` and the landing build.

## UI
- Logo = text-only wordmark (`.wordmark`, bold, -0.03em, lime underline accent); favicon / PWA icons unchanged. Hero: "Fill your calendar, not your inbox." (marker on the first phrase), visual = phone booking (slots appear, 10:30 picked, Booked + check reveal) + calendar block slides in + "New booking" / "Invoice paid" cards; 8 s loop resting on the final frame.
- Motion rules: only transform / opacity (a test checks every @keyframes); all loops behind `prefers-reduced-motion: no-preference` (base styles = final frame); loops pause off screen and in hidden tabs; reveals gated by `html.js` with a 3 s `reveal-all` safety net in the head script. Lighthouse 2026-10-10: mobile 95/100/100/100, desktop 100s, CLS ~0.002.
- Responsive 320 → wide desktop, no horizontal scroll (checked 320/375/768/1440). Mobile menu (<1024) with aria-expanded + Escape; FAQ is native `<details>`; toggle buttons use `aria-pressed`; skip link; one h1.
- Lighthouse (local, uncompressed, 2026-10-10): mobile 96/100/100/100, desktop 100/100/100/100 (perf/a11y/best practices/SEO).

## Known limits / TODO
- `npm run web` (dev server) still shows the app at `/`; preview the landing with `npm run build:web` and serve `dist` (fallback to `/_app/shell`).
- Refund page: `RESELLER` = `Polar Software, Inc.` (merchant of record per polar.sh/legal/checkout-buyer-terms, checked 2026-10-10), `REFUND_UPDATED` date; lawyer review.
- `get_public_pricing` is not rate-limited (a STABLE read of two tiny tables; PostgREST cannot count without writing).
- `addons.available_plans` is display + admin data only: `set_addon` does not yet refuse enabling an add-on on a plan outside it.
- Only English; another language = another `i18n/<lang>.json` + a page per language.

## Changelog
- 2026-10-22: Copy made truthful for manual billing: cancelling and changing plans go through support (FAQ, refund policy, fineprint), add-ons say "ask us to enable", the "Ready-made team roles" row is gone (`default_roles` is no longer in `DISPLAY_FEATURES`: nothing enforces it), multi-location and "set up in minutes" claims are now true (booking-page location choice, Today setup checklist). Prices still come from `get_public_pricing()`. English is the only language. Tests added in `landing.test.ts` / `pricingModel.test.ts`.
- 2026-10-10: `/` no longer redirects signed-in visitors; auth-aware header and CTAs from the stored session (no network); header screenshots `docs/screenshots/landing/header-*`, `menu-mobile-*`.
- 2026-10-10: Revision: text wordmark, new animated hero, scroll reveals and calm loops on every illustration, section heading accent, hover lift, header blur on scroll; skeleton pulse is opacity-only.
- 2026-10-10: Single origin + Vercel; legal pages generated from brand.ts; reseller Polar Software, Inc.; screenshots in `docs/screenshots/landing/`.
- 2026-10-10: Landing page, /refund, public pricing RPC + new price fields, reserved slugs, SPA fallback moved to /_app/shell.
