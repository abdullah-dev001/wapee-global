/**
 * Assembles the static landing page (/) and the refund page (/refund). Pure string
 * functions; `scripts/build-landing.mjs` calls them after `expo export` and writes
 * the files. No prices here: they are loaded at runtime (see landingClient.ts).
 */
import { interpolate } from '../pricingModel.ts';
import { attr, inlineJson, tx, type PageContext } from './context.ts';
import { footer, head, header, logo } from './chrome.ts';
import { pricing } from './pricingSection.ts';
import { ctaBand, faq, features, hero, how, who } from './sections.ts';
import { heroVisualCss } from './heroVisual.ts';
import { motionCss } from './motion.ts';
import { landingCss, legalCss } from './styles.ts';

/** Plain text (no HTML escaping) for JSON-LD: `inlineJson` already makes the script tag safe. */
function plain(ctx: PageContext, template: string, vars: Record<string, string | number> = {}) {
  return interpolate(template, { name: ctx.brandName, email: ctx.supportEmail, ...vars });
}

export type LandingAssets = {
  /** URL of the browser script (content-hashed). */
  scriptSrc: string;
  /** @font-face rules (DM Sans, self-hosted) and the font URL to preload. */
  fontCss: string;
  preloadFont: string | null;
  /** Public RPC endpoint + publishable key (safe in the browser). */
  rpcUrl: string;
  apiKey: string;
  /** localStorage key of the Supabase session (read only, never sent anywhere). */
  sessionStorageKey: string;
  /**
   * authSession.ts with its types stripped (defines readStoredSession + readSignedIn).
   * Inlined into <head> so the header variant is chosen before first paint.
   */
  authScript: string;
};

/**
 * Runs in <head>, before first paint, with no network call: marks JS on, and when the
 * stored Supabase session is valid and not expired sets html[data-auth="in"] and
 * window.__landingUser (the display name, filled into the header with textContent).
 * It never redirects: signed-in visitors see the landing page too.
 */
export function headScript(sessionKey: string, authScript: string): string {
  return `<script>(function(){var d=document.documentElement;d.className=d.className.replace('no-js','js');try{${authScript}
var u=readSignedIn(readStoredSession(window.localStorage,${inlineJson(sessionKey)}),Date.now());if(u){d.setAttribute('data-auth','in');window.__landingUser=u.name||'';}}catch(e){}setTimeout(function(){if(!window.__landingMotion)d.classList.add('reveal-all');},3000);})();</script>`;
}

export type JsonLdOffer = { price: string; priceCurrency: string; name: string; url: string };

/**
 * `offers` built from `get_public_pricing()` at build time (scripts/build-landing.mjs): never a
 * price literal in source. Omitted entirely (not a placeholder) when the fetch failed or
 * returned nothing usable, per the "no price literals in code" rule — leaving offers out is
 * correct, a fabricated one is not.
 */
export function softwareJsonLd(ctx: PageContext, offers: JsonLdOffer[] | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: ctx.brandName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${ctx.siteUrl}/`,
    description: plain(ctx, ctx.s.meta.description),
  };
  if (offers && offers.length > 0) {
    base.offers = offers.map((o) => ({
      '@type': 'Offer',
      name: o.name,
      price: o.price,
      priceCurrency: o.priceCurrency,
      url: o.url,
    }));
  }
  return base;
}

export function organizationJsonLd(ctx: PageContext): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ctx.brandName,
    url: `${ctx.siteUrl}/`,
    logo: `${ctx.siteUrl}/icons/icon-512.png`,
    email: ctx.supportEmail,
  };
}

export function websiteJsonLd(ctx: PageContext): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ctx.brandName,
    url: `${ctx.siteUrl}/`,
  };
}

/**
 * Built from the SAME `ctx.s.faq.items` the rendered FAQ section reads (`sections.ts`'s `faq()`),
 * so the two can never drift apart. Order follows `Object.values`, same as the rendered list.
 */
export function faqJsonLd(ctx: PageContext): Record<string, unknown> {
  const items = Object.values(ctx.s.faq.items).map((item) => ({
    '@type': 'Question',
    name: plain(ctx, item.q),
    acceptedAnswer: { '@type': 'Answer', text: plain(ctx, item.a) },
  }));
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items,
  };
}

export function renderLanding(ctx: PageContext, assets: LandingAssets): string {
  // No price literal at build time: landingClient.ts's updateJsonLd() adds real `offers` once
  // get_public_pricing() resolves in the browser (same live data the pricing cards show).
  const jsonLd = softwareJsonLd(ctx, null);
  const config = {
    rpcUrl: assets.rpcUrl,
    apiKey: assets.apiKey,
    locale: 'en',
    signupPath: ctx.paths.signup,
    billingPath: ctx.paths.billing,
    jsonLd,
    strings: ctx.s.pricing,
  };
  const extra = [
    headScript(assets.sessionStorageKey, assets.authScript),
    assets.preloadFont
      ? `<link rel="preload" href="${attr(assets.preloadFont)}" as="font" type="font/ttf" crossorigin>`
      : '',
    `<link rel="preconnect" href="${attr(new URL(assets.rpcUrl).origin)}" crossorigin>`,
    `<link rel="manifest" href="/manifest.json">`,
    `<script type="application/ld+json" id="ld-json">${inlineJson(jsonLd)}</script>`,
    `<script type="application/ld+json">${inlineJson(organizationJsonLd(ctx))}</script>`,
    `<script type="application/ld+json">${inlineJson(websiteJsonLd(ctx))}</script>`,
    `<script type="application/ld+json">${inlineJson(faqJsonLd(ctx))}</script>`,
  ].join('\n');
  return `<!doctype html>
<html lang="en" dir="ltr" class="no-js">
${head(ctx, {
  title: tx(ctx, ctx.s.meta.title),
  description: tx(ctx, ctx.s.meta.description),
  path: '/',
  css: assets.fontCss + landingCss + heroVisualCss + motionCss,
  extra,
})}
<body>
<a class="skip" href="#main">${tx(ctx, ctx.s.skip)}</a>
${header(ctx)}
<main id="main">
${hero(ctx)}
${who(ctx)}
${how(ctx)}
${features(ctx)}
${pricing(ctx)}
${faq(ctx)}
${ctaBand(ctx)}
</main>
${footer(ctx)}
<script type="application/json" id="landing-config">${inlineJson(config)}</script>
<script src="${attr(assets.scriptSrc)}" defer></script>
</body>
</html>
`;
}

/** /refund: same look as /privacy and /terms. */
export function renderRefund(
  ctx: PageContext,
  o: { fontCss: string; updated: string; reseller: string | null },
): string {
  const r = ctx.s.refund;
  const sec = r.sections;
  const email = `<a href="mailto:${attr(ctx.supportEmail)}">${attr(ctx.supportEmail)}</a>`;
  const withEmail = (template: string) =>
    tx(ctx, template, { email: '__EMAIL__' }).replace('__EMAIL__', email);
  const block = (title: string, body: string) => `<h2>${tx(ctx, title)}</h2><p>${body}</p>`;
  return `<!doctype html>
<html lang="en" dir="ltr">
${head(ctx, {
  title: `${tx(ctx, r.title)} - ${attr(ctx.brandName)}`,
  description: tx(ctx, r.metaDescription),
  path: ctx.paths.refund,
  css: o.fontCss + landingCss + motionCss + legalCss,
})}
<body class="legal">
<header class="site-header"><div class="wrap header-row">${logo(ctx)}</div></header>
<main class="legal-main" id="main">
  <h1>${tx(ctx, r.title)}</h1>
  <p class="muted">${tx(ctx, r.updated, { date: o.updated })}</p>
  <p>${tx(ctx, r.intro)}</p>
  ${block(sec.trial.title, tx(ctx, sec.trial.body))}
  ${block(sec.renewal.title, tx(ctx, sec.renewal.body))}
  ${block(sec.cancel.title, tx(ctx, sec.cancel.body))}
  ${block(sec.refunds.title, tx(ctx, sec.refunds.body))}
  <p>${tx(ctx, sec.refunds.errors)}</p>
  ${block(sec.reseller.title, tx(ctx, sec.reseller.body, { reseller: o.reseller ?? r.resellerPending }))}
  ${block(sec.contact.title, withEmail(sec.contact.body))}
</main>
${footer(ctx)}
</body>
</html>
`;
}
