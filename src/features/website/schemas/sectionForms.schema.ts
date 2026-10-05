import { z } from 'zod';

import { SOCIAL_NETWORKS, type SocialNetwork } from '../types';

/**
 * Section editor forms. Limits mirror `website_section_content_error()` in the
 * database; the server validates again and is the authority.
 */

export type TextFieldSpec = {
  key: string;
  max: number;
  multiline?: boolean;
};

/** Types whose content is plain optional text fields (and the fields they have). */
export const SIMPLE_SECTION_SPECS = {
  hero: [
    { key: 'headline', max: 120 },
    { key: 'subheadline', max: 300, multiline: true },
    { key: 'cta_label', max: 40 },
  ],
  about: [
    { key: 'title', max: 120 },
    { key: 'body', max: 4000, multiline: true },
  ],
  services: [
    { key: 'title', max: 120 },
    { key: 'intro', max: 500, multiline: true },
  ],
  testimonials: [{ key: 'title', max: 120 }],
} as const satisfies Record<string, readonly TextFieldSpec[]>;

export type SimpleSectionType = keyof typeof SIMPLE_SECTION_SPECS;

export function isSimpleSection(type: string): type is SimpleSectionType {
  return type in SIMPLE_SECTION_SPECS;
}

export function simpleSectionSchema(type: SimpleSectionType) {
  const shape: Record<string, z.ZodString> = {};
  for (const spec of SIMPLE_SECTION_SPECS[type]) {
    shape[spec.key] = z.string().max(spec.max, 'websiteEditor.errors.tooLong');
  }
  return z.object(shape);
}

/** Trimmed, non-empty values only: an emptied field is removed from the stored content. */
export function textContent(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const text = value.trim();
    if (text) out[key] = text;
  }
  return out;
}

/** Stored content -> form defaults (every key a string). */
export function textDefaults(
  specs: readonly TextFieldSpec[],
  content: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    specs.map((spec) => [
      spec.key,
      typeof content[spec.key] === 'string' ? (content[spec.key] as string) : '',
    ]),
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

const httpsUrl = z
  .string()
  .max(500, 'websiteEditor.errors.tooLong')
  .refine((v) => v === '' || /^https:\/\/[^\s<>"']+$/.test(v), 'websiteEditor.errors.https');

export const contactSchema = z.object({
  title: z.string().max(120, 'websiteEditor.errors.tooLong'),
  whatsapp: z
    .string()
    .refine((v) => v === '' || /^\+[1-9][0-9]{6,14}$/.test(v), 'websiteEditor.errors.whatsapp'),
  map_url: httpsUrl,
  social: z.object(
    Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, httpsUrl])) as Record<
      SocialNetwork,
      typeof httpsUrl
    >,
  ),
});
export type ContactFormValues = z.infer<typeof contactSchema>;

export function contactDefaults(content: Record<string, unknown>): ContactFormValues {
  const social = (content.social ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    title: s(content.title),
    whatsapp: s(content.whatsapp),
    map_url: s(content.map_url),
    social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, s(social[n])])) as Record<
      SocialNetwork,
      string
    >,
  };
}

export function contactContent(values: ContactFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (values.title.trim()) out.title = values.title.trim();
  if (values.whatsapp) out.whatsapp = values.whatsapp;
  if (values.map_url.trim()) out.map_url = values.map_url.trim();
  const social: Record<string, string> = {};
  for (const network of SOCIAL_NETWORKS) {
    const url = values.social[network].trim();
    if (url) social[network] = url;
  }
  if (Object.keys(social).length > 0) out.social = social;
  return out;
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export const MAX_FAQ_ITEMS = 20;

export const faqSchema = z.object({
  title: z.string().max(120, 'websiteEditor.errors.tooLong'),
  items: z
    .array(
      z.object({
        q: z
          .string()
          .trim()
          .min(1, 'websiteEditor.errors.required')
          .max(200, 'websiteEditor.errors.tooLong'),
        a: z
          .string()
          .trim()
          .min(1, 'websiteEditor.errors.required')
          .max(1500, 'websiteEditor.errors.tooLong'),
      }),
    )
    .max(MAX_FAQ_ITEMS),
});
export type FaqFormValues = z.infer<typeof faqSchema>;

export function faqDefaults(content: Record<string, unknown>): FaqFormValues {
  const items = Array.isArray(content.items) ? content.items : [];
  return {
    title: typeof content.title === 'string' ? content.title : '',
    items: items.map((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>;
      return { q: typeof i.q === 'string' ? i.q : '', a: typeof i.a === 'string' ? i.a : '' };
    }),
  };
}

export function faqContent(values: FaqFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {
    items: values.items.map((i) => ({ q: i.q.trim(), a: i.a.trim() })),
  };
  if (values.title.trim()) out.title = values.title.trim();
  return out;
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export const MAX_GALLERY_IMAGES = 12;

export type GalleryImage = { path: string; alt: string };
export type GalleryFormValues = { title: string; images: GalleryImage[] };

export function galleryDefaults(content: Record<string, unknown>): GalleryFormValues {
  const images = Array.isArray(content.images) ? content.images : [];
  return {
    title: typeof content.title === 'string' ? content.title : '',
    images: images.flatMap((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>;
      return typeof i.path === 'string'
        ? [{ path: i.path, alt: typeof i.alt === 'string' ? i.alt : '' }]
        : [];
    }),
  };
}

export function galleryContent(values: GalleryFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {
    images: values.images.map((i) =>
      i.alt.trim() ? { path: i.path, alt: i.alt.trim() } : { path: i.path },
    ),
  };
  if (values.title.trim()) out.title = values.title.trim();
  return out;
}

/** Whether an alt text is acceptable (<= 150). */
export function altTooLong(alt: string): boolean {
  return alt.length > 150;
}

/** Moves item `index` by `delta` (-1 up, +1 down); out-of-range moves return the list unchanged. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item as T);
  return copy;
}
