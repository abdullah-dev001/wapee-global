/**
 * Landing page CSS, built from the app's theme tokens at build time (light only).
 * Relative `.ts` imports on purpose: this runs in plain Node (type stripping), not Metro.
 */
import { colors } from '../../../lib/theme/colors.ts';
import { shadowLevels } from '../../../lib/theme/shadowLevels.ts';
import { breakpoints, duration, layout, radius, spacing } from '../../../lib/theme/tokens.ts';
import { fontSize, letterSpacingEm, lineHeight } from '../../../lib/theme/typography.ts';

/** Marketing display sizes (above the app's type scale, which tops out at 8xl). */
const display = {
  hero: 54,
  heroMobile: 34,
  section: 38,
  sectionMobile: 28,
  price: 44,
} as const;

/** Page width and the big vertical rhythm, as multiples of the spacing scale. */
const pageMaxWidth = 1160;
const sectionGap = spacing[48] * 2;
const sectionGapMobile = spacing[48] + spacing[16];

const px = (n: number) => `${n}px`;

export const landingCss = `
:root {
  --primary: ${colors.primary};
  --primary-hover: ${colors.primaryHover};
  --primary-light: ${colors.primaryLight};
  --accent: ${colors.secondary};
  --accent-light: ${colors.secondaryLight};
  --bg: ${colors.background};
  --surface: ${colors.surface};
  --border: ${colors.border};
  --text: ${colors.textPrimary};
  --text-2: ${colors.textSecondary};
  --muted: ${colors.textMuted};
  --on-primary: ${colors.textOnPrimary};
  --error-bg: ${colors.errorLight};
  --error: ${colors.errorText};
  --shadow-sm: ${shadowLevels.sm.web};
  --shadow-md: ${shadowLevels.md.web};
  --shadow-lg: ${shadowLevels.lg.web};
  --r-sm: ${px(radius.sm)}; --r-md: ${px(radius.md)}; --r-lg: ${px(radius.lg)}; --r-xl: ${px(radius.xl)};
  --gutter: ${px(layout.pagePaddingMobile)};
  --section: ${px(sectionGapMobile)};
  color-scheme: light;
}
@media (min-width: ${px(breakpoints.tablet)}) {
  :root { --gutter: ${px(layout.pagePadding)}; --section: ${px(sectionGap)}; }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: ${px(layout.headerHeight + spacing[16])}; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
body {
  margin: 0; background: var(--surface); color: var(--text);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: ${px(fontSize.xl)}; line-height: ${lineHeight.loose};
  -webkit-font-smoothing: antialiased; overflow-x: hidden;
}
img, svg { display: block; max-width: 100%; }
a { color: var(--primary); }
h1, h2, h3 { color: var(--primary); margin: 0; letter-spacing: ${letterSpacingEm.tighter}em; line-height: ${lineHeight.snug}; }
h3 { font-size: ${px(fontSize['3xl'])}; letter-spacing: ${letterSpacingEm.tight}em; }
p { margin: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip { position: absolute; left: var(--gutter); top: -${px(spacing[48])}; z-index: 100; background: var(--primary); color: var(--on-primary); padding: ${px(spacing[8])} ${px(spacing[16])}; border-radius: var(--r-md); }
.skip:focus { top: ${px(spacing[8])}; }
:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; border-radius: var(--r-sm); }
.wrap { max-width: ${px(pageMaxWidth)}; margin: 0 auto; padding: 0 var(--gutter); }
.section { padding: var(--section) 0; }
.section-alt { background: var(--bg); }
.cta-section { padding-top: 0; }
.plain-list { list-style: none; margin: 0; padding: 0; }
.section-head { max-width: 720px; margin: 0 auto ${px(spacing[48])}; text-align: center; }
.section-head h2 { font-size: ${px(display.sectionMobile)}; }
.section-head p { margin-top: ${px(spacing[12])}; color: var(--text-2); font-size: ${px(fontSize['3xl'])}; }
@media (min-width: ${px(breakpoints.tablet)}) { .section-head h2 { font-size: ${px(display.section)}; } }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: ${px(spacing[8])};
  min-height: ${px(layout.minTouchTarget)}; padding: ${px(spacing[10])} ${px(spacing[20])};
  border-radius: var(--r-md); border: 1.5px solid transparent; font: inherit; font-weight: 600;
  font-size: ${px(fontSize.lg)}; line-height: ${lineHeight.compact}; text-decoration: none; cursor: pointer;
  transition: background-color ${duration.base}ms ease, color ${duration.base}ms ease, border-color ${duration.base}ms ease;
}
.btn-lg { min-height: ${px(spacing[48] + spacing[4])}; padding: ${px(spacing[12])} ${px(spacing[24])}; font-size: ${px(fontSize.xl)}; }
.btn-primary { background: var(--primary); color: var(--on-primary); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-outline { background: var(--surface); color: var(--primary); border-color: var(--primary); }
.btn-outline:hover { background: var(--primary-light); }
.btn-ghost { background: transparent; color: var(--primary); }
.btn-ghost:hover { background: var(--primary-light); }
.btn-accent { background: var(--accent); color: var(--primary); }
.btn-accent:hover { background: ${colors.secondaryHover}; }
.btn-block { width: 100%; }

/* Header */
.site-header { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,0.94); backdrop-filter: saturate(1.4) blur(8px); border-bottom: 1px solid var(--border); }
.header-row { display: flex; align-items: center; gap: ${px(spacing[16])}; min-height: ${px(layout.headerHeight)}; }
.site-nav { margin-left: auto; display: flex; align-items: center; gap: ${px(spacing[4])}; }
.nav-links { display: flex; gap: ${px(spacing[4])}; list-style: none; margin: 0; padding: 0; }
.nav-links a { display: inline-flex; align-items: center; min-height: ${px(layout.minTouchTarget)}; padding: 0 ${px(spacing[12])}; color: var(--text-2); text-decoration: none; font-weight: 500; border-radius: var(--r-md); }
.nav-links a:hover { color: var(--primary); background: var(--primary-light); }
.nav-actions { display: flex; gap: ${px(spacing[8])}; margin-left: ${px(spacing[12])}; }
.menu-button { display: none; margin-left: auto; width: ${px(layout.minTouchTarget)}; height: ${px(layout.minTouchTarget)}; align-items: center; justify-content: center; border: 1px solid var(--border); background: var(--surface); border-radius: var(--r-md); color: var(--primary); cursor: pointer; }
.menu-button svg { width: 22px; height: 22px; }
.menu-button .icon-close, .menu-button[aria-expanded="true"] .icon-menu { display: none; }
.menu-button[aria-expanded="true"] .icon-close { display: block; }
@media (max-width: ${px(breakpoints.desktop - 1)}) {
  .js .menu-button { display: inline-flex; }
  .site-nav { flex-wrap: wrap; justify-content: flex-end; }
  .js .site-nav { display: none; position: absolute; left: 0; right: 0; top: 100%; background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--shadow-lg); padding: ${px(spacing[8])} var(--gutter) ${px(spacing[20])}; flex-direction: column; align-items: stretch; }
  .js .site-nav.open { display: flex; }
  .js .nav-links { flex-direction: column; }
  .js .nav-links a { width: 100%; font-size: ${px(fontSize['2xl'])}; }
  .js .nav-actions { flex-direction: column; margin: ${px(spacing[12])} 0 0; }
  .js .nav-actions .btn { width: 100%; }
}

/* Hero */
.hero { padding: ${px(spacing[48])} 0 var(--section); background: linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%); overflow: hidden; }
.hero-grid { display: grid; gap: ${px(spacing[48])}; align-items: center; }
.eyebrow { display: inline-block; background: var(--accent-light); color: var(--primary); border: 1px solid var(--accent); border-radius: ${px(radius.full)}; padding: ${px(spacing[4])} ${px(spacing[12])}; font-size: ${px(fontSize.base)}; font-weight: 600; line-height: ${lineHeight.normal}; }
.hero h1 { margin-top: ${px(spacing[16])}; font-size: ${px(display.heroMobile)}; line-height: ${lineHeight.tight}; }
.hero-sub { margin-top: ${px(spacing[16])}; font-size: ${px(fontSize['3xl'])}; color: var(--text-2); max-width: 560px; }
.hero-ctas { display: flex; flex-wrap: wrap; gap: ${px(spacing[12])}; margin-top: ${px(spacing[32])}; }
.hero-note { margin-top: ${px(spacing[16])}; font-size: ${px(fontSize.base)}; color: var(--muted); }
.hero-art svg { width: 100%; height: auto; }
.promises { display: flex; flex-wrap: wrap; gap: ${px(spacing[8])} ${px(spacing[20])}; margin-top: ${px(spacing[24])}; padding: 0; list-style: none; color: var(--text-2); font-size: ${px(fontSize.lg)}; }
.promises li { display: inline-flex; align-items: center; gap: ${px(spacing[6])}; }
@media (min-width: ${px(breakpoints.desktop)}) {
  .hero { padding-top: ${px(spacing[48] + spacing[32])}; }
  .hero-grid { grid-template-columns: 1.05fr 1fr; }
  .hero h1 { font-size: ${px(display.hero)}; }
}

/* Cards and grids */
.grid { display: grid; gap: ${px(spacing[16])}; }
@media (min-width: 560px) { .grid-3, .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: ${px(breakpoints.desktop)}) { .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); padding: ${px(layout.cardPaddingMobile)}; box-shadow: var(--shadow-sm); }
@media (min-width: ${px(breakpoints.tablet)}) { .card { padding: ${px(layout.cardPadding)}; } }
.card p { color: var(--text-2); margin-top: ${px(spacing[8])}; font-size: ${px(fontSize.lg)}; line-height: ${lineHeight.relaxed}; }
.icon-tile { width: 48px; height: 48px; border-radius: var(--r-lg); background: var(--primary-light); color: var(--primary); display: grid; place-items: center; margin-bottom: ${px(spacing[16])}; }
.icon-tile svg, .icon { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.who-grid { display: grid; gap: ${px(spacing[12])}; grid-template-columns: repeat(2, minmax(0, 1fr)); list-style: none; padding: 0; margin: 0; }
@media (min-width: ${px(breakpoints.tablet)}) { .who-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: ${px(breakpoints.desktop)}) { .who-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.who-item { display: flex; flex-direction: column; align-items: center; text-align: center; gap: ${px(spacing[12])}; padding: ${px(spacing[20])} ${px(spacing[12])}; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); font-weight: 600; color: var(--primary); line-height: ${lineHeight.compact}; }
.who-item .icon-tile { margin: 0; }
.who-line { text-align: center; margin-top: ${px(spacing[32])}; font-size: ${px(fontSize['4xl'])}; font-weight: 600; color: var(--primary); }
.who-line mark { background: linear-gradient(transparent 60%, var(--accent) 60%); color: inherit; padding: 0 2px; }
.steps { list-style: none; margin: 0; padding: 0; counter-reset: step; }
.step-art { border-radius: var(--r-lg); background: var(--bg); border: 1px solid var(--border); margin-bottom: ${px(spacing[20])}; overflow: hidden; }
.step-art svg { width: 100%; height: auto; }
.step-num { display: inline-block; font-size: ${px(fontSize.md)}; font-weight: 700; color: var(--primary); background: var(--accent); border-radius: ${px(radius.full)}; padding: ${px(spacing[2])} ${px(spacing[10])}; margin-bottom: ${px(spacing[8])}; }
.addons-note { margin-top: ${px(spacing[32])}; text-align: center; color: var(--text-2); }
.addons-note a { font-weight: 600; white-space: nowrap; }

/* Pricing */
.toggle { display: inline-flex; padding: ${px(spacing[4])}; background: var(--bg); border: 1px solid var(--border); border-radius: ${px(radius.full)}; gap: ${px(spacing[4])}; }
.toggle-row { display: flex; justify-content: center; margin-bottom: ${px(spacing[32])}; }
.toggle button { min-height: ${px(layout.minTouchTarget)}; padding: 0 ${px(spacing[20])}; border: 0; border-radius: ${px(radius.full)}; background: transparent; color: var(--text-2); font: inherit; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: ${px(spacing[8])}; }
.toggle button[aria-pressed="true"] { background: var(--primary); color: var(--on-primary); }
.save { background: var(--accent); color: var(--primary); border-radius: ${px(radius.full)}; padding: 0 ${px(spacing[8])}; font-size: ${px(fontSize.sm)}; font-weight: 700; line-height: 1.7; }
.save[hidden] { display: none; }
.plans { display: grid; gap: ${px(spacing[20])}; align-items: start; }
@media (min-width: ${px(breakpoints.desktop)}) { .plans { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: ${px(breakpoints.tablet)}) and (max-width: ${px(breakpoints.desktop - 1)}) { .plans { max-width: 520px; margin: 0 auto; } }
.plan { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); padding: ${px(spacing[24])}; box-shadow: var(--shadow-sm); }
.plan-popular { border: 2px solid var(--primary); box-shadow: var(--shadow-lg); }
.plan-badge { position: absolute; top: -${px(spacing[14])}; left: ${px(spacing[24])}; background: var(--accent); color: var(--primary); font-weight: 700; font-size: ${px(fontSize.md)}; border-radius: ${px(radius.full)}; padding: ${px(spacing[4])} ${px(spacing[12])}; line-height: ${lineHeight.compact}; }
.plan-name { font-size: ${px(fontSize['6xl'])}; }
.plan-for { color: var(--text-2); margin-top: ${px(spacing[6])}; min-height: 3em; font-size: ${px(fontSize.lg)}; line-height: ${lineHeight.relaxed}; }
.plan-price { margin-top: ${px(spacing[16])}; display: flex; flex-wrap: wrap; align-items: baseline; gap: ${px(spacing[6])}; }
.plan-amount { font-size: ${px(display.price)}; font-weight: 700; color: var(--primary); letter-spacing: ${letterSpacingEm.tighter}em; line-height: 1; }
.plan-unit { color: var(--text-2); font-size: ${px(fontSize.lg)}; }
.plan-billed { color: var(--muted); font-size: ${px(fontSize.base)}; margin: ${px(spacing[6])} 0 ${px(spacing[20])}; }
.checks { list-style: none; padding: 0; margin: ${px(spacing[24])} 0 0; display: grid; gap: ${px(spacing[10])}; font-size: ${px(fontSize.lg)}; line-height: ${lineHeight.normal}; }
.checks li { display: flex; gap: ${px(spacing[10])}; align-items: flex-start; }
.checks .inherit { font-weight: 600; color: var(--primary); }
.checks .addon-line { color: var(--text-2); padding-left: ${px(spacing[32] - spacing[2])}; font-style: italic; }
.icon-check { width: 20px; height: 20px; flex: none; fill: none; stroke: var(--primary); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; background: var(--accent-light); border-radius: ${px(radius.full)}; padding: 3px; }
.fineprint { text-align: center; color: var(--text-2); margin-top: ${px(spacing[24])}; font-size: ${px(fontSize.lg)}; }
.skeleton { background: var(--border); border-radius: var(--r-md); }
@media (prefers-reduced-motion: no-preference) { .skeleton { animation: shimmer ${duration.skeletonPulse}ms ease-in-out infinite; } }
@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.plan-skeleton { min-height: 460px; display: grid; gap: ${px(spacing[12])}; align-content: start; }
.sk-line { height: 14px; } .sk-title { height: 24px; width: 40%; } .sk-price { height: 44px; width: 55%; } .sk-btn { height: 44px; }
.pricing-error { max-width: 560px; margin: 0 auto ${px(spacing[24])}; text-align: center; background: var(--error-bg); color: var(--error); border-radius: var(--r-lg); padding: ${px(spacing[20])}; }
.pricing-error p + p { margin-top: ${px(spacing[8])}; color: var(--text-2); }
.pricing-error .btn { margin-top: ${px(spacing[16])}; }
.pricing-failed .plans, .pricing-failed .toggle-row, .pricing-failed .price-dependent,
.no-js .plans, .no-js .toggle-row, .no-js .price-dependent, .no-js .menu-button { display: none; }
.subhead { margin: ${px(spacing[48] + spacing[16])} 0 ${px(spacing[8])}; font-size: ${px(fontSize['7xl'])}; text-align: center; }
.subhead + p { text-align: center; color: var(--text-2); margin-bottom: ${px(spacing[24])}; }
.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: var(--r-xl); background: var(--surface); }
table { width: 100%; border-collapse: collapse; font-size: ${px(fontSize.lg)}; }
th, td { padding: ${px(spacing[12])} ${px(spacing[16])}; text-align: start; vertical-align: top; border-bottom: 1px solid var(--border); line-height: ${lineHeight.normal}; }
tbody tr:last-child > * { border-bottom: 0; }
thead th { background: var(--bg); color: var(--primary); font-weight: 700; white-space: nowrap; }
tbody th { font-weight: 600; color: var(--text); }
.nowrap { white-space: nowrap; }
.compare-table td, .compare-table thead th:not(:first-child) { text-align: center; }
.compare-table .icon-check { margin: 0 auto; }
.cell-addon { white-space: nowrap; color: var(--text-2); font-size: ${px(fontSize.base)}; font-weight: 600; }
.cell-no { color: var(--muted); }
.sk-row td { padding: ${px(spacing[16])}; }
@media (max-width: 639px) {
  .addons-table thead { display: none; }
  .addons-table tr { display: block; padding: ${px(spacing[16])}; border-bottom: 1px solid var(--border); }
  .addons-table tbody tr:last-child { border-bottom: 0; }
  .addons-table th, .addons-table td { display: block; border: 0; padding: ${px(spacing[2])} 0; }
  .addons-table th { font-size: ${px(fontSize['2xl'])}; color: var(--primary); }
  .addons-table td[data-label]::before { content: attr(data-label) ": "; font-weight: 600; color: var(--text); }
  .addons-table td:nth-child(2)::before { content: none; }
  .compare-table th, .compare-table td { padding: ${px(spacing[10])} ${px(spacing[8])}; font-size: ${px(fontSize.base)}; }
}

/* FAQ */
.faq { max-width: 800px; margin: 0 auto; display: grid; gap: ${px(spacing[12])}; }
.faq details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); }
.faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: ${px(spacing[16])}; min-height: ${px(layout.minTouchTarget + spacing[12])}; padding: ${px(spacing[12])} ${px(spacing[20])}; font-weight: 600; color: var(--primary); font-size: ${px(fontSize['2xl'])}; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary svg { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; transition: transform ${duration.base}ms ease; }
.faq details[open] summary svg { transform: rotate(180deg); }
.faq details p { padding: 0 ${px(spacing[20])} ${px(spacing[20])}; color: var(--text-2); }

/* CTA band + footer */
.cta-band { background: var(--primary); color: var(--on-primary); border-radius: var(--r-xl); padding: ${px(spacing[48])} ${px(spacing[24])}; text-align: center; position: relative; overflow: hidden; }
.cta-band h2 { color: var(--on-primary); font-size: ${px(display.sectionMobile)}; }
.cta-band p { margin-top: ${px(spacing[12])}; color: ${colors.sidebarText}; font-size: ${px(fontSize['3xl'])}; }
.cta-band .hero-ctas { justify-content: center; }
.cta-band .btn-outline { background: transparent; color: var(--on-primary); border-color: var(--on-primary); }
.cta-band .btn-outline:hover { background: ${colors.sidebarHover}; }
.cta-band :focus-visible { outline-color: var(--accent); }
@media (min-width: ${px(breakpoints.tablet)}) { .cta-band h2 { font-size: ${px(display.section)}; } }
.site-footer { border-top: 1px solid var(--border); background: var(--bg); padding: ${px(spacing[48])} 0 ${px(spacing[32])}; font-size: ${px(fontSize.lg)}; }
.footer-grid { display: grid; gap: ${px(spacing[32])}; }
@media (min-width: ${px(breakpoints.tablet)}) { .footer-grid { grid-template-columns: 2fr 1fr 1fr; } }
.site-footer h2 { font-size: ${px(fontSize.base)}; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text); margin-bottom: ${px(spacing[8])}; }
.site-footer ul { list-style: none; margin: 0; padding: 0; }
.site-footer li a { display: inline-flex; align-items: center; min-height: ${px(layout.minTouchTarget)}; color: var(--text-2); }
.site-footer li a:hover { color: var(--primary); }
.footer-tagline { color: var(--text-2); margin-top: ${px(spacing[8])}; max-width: 360px; }
.copyright { margin-top: ${px(spacing[32])}; padding-top: ${px(spacing[20])}; border-top: 1px solid var(--border); color: var(--muted); font-size: ${px(fontSize.base)}; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

/** /refund (and any later legal page): the /privacy and /terms look. */
export const legalCss = `
.legal { background: var(--bg); }
.legal-main { max-width: ${px(layout.settingsMaxWidth)}; margin: 0 auto; padding: ${px(spacing[24])} var(--gutter) ${px(spacing[48] + spacing[16])}; }
.legal-main h1 { font-size: ${px(fontSize['7xl'])}; margin: 0 0 ${px(spacing[4])}; }
.legal-main h2 { font-size: ${px(fontSize['4xl'])}; margin: ${px(spacing[32])} 0 ${px(spacing[8])}; }
.legal-main p { margin: 0 0 ${px(spacing[12])}; }
.legal-main .muted { color: var(--text-2); font-size: ${px(fontSize.base)}; }
`;
