import { describe, expect, it } from 'vitest';

import { parseTokenFromFragment, stripTokenFromUrl } from './tokenFragment';

describe('parseTokenFromFragment', () => {
  it('reads the token from a fragment with the leading #', () => {
    expect(parseTokenFromFragment('#token=abc123')).toBe('abc123');
  });

  it('reads the token from a fragment without the leading #', () => {
    expect(parseTokenFromFragment('token=abc123')).toBe('abc123');
  });

  it('decodes a URL-encoded token', () => {
    expect(parseTokenFromFragment('#token=abc%2Bdef')).toBe('abc+def');
  });

  it('ignores other params in the fragment', () => {
    expect(parseTokenFromFragment('#foo=bar&token=xyz&baz=qux')).toBe('xyz');
  });

  it('trims whitespace around the token', () => {
    expect(parseTokenFromFragment('#token= abc123 ')).toBe('abc123');
  });

  it.each([null, undefined, '', '#'])('returns null for %p', (input) => {
    expect(parseTokenFromFragment(input)).toBeNull();
  });

  it('returns null when there is no token param', () => {
    expect(parseTokenFromFragment('#foo=bar')).toBeNull();
  });

  it('returns null when the token param is present but empty', () => {
    expect(parseTokenFromFragment('#token=')).toBeNull();
  });

  it('returns null when the token is only whitespace', () => {
    expect(parseTokenFromFragment('#token=%20%20')).toBeNull();
  });
});

describe('stripTokenFromUrl', () => {
  it('removes the token and an emptied fragment', () => {
    expect(stripTokenFromUrl('/ink/manage#token=abc')).toBe('/ink/manage');
    expect(stripTokenFromUrl('https://x.test/a?b=1#token=abc')).toBe('https://x.test/a?b=1');
  });
  it('keeps other fragment params and URLs without a token', () => {
    expect(stripTokenFromUrl('/a#token=abc&x=1')).toBe('/a#x=1');
    expect(stripTokenFromUrl('/a#section')).toBe('/a#section');
    expect(stripTokenFromUrl('/a')).toBe('/a');
  });
});
