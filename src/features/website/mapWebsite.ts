import {
  SOCIAL_NETWORKS,
  type SocialNetwork,
  type WebsiteModel,
  type WebsiteSection,
} from './types';

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v: unknown): Raw[] =>
  Array.isArray(v) ? v.filter((x): x is Raw => typeof x === 'object' && x !== null) : [];
const obj = (v: unknown): Raw => (typeof v === 'object' && v !== null ? (v as Raw) : {});

function mapSection(s: Raw): WebsiteSection | null {
  switch (s.type) {
    case 'hero':
      return {
        type: 'hero',
        headline: str(s.headline),
        subheadline: str(s.subheadline),
        ctaLabel: str(s.cta_label),
      };
    case 'about':
      return { type: 'about', title: str(s.title), body: str(s.body) };
    case 'services':
      return {
        type: 'services',
        title: str(s.title),
        intro: str(s.intro),
        services: arr(s.services).flatMap((x) => {
          const name = str(x.name);
          return name
            ? [
                {
                  name,
                  description: str(x.description),
                  durationMinutes: num(x.duration_minutes),
                  categoryName: str(x.category_name),
                  priceMinor: num(x.price_minor),
                },
              ]
            : [];
        }),
      };
    case 'gallery':
      return {
        type: 'gallery',
        title: str(s.title),
        images: arr(s.images).flatMap((i) => {
          const url = str(i.url);
          return url ? [{ url, alt: str(i.alt) }] : [];
        }),
      };
    case 'testimonials':
      return {
        type: 'testimonials',
        title: str(s.title),
        reviews: arr(s.reviews).flatMap((r) => {
          const rating = num(r.rating);
          return rating !== null
            ? [
                {
                  firstName: str(r.first_name) ?? '',
                  rating,
                  comment: str(r.comment),
                  ownerReply: str(r.owner_reply),
                  createdAt: str(r.created_at),
                },
              ]
            : [];
        }),
      };
    case 'faqs':
      return {
        type: 'faqs',
        title: str(s.title),
        items: arr(s.items).flatMap((i) => {
          const q = str(i.q);
          const a = str(i.a);
          return q && a ? [{ q, a }] : [];
        }),
      };
    case 'contact': {
      const rawSocial = obj(s.social);
      const social: Partial<Record<SocialNetwork, string>> = {};
      for (const network of SOCIAL_NETWORKS) {
        const url = str(rawSocial[network]);
        if (url) social[network] = url;
      }
      return {
        type: 'contact',
        title: str(s.title),
        whatsapp: str(s.whatsapp),
        mapUrl: str(s.map_url),
        social,
      };
    }
    default:
      return null;
  }
}

/** `get_website` response data -> the view model. Unknown section types are dropped. */
export function mapWebsite(raw: Raw): WebsiteModel {
  const business = obj(raw.business);
  const branch = obj(raw.branch);
  const theme = obj(raw.theme);
  const seo = obj(raw.seo);
  const booking = obj(raw.booking);

  return {
    businessName: str(business.name) ?? '',
    slug: str(business.slug) ?? '',
    branch: {
      name: str(branch.name) ?? '',
      address: str(branch.address),
      phone: str(branch.phone),
      currency: str(branch.currency) ?? '',
      countryCode: str(branch.country_code),
    },
    hours: arr(raw.hours).flatMap((h) => {
      const dayOfWeek = num(h.day_of_week);
      const startMinute = num(h.start_minute);
      const endMinute = num(h.end_minute);
      return dayOfWeek !== null && startMinute !== null && endMinute !== null
        ? [{ dayOfWeek, startMinute, endMinute }]
        : [];
    }),
    theme: {
      brandColor: str(theme.brand_color),
      fontKey: str(theme.font_key),
      radiusKey: str(theme.radius_key),
      logoUrl: str(theme.logo_url),
      heroImageUrl: str(theme.hero_image_url),
      templateKey: str(theme.template_key),
    },
    seo: {
      title: str(seo.title) ?? str(business.name) ?? '',
      description: str(seo.description),
      canonicalUrl: str(seo.canonical_url),
    },
    sections: arr(raw.sections).flatMap((s) => {
      const mapped = mapSection(s);
      return mapped ? [mapped] : [];
    }),
    bookable: booking.bookable === true,
    jsonLd: Object.keys(obj(raw.json_ld)).length > 0 ? obj(raw.json_ld) : null,
  };
}
