import { describe, expect, it } from 'vitest';

import {
  addDomain,
  buildWidgetSnippet,
  domainListProblem,
  embedState,
  functionsBaseUrl,
  isValidDomain,
  normaliseDomainInput,
  pickParentOrigin,
  toOrigin,
} from './widgetLogic';

describe('normaliseDomainInput', () => {
  it.each([
    ['https://www.Example.com/book?x=1#a', 'www.example.com'],
    ['  Example.COM  ', 'example.com'],
    ['example.com:8080', 'example.com'],
    ['http://localhost:8081/', 'localhost'],
    ['example.com/path', 'example.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseDomainInput(input)).toBe(expected);
  });
});

describe('isValidDomain', () => {
  it('accepts hostnames and localhost', () => {
    for (const d of ['example.com', 'shop.example.co.uk', 'localhost', 'a-b.example.org']) {
      expect(isValidDomain(d)).toBe(true);
    }
  });
  it('rejects everything else', () => {
    for (const d of [
      '',
      'intranet',
      '*.example.com',
      'exa mple.com',
      '-a.com',
      'a.c',
      'a..com',
      'example.com/x',
      'ex@mple.com',
    ]) {
      expect(isValidDomain(d)).toBe(false);
    }
  });
});

describe('domain lists', () => {
  it('addDomain normalises and de-duplicates', () => {
    expect(addDomain(['a.com'], 'HTTPS://A.com/x')).toEqual(['a.com']);
    expect(addDomain(['a.com'], 'b.com')).toEqual(['a.com', 'b.com']);
    expect(addDomain(['a.com'], '   ')).toEqual(['a.com']);
  });
  it('domainListProblem flags >10 and invalid entries', () => {
    expect(domainListProblem(['a.com'])).toBeNull();
    expect(domainListProblem(['a.com', 'nope'])).toBe('invalid');
    expect(domainListProblem(Array.from({ length: 11 }, (_, i) => `d${i}.com`))).toBe('too_many');
  });
});

describe('snippet', () => {
  it('builds the script tag', () => {
    expect(
      buildWidgetSnippet({
        publicSiteUrl: 'https://wapee.site/',
        functionsUrl: 'https://x.supabase.co/functions/v1/',
        key: 'wk_abc',
      }),
    ).toBe(
      '<script src="https://wapee.site/widget.js" data-key="wk_abc" data-api="https://x.supabase.co/functions/v1" data-app="https://wapee.site" async></script>',
    );
    expect(functionsBaseUrl('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1');
  });
});

describe('origins', () => {
  it('toOrigin canonicalises and refuses non-http', () => {
    expect(toOrigin('HTTPS://Example.com:8443/a/b?c')).toBe('https://example.com:8443');
    expect(toOrigin('javascript:alert(1)')).toBeNull();
    expect(toOrigin('null')).toBeNull();
    expect(toOrigin('')).toBeNull();
    expect(toOrigin(undefined)).toBeNull();
  });
  it('pickParentOrigin prefers ancestorOrigins, falls back to the referrer', () => {
    expect(
      pickParentOrigin({ ancestorOrigins: ['https://a.com'], referrer: 'https://b.com/x' }),
    ).toBe('https://a.com');
    expect(pickParentOrigin({ ancestorOrigins: [], referrer: 'https://b.com/x?y' })).toBe(
      'https://b.com',
    );
    expect(pickParentOrigin({ referrer: '' })).toBeNull();
    expect(pickParentOrigin({})).toBeNull();
  });
});

describe('embedState', () => {
  it('is normal when not framed', () => {
    expect(embedState({ isFramed: false, embedParam: null, parentOrigin: null })).toEqual({
      kind: 'not_embedded',
    });
    expect(
      embedState({ isFramed: false, embedParam: 'tok', parentOrigin: 'https://a.com' }),
    ).toEqual({ kind: 'not_embedded' });
  });
  it('asks the server to verify when framed with a token and a known parent', () => {
    expect(
      embedState({ isFramed: true, embedParam: 'tok', parentOrigin: 'https://a.com' }),
    ).toEqual({
      kind: 'check',
      token: 'tok',
      origin: 'https://a.com',
    });
  });
  it('blocks when framed without a token or without a known parent', () => {
    expect(embedState({ isFramed: true, embedParam: null, parentOrigin: 'https://a.com' })).toEqual(
      { kind: 'blocked' },
    );
    expect(embedState({ isFramed: true, embedParam: 'tok', parentOrigin: null })).toEqual({
      kind: 'blocked',
    });
  });
});
