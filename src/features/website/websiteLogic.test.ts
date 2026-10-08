import { describe, expect, it } from 'vitest';

import { hoursRows } from './hoursDisplay';
import { bookingUrl, mapsUrl, reviewUrl, telUrl, websiteUrl, whatsappUrl } from './links';
import { mapWebsite } from './mapWebsite';

describe('links', () => {
  it('builds website, booking and review urls', () => {
    expect(websiteUrl('https://wapee.online/', 'nova')).toBe('https://wapee.online/nova');
    expect(bookingUrl('https://wapee.online', 'nova')).toBe('https://wapee.online/nova/book');
    expect(reviewUrl('https://wapee.online///', 'nova', 'a b')).toBe(
      'https://wapee.online/nova/review#token=a%20b',
    );
  });
  it('whatsapp only from a valid E.164', () => {
    expect(whatsappUrl('+447700900123')).toBe('https://wa.me/447700900123');
    expect(whatsappUrl('07700900123')).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
  it('tel keeps digits and plus', () => {
    expect(telUrl('+44 20 7123 4567')).toBe('tel:+442071234567');
    expect(telUrl('abc')).toBeNull();
    expect(telUrl(null)).toBeNull();
  });
  it('maps: owner link wins (https only), else address search', () => {
    expect(mapsUrl('https://maps.example.com/x', '1 High St')).toBe('https://maps.example.com/x');
    expect(mapsUrl('javascript:alert(1)', '1 High St')).toContain('google.com/maps/search');
    expect(mapsUrl(null, '1 High St & Co')).toContain(encodeURIComponent('1 High St & Co'));
    expect(mapsUrl(null, '  ')).toBeNull();
  });
});

describe('hoursRows', () => {
  it('orders from the first day, joins split shifts and marks closed days', () => {
    const rows = hoursRows(
      [
        { dayOfWeek: 1, startMinute: 780, endMinute: 1020 },
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 2, startMinute: 540, endMinute: 1020 },
      ],
      1,
    );
    expect(rows.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0]?.ranges).toEqual(['09:00–12:00', '13:00–17:00']);
    expect(rows[2]?.ranges).toEqual([]);
  });
});

describe('mapWebsite', () => {
  const raw = {
    business: { name: 'Nova', slug: 'nova', industry: 'salon' },
    branch: {
      name: 'Main',
      address: '1 High St',
      phone: '+44',
      currency: 'GBP',
      country_code: 'GB',
    },
    hours: [{ day_of_week: 1, start_minute: 540, end_minute: 1020 }, { day_of_week: 'x' }],
    theme: {
      brand_color: '#112233',
      font_key: 'serif',
      radius_key: 'lg',
      logo_url: 'https://x/l.png',
    },
    seo: { title: 'Nova', description: 'Hair', canonical_url: 'https://wapee.online/nova' },
    sections: [
      { type: 'hero', headline: 'Hi', subheadline: null, cta_label: 'Book' },
      {
        type: 'services',
        title: null,
        intro: null,
        services: [{ name: 'Cut', price_minor: 4000, duration_minutes: 60 }, { name: '' }],
      },
      {
        type: 'faqs',
        title: 'FAQ',
        items: [
          { q: 'Q', a: 'A' },
          { q: 'x', a: '' },
        ],
      },
      {
        type: 'testimonials',
        title: null,
        reviews: [
          { first_name: 'Sarah', rating: 5, comment: 'Great', owner_reply: 'Thanks' },
          { rating: 'bad' },
        ],
      },
      {
        type: 'contact',
        whatsapp: '+447700900123',
        map_url: null,
        social: { instagram: 'https://i/x', myspace: 'https://m' },
      },
      { type: 'blog' },
    ],
    booking: { bookable: true, show_prices: true },
    json_ld: { '@type': 'LocalBusiness' },
  };
  const model = mapWebsite(raw);

  it('maps the basics', () => {
    expect(model.businessName).toBe('Nova');
    expect(model.bookable).toBe(true);
    expect(model.theme).toMatchObject({
      brandColor: '#112233',
      fontKey: 'serif',
      logoUrl: 'https://x/l.png',
    });
    expect(model.seo.canonicalUrl).toBe('https://wapee.online/nova');
    expect(model.jsonLd).toEqual({ '@type': 'LocalBusiness' });
  });
  it('drops malformed rows and unknown sections', () => {
    expect(model.hours).toHaveLength(1);
    expect(model.sections.map((s) => s.type)).toEqual([
      'hero',
      'services',
      'faqs',
      'testimonials',
      'contact',
    ]);
  });
  it('drops unnamed services, empty faq answers and unrated reviews', () => {
    const services = model.sections.find((s) => s.type === 'services');
    expect(services?.type === 'services' && services.services).toHaveLength(1);
    const faqs = model.sections.find((s) => s.type === 'faqs');
    expect(faqs?.type === 'faqs' && faqs.items).toHaveLength(1);
    const reviews = model.sections.find((s) => s.type === 'testimonials');
    expect(reviews?.type === 'testimonials' && reviews.reviews).toHaveLength(1);
  });
  it('keeps only known social networks', () => {
    const contact = model.sections.find((s) => s.type === 'contact');
    expect(contact?.type === 'contact' && contact.social).toEqual({ instagram: 'https://i/x' });
  });
  it('survives an empty payload', () => {
    const empty = mapWebsite({});
    expect(empty.sections).toEqual([]);
    expect(empty.bookable).toBe(false);
    expect(empty.jsonLd).toBeNull();
  });
});
