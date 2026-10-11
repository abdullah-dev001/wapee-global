import { describe, expect, it } from 'vitest';

import { loadNodeFs } from '@/test/nodeFs';

import en from './i18n/en.json';
import { type PageContext } from './render/context';
import { renderLanding } from './render/page';

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
const KEY = 'sb-ref-auth-token';
const STUB = 'function readStoredSession(){return null}function readSignedIn(){return null}';
const assets = {
  scriptSrc: '/assets/landing/landing.abc.js',
  fontCss: '',
  preloadFont: null,
  rpcUrl: 'https://ref.supabase.co/rest/v1/rpc/get_public_pricing',
  apiKey: 'publishable-key',
  sessionStorageKey: KEY,
  authScript: STUB,
};
const html = renderLanding(ctx, assets);
const head = html.slice(0, html.indexOf('</head>'));
const scriptBodies = (src: string) =>
  [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');

/** authSession.ts with types stripped, exactly as scripts/build-landing.mjs inlines it. */
async function realAuthScript(): Promise<string> {
  const nodeFs = await loadNodeFs();
  const moduleName = 'node:module';
  const { stripTypeScriptTypes } = (await import(/* @vite-ignore */ moduleName)) as {
    stripTypeScriptTypes: (code: string, o: { mode: 'strip' }) => string;
  };
  const source = nodeFs.readFileSync(
    nodeFs.join(nodeFs.root, 'src/features/landing/authSession.ts'),
    'utf8',
  );
  return stripTypeScriptTypes(source, { mode: 'strip' }).replace(
    /^export\s+(?=(const|function|let)\b)/gm,
    '',
  );
}

type FakeEl = { textContent: string };
/** Runs the head script and the header name script against a minimal fake browser. */
function runInFakeBrowser(head: string, fill: string, stored: Record<string, string | undefined>) {
  const attrs: Record<string, string> = {};
  const nameEls: FakeEl[] = [{ textContent: 'Your account' }, { textContent: 'Your account' }];
  const window: Record<string, unknown> = {
    localStorage: { getItem: (k: string) => stored[k] ?? null },
  };
  const document = {
    documentElement: {
      className: 'no-js',
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      classList: { add: () => undefined },
    },
    querySelectorAll: () => nameEls,
  };
  const noTimers = () => undefined;
  new Function('window', 'document', 'setTimeout', 'location', head)(window, document, noTimers, {
    replace: () => {
      throw new Error('must not redirect');
    },
  });
  new Function('window', 'document', fill)(window, document);
  return {
    attrs,
    user: window.__landingUser,
    names: nameEls.map((e) => e.textContent),
    className: document.documentElement.className,
  };
}

describe('auth-aware header markup', () => {
  it('the head script is present, reads the session key, and never redirects', () => {
    const [script] = scriptBodies(head);
    expect(script).toContain(`"${KEY}"`);
    expect(script).toContain("setAttribute('data-auth','in')");
    expect(head).not.toMatch(/location\.(replace|assign|href)/);
    expect(head).not.toContain('/today');
  });

  it('logged-out markup is the default: no data-auth on <html>, Log in + Start free trial present', () => {
    expect(html).toMatch(/<html lang="en" dir="ltr" class="no-js">/);
    expect(html).toContain('<a class="btn btn-ghost auth-out" href="/login">Log in</a>');
    expect(html).toContain(
      '<a class="btn btn-primary auth-out" href="/signup">Start free trial</a>',
    );
    expect(html).toContain(
      'html:not([data-auth="in"]) .auth-in, html[data-auth="in"] .auth-out { display: none; }',
    );
  });

  it('both header variants and the signed-in CTAs are in the HTML', () => {
    expect(html).toContain('<span class="nav-user-name" data-user-name>Your account</span>');
    expect(html).toContain('<a class="btn btn-primary auth-in" href="/today">Dashboard</a>');
    expect(
      html.match(/class="btn btn-[a-z]+ btn-lg auth-in" href="\/today">Go to Dashboard</g),
    ).toHaveLength(2);
    expect(html.match(/auth-out" href="\/signup">Start (14-day )?free trial/g)).toHaveLength(3);
  });

  it('every "Log in" link (header and final CTA band) is signed-out only', () => {
    const logins = [...html.matchAll(/<a class="([^"]*)" href="\/login">/g)].map((m) => m[1]);
    expect(logins).toHaveLength(2);
    for (const cls of logins) expect(cls).toMatch(/\bauth-out\b/);
    expect(html).toContain('<a class="btn btn-outline btn-lg auth-out" href="/login">Log in</a>');
  });

  it('the name goes in with textContent, never innerHTML', () => {
    const fill = scriptBodies(html).find((s) => s.includes('[data-user-name]')) ?? '';
    expect(fill).toContain('.textContent=n');
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe('head script + name script, run with the real session reader', () => {
  const session = (expiresAt: number, name: string) =>
    JSON.stringify({
      access_token: 'a.b.c',
      refresh_token: 'r',
      expires_at: expiresAt,
      user: { email: 'someone@example.com', user_metadata: { full_name: name } },
    });

  it('valid session: data-auth="in" and the (escaped-by-textContent) name in every slot', async () => {
    const page = renderLanding(ctx, { ...assets, authScript: await realAuthScript() });
    const [headJs] = scriptBodies(page.slice(0, page.indexOf('</head>')));
    const fill = scriptBodies(page).find((s) => s.includes('[data-user-name]')) ?? '';
    const evil = '<img src=x onerror=alert(1)>';
    const r = runInFakeBrowser(headJs ?? '', fill, {
      [KEY]: session(Date.now() / 1000 + 600, evil),
    });
    expect(r.attrs['data-auth']).toBe('in');
    expect(r.className).toBe('js');
    expect(r.names).toEqual(['<img src=x onerro…', '<img src=x onerro…']);
  });

  it('expired, missing or broken session: stays signed out and the names keep the default', async () => {
    const page = renderLanding(ctx, { ...assets, authScript: await realAuthScript() });
    const [headJs] = scriptBodies(page.slice(0, page.indexOf('</head>')));
    const fill = scriptBodies(page).find((s) => s.includes('[data-user-name]')) ?? '';
    for (const stored of [
      { [KEY]: session(Date.now() / 1000 - 5, 'Ada') },
      {},
      { [KEY]: '{oops' },
    ]) {
      const r = runInFakeBrowser(headJs ?? '', fill, stored);
      expect(r.attrs['data-auth']).toBeUndefined();
      expect(r.names).toEqual(['Your account', 'Your account']);
    }
  });
});
