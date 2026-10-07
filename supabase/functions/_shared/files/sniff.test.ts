import { describe, expect, it } from 'vitest';

import { clampTtl, detectMime, totalFromContentRange } from './sniff.ts';

const bytes = (...v: number[]) => Uint8Array.from(v);
const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe('detectMime', () => {
  it('recognises the four allowed kinds by their first bytes', () => {
    expect(detectMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(detectMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(detectMime(ascii('RIFF....WEBPVP8 '))).toBe('image/webp');
    expect(detectMime(ascii('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('refuses everything else, whatever the file was called', () => {
    expect(detectMime(ascii('GIF89a'))).toBeNull();
    expect(detectMime(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectMime(ascii('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectMime(bytes(0x4d, 0x5a, 0x90, 0))).toBeNull(); // Windows executable
    expect(detectMime(ascii('RIFF....WAVEfmt '))).toBeNull(); // RIFF but not WEBP
    expect(detectMime(ascii('ftypheic'))).toBeNull(); // HEIC
    expect(detectMime(new Uint8Array(0))).toBeNull();
    expect(detectMime(bytes(0xff, 0xd8))).toBeNull(); // truncated jpeg signature
  });
});

describe('totalFromContentRange', () => {
  it('reads the total', () => {
    expect(totalFromContentRange('bytes 0-31/12345')).toBe(12345);
    expect(totalFromContentRange('bytes 0-31/*')).toBeNull();
    expect(totalFromContentRange(null)).toBeNull();
    expect(totalFromContentRange('garbage')).toBeNull();
  });
});

describe('clampTtl', () => {
  it('defaults to 5 minutes and never exceeds it', () => {
    expect(clampTtl(undefined)).toBe(300);
    expect(clampTtl(99999)).toBe(300);
    expect(clampTtl(60)).toBe(60);
    expect(clampTtl(0)).toBe(2);
    expect(clampTtl(-5)).toBe(2);
    expect(clampTtl('x')).toBe(300);
  });
});
