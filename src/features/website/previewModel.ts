/**
 * Builds the editor's live-preview model from the DRAFT being edited, by
 * producing the same JSON shape `get_website` returns and running it through the
 * same mapper — so the preview and the public page cannot drift apart.
 *
 * The visibility rules below mirror `get_website_public` (a section with nothing
 * to show is omitted); they are display rules only, the server stays the
 * authority on the real site.
 */

import { type AdminSection, type AdminWebsite } from './adminTypes';
import { assetPublicUrl } from './imageUpload';
import { mapWebsite } from './mapWebsite';
import {
  type WebsiteHour,
  type WebsiteModel,
  type WebsiteReviewItem,
  type WebsiteSectionType,
  type WebsiteServiceItem,
} from './types';

type Json = Record<string, unknown>;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** True when the public site omits this section for lack of content. */
export function sectionIsEmpty(
  type: WebsiteSectionType,
  content: Json,
  counts: { serviceCount: number; reviewCount: number },
): boolean {
  switch (type) {
    case 'about':
      return typeof content.body !== 'string' || content.body.trim() === '';
    case 'gallery':
      return asArray(content.images).length === 0;
    case 'faqs':
      return asArray(content.items).length === 0;
    case 'services':
      return counts.serviceCount === 0;
    case 'testimonials':
      return counts.reviewCount === 0;
    default:
      return false;
  }
}

export type PreviewInputs = {
  businessName: string;
  slug: string;
  currency: string;
  bookable: boolean;
  supabaseUrl: string;
  website: AdminWebsite;
  sections: readonly AdminSection[];
  services: readonly WebsiteServiceItem[];
  reviews: readonly WebsiteReviewItem[];
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    countryCode: string | null;
  };
  hours: readonly WebsiteHour[];
};

export function buildPreviewModel(input: PreviewInputs): WebsiteModel {
  const counts = { serviceCount: input.services.length, reviewCount: input.reviews.length };
  const url = (path: string | null) => (path ? assetPublicUrl(input.supabaseUrl, path) : undefined);

  const rawSections = [...input.sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((s) => s.isVisible && !sectionIsEmpty(s.type, s.content, counts))
    .map((s): Json => {
      const base: Json = { type: s.type, ...s.content };
      if (s.type === 'services') {
        base.services = input.services.map((x) => ({
          name: x.name,
          description: x.description,
          duration_minutes: x.durationMinutes,
          category_name: x.categoryName,
          price_minor: x.priceMinor ?? undefined,
        }));
      }
      if (s.type === 'testimonials') {
        base.reviews = input.reviews.map((r) => ({
          first_name: r.firstName,
          rating: r.rating,
          comment: r.comment,
          owner_reply: r.ownerReply,
          created_at: r.createdAt,
        }));
      }
      if (s.type === 'gallery') {
        base.images = asArray(s.content.images).map((img) => {
          const i = (img ?? {}) as Json;
          return { url: url(typeof i.path === 'string' ? i.path : null), alt: i.alt };
        });
      }
      return base;
    });

  return mapWebsite({
    business: { name: input.businessName, slug: input.slug },
    branch: {
      name: input.branch.name,
      address: input.branch.address,
      phone: input.branch.phone,
      currency: input.currency,
      country_code: input.branch.countryCode,
    },
    hours: input.hours.map((h) => ({
      day_of_week: h.dayOfWeek,
      start_minute: h.startMinute,
      end_minute: h.endMinute,
    })),
    theme: {
      brand_color: input.website.brandColor,
      font_key: input.website.fontKey,
      radius_key: input.website.radiusKey,
      logo_url: url(input.website.logoPath),
      hero_image_url: url(input.website.heroImagePath),
      template_key: input.website.templateKey,
    },
    seo: {
      title: input.website.seoTitle ?? input.businessName,
      description: input.website.seoDescription,
    },
    sections: rawSections,
    booking: { bookable: input.bookable },
  });
}
