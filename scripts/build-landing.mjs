/**
 * Writes the static marketing landing page into the web export (runs from `postbuild:web`).
 *
 *   dist/index.html            the landing page (pre-rendered HTML, no React)
 *   dist/_app/shell.html       Expo's own index.html, kept as the SPA fallback (see vercel.json, public/sw.js)
 *   dist/refund.html           the Refund Policy
 *   dist/privacy.html, dist/terms.html   from src/features/landing/legal/*.html ({{brandName}}, {{supportEmail}})
 *   dist/assets/landing/*      the browser script (content-hashed) and DM Sans font files
 *   dist/icons/og-image.png    Open Graph / Twitter share image (1200x630, brand style; scripts/ogImage.mjs)
 *   dist/robots.txt, dist/sitemap.xml   Allow landing + legal pages, Disallow every private app route and
 *                               guest-token page (derived from app/(app)+(admin)+(auth) at build time)
 *
 * Why: Expo's static render of "/" is an empty <div id="root"> (the root layout waits for fonts), so it has
 * no text for search engines or for a payment-provider review. Prices are NOT baked in: the page loads them
 * from the public `get_public_pricing()` RPC at runtime.
 *
 * Needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (the publishable key). Locally they come from
 * .env (`node --env-file-if-exists=.env`); on Vercel from the project's Environment Variables.
 *
 *   node --env-file-if-exists=.env scripts/build-landing.mjs [--out dist]
 *   node --env-file-if-exists=.env scripts/build-landing.mjs --check-env   (prebuild:web: fail BEFORE the export)
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brand } from '../src/config/brand.ts';
import { renderLanding, renderRefund } from '../src/features/landing/render/page.ts';
import { renderOgImage } from './ogImage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = resolve(root, outArg > -1 ? process.argv[outArg + 1] : 'dist');
const landingSrc = join(root, 'src/features/landing');

/** Date shown on the refund page; bump when its text changes. */
const REFUND_UPDATED = '2026-10-24';
/**
 * Merchant of record shown on the refund page (null shows "[name to be added]").
 * Source: polar.sh/legal/checkout-buyer-terms names "Polar Software, Inc., 3500 South DuPont Highway, Dover, DE,
 * 19901" as merchant of record and authorized reseller; the polar.sh/legal footer reads "© Polar Software, Inc."
 * (checked 2026-10-10).
 */
const RESELLER = 'Polar Software, Inc.';

function fail(message) {
  console.error(`[build-landing] ${message}`);
  process.exit(1);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const missing = [
  !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !anonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
].filter(Boolean);
if (missing.length > 0) {
  fail(
    `missing ${missing.join(' and ')}. Set it in .env (local) or in Vercel > Project > Settings > ` +
      'Environment Variables (Production AND Preview), then rebuild. The app and the landing page cannot reach ' +
      'Supabase without it.',
  );
}
try {
  new URL(supabaseUrl);
} catch {
  fail(`EXPO_PUBLIC_SUPABASE_URL is not a URL: "${supabaseUrl}".`);
}
if (process.argv.includes('--check-env')) {
  console.log('[build-landing] build env ok');
  process.exit(0);
}
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

// Expo's debug route list (/_sitemap) would publish every route name: not part of the site.
rmSync(join(out, '_sitemap.html'), { force: true });

// 2. Browser script: pricingModel.ts + landingClient.ts + motionClient.ts, types stripped, one classic script.
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
const motion = unexport(strip('motionClient.ts'));
// Head script part: the session reader, inlined into <head> (must stay import-free and contain no "</script").
const authScript = unexport(strip('authSession.ts'));
if (/^\s*import\s/m.test(authScript) || authScript.includes('</script'))
  fail('authSession.ts cannot be inlined into <head>.');
if (/^\s*import\s/m.test(motion)) fail('motion script has an import.');
const script = `(function(){'use strict';\n${model}\n${client}\n${motion}\n})();\n`;
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
  siteUrl: brand.urls.site,
  year: new Date().getUTCFullYear(),
  paths: {
    dashboard: '/today',
    login: '/login',
    signup: '/signup',
    terms: '/terms',
    privacy: '/privacy',
    refund: '/refund',
  },
};
// OG/Twitter share image (1200x630, brand style): same hero copy the page shows, no price, no new text.
const ogIconsDir = join(out, 'icons');
mkdirSync(ogIconsDir, { recursive: true });
const tagline = strings.hero.title.replace('{{highlight}}', strings.hero.titleHighlight);
writeFileSync(
  join(ogIconsDir, 'og-image.png'),
  await renderOgImage({ brandName: brand.name, tagline }),
);

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
    authScript,
  }),
);
writeFileSync(
  join(out, 'refund.html'),
  renderRefund(ctx, { fontCss, updated: REFUND_UPDATED, reseller: RESELLER }),
);

// Legal pages: templates with the product name, support email and site URL from brand.ts (no hardcoded copy).
for (const page of ['privacy', 'terms']) {
  const html = readFileSync(join(landingSrc, 'legal', `${page}.html`), 'utf8')
    .replaceAll('{{brandName}}', brand.name)
    .replaceAll('{{supportEmail}}', brand.supportEmail)
    .replaceAll('{{operator}}', brand.operator)
    .replaceAll('{{siteUrl}}', brand.urls.site);
  if (html.includes('{{')) fail(`legal/${page}.html has an unknown {{placeholder}}.`);
  writeFileSync(join(out, `${page}.html`), html);
}

// 5. robots.txt + sitemap.xml (absolute URLs from brand.ts).
// Allow only the marketing landing + legal pages; everything else needs a session (dashboard, admin,
// auth) or is a guest-token page not meant for search (manage/portal/review/sign, the booking flow).
// Derived from app/(app)+(admin)+(auth)'s own top-level route names so it can't drift from the routes
// themselves (same derivation reservedSlugs.test.ts uses for the reserved-slug list).
function topLevelRouteNames(groupDir) {
  const dir = join(root, 'app', groupDir);
  if (!existsSync(dir)) return [];
  return [
    ...new Set(
      readdirSync(dir)
        .filter((f) => f !== '_layout.tsx')
        .map((f) => f.replace(/\.tsx?$/, ''))
        .filter((name) => name && name !== 'index'),
    ),
  ];
}
const privateRoutes = [
  ...topLevelRouteNames('(app)'),
  ...topLevelRouteNames('(admin)'),
  ...topLevelRouteNames('(auth)'),
];
const site = brand.urls.site;
const disallow = [
  ...privateRoutes.map((r) => `Disallow: /${r}`),
  // Guest-token pages on a business's public page: not landing content, not meant for search.
  'Disallow: /*/manage',
  'Disallow: /*/portal',
  'Disallow: /*/review',
  'Disallow: /*/sign',
  'Disallow: /*/book',
]
  .sort()
  .join('\n');
writeFileSync(
  join(out, 'robots.txt'),
  `User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${site}/sitemap.xml\n`,
);
const pages = ['/', '/privacy', '/terms', '/refund'];
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${site}${p}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);

console.log(
  `[build-landing] wrote index.html, refund.html, privacy.html, terms.html, _app/shell.html, landing.${hash}.js, icons/og-image.png, robots.txt, sitemap.xml`,
);
