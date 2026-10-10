/**
 * Writes the static marketing landing page into the web export (runs from `postbuild:web`).
 *
 *   dist/index.html            the landing page (pre-rendered HTML, no React)
 *   dist/_app/shell.html       Expo's own index.html, kept as the SPA fallback (see public/_redirects, public/sw.js)
 *   dist/refund.html           the Refund Policy (DRAFT)
 *   dist/assets/landing/*      the browser script (content-hashed) and DM Sans font files
 *   dist/robots.txt, dist/sitemap.xml
 *
 * Why: Expo's static render of "/" is an empty <div id="root"> (the root layout waits for fonts), so it has
 * no text for search engines or for a payment-provider review. Prices are NOT baked in: the page loads them
 * from the public `get_public_pricing()` RPC at runtime.
 *
 * Needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (the publishable key; read from .env by
 * `node --env-file-if-exists=.env`). Usage: node --env-file-if-exists=.env scripts/build-landing.mjs [--out dist]
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brand } from '../src/config/brand.ts';
import { renderLanding, renderRefund } from '../src/features/landing/render/page.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = resolve(root, outArg > -1 ? process.argv[outArg + 1] : 'dist');
const landingSrc = join(root, 'src/features/landing');

/** Date shown on the refund page; bump when its text changes. */
const REFUND_UPDATED = '2026-10-10';
/** Merchant of record shown on the refund page; null shows "[name to be added]". */
const RESELLER = null;

function fail(message) {
  console.error(`[build-landing] ${message}`);
  process.exit(1);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
if (!supabaseUrl || !anonKey)
  fail('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set.');
if (!existsSync(join(out, 'index.html')))
  fail(`${out}/index.html not found: run "expo export --platform web" first.`);

// 1. Keep Expo's app shell for the SPA fallback (only the first time: a re-run must not move the landing page).
const indexPath = join(out, 'index.html');
const shellPath = join(out, '_app', 'shell.html');
if (readFileSync(indexPath, 'utf8').includes('id="root"')) {
  mkdirSync(dirname(shellPath), { recursive: true });
  renameSync(indexPath, shellPath);
} else if (!existsSync(shellPath)) {
  fail('dist/index.html is not the Expo shell and no saved shell exists: re-run the web export.');
}

// 2. Browser script: pricingModel.ts + landingClient.ts, types stripped, one classic script.
const strip = (file) =>
  stripTypeScriptTypes(readFileSync(join(landingSrc, file), 'utf8'), { mode: 'strip' });
const unexport = (code) => code.replace(/^export\s+(?=(const|function|async|let)\b)/gm, '');
const model = unexport(strip('pricingModel.ts'));
const client = unexport(strip('landingClient.ts')).replace(
  /^import[\s\S]*?from '\.\/pricingModel\.ts';\s*$/m,
  '',
);
if (/^\s*import\s/m.test(client) || /^\s*import\s/m.test(model))
  fail('landing script still has an import after bundling.');
const script = `(function(){'use strict';\n${model}\n${client}\n})();\n`;
const hash = createHash('sha256').update(script).digest('hex').slice(0, 12);
const assetDir = join(out, 'assets', 'landing');
mkdirSync(assetDir, { recursive: true });
writeFileSync(join(assetDir, `landing.${hash}.js`), script);

// 3. Fonts (DM Sans, the app font), self-hosted next to the script.
const fonts = [
  ['400Regular', 400],
  ['600SemiBold', 600],
  ['700Bold', 700],
];
let fontCss = '';
for (const [name, weight] of fonts) {
  const file = `DMSans_${name}.ttf`;
  copyFileSync(
    join(root, 'node_modules/@expo-google-fonts/dm-sans', name, file),
    join(assetDir, file),
  );
  fontCss += `@font-face{font-family:'DM Sans';font-style:normal;font-weight:${weight};font-display:swap;src:url(/assets/landing/${file}) format('truetype');}`;
}

// 4. Pages.
const strings = JSON.parse(readFileSync(join(landingSrc, 'i18n/en.json'), 'utf8'));
const ctx = {
  s: strings,
  brandName: brand.name,
  supportEmail: brand.supportEmail,
  siteUrl: brand.urls.publicSite,
  year: new Date().getUTCFullYear(),
  paths: {
    login: '/login',
    signup: '/signup',
    terms: '/terms',
    privacy: '/privacy',
    refund: '/refund',
  },
};
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
writeFileSync(
  indexPath,
  renderLanding(ctx, {
    scriptSrc: `/assets/landing/landing.${hash}.js`,
    fontCss,
    preloadFont: '/assets/landing/DMSans_400Regular.ttf',
    rpcUrl: `${supabaseUrl}/rest/v1/rpc/get_public_pricing`,
    apiKey: anonKey,
    // supabase-js default storage key on web: sb-<project ref>-auth-token (see src/lib/supabase/client.ts).
    sessionStorageKey: `sb-${projectRef}-auth-token`,
  }),
);
writeFileSync(
  join(out, 'refund.html'),
  renderRefund(ctx, { fontCss, updated: REFUND_UPDATED, reseller: RESELLER }),
);

// 5. robots.txt + sitemap.xml (absolute URLs from brand.ts).
const site = brand.urls.publicSite;
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
const pages = ['/', '/privacy', '/terms', '/refund'];
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${site}${p}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);

console.log(`[build-landing] wrote index.html, refund.html, _app/shell.html, landing.${hash}.js`);
