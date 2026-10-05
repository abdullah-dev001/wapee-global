import { describe, expect, it } from 'vitest';

import { type AdminSection, type AdminWebsite } from './adminTypes';
import { buildPreviewModel, sectionIsEmpty } from './previewModel';

const BIZ = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const website: AdminWebsite = {
  id: 'w',
  branchId: 'b',
  templateKey: 'default',
  isPublished: false,
  publishedAt: null,
  brandColor: '#112233',
  fontKey: 'serif',
  radiusKey: 'lg',
  logoPath: `${BIZ}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`,
  heroImagePath: null,
  seoTitle: null,
  seoDescription: 'Desc',
};
const section = (
  type: AdminSection['type'],
  sortOrder: number,
  content: Record<string, unknown> = {},
  isVisible = true,
): AdminSection => ({ id: type, type, isVisible, sortOrder, content });

const sections = [
  section('hero', 1, { headline: 'Hello' }),
  section('about', 2, { body: '   ' }),
  section('services', 3),
  section('gallery', 4, {
    images: [{ path: `${BIZ}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`, alt: 'Front' }],
  }),
  section('testimonials', 5),
  section('faqs', 6, { items: [{ q: 'Q?', a: 'A.' }] }, false),
  section('contact', 7, { whatsapp: '+447700900123' }),
];

const base = {
  businessName: 'Nova',
  slug: 'nova',
  currency: 'GBP',
  bookable: true,
  supabaseUrl: 'https://x.supabase.co',
  website,
  sections,
  services: [
    { name: 'Cut', description: null, durationMinutes: 60, categoryName: null, priceMinor: 4000 },
  ],
  reviews: [],
  branch: { name: 'Main', address: '1 High St', phone: '+44', countryCode: 'GB' },
  hours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
};

describe('sectionIsEmpty', () => {
  const counts = { serviceCount: 1, reviewCount: 0 };
  it('mirrors the server rules', () => {
    expect(sectionIsEmpty('hero', {}, counts)).toBe(false);
    expect(sectionIsEmpty('contact', {}, counts)).toBe(false);
    expect(sectionIsEmpty('about', { body: ' ' }, counts)).toBe(true);
    expect(sectionIsEmpty('about', { body: 'x' }, counts)).toBe(false);
    expect(sectionIsEmpty('gallery', { images: [] }, counts)).toBe(true);
    expect(sectionIsEmpty('faqs', {}, counts)).toBe(true);
    expect(sectionIsEmpty('services', {}, { serviceCount: 0, reviewCount: 0 })).toBe(true);
    expect(sectionIsEmpty('testimonials', {}, counts)).toBe(true);
    expect(sectionIsEmpty('testimonials', {}, { serviceCount: 0, reviewCount: 2 })).toBe(false);
  });
});

describe('buildPreviewModel', () => {
  const model = buildPreviewModel(base);

  it('keeps order, drops hidden and empty sections', () => {
    // about (blank body), testimonials (no reviews) and faqs (hidden) are omitted
    expect(model.sections.map((s) => s.type)).toEqual(['hero', 'services', 'gallery', 'contact']);
  });
  it('turns asset paths into public urls', () => {
    expect(model.theme.logoUrl).toBe(
      `https://x.supabase.co/storage/v1/object/public/website-assets/${website.logoPath}`,
    );
    const gallery = model.sections.find((s) => s.type === 'gallery');
    expect(gallery?.type === 'gallery' && gallery.images[0]?.url).toContain('/website-assets/');
  });
  it('carries theme, seo and booking flags', () => {
    expect(model.theme).toMatchObject({ brandColor: '#112233', fontKey: 'serif', radiusKey: 'lg' });
    expect(model.seo).toMatchObject({ title: 'Nova', description: 'Desc' });
    expect(model.bookable).toBe(true);
  });
  it('shows testimonials once there are featured reviews', () => {
    const withReviews = buildPreviewModel({
      ...base,
      reviews: [
        { firstName: 'Sarah', rating: 5, comment: 'Great', ownerReply: null, createdAt: null },
      ],
    });
    expect(withReviews.sections.map((s) => s.type)).toContain('testimonials');
  });
  it('follows a new sort order', () => {
    const reordered = buildPreviewModel({
      ...base,
      sections: [section('contact', 1), section('hero', 2, { headline: 'H' })],
    });
    expect(reordered.sections.map((s) => s.type)).toEqual(['contact', 'hero']);
  });
});
