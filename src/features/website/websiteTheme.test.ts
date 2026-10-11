import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCENT,
  contrastRatio,
  ensureContrast,
  fontOverride,
  mix,
  parseHexColor,
  readableOn,
  resolveFontKey,
  resolveRadiusKey,
  resolveWebsiteTheme,
} from './websiteTheme';

describe('parseHexColor', () => {
  it('accepts #rrggbb in any case and lower-cases it', () => {
    expect(parseHexColor('#1A2B3C')).toBe('#1a2b3c');
    expect(parseHexColor('#abcdef')).toBe('#abcdef');
  });
  it.each(['red', '#fff', '#12345', '#1234567', '123456', '#gggggg', '', null, undefined, 5])(
    'rejects %s',
    (value) => {
      expect(parseHexColor(value)).toBeNull();
    },
  );
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#024751', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#024751'), 8);
  });
});

describe('readableOn', () => {
  it('picks white on a dark accent and near-black on a light one', () => {
    expect(readableOn('#024751')).toBe('#ffffff');
    expect(readableOn('#ffff00')).toBe('#111827');
    expect(readableOn('#d8ff29')).toBe('#111827');
  });
  it('always achieves at least 4.5:1 for a spread of colours', () => {
    for (const hex of [
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#808080',
      '#ff8800',
      '#123456',
      '#fedcba',
    ]) {
      expect(contrastRatio(hex, readableOn(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('ensureContrast', () => {
  it('leaves an already readable colour alone', () => {
    expect(ensureContrast('#024751', '#ffffff')).toBe('#024751');
  });
  it('darkens a too-light colour until it reads on white', () => {
    const fixed = ensureContrast('#ffee00', '#ffffff');
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('mix', () => {
  it('interpolates and clamps', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030');
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
});

describe('resolveWebsiteTheme', () => {
  it('falls back to the default accent on invalid input', () => {
    for (const bad of ['red', '#12', '', null, undefined, 'javascript:alert(1)']) {
      const resolved = resolveWebsiteTheme({ brandColor: bad });
      expect(resolved.accent).toBe(DEFAULT_ACCENT);
    }
  });
  it('uses a valid colour and derives readable text for it', () => {
    const resolved = resolveWebsiteTheme({ brandColor: '#FFEE00' });
    expect(resolved.accent).toBe('#ffee00');
    expect(contrastRatio(resolved.accent, resolved.onAccent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolved.accentText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('accentText never fails contrast, whatever the colour', () => {
    for (const hex of ['#ffffff', '#ffff00', '#00ffff', '#ff00ff', '#000000', '#7f7f7f']) {
      const resolved = resolveWebsiteTheme({ brandColor: hex });
      expect(contrastRatio(resolved.accentText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('defaults font and radius, and ignores unknown keys', () => {
    const resolved = resolveWebsiteTheme({ fontKey: 'comic_sans', radiusKey: 'huge' });
    expect(resolved.fontKey).toBe('dm_sans');
    expect(resolved.radiusKey).toBe('md');
  });
  it('maps radius keys to control/card radii', () => {
    expect(resolveWebsiteTheme({ radiusKey: 'none' })).toMatchObject({
      controlRadius: 0,
      cardRadius: 0,
    });
    expect(resolveWebsiteTheme({ radiusKey: 'full' }).controlRadius).toBe(9999);
  });
});

describe('keys', () => {
  it('validates font and radius keys', () => {
    expect(resolveFontKey('serif')).toBe('serif');
    expect(resolveFontKey(undefined)).toBe('dm_sans');
    expect(resolveRadiusKey('lg')).toBe('lg');
    expect(resolveRadiusKey(3)).toBe('md');
  });
});

describe('fontOverride', () => {
  it('leaves DM Sans to the theme', () => {
    expect(fontOverride('dm_sans', 'DMSans_600SemiBold', 'ios')).toBeNull();
  });
  it('moves weight from the family name to fontWeight for system fonts', () => {
    expect(fontOverride('system_sans', 'DMSans_600SemiBold', 'ios')).toEqual({
      fontFamily: 'System',
      fontWeight: '600',
    });
    expect(fontOverride('serif', 'DMSans_700Bold', 'android')).toEqual({
      fontFamily: 'serif',
      fontWeight: '700',
    });
    expect(fontOverride('serif', 'DMSans_400Regular', 'web')?.fontFamily).toContain('Georgia');
  });
});
