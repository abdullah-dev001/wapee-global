import { describe, expect, it } from 'vitest';

import { brand } from '@/config/brand';
import { listFiles, loadNodeFs } from '@/test/nodeFs';

import { isAccountDisabledError } from './accountDisabled';

/** The exact text the Auth hook returns (SQL cannot read brand.ts, so it is checked here). */
const HOOK_MESSAGE = `This account is disabled. Contact ${brand.supportEmail}`;

describe('isAccountDisabledError', () => {
  it('matches the Auth hook message', () => {
    expect(isAccountDisabledError({ message: HOOK_MESSAGE })).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isAccountDisabledError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isAccountDisabledError(null)).toBe(false);
  });
});

describe('suspended-account message', () => {
  it('reads exactly "This account is disabled. Contact <brand.supportEmail>"', () => {
    expect(HOOK_MESSAGE).toBe('This account is disabled. Contact support@wapee.online');
  });

  it('the LATEST custom_access_token_hook in the migrations returns that exact text', async () => {
    const nodeFs = await loadNodeFs();
    const defining = listFiles(nodeFs, 'supabase/migrations', /\.sql$/)
      .sort()
      .filter((f) =>
        /function public\.custom_access_token_hook/.test(nodeFs.readFileSync(f, 'utf8')),
      );
    const latest = defining.at(-1);
    expect(latest).toBeDefined();
    const sql = nodeFs.readFileSync(latest ?? '', 'utf8');
    expect(sql).toContain(`'${HOOK_MESSAGE}'`);
    expect(sql.match(/This account is disabled\. Contact [^'"]+/g)).toEqual([HOOK_MESSAGE]);
  });
});
