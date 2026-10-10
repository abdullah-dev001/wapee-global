import { describe, expect, it } from 'vitest';

import { listFiles, loadNodeFs } from '@/test/nodeFs';

import { isReservedSlug, reservedSlugs } from './reservedSlugs';

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
