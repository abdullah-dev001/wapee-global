import { describe, expect, it } from 'vitest';

import { buildManageUrl } from './manageUrl.ts';

describe('buildManageUrl', () => {
  it('uses the real guest route /<slug>/manage#token=, never /manage/<token>', () => {
    const url = buildManageUrl('https://wapee.online', 'nova-hair-studio', 'abc123');
    expect(url).toBe('https://wapee.online/nova-hair-studio/manage#token=abc123');
    expect(url).not.toContain('/manage/');
  });

  it('drops trailing slashes from the base and encodes slug and token', () => {
    expect(buildManageUrl('https://wapee.online//', 'a b', 'x/y')).toBe(
      'https://wapee.online/a%20b/manage#token=x%2Fy',
    );
  });
});
