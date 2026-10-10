/** Header, footer and the <head> of the landing page. */
import { colors } from '../../../lib/theme/colors.ts';
import { attr, tx, type PageContext } from './context.ts';
import { icon } from './icons.ts';

/** Text-only wordmark (no icon): bold DM Sans, tight tracking, a small lime underline accent (CSS). */
export function logo(ctx: PageContext): string {
  return `<a class="wordmark" href="/" aria-label="${tx(ctx, ctx.s.nav.home)}">${attr(ctx.brandName)}</a>`;
}

export function header(ctx: PageContext): string {
  const n = ctx.s.nav;
  const link = (href: string, label: string) => `<li><a href="${href}">${tx(ctx, label)}</a></li>`;
  return `<header class="site-header">
<div class="wrap header-row">
  ${logo(ctx)}
  <button class="menu-button" id="menu-button" type="button" aria-expanded="false" aria-controls="site-nav">
    <span class="sr-only">${tx(ctx, n.menu)}</span>${icon('menu', 'icon icon-menu')}${icon('close', 'icon icon-close')}
  </button>
  <nav class="site-nav" id="site-nav" aria-label="${tx(ctx, n.label)}">
    <ul class="nav-links">
      ${link('#features', n.features)}${link('#how', n.how)}${link('#pricing', n.pricing)}${link('#faq', n.faq)}
    </ul>
    <div class="nav-actions">
      <a class="btn btn-ghost" href="${attr(ctx.paths.login)}">${tx(ctx, n.login)}</a>
      <a class="btn btn-primary" href="${attr(ctx.paths.signup)}">${tx(ctx, n.trial)}</a>
    </div>
  </nav>
</div>
</header>`;
}

export function footer(ctx: PageContext): string {
  const f = ctx.s.footer;
  return `<footer class="site-footer">
<div class="wrap">
  <div class="footer-grid">
    <div>${logo(ctx)}<p class="footer-tagline">${tx(ctx, f.tagline)}</p></div>
    <div>
      <h2>${tx(ctx, f.legal)}</h2>
      <ul>
        <li><a href="${attr(ctx.paths.terms)}">${tx(ctx, f.terms)}</a></li>
        <li><a href="${attr(ctx.paths.privacy)}">${tx(ctx, f.privacy)}</a></li>
        <li><a href="${attr(ctx.paths.refund)}">${tx(ctx, f.refund)}</a></li>
      </ul>
    </div>
    <div>
      <h2>${tx(ctx, f.contact)}</h2>
      <ul><li><a href="mailto:${attr(ctx.supportEmail)}">${attr(ctx.supportEmail)}</a></li></ul>
    </div>
  </div>
  <p class="copyright">${tx(ctx, f.copyright, { year: ctx.year })}</p>
</div>
</footer>`;
}

export type HeadOptions = {
  title: string;
  description: string;
  /** Path on the public site, e.g. "/" or "/refund". */
  path: string;
  css: string;
  /** Extra tags (preloads, JSON-LD, inline scripts), already safe HTML. */
  extra?: string;
};

export function head(ctx: PageContext, o: HeadOptions): string {
  const url = `${ctx.siteUrl}${o.path}`;
  const image = `${ctx.siteUrl}/icons/icon-512.png`;
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${attr(o.title)}</title>
<meta name="description" content="${attr(o.description)}">
<link rel="canonical" href="${attr(url)}">
<meta name="theme-color" content="${colors.primary}">
<meta name="color-scheme" content="light">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${attr(ctx.brandName)}">
<meta property="og:title" content="${attr(o.title)}">
<meta property="og:description" content="${attr(o.description)}">
<meta property="og:url" content="${attr(url)}">
<meta property="og:image" content="${attr(image)}">
<meta property="og:image:alt" content="${tx(ctx, ctx.s.meta.ogImageAlt)}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${o.extra ?? ''}
<style>${o.css}</style>
</head>`;
}
