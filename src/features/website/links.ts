/** URL builders for the public pages. PURE. One place, so a route move is one edit. */

function base(publicSiteUrl: string): string {
  return publicSiteUrl.replace(/\/+$/, '');
}

/** The business website: `<site>/<slug>`. */
export function websiteUrl(publicSiteUrl: string, slug: string): string {
  return `${base(publicSiteUrl)}/${slug}`;
}

/** The shareable booking link: `<site>/<slug>/book`. Works whether or not the website is published. */
export function bookingUrl(publicSiteUrl: string, slug: string): string {
  return `${websiteUrl(publicSiteUrl, slug)}/book`;
}

/** The customer's review link. The token travels in the FRAGMENT, like the manage link. */
export function reviewUrl(publicSiteUrl: string, slug: string, token: string): string {
  return `${websiteUrl(publicSiteUrl, slug)}/review#token=${encodeURIComponent(token)}`;
}

/** `https://wa.me/<digits>` from an E.164 number, or null when it is not one. */
export function whatsappUrl(e164: string | null | undefined): string | null {
  if (!e164 || !/^\+[1-9][0-9]{6,14}$/.test(e164)) return null;
  return `https://wa.me/${e164.slice(1)}`;
}

/** `tel:` link for a phone number; keeps digits and a leading plus. */
export function telUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return /\d{5,}/.test(cleaned) ? `tel:${cleaned}` : null;
}

/** A map link: the owner's own link if set, else a search link from the address. */
export function mapsUrl(
  mapUrl: string | null | undefined,
  address: string | null | undefined,
): string | null {
  if (mapUrl && /^https:\/\//.test(mapUrl)) return mapUrl;
  if (address && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return null;
}
