/**
 * The view model the website section components render. Presentational only:
 * the SAME components serve the public page (fed from `get_website`) and the
 * editor's live preview (fed from the draft being edited), so neither source's
 * shape leaks into JSX. Mapping from each source happens at the edge.
 */

export type WebsiteHour = { dayOfWeek: number; startMinute: number; endMinute: number };

export type WebsiteServiceItem = {
  name: string;
  description: string | null;
  durationMinutes: number | null;
  categoryName: string | null;
  /** Minor units. Null when the branch hides prices. */
  priceMinor: number | null;
};

export type WebsiteReviewItem = {
  firstName: string;
  rating: number;
  comment: string | null;
  ownerReply: string | null;
  createdAt: string | null;
};

export type WebsiteSection =
  | { type: 'hero'; headline: string | null; subheadline: string | null; ctaLabel: string | null }
  | { type: 'about'; title: string | null; body: string | null }
  | { type: 'services'; title: string | null; intro: string | null; services: WebsiteServiceItem[] }
  | {
      type: 'gallery';
      title: string | null;
      images: { url: string; alt: string | null }[];
    }
  | { type: 'testimonials'; title: string | null; reviews: WebsiteReviewItem[] }
  | { type: 'faqs'; title: string | null; items: { q: string; a: string }[] }
  | {
      type: 'contact';
      title: string | null;
      whatsapp: string | null;
      mapUrl: string | null;
      social: Partial<Record<SocialNetwork, string>>;
    };

export const SOCIAL_NETWORKS = [
  'instagram',
  'facebook',
  'tiktok',
  'x',
  'youtube',
  'linkedin',
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export type WebsiteSectionType = WebsiteSection['type'];
export const SECTION_TYPES: readonly WebsiteSectionType[] = [
  'hero',
  'about',
  'services',
  'gallery',
  'testimonials',
  'faqs',
  'contact',
] as const;

export type WebsiteModel = {
  businessName: string;
  slug: string;
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    currency: string;
    countryCode: string | null;
  };
  hours: WebsiteHour[];
  theme: {
    brandColor: string | null;
    fontKey: string | null;
    radiusKey: string | null;
    logoUrl: string | null;
    heroImageUrl: string | null;
    templateKey: string | null;
  };
  seo: { title: string; description: string | null; canonicalUrl: string | null };
  sections: WebsiteSection[];
  /** Whether Book buttons are shown (booking settings), and whether prices are. */
  bookable: boolean;
  jsonLd: Record<string, unknown> | null;
};
