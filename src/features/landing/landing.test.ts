import { describe, expect, it } from 'vitest';

import { listFiles, loadNodeFs } from '@/test/nodeFs';

import en from './i18n/en.json';
import { type PageContext } from './render/context';
import { renderLanding, renderRefund } from './render/page';

const ctx: PageContext = {
  s: en,
  brandName: 'Brandname',
  supportEmail: 'help@example.com',
  siteUrl: 'https://example.com',
  year: 2030,
  paths: {
    login: '/login',
    signup: '/signup',
    terms: '/terms',
    privacy: '/privacy',
    refund: '/refund',
    dashboard: '/today',
  },
};
const assets = {
  scriptSrc: '/assets/landing/landing.abc.js',
  fontCss: '',
  preloadFont: null,
  rpcUrl: 'https://ref.supabase.co/rest/v1/rpc/get_public_pricing',
  apiKey: 'publishable-key',
  sessionStorageKey: 'sb-ref-auth-token',
  authScript: 'function readStoredSession(){return null}function readSignedIn(){return null}',
};

/** A price written as a literal: "$15", "€9.99", "15 USD", "39/month", "$ 79". */
const PRICE_LITERAL =
  /[$€£¥₹]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP)\b|\d\s*\/\s*(?:mo|month|year|yr)\b/i;

describe('landing page HTML', () => {
  const html = renderLanding(ctx, assets);

  it('has the SEO basics', () => {
    expect(html).toContain('<html lang="en"');
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<link rel="canonical" href="https://example.com/">');
    expect(html).toContain('<meta name="robots" content="index, follow">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:title"');
    expect(html).toContain('name="twitter:image"');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('keeps the title under 60 chars and the description under 160 with the real brand name', () => {
    // Built with the real brand name ("Wapee"), not the longer test fixture ("Brandname"): the
    // length budget is about what a search result actually shows, which depends on the real name.
    const realHtml = renderLanding({ ...ctx, brandName: 'Wapee' }, assets);
    const title = realHtml.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const description = realHtml.match(/<meta name="description" content="([^"]+)">/)?.[1] ?? '';
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('has Organization, WebSite and FAQPage JSON-LD, and the FAQ schema matches the page text exactly', () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1] ?? '{}') as Record<string, unknown>);
    expect(blocks.some((b) => b['@type'] === 'Organization')).toBe(true);
    expect(blocks.some((b) => b['@type'] === 'WebSite')).toBe(true);

    const faqBlock = blocks.find((b) => b['@type'] === 'FAQPage') as
      | { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
      | undefined;
    expect(faqBlock).toBeDefined();
    const faqItems = Object.values(en.faq.items);
    expect(faqBlock?.mainEntity).toHaveLength(faqItems.length);
    faqItems.forEach((item, i) => {
      // The page interpolates {{name}}/{{email}}; the JSON-LD must carry the SAME resolved text,
      // not the raw template, so a crawler reading only the schema sees what a visitor reads.
      const expectedQ = item.q.replace(/\{\{name\}\}/g, ctx.brandName);
      const expectedA = item.a
        .replace(/\{\{name\}\}/g, ctx.brandName)
        .replace(/\{\{email\}\}/g, ctx.supportEmail);
      expect(faqBlock?.mainEntity[i]?.name).toBe(expectedQ);
      expect(faqBlock?.mainEntity[i]?.acceptedAnswer.text).toBe(expectedA);
    });
  });

  it('SoftwareApplication JSON-LD carries no price at build time (runtime adds offers, see landingClient.ts)', () => {
    const match = html.match(/<script type="application\/ld\+json" id="ld-json">([\s\S]*?)<\/script>/);
    const ld = JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>;
    expect(ld.offers).toBeUndefined();
  });

  it('ships no price: the pricing section is a skeleton filled at runtime', () => {
    expect(html).not.toMatch(PRICE_LITERAL);
    expect(html).toContain('id="plans"');
    expect(html).toContain('class="plan plan-skeleton"');
    expect(html).toContain('get_public_pricing');
  });

  it('links signup, login and the legal pages, and shows the contact email', () => {
    for (const href of [
      '/signup',
      '/login',
      '/terms',
      '/privacy',
      '/refund',
      'mailto:help@example.com',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('does not advertise features that are off at launch', () => {
    const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
    for (const word of [
      'sms',
      'widget',
      'deposit',
      'waitlist',
      'custom domain',
      'hipaa',
      'soc 2',
    ]) {
      expect(text).not.toContain(word);
    }
  });
});

describe('wordmark and hero', () => {
  const html = renderLanding(ctx, assets);
  const wordmarks = [...html.matchAll(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/g)];

  it('header and footer use a text-only wordmark: no img, no svg, just the product name', () => {
    expect(wordmarks).toHaveLength(2);
    for (const [, inner] of wordmarks) {
      expect(inner).not.toMatch(/<(img|svg|picture)\b/i);
      expect(inner).toBe('Brandname');
    }
  });

  it('the hero headline is real text with the marker phrase, and the visual is described', () => {
    expect(html).toMatch(
      /<h1 id="hero-title"><span class="marker">Fill your calendar<\/span>, not your inbox\.<\/h1>/,
    );
    expect(html).toContain('class="hero-visual" role="img" aria-label="');
    expect(html).toContain('No credit card needed · Set up in minutes');
  });

  it('every animation sits behind prefers-reduced-motion and only moves transform / opacity', () => {
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    for (const block of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}/g)) {
      const props = [...(block[1] ?? '').matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.filter((p) => p !== 'opacity' && p !== 'transform')).toEqual([]);
    }
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
  });
});

describe('refund page', () => {
  const html = renderRefund(ctx, { fontCss: '', updated: '2030-01-01', reseller: null });

  it('is marked DRAFT, names the contact email and leaves the reseller to fill', () => {
    expect(html).toContain('class="draft"');
    expect(html).toContain('mailto:help@example.com');
    expect(html).toContain(en.refund.resellerPending);
    expect(html).toContain('<link rel="canonical" href="https://example.com/refund">');
  });

  it('has the same robots/OG basics as the landing page', () => {
    expect(html).toContain('<meta name="robots" content="index, follow">');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });
});

describe('legal page templates (privacy.html, terms.html)', () => {
  it('have canonical, robots and Open Graph tags with {{siteUrl}} filled, no leftover placeholder', async () => {
    const nodeFs = await loadNodeFs();
    for (const page of ['privacy', 'terms']) {
      const template = nodeFs.readFileSync(
        nodeFs.join(nodeFs.root, 'src/features/landing/legal', `${page}.html`),
        'utf8',
      );
      expect(template).toContain('<link rel="canonical" href="{{siteUrl}}/' + page + '" />');
      expect(template).toContain('<meta name="robots" content="index, follow" />');
      expect(template).toContain('property="og:title"');
      // build-landing.mjs fails the build if any {{placeholder}} survives substitution; this just
      // confirms siteUrl is one of the placeholders it is expected to fill.
      expect(template).toContain('{{siteUrl}}');
    }
    const buildScript = nodeFs.readFileSync(
      nodeFs.join(nodeFs.root, 'scripts/build-landing.mjs'),
      'utf8',
    );
    expect(buildScript).toContain("replaceAll('{{siteUrl}}', brand.urls.site)");
  });
});

describe('no price literal in the landing code', () => {
  it('no landing source file, string file or build script contains a price', async () => {
    const nodeFs = await loadNodeFs();
    const files = [
      ...listFiles(nodeFs, 'src/features/landing', /\.(ts|json)$/).filter(
        (f) => !/\.test\.ts$/.test(f),
      ),
      nodeFs.join(nodeFs.root, 'scripts/build-landing.mjs'),
    ];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => PRICE_LITERAL.test(nodeFs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the guard itself catches the shapes it is meant to', () => {
    for (const bad of ['$15', '€ 9', '39 USD', '79/month', '15 / mo'])
      expect(bad).toMatch(PRICE_LITERAL);
    for (const ok of ['14-day free trial', '{{amount}} / month', '2 months free'])
      expect(ok).not.toMatch(PRICE_LITERAL);
  });
});

describe('truthful billing copy (no self-serve billing yet)', () => {
  const copy = JSON.stringify(en);

  it('says cancelling and changing plans go through us, with the support address', () => {
    const en2 = en;
    expect(en2.faq.items.cancel.a).toContain('{{email}}');
    expect(en2.faq.items.cancel.a).toMatch(/end of the period you have already paid/);
    expect(en2.faq.items.plans.a).toMatch(/ask us/i);
    expect(en2.faq.items.plans.a).toContain('{{email}}');
    expect(en2.refund.sections.cancel.body).toContain('{{email}}');
  });

  it('never promises a self-serve action or a buy button', () => {
    expect(copy).not.toMatch(/buy now|buy it|purchase|checkout/i);
    expect(copy).not.toMatch(/cancel anytime|you can cancel at any time/i);
  });

  it('does not list "Ready-made team roles" as a plan feature', () => {
    expect(copy).not.toMatch(/ready-made team roles/i);
  });
});
