/**
 * Checks the SEO machinery that `landing.test.ts` cannot reach because it renders strings only:
 * the OG image file (scripts/ogImage.mjs, sharp) and the private-route lists `vercel.json` and
 * `scripts/build-landing.mjs` must both stay in step with the real app routes.
 */
import { describe, expect, it } from 'vitest';

import { listFiles, loadNodeFs } from '@/test/nodeFs';

/** First path segment of every route file directly under one of the private route groups. */
async function privateTopLevelRoutes(): Promise<string[]> {
  const nodeFs = await loadNodeFs();
  const names = new Set<string>();
  for (const group of ['(app)', '(admin)', '(auth)']) {
    const dir = nodeFs.join(nodeFs.root, 'app', group);
    for (const entry of nodeFs.readdirSync(dir)) {
      if (entry === '_layout.tsx') continue;
      names.add(entry.replace(/\.tsx?$/, ''));
    }
  }
  return [...names];
}

describe('OG share image', () => {
  it('renders a real 1200x630 PNG', async () => {
    const { renderOgImage } = await import('../../../scripts/ogImage.mjs');
    const buf: Buffer = await renderOgImage({ brandName: 'Wapee', tagline: 'Test tagline' });
    // PNG signature + IHDR width/height are the first bytes: no need for an image-decoding
    // dependency just to assert the dimensions this file claims (og:image:width/height).
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.readUInt32BE(16)).toBe(1200); // IHDR width
    expect(buf.readUInt32BE(20)).toBe(630); // IHDR height
  });
});

describe('private routes stay out of search', () => {
  it('every top-level route under (app)/(admin)/(auth) has an X-Robots-Tag rule in vercel.json', async () => {
    const nodeFs = await loadNodeFs();
    const vercelJson = JSON.parse(
      nodeFs.readFileSync(nodeFs.join(nodeFs.root, 'vercel.json'), 'utf8'),
    ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const robotsRule = vercelJson.headers.find((h) =>
      h.headers.some((x) => x.key === 'X-Robots-Tag' && !h.source.includes(':slug')),
    );
    expect(robotsRule).toBeDefined();
    const routes = await privateTopLevelRoutes();
    expect(routes.length).toBeGreaterThan(10);
    const missing = routes.filter((r) => !robotsRule?.source.includes(r));
    expect(missing).toEqual([]);
  });

  it('the guest-token pages on a business public page are covered too', async () => {
    const nodeFs = await loadNodeFs();
    const vercelJson = JSON.parse(
      nodeFs.readFileSync(nodeFs.join(nodeFs.root, 'vercel.json'), 'utf8'),
    ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const slugRule = vercelJson.headers.find(
      (h) =>
        h.source.includes(':slug') && h.headers.some((x) => x.key === 'X-Robots-Tag'),
    );
    expect(slugRule).toBeDefined();
    for (const page of ['manage', 'portal', 'review', 'sign', 'book']) {
      expect(slugRule?.source).toContain(page);
    }
  });

  it('robots.txt generation (build-landing.mjs) derives Disallow from the SAME route groups', async () => {
    const nodeFs = await loadNodeFs();
    const script = nodeFs.readFileSync(
      nodeFs.join(nodeFs.root, 'scripts/build-landing.mjs'),
      'utf8',
    );
    expect(script).toMatch(/topLevelRouteNames\('\(app\)'\)/);
    expect(script).toMatch(/topLevelRouteNames\('\(admin\)'\)/);
    expect(script).toMatch(/topLevelRouteNames\('\(auth\)'\)/);
  });
});

describe('every private route group has a NoIndexHead', () => {
  it('(app), (admin) and (auth) layouts all mount NoIndexHead', async () => {
    const nodeFs = await loadNodeFs();
    for (const file of [
      'app/(app)/_layout.tsx',
      'app/(admin)/_layout.tsx',
      'app/(auth)/_layout.tsx',
    ]) {
      const src = nodeFs.readFileSync(nodeFs.join(nodeFs.root, file), 'utf8');
      expect(src).toContain('NoIndexHead');
    }
  });

  it('/<slug>/book stays noindex (the website at /<slug> is the indexable page, see WebsiteHead)', async () => {
    const nodeFs = await loadNodeFs();
    const src = nodeFs.readFileSync(
      nodeFs.join(nodeFs.root, 'app/(public)/[slug]/book.tsx'),
      'utf8',
    );
    expect(src).toContain('noindex, nofollow');
  });
});

describe('every app/public .tsx and .ts file is covered by the private- or public-route lists', () => {
  it('no new top-level route was added without updating this suite (fails loud, not silent)', async () => {
    const nodeFs = await loadNodeFs();
    const groups = listFiles(nodeFs, 'app', /\.tsx?$/)
      .map((f) => f.slice(nodeFs.join(nodeFs.root, 'app').length + 1))
      .map((f) => f.split('/')[0] ?? '')
      .filter((g) => /^\(.*\)$/.test(g));
    expect(new Set(groups)).toEqual(new Set(['(app)', '(admin)', '(auth)', '(public)']));
  });
});
