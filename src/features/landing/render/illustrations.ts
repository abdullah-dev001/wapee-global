/**
 * Original flat illustrations for the landing page, drawn in the brand colours.
 * Shapes only (no words inside), so they need no translation. Each caller wraps
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

function calendarCard(): string {
  const cols = [0, 1, 2, 3];
  const colX = (i: number) => 214 + i * 78;
  const rows = [0, 1, 2, 3, 4, 5];
  const lines = rows.map((r) => `<path d="M206 ${118 + r * 40}h318" stroke="${c.b}"/>`).join('');
  const heads = cols.map((i) => bar(colX(i) + 14, 92, 40, 8, c.t)).join('');
  const hours = rows.map((r) => bar(176, 114 + r * 40, 20, 7)).join('');
  const block = (col: number, top: number, h: number, fill: string, edge: string, ink: string) =>
    `<rect x="${colX(col) + 4}" y="${top}" width="68" height="${h}" rx="8" fill="${fill}"/>` +
    `<rect x="${colX(col) + 4}" y="${top}" width="4" height="${h}" rx="2" fill="${edge}"/>` +
    bar(colX(col) + 14, top + 10, 40, 6, ink) +
    (h > 50 ? bar(colX(col) + 14, top + 22, 28, 6, ink) : '');
  return (
    card(160, 44, 380, 330) +
    bar(184, 64, 110, 12, c.p) +
    `<rect x="440" y="58" width="76" height="24" rx="12" fill="${c.pl}"/>` +
    heads +
    hours +
    lines +
    block(0, 124, 72, c.pl, c.p, c.p) +
    block(1, 164, 52, c.p, c.a, colors.textOnPrimary) +
    block(2, 124, 34, c.al, c.p, c.p) +
    block(2, 244, 72, c.pl, c.p, c.p) +
    block(3, 204, 52, c.pl, c.p, c.p) +
    block(0, 284, 52, c.al, c.p, c.p)
  );
}

function phone(): string {
  const slots = [0, 1, 2]
    .flatMap((r) => [0, 1, 2].map((col) => ({ r, col })))
    .map(({ r, col }) => {
      const sel = r === 1 && col === 1;
      return `<rect x="${56 + col * 50}" y="${268 + r * 34}" width="42" height="26" rx="8" fill="${sel ? c.a : c.w}" stroke="${sel ? c.p : c.b}"/>`;
    })
    .join('');
  const days = [0, 1, 2, 3, 4]
    .map((i) => {
      const sel = i === 2;
      return (
        `<rect x="${54 + i * 30}" y="${214}" width="24" height="34" rx="8" fill="${sel ? c.p : c.bg}"/>` +
        bar(60 + i * 30, 228, 12, 6, sel ? c.a : c.b)
      );
    })
    .join('');
  return (
    `<rect x="34" y="96" width="196" height="360" rx="30" fill="${c.shadow}" opacity=".12"/>` +
    `<rect x="28" y="88" width="196" height="360" rx="30" fill="${c.p}"/>` +
    `<rect x="38" y="100" width="176" height="336" rx="22" fill="${c.w}"/>` +
    `<rect x="102" y="106" width="48" height="6" rx="3" fill="${c.p}" opacity=".25"/>` +
    `<rect x="38" y="118" width="176" height="64" fill="${c.pl}"/>` +
    `<circle cx="70" cy="150" r="16" fill="${c.p}"/><path d="m63 150 5 5 9-10" fill="none" stroke="${c.a}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    bar(94, 140, 90, 9, c.p) +
    bar(94, 156, 60, 7, c.t) +
    bar(54, 196, 70, 7, c.t) +
    days +
    slots +
    `<rect x="54" y="384" width="144" height="36" rx="10" fill="${c.p}"/>` +
    bar(98, 398, 56, 8, c.a)
  );
}

function confirmedToast(): string {
  return (
    card(318, 384, 214, 60, 14) +
    `<circle cx="346" cy="414" r="14" fill="${c.a}"/><path d="m340 414 4 4 8-8" fill="none" stroke="${c.p}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    bar(370, 404, 120, 8, c.p) +
    bar(370, 418, 80, 7)
  );
}

/** Hero: a phone with the booking page in front of a team calendar. */
export function heroIllustration(): string {
  return `<svg viewBox="0 0 560 470" aria-hidden="true" focusable="false">
<circle cx="380" cy="210" r="190" fill="${c.pl}" opacity=".6"/>
<circle cx="96" cy="90" r="34" fill="${c.al}"/>
${calendarCard()}${phone()}${confirmedToast()}
</svg>`;
}

const stepFrame = (inner: string) =>
  `<svg viewBox="0 0 320 180" aria-hidden="true" focusable="false"><rect width="320" height="180" fill="${c.bg}"/>${inner}</svg>`;

/** Step 1: a list of services with durations and prices, plus opening hours. */
export function stepSetupIllustration(): string {
  const row = (y: number, dot: string, w: number) =>
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
            `<rect x="${48 + i * 33}" y="148" width="27" height="18" rx="9" fill="${i < 5 ? c.p : c.w}" stroke="${i < 5 ? c.p : c.b}"/>`,
        )
        .join(''),
  );
}

/** Step 2: the booking link, shared to customers. */
export function stepShareIllustration(): string {
  return stepFrame(
    `<circle cx="64" cy="54" r="22" fill="${c.pl}"/><circle cx="262" cy="46" r="16" fill="${c.al}"/><circle cx="270" cy="140" r="22" fill="${c.pl}"/><circle cx="54" cy="138" r="14" fill="${c.al}"/>` +
      card(56, 70, 208, 44, 22) +
      `<g fill="none" stroke="${c.p}" stroke-width="2.4" stroke-linecap="round"><path d="M84 96.5l-2 2a5 5 0 0 1-7-7l4-4a5 5 0 0 1 7 0"/><path d="M86 85.5l2-2a5 5 0 0 1 7 7l-4 4a5 5 0 0 1-7 0"/></g>` +
      bar(106, 88, 100, 9, c.p) +
      `<rect x="214" y="80" width="38" height="24" rx="12" fill="${c.a}"/>` +
      `<path d="M228 120l12 30 4-12 12-4z" fill="${c.p}" stroke="${c.w}" stroke-width="2" stroke-linejoin="round"/>`,
  );
}

/** Step 3: calendar, client and invoice together. */
export function stepManageIllustration(): string {
  const cells = [0, 1, 2, 3]
    .flatMap((r) => [0, 1, 2, 3].map((col) => ({ r, col })))
    .map(({ r, col }) => {
      const on = (r + col) % 3 === 0;
      return `<rect x="${44 + col * 26}" y="${58 + r * 24}" width="20" height="18" rx="5" fill="${on ? c.p : c.pl}"/>`;
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
      `<rect x="236" y="132" width="40" height="18" rx="9" fill="${c.a}"/>` +
      `<path d="m249 141 3 3 6-6" fill="none" stroke="${c.p}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}
