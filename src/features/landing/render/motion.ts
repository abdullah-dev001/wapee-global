/**
 * Motion + polish CSS for the landing page (built from theme tokens).
 *
 * Rules: animate only transform and opacity; calm loops (3-8 s); everything moving
 * sits behind `prefers-reduced-motion: no-preference`, so reduced-motion visitors get
 * the static final state. motionClient.ts pauses loops that are off screen
 * (`[data-motion]:not(.in-view)`) or while the tab is hidden (`html.page-hidden`).
 * Scroll reveals are gated by `html.js` (set before paint) and forced visible by
 * `html.reveal-all` (a 3 s safety net set in the head script) if the script fails.
 */
import { colors } from '../../../lib/theme/colors.ts';
import { shadowLevels } from '../../../lib/theme/shadowLevels.ts';
import { breakpoints, duration, radius, spacing } from '../../../lib/theme/tokens.ts';
import { fontSize, letterSpacingEm } from '../../../lib/theme/typography.ts';

const px = (n: number) => `${n}px`;

/** `#rrggbb` + alpha as rgba(), for tints of the brand colours. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const ease = 'cubic-bezier(.2,.8,.2,1)';

export const motionCss = `
/* Wordmark: text only, lime marker underline as the one accent */
.wordmark { position: relative; z-index: 0; display: inline-flex; align-items: center; min-height: 44px; font-weight: 700; font-size: ${px(fontSize['7xl'])}; letter-spacing: ${letterSpacingEm.tighter}em; color: var(--primary); text-decoration: none; line-height: 1; }
.wordmark::after { content: ""; position: absolute; z-index: -1; left: -2px; right: -2px; bottom: 11px; height: 7px; border-radius: 4px; background: var(--accent); }

/* Header: transparent at the top, white + blur + hairline once scrolled */
.site-header { background: transparent; border-bottom-color: transparent; backdrop-filter: none; transition: background-color ${duration.slow}ms ease, box-shadow ${duration.slow}ms ease, border-color ${duration.slow}ms ease; }
.site-header.is-scrolled, .no-js .site-header, .legal .site-header { background: ${tint(colors.surface, 0.82)}; backdrop-filter: saturate(1.6) blur(12px); -webkit-backdrop-filter: saturate(1.6) blur(12px); border-bottom-color: var(--border); box-shadow: ${shadowLevels.sm.web}; }
@media (max-width: ${px(breakpoints.desktop - 1)}) { .js .site-nav.open { background: var(--surface); } }

/* Hero: soft brand glow + dot grid, headline marker */
.hero { position: relative; isolation: isolate; background: var(--surface); }
.hero::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(60% 55% at 78% 30%, ${tint(colors.primary, 0.09)} 0%, transparent 70%),
              radial-gradient(40% 40% at 12% 85%, ${tint(colors.secondary, 0.18)} 0%, transparent 70%),
              linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%); }
.hero::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background-image: radial-gradient(${tint(colors.primary, 0.13)} 1px, transparent 1.2px); background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(70% 70% at 70% 35%, #000 0%, transparent 75%); mask-image: radial-gradient(70% 70% at 70% 35%, #000 0%, transparent 75%); }
.marker { position: relative; z-index: 0; white-space: nowrap; }
.marker::after { content: ""; position: absolute; z-index: -1; left: -0.08em; right: -0.08em; bottom: 0.06em; height: 0.36em; border-radius: 0.12em; background: var(--accent); transform-origin: left center; }
.hero-note { display: flex; flex-wrap: wrap; gap: ${px(spacing[6])}; align-items: center; }

.addons-note + .promises { justify-content: center; }
@media (prefers-reduced-motion: reduce) { html.js .reveal { opacity: 1; transform: none; transition: none; } }

/* Section headings: a small lime accent */
.section-head h2::before { content: ""; display: block; width: 40px; height: 5px; margin: 0 auto ${px(spacing[16])}; border-radius: ${px(radius.full)}; background: var(--accent); }

/* Hover: transform + shadow only */
.btn { transition: transform ${duration.base}ms ${ease}, box-shadow ${duration.base}ms ease, background-color ${duration.base}ms ease, color ${duration.base}ms ease, border-color ${duration.base}ms ease; }
.btn:hover { transform: translateY(-1px); box-shadow: ${shadowLevels.md.web}; }
.btn:active { transform: translateY(0); box-shadow: none; }
.nav-links a:hover, .btn-ghost:hover { transform: none; box-shadow: none; }
.card, .who-item, .plan, .faq details { transition: transform ${duration.slow}ms ${ease}, box-shadow ${duration.slow}ms ease; }
.card:hover, .who-item:hover { transform: translateY(-3px); box-shadow: ${shadowLevels.lg.web}; }
.plan:hover { transform: translateY(-3px); box-shadow: ${shadowLevels.lg.web}; }
.faq details:hover { box-shadow: ${shadowLevels.md.web}; }

/* CTA band: soft floating shapes at the edges, away from the text */
.cta-band { isolation: isolate; }
.cta-shape { position: absolute; z-index: -1; border-radius: 50%; pointer-events: none; }
.cta-shape-1 { width: 220px; height: 220px; left: -70px; top: -80px; background: ${tint(colors.secondary, 0.16)}; }
.cta-shape-2 { width: 160px; height: 160px; right: -50px; bottom: -60px; background: ${tint(colors.surface, 0.08)}; }
.cta-shape-3 { width: 54px; height: 54px; right: 12%; top: 18%; background: ${tint(colors.secondary, 0.22)}; }

/* Scroll reveal (once). Never on the hero text: it is the LCP element. */
.js .reveal { opacity: 0; transform: translateY(18px); transition: opacity 700ms ${ease}, transform 700ms ${ease}; }
.js .reveal.is-visible, .reveal-all .reveal { opacity: 1; transform: none; }
.js .reveal-d1 { transition-delay: 90ms; } .js .reveal-d2 { transition-delay: 180ms; } .js .reveal-d3 { transition-delay: 270ms; }

/* SVG parts move around their own box */
.sv-row-hl, .sv-day, .sv-bubble, .sv-pop, .sv-cursor, .sv-cell { transform-box: fill-box; transform-origin: center; }
.sv-row-hl { opacity: 0; }

@media (prefers-reduced-motion: no-preference) {
  .hero-visual { animation: rise 900ms ${ease} both; }
  .marker::after { animation: marker 900ms ${ease} 250ms both; }
  .who-item .icon-tile, #features .icon-tile { animation: float 6s ease-in-out infinite; }
  .who-item:nth-child(2n) .icon-tile, #features li:nth-child(2n) .icon-tile { animation-delay: -2s; }
  .who-item:nth-child(3n) .icon-tile, #features li:nth-child(3n) .icon-tile { animation-delay: -4s; }
  .sv-row-hl { animation: row-hl 6s ease-in-out infinite; }
  .sv-row-hl:nth-of-type(2) { animation-delay: 2s; }
  .sv-day { animation: day 6s ease-in-out infinite; }
  .sv-bubble { animation: float 7s ease-in-out infinite; }
  .sv-bubble:nth-of-type(2n) { animation-delay: -3s; }
  .sv-cursor { animation: cursor 5s ${ease} infinite; }
  .sv-pop { animation: pop 5s ${ease} infinite; }
  .sv-cell { animation: cell 6s ease-in-out infinite; }
  .sv-cell:nth-of-type(2n) { animation-delay: -1.5s; }
  .sv-cell:nth-of-type(3n) { animation-delay: -3s; }
  .cta-shape { animation: float 8s ease-in-out infinite; }
  .cta-shape-2 { animation-duration: 7s; animation-delay: -3s; }
  .cta-shape-3 { animation-duration: 5s; animation-delay: -1s; }
}
@keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes marker { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes row-hl { 0%, 100% { opacity: 0; } 20%, 45% { opacity: 1; } 65% { opacity: 0; } }
@keyframes day { 0%, 70%, 100% { opacity: 1; } 80% { opacity: .55; } }
@keyframes cursor { 0%, 100% { transform: translate(14px, 14px); opacity: 0; } 20% { opacity: 1; } 45%, 70% { transform: translate(0, 0); opacity: 1; } 90% { opacity: 0; } }
@keyframes pop { 0%, 40% { transform: scale(1); } 50% { transform: scale(1.12); } 60%, 100% { transform: scale(1); } }
@keyframes cell { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }

/* Pause off screen and in background tabs */
.js [data-motion]:not(.in-view) *, .js [data-motion]:not(.in-view)::before, .js [data-motion]:not(.in-view)::after,
.page-hidden *, .page-hidden *::before, .page-hidden *::after { animation-play-state: paused !important; }
`;
