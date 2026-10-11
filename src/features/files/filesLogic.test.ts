import { describe, expect, it } from 'vitest';

import { MAX_FILE_BYTES, fileErrorKey, formatBytes, isImageMime, pickProblem } from './filesLogic';

describe('pickProblem', () => {
  it('accepts jpeg/png/webp/pdf up to exactly 10 MB', () => {
    expect(pickProblem({ mime: 'image/jpeg', size: 1000 })).toBeNull();
    expect(pickProblem({ mime: 'application/pdf', size: MAX_FILE_BYTES })).toBeNull();
    expect(pickProblem({ mime: 'IMAGE/PNG', size: 5 })).toBeNull();
  });
  it('refuses HEIC, SVG and anything else, and sizes outside 1 byte..10 MB', () => {
    expect(pickProblem({ mime: 'image/heic', size: 1000 })).toBe('unsupported_type');
    expect(pickProblem({ mime: 'image/svg+xml', size: 1000 })).toBe('unsupported_type');
    expect(pickProblem({ mime: 'image/jpeg', size: MAX_FILE_BYTES + 1 })).toBe('file_too_large');
    expect(pickProblem({ mime: 'image/jpeg', size: 0 })).toBe('invalid_size');
  });
  it('an unknown size or type is left to the server', () => {
    expect(pickProblem({ mime: null, size: null })).toBeNull();
  });
});

describe('helpers', () => {
  it('knows images from documents and formats sizes', () => {
    expect(isImageMime('image/webp')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
  it('maps codes with a safe fallback', () => {
    expect(fileErrorKey('photo_consent_required')).toBe('files.errors.photo_consent_required');
    expect(fileErrorKey('toString')).toBe('files.errors.unknown');
    expect(fileErrorKey(null)).toBe('files.errors.unknown');
  });
});
