/**
 * Renders the Open Graph share image (1200x630, brand style) at build time.
 * SVG template -> PNG via sharp (devDependency; vips/rsvg under the hood, no Vercel build issues).
 *
 * Used by scripts/build-landing.mjs; kept in its own file so it can be unit-reasoned about
 * without pulling sharp into anything that runs in the browser or in vitest.
 */
import { Buffer } from 'node:buffer';

import sharp from 'sharp';

import { colors } from '../src/lib/theme/colors.ts';

const WIDTH = 1200;
const HEIGHT = 630;

/** @param {{ brandName: string; tagline: string }} o */
function template(o) {
  const escaped = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.primary}"/>
  <circle cx="1080" cy="80" r="260" fill="${colors.primaryHover}" opacity="0.35"/>
  <circle cx="60" cy="580" r="220" fill="${colors.primaryHover}" opacity="0.3"/>
  <text x="90" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="92" fill="${colors.textOnPrimary}">${escaped(o.brandName)}</text>
  <rect x="92" y="330" width="150" height="10" rx="5" fill="${colors.secondary}"/>
  <text x="90" y="400" font-family="DejaVu Sans, Arial, sans-serif" font-weight="400" font-size="36" fill="${colors.sidebarText}">${escaped(o.tagline)}</text>
</svg>`;
}

/**
 * @param {{ brandName: string; tagline: string }} o
 * @returns {Promise<Buffer>} PNG bytes.
 */
export async function renderOgImage(o) {
  return sharp(Buffer.from(template(o))).png().toBuffer();
}
