import { describe, expect, it } from 'vitest';

import {
  SIMPLE_SECTION_SPECS,
  contactContent,
  contactDefaults,
  contactSchema,
  faqContent,
  faqDefaults,
  faqSchema,
  galleryContent,
  galleryDefaults,
  isSimpleSection,
  moveItem,
  simpleSectionSchema,
  textContent,
  textDefaults,
} from './sectionForms.schema';

describe('simple sections', () => {
  it('knows which types are simple', () => {
    expect(isSimpleSection('hero')).toBe(true);
    expect(isSimpleSection('gallery')).toBe(false);
  });
  it('enforces the database limits', () => {
    const schema = simpleSectionSchema('hero');
    expect(
      schema.safeParse({ headline: 'x'.repeat(120), subheadline: '', cta_label: '' }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ headline: 'x'.repeat(121), subheadline: '', cta_label: '' }).success,
    ).toBe(false);
    expect(
      simpleSectionSchema('about').safeParse({ title: '', body: 'x'.repeat(4001) }).success,
    ).toBe(false);
  });
  it('drops emptied fields and trims', () => {
    expect(textContent({ headline: '  Hi  ', subheadline: '   ', cta_label: '' })).toEqual({
      headline: 'Hi',
    });
  });
  it('builds defaults from stored content, tolerating junk', () => {
    expect(textDefaults(SIMPLE_SECTION_SPECS.hero, { headline: 'A', cta_label: 5 })).toEqual({
      headline: 'A',
      subheadline: '',
      cta_label: '',
    });
  });
});

describe('contact', () => {
  const empty = contactDefaults({});
  it('accepts blanks and valid values', () => {
    expect(contactSchema.safeParse(empty).success).toBe(true);
    expect(
      contactSchema.safeParse({
        ...empty,
        whatsapp: '+447700900123',
        map_url: 'https://maps.example.com/x',
        social: { ...empty.social, instagram: 'https://instagram.com/x' },
      }).success,
    ).toBe(true);
  });
  it('rejects non-https links and bad WhatsApp numbers', () => {
    expect(contactSchema.safeParse({ ...empty, map_url: 'http://x.com' }).success).toBe(false);
    expect(contactSchema.safeParse({ ...empty, map_url: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(contactSchema.safeParse({ ...empty, whatsapp: '07700 900123' }).success).toBe(false);
    expect(
      contactSchema.safeParse({ ...empty, social: { ...empty.social, tiktok: 'tiktok.com/x' } })
        .success,
    ).toBe(false);
  });
  it('stores only what is filled in', () => {
    expect(contactContent(empty)).toEqual({});
    expect(
      contactContent({
        ...empty,
        title: ' Find us ',
        whatsapp: '+447700900123',
        social: { ...empty.social, facebook: ' https://fb.com/x ' },
      }),
    ).toEqual({
      title: 'Find us',
      whatsapp: '+447700900123',
      social: { facebook: 'https://fb.com/x' },
    });
  });
  it('round-trips stored content', () => {
    const stored = {
      title: 'T',
      whatsapp: '+447700900123',
      map_url: 'https://m.x/y',
      social: { x: 'https://x.com/a' },
    };
    expect(contactContent(contactDefaults(stored))).toEqual(stored);
  });
});

describe('faqs', () => {
  it('requires both question and answer and caps at 20', () => {
    expect(faqSchema.safeParse({ title: '', items: [{ q: 'Q', a: 'A' }] }).success).toBe(true);
    expect(faqSchema.safeParse({ title: '', items: [{ q: 'Q', a: '  ' }] }).success).toBe(false);
    const many = Array.from({ length: 21 }, () => ({ q: 'Q', a: 'A' }));
    expect(faqSchema.safeParse({ title: '', items: many }).success).toBe(false);
  });
  it('round-trips and trims', () => {
    expect(faqContent({ title: ' FAQ ', items: [{ q: ' Q ', a: ' A ' }] })).toEqual({
      title: 'FAQ',
      items: [{ q: 'Q', a: 'A' }],
    });
    expect(faqDefaults({ items: [{ q: 'Q', a: 'A' }, 5] }).items).toHaveLength(2);
  });
});

describe('gallery', () => {
  it('keeps alt only when set and drops junk entries', () => {
    expect(
      galleryContent({
        title: '',
        images: [
          { path: 'a/b.png', alt: ' Front ' },
          { path: 'c/d.jpg', alt: '' },
        ],
      }),
    ).toEqual({ images: [{ path: 'a/b.png', alt: 'Front' }, { path: 'c/d.jpg' }] });
    expect(galleryDefaults({ images: [{ path: 'a/b.png' }, { nope: 1 }, 3] }).images).toEqual([
      { path: 'a/b.png', alt: '' },
    ]);
  });
});

describe('moveItem', () => {
  it('moves up and down and ignores out-of-range moves', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
