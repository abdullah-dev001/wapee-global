/**
 * ALL money formatting and arithmetic lives here (CLAUDE.md §6, §8).
 *
 * Rules:
 * - Amounts are integers in MINOR units (`amount_minor bigint` in the DB) plus an
 *   ISO 4217 currency code. Never floats.
 * - Minor-unit exponent comes from the currency (USD 2, JPY 0, KWD 3), never assumed.
 * - Formatting uses Intl.NumberFormat with the business locale.
 * - Arithmetic only between amounts of the same currency.
 *
 * SKELETON: signatures only. Implement each helper in the task that first needs it.
 */
import { notImplemented } from '@/lib/notImplemented';

/** ISO 4217 currency code, e.g. "USD", "PKR". */
export type CurrencyCode = string;
/** BCP-47 locale tag, e.g. "en-US". */
export type LocaleTag = string;

/** An amount in minor units with its currency. */
export type Money = {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
};

/** Creates a Money value. `amountMinor` must be a safe integer. */
export function money(_amountMinor: number, _currency: CurrencyCode): Money {
  return notImplemented('money');
}

/** Number of minor-unit digits for a currency (via Intl), e.g. USD → 2, JPY → 0. */
export function currencyExponent(_currency: CurrencyCode): number {
  return notImplemented('currencyExponent');
}

/** Converts a user-entered major-unit string ("12.50") to minor units without float math. */
export function parseMajorToMinor(
  _input: string,
  _currency: CurrencyCode,
  _locale: LocaleTag,
): number | null {
  return notImplemented('parseMajorToMinor');
}

/** Formats Money for display with the business locale, e.g. "$12.50", "Rs 1,250". */
export function formatMoney(_value: Money, _locale: LocaleTag): string {
  return notImplemented('formatMoney');
}

/** Formats minor units as a plain major-unit number string for inputs ("12.50"). */
export function formatMinorAsMajor(_amountMinor: number, _currency: CurrencyCode): string {
  return notImplemented('formatMinorAsMajor');
}

/** Sum of amounts in the same currency. Throws on a currency mismatch. */
export function addMoney(..._values: Money[]): Money {
  return notImplemented('addMoney');
}

/** a − b in the same currency. */
export function subtractMoney(_a: Money, _b: Money): Money {
  return notImplemented('subtractMoney');
}

/** Multiplies by an integer quantity (line items). */
export function multiplyMoney(_value: Money, _quantity: number): Money {
  return notImplemented('multiplyMoney');
}

/**
 * Percentage of an amount in basis points (1% = 100 bp), rounded to a minor unit
 * with one documented rounding rule (used for tax and discounts).
 */
export function percentOf(_value: Money, _basisPoints: number): Money {
  return notImplemented('percentOf');
}

/** Splits an amount into parts that sum exactly to the original (no lost cents). */
export function allocateMoney(_value: Money, _ratios: number[]): Money[] {
  return notImplemented('allocateMoney');
}
