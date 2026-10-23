/**
 * Before any checkout or plan change: the Polar product must charge exactly the price the
 * database shows the owner (plans / addons via get_public_pricing). Prices are never written in
 * code; this only compares. Pure.
 *
 *   fixed price            price_amount === the DB price (minor units)
 *   per location (seats)   one seat tier, price_per_seat === the DB price per location
 */

export type PolarProduct = {
  id?: unknown;
  is_archived?: unknown;
  is_recurring?: unknown;
  recurring_interval?: unknown;
  recurring_interval_count?: unknown;
  prices?: unknown;
};

export type ExpectedPrice = {
  interval: 'month' | 'year';
  priceMinor: number;
  currency: string;
  perSeat: boolean;
};

export type PriceCheck = { ok: true } | { ok: false; code: 'not_available' | 'price_mismatch' };

type Price = {
  amount_type?: unknown;
  is_archived?: unknown;
  price_currency?: unknown;
  price_amount?: unknown;
  seat_tiers?: { tiers?: unknown } | null;
};

export function checkProductPrice(
  product: PolarProduct | null | undefined,
  want: ExpectedPrice,
): PriceCheck {
  if (!product || product.is_archived === true) return { ok: false, code: 'not_available' };
  const count =
    typeof product.recurring_interval_count === 'number' ? product.recurring_interval_count : 1;
  if (
    product.is_recurring !== true ||
    product.recurring_interval !== want.interval ||
    count !== 1
  ) {
    return { ok: false, code: 'price_mismatch' };
  }
  const prices = (Array.isArray(product.prices) ? product.prices : []) as Price[];
  const live = prices.filter(
    (p) =>
      p &&
      p.is_archived !== true &&
      typeof p.price_currency === 'string' &&
      p.price_currency.toLowerCase() === want.currency.toLowerCase(),
  );
  if (live.length !== 1) return { ok: false, code: 'price_mismatch' };
  const price = live[0]!;
  if (want.perSeat) {
    const tiers = Array.isArray(price.seat_tiers?.tiers)
      ? (price.seat_tiers?.tiers as Record<string, unknown>[])
      : [];
    if (price.amount_type !== 'seat_based' || tiers.length !== 1)
      return { ok: false, code: 'price_mismatch' };
    return tiers[0]?.price_per_seat === want.priceMinor
      ? { ok: true }
      : { ok: false, code: 'price_mismatch' };
  }
  if (price.amount_type !== 'fixed') return { ok: false, code: 'price_mismatch' };
  return price.price_amount === want.priceMinor
    ? { ok: true }
    : { ok: false, code: 'price_mismatch' };
}
