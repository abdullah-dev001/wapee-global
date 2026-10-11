import { partialMatchKey } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';

import { createQueryKeys } from './keys';

describe('createQueryKeys.business', () => {
  const keys = createQueryKeys('products');
  const branchList = keys.list({ businessId: 'b1', branchId: 'br1', search: 'oil' });

  it('matches a list keyed by ANY branch of the business (so an invalidation reaches it)', () => {
    expect(partialMatchKey(branchList, keys.business('b1'))).toBe(true);
  });

  it('does not match another business', () => {
    expect(partialMatchKey(branchList, keys.business('b2'))).toBe(false);
  });

  it('documents the trap: scope({ businessId }) means branch null and misses a branch-keyed list', () => {
    expect(partialMatchKey(branchList, keys.scope({ businessId: 'b1' }))).toBe(false);
  });
});

describe('branchless invalidation guard', () => {
  it('no source file invalidates with a branchless `.scope({ businessId })` (use `.business(businessId)`)', async () => {
    // No @types/node in this project: a minimal shape for the two modules used.
    type Fs = {
      readdirSync: (dir: string) => string[];
      readFileSync: (file: string, enc: 'utf8') => string;
      statSync: (file: string) => { isDirectory: () => boolean };
    };
    const fsName = 'node:fs';
    const pathName = 'node:path';
    const { readdirSync, readFileSync, statSync } = (await import(/* @vite-ignore */ fsName)) as Fs;
    const { join } = (await import(/* @vite-ignore */ pathName)) as {
      join: (...parts: string[]) => string;
    };
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(join(process.cwd(), 'src'));
    const bad = files.filter((f) =>
      /Keys\.scope\(\s*\{\s*businessId(\s*:[^,}]*)?\s*\}\s*\)/.test(readFileSync(f, 'utf8')),
    );
    expect(bad).toEqual([]);
  });
});
