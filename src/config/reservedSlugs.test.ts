import { describe, expect, it } from 'vitest';

import { listFiles, loadNodeFs } from '@/test/nodeFs';

import { isReservedSlug, reservedSlugs, SLUG_PATTERN } from './reservedSlugs';

/** Every slug the migrations insert into `public.reserved_slugs`. */
async function slugsInMigrations(): Promise<string[]> {
  const nodeFs = await loadNodeFs();
  const found: string[] = [];
  for (const file of listFiles(nodeFs, 'supabase/migrations', /\.sql$/)) {
    const sql = nodeFs.readFileSync(file, 'utf8');
    for (const block of sql.matchAll(
      /insert into public\.reserved_slugs \(slug\) values([\s\S]*?);/g,
    )) {
      for (const m of (block[1] ?? '').matchAll(/\('([^']+)'\)/g)) found.push(m[1] ?? '');
    }
  }
  return found;
}

describe('reserved slugs', () => {
  it('reserves the landing paths', () => {
    for (const slug of ['pricing', 'features', 'refund', 'privacy', 'terms', 'login', 'signup']) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it('is case- and space-insensitive', () => {
    expect(isReservedSlug('  Refund ')).toBe(true);
    expect(isReservedSlug('nova-hair-studio')).toBe(false);
  });

  it('matches the database list (every slug a migration reserves is in the client list)', async () => {
    const fromDb = await slugsInMigrations();
    expect(fromDb.length).toBeGreaterThan(50);
    expect(fromDb.filter((s) => !reservedSlugs.includes(s))).toEqual([]);
  });

  it('the client list is reserved in the database too', async () => {
    const fromDb = new Set(await slugsInMigrations());
    expect(reservedSlugs.filter((s) => !fromDb.has(s))).toEqual([]);
  });
});

/** First URL segment of every route file under app/ (route groups like "(app)" do not appear in URLs). */
async function topLevelPaths(): Promise<string[]> {
  const nodeFs = await loadNodeFs();
  const appDir = nodeFs.join(nodeFs.root, 'app');
  const fromRoutes = listFiles(nodeFs, 'app', /\.tsx?$/).map((file) => {
    const segments = file
      .slice(appDir.length + 1)
      .replace(/\.tsx?$/, '')
      .split('/')
      .filter((s) => !/^\(.*\)$/.test(s));
    return segments[0] ?? '';
  });
  // Files served as-is from public/ (/<name>), and what scripts/build-landing.mjs writes.
  const fromPublic = nodeFs
    .readdirSync(nodeFs.join(nodeFs.root, 'public'))
    .map((f) => f.replace(/\.html$/, ''));
  const fromLandingBuild = [
    'privacy',
    'terms',
    'refund',
    'robots.txt',
    'sitemap.xml',
    'assets',
    '_app',
  ];
  return [...new Set([...fromRoutes, ...fromPublic, ...fromLandingBuild])];
}

describe('every top-level path is reserved', () => {
  it('a business slug can never shadow an app route, a public file or a landing page', async () => {
    const paths = await topLevelPaths();
    expect(paths).toContain('today');
    // Paths that could never be a slug anyway (underscore, "+", brackets, dots fail SLUG_PATTERN) are skipped.
    const couldBeSlug = paths.filter((p) => SLUG_PATTERN.test(p) && p !== 'index');
    expect(couldBeSlug.filter((p) => !isReservedSlug(p))).toEqual([]);
  });
});
