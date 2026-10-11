/**
 * POST /functions/v1/get_website
 *
 * The ONE public read of a business website. Takes a business SLUG, calls the
 * service-role RPC `get_website_public`, and returns only public fields, mapped
 * field by field (never spread) so a column added to the RPC later cannot reach
 * the public page by default.
 *
 * Request   { slug: string }
 * Response  { ok: true, data: { business, branch, hours, theme, seo, sections, booking, json_ld } }
 *           { ok: false, code: 'not_found' | 'rate_limited' | 'bad_request' | 'server_error' }
 *
 * Unknown slug, deleted, inactive, no website and UNPUBLISHED all return the
 * identical `not_found`.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { siteUrl } from '../_shared/site.ts';

const RequestSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid slug'),
  })
  .strict();

type Json = Record<string, unknown>;

/** Public URL of an object in the public website-assets bucket. */
function assetUrl(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) return null;
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) throw new Error('SUPABASE_URL is not set');
  return `${base}/storage/v1/object/public/website-assets/${path}`;
}

function websiteBase(): string {
  return siteUrl();
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** One section, mapped through a per-type allow-list. */
function mapSection(s: Json): Json {
  const type = str(s.type) ?? '';
  const c = (s.content ?? {}) as Json;
  switch (type) {
    case 'hero':
      return {
        type,
        headline: str(c.headline),
        subheadline: str(c.subheadline),
        cta_label: str(c.cta_label),
      };
    case 'about':
      return { type, title: str(c.title), body: str(c.body) };
    case 'services': {
      const services = (Array.isArray(s.services) ? s.services : []) as Json[];
      return {
        type,
        title: str(c.title),
        intro: str(c.intro),
        services: services.map((x) => ({
          name: str(x.name),
          description: str(x.description),
          duration_minutes: typeof x.duration_minutes === 'number' ? x.duration_minutes : null,
          category_name: str(x.category_name),
          // Present only when the branch shows prices (the RPC omits it otherwise).
          ...(typeof x.price_minor === 'number' ? { price_minor: x.price_minor } : {}),
        })),
      };
    }
    case 'gallery': {
      const images = (Array.isArray(c.images) ? c.images : []) as Json[];
      return {
        type,
        title: str(c.title),
        images: images.map((i) => ({ url: assetUrl(i.path), alt: str(i.alt) })),
      };
    }
    case 'testimonials': {
      const reviews = (Array.isArray(s.reviews) ? s.reviews : []) as Json[];
      return {
        type,
        title: str(c.title),
        reviews: reviews.map((r) => ({
          first_name: str(r.first_name),
          rating: typeof r.rating === 'number' ? r.rating : null,
          comment: str(r.comment),
          owner_reply: str(r.owner_reply),
          created_at: str(r.created_at),
        })),
      };
    }
    case 'faqs': {
      const items = (Array.isArray(c.items) ? c.items : []) as Json[];
      return {
        type,
        title: str(c.title),
        items: items.map((i) => ({ q: str(i.q), a: str(i.a) })),
      };
    }
    case 'contact': {
      const social = (c.social ?? {}) as Json;
      return {
        type,
        title: str(c.title),
        whatsapp: str(c.whatsapp),
        map_url: str(c.map_url),
        social: Object.fromEntries(Object.entries(social).filter(([, v]) => typeof v === 'string')),
      };
    }
    default:
      return { type };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  let slug: string | null = null;
  try {
    const db = serviceClient();

    const limit = await checkRateLimit(req, db, 'get_website');
    if (!limit.allowed) {
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');
    slug = parsed.data.slug;

    const { data, error } = await db.rpc('get_website_public', { p_slug: slug });
    if (error) throw error;
    if (!data) return jsonError(req, 'not_found');

    const w = data as Json;
    const business = (w.business ?? {}) as Json;
    const branch = (w.branch ?? {}) as Json;
    const site = (w.website ?? {}) as Json;
    const seo = (w.seo ?? {}) as Json;
    const booking = (w.booking ?? {}) as Json;
    const url = `${websiteBase()}/${slug}`;
    const logo = assetUrl(site.logo_path);

    const jsonLd = {
      ...((w.json_ld ?? {}) as Json),
      url,
      ...(logo ? { image: logo } : {}),
    };

    return jsonOk(req, {
      business: {
        name: str(business.name),
        slug: str(business.slug),
        industry: str(business.industry),
      },
      branch: {
        name: str(branch.name),
        address: str(branch.address),
        phone: str(branch.phone),
        country_code: str(branch.country_code),
        timezone: str(branch.timezone),
        currency: str(branch.currency),
      },
      hours: ((Array.isArray(w.hours) ? w.hours : []) as Json[]).map((h) => ({
        day_of_week: h.day_of_week,
        start_minute: h.start_minute,
        end_minute: h.end_minute,
      })),
      theme: {
        template_key: str(site.template_key),
        brand_color: str(site.brand_color),
        font_key: str(site.font_key),
        radius_key: str(site.radius_key),
        logo_url: logo,
        hero_image_url: assetUrl(site.hero_image_path),
      },
      seo: { title: str(seo.title), description: str(seo.description), canonical_url: url },
      sections: ((Array.isArray(w.sections) ? w.sections : []) as Json[]).map(mapSection),
      booking: { bookable: booking.bookable === true, show_prices: booking.show_prices === true },
      json_ld: jsonLd,
    });
  } catch (err) {
    logUnexpected('get_website', slug, err);
    return jsonError(req, 'server_error');
  }
});
