/**
 * Original flat illustrations for the landing page, drawn in the brand colours.
 * Shapes only (no words inside), so they need no translation. Parts with an `sv-*`
 * class are animated by motion.ts (transform / opacity only). Each caller wraps
 * them with role="img" + an aria-label, or marks them decorative.
 */
import { colors } from '../../../lib/theme/colors.ts';

const c = {
  p: colors.primary,
  pl: colors.primaryLight,
  a: colors.secondary,
  al: colors.secondaryLight,
  w: colors.surface,
  bg: colors.background,
  b: colors.border,
  t: colors.textMuted,
  shadow: colors.shadow,
};

/** A rounded bar standing in for a line of text. */
const bar = (x: number, y: number, w: number, h = 8, fill: string = c.b) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`;

const card = (x: number, y: number, w: number, h: number, r = 16) =>
  `<rect x="${x + 2}" y="${y + 6}" width="${w}" height="${h}" rx="${r}" fill="${c.shadow}" opacity=".07"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c.w}" stroke="${c.b}"/>`;

const stepFrame = (inner: string) =>
  `<svg viewBox="0 0 320 180" aria-hidden="true" focusable="false"><rect width="320" height="180" fill="${c.bg}"/>${inner}</svg>`;

/** Step 1: a list of services with durations and prices, plus opening hours. */
export function stepSetupIllustration(): string {
  const row = (y: number, dot: string, w: number) =>
    `<rect class="sv-row-hl" x="44" y="${y - 14}" width="232" height="28" rx="8" fill="${c.al}"/>` +
    `<circle cx="58" cy="${y}" r="7" fill="${dot}"/>` +
    bar(74, y - 4, w, 8, colors.textSecondary) +
    `<circle cx="196" cy="${y}" r="6" fill="none" stroke="${c.t}" stroke-width="1.5"/><path d="M196 ${y - 3}v3h2.5" stroke="${c.t}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
    bar(208, y - 3, 22, 6) +
    bar(246, y - 4, 28, 8, c.p);
  return stepFrame(
    card(36, 24, 248, 112, 12) +
      row(48, c.p, 84) +
      `<path d="M48 64h224" stroke="${c.b}"/>` +
      row(80, c.a, 64) +
      `<path d="M48 96h224" stroke="${c.b}"/>` +
      row(112, c.pl, 96) +
      [0, 1, 2, 3, 4, 5, 6]
        .map(
          (i) =>
            `<rect class="sv-day" x="${48 + i * 33}" y="148" width="27" height="18" rx="9" fill="${i < 5 ? c.p : c.w}" stroke="${i < 5 ? c.p : c.b}"/>`,
        )
        .join(''),
  );
}

/** Step 2: the booking link, shared to customers. */
export function stepShareIllustration(): string {
  return stepFrame(
    `<circle class="sv-bubble" cx="64" cy="54" r="22" fill="${c.pl}"/><circle class="sv-bubble" cx="262" cy="46" r="16" fill="${c.al}"/><circle class="sv-bubble" cx="270" cy="140" r="22" fill="${c.pl}"/><circle class="sv-bubble" cx="54" cy="138" r="14" fill="${c.al}"/>` +
      card(56, 70, 208, 44, 22) +
      `<g fill="none" stroke="${c.p}" stroke-width="2.4" stroke-linecap="round"><path d="M84 96.5l-2 2a5 5 0 0 1-7-7l4-4a5 5 0 0 1 7 0"/><path d="M86 85.5l2-2a5 5 0 0 1 7 7l-4 4a5 5 0 0 1-7 0"/></g>` +
      bar(106, 88, 100, 9, c.p) +
      `<rect class="sv-pop" x="214" y="80" width="38" height="24" rx="12" fill="${c.a}"/>` +
      `<path class="sv-cursor" d="M228 120l12 30 4-12 12-4z" fill="${c.p}" stroke="${c.w}" stroke-width="2" stroke-linejoin="round"/>`,
  );
}

/** Step 3: calendar, client and invoice together. */
export function stepManageIllustration(): string {
  const cells = [0, 1, 2, 3]
    .flatMap((r) => [0, 1, 2, 3].map((col) => ({ r, col })))
    .map(({ r, col }) => {
      const on = (r + col) % 3 === 0;
      return `<rect${on ? ' class="sv-cell"' : ''} x="${44 + col * 26}" y="${58 + r * 24}" width="20" height="18" rx="5" fill="${on ? c.p : c.pl}"/>`;
    })
    .join('');
  return stepFrame(
    card(32, 24, 128, 136, 12) +
      bar(44, 38, 60, 8, c.p) +
      cells +
      card(176, 24, 112, 136, 12) +
      bar(190, 40, 52, 8, c.p) +
      bar(190, 62, 84, 6) +
      bar(190, 76, 70, 6) +
      bar(190, 90, 78, 6) +
      `<path d="M190 108h84" stroke="${c.b}"/>` +
      bar(190, 118, 36, 8, colors.textSecondary) +
      `<g class="sv-pop"><rect x="236" y="132" width="40" height="18" rx="9" fill="${c.a}"/>` +
      `<path d="m249 141 3 3 6-6" fill="none" stroke="${c.p}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  );
}
