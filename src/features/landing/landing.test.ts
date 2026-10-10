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
  },
};
const assets = {
  scriptSrc: '/assets/landing/landing.abc.js',
  fontCss: '',
  preloadFont: null,
  rpcUrl: 'https://ref.supabase.co/rest/v1/rpc/get_public_pricing',
  apiKey: 'publishable-key',
  sessionStorageKey: 'sb-ref-auth-token',
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
    expect(html).toContain('property="og:title"');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
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

  it('redirects a signed-in visitor to /today using the session key', () => {
    expect(html).toContain('"sb-ref-auth-token"');
    expect(html).toContain("location.replace('/today')");
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
