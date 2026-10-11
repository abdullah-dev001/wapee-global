import { describe, expect, it } from 'vitest';

import {
  MAX_IMAGE_BYTES,
  assetPath,
  assetPublicUrl,
  extensionFor,
  imageProblem,
  uuidV4,
} from './imageUpload';

const BIZ = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('imageProblem', () => {
  it('accepts jpeg, png, webp up to 5 MB', () => {
    expect(imageProblem({ mimeType: 'image/jpeg', fileSize: 1000 })).toBeNull();
    expect(imageProblem({ mimeType: 'image/png', fileSize: MAX_IMAGE_BYTES })).toBeNull();
    expect(imageProblem({ mimeType: 'IMAGE/WEBP', fileSize: 1 })).toBeNull();
  });
  it('refuses other types, including svg and gif', () => {
    for (const mimeType of ['image/svg+xml', 'image/gif', 'application/pdf', '', null, undefined]) {
      expect(imageProblem({ mimeType, fileSize: 10 })).toBe('type');
    }
  });
  it('refuses over 5 MB and unknown size', () => {
    expect(imageProblem({ mimeType: 'image/png', fileSize: MAX_IMAGE_BYTES + 1 })).toBe('size');
    expect(imageProblem({ mimeType: 'image/png', fileSize: null })).toBe('unknown_size');
    expect(imageProblem({ mimeType: 'image/png', fileSize: Number.NaN })).toBe('unknown_size');
  });
});

describe('asset paths', () => {
  it('builds a path the storage policy accepts', () => {
    const path = assetPath(BIZ, 'image/png');
    expect(path).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
    expect(path?.startsWith(`${BIZ}/`)).toBe(true);
  });
  it('maps extensions and refuses unknown types', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/svg+xml')).toBeNull();
    expect(assetPath(BIZ, 'image/gif')).toBeNull();
  });
  it('uuidV4 is well-formed for any random source', () => {
    for (const r of [() => 0, () => 0.999999, Math.random]) {
      expect(uuidV4(r)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
  it('builds the public url', () => {
    expect(assetPublicUrl('https://x.supabase.co/', 'a/b.png')).toBe(
      'https://x.supabase.co/storage/v1/object/public/website-assets/a/b.png',
    );
  });
});
