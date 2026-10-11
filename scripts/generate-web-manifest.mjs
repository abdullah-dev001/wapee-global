/**
 * Writes public/manifest.json from src/config/brand.ts so the product name lives in
 * one place. Runs automatically before `start`, `web` and `build:web` (npm pre-scripts).
 * Run manually: node scripts/generate-web-manifest.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brand } from '../src/config/brand.ts';

// Keep in sync with src/lib/theme/colors.ts (primary, background).
const THEME_COLOR = '#024751';
const BACKGROUND_COLOR = '#f8fafb';

const manifest = {
  id: '/',
  name: brand.name,
  short_name: brand.name,
  description: brand.description,
  // "/" is the marketing landing page; the installed app opens the dashboard (signed out: AuthGate sends it to /login).
  start_url: '/today',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  theme_color: THEME_COLOR,
  background_color: BACKGROUND_COLOR,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  ],
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(resolve(root, 'public/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
