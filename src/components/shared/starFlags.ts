/** Rating helpers shared by the star components. PURE. */

/** 1..5 only; anything else is not a rating. */
export function isRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/** Filled/empty flags for a star row. Out-of-range input renders as zero stars. */
export function starFlags(rating: number): boolean[] {
  const filled = isRating(rating) ? rating : 0;
  return Array.from({ length: 5 }, (_, i) => i < filled);
}
