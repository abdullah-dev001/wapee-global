/**
 * ALL money formatting and arithmetic lives here (CLAUDE.md §6, §8).
 *
 * Rules:
 * - Amounts are integers in MINOR units (`amount_minor bigint` in the DB) plus an
 *   ISO 4217 currency code. Never floats.
 * - Minor-unit exponent comes from the currency (USD 2, JPY 0, KWD 3), never assumed.
 * - Formatting uses Intl.NumberFormat with the business locale.
 * - Currency belongs to the **branch**, not the business (decision 23), and
 *   reports must never add amounts in different currencies (decision 25):
 *   group by currency and show separate totals.
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
export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Money must be a safe integer in minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency: currency.toUpperCase() };
}

/**
 * Minor-unit digits for a currency: USD 2, JPY 0, KWD 3.
 *
 * Read from `Intl` so the list never has to be maintained by hand. Hermes ships
 * currency data, but an unknown code still falls back to 2, which is right for
 * the overwhelming majority.
 */
export function currencyExponent(currency: CurrencyCode): number {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
      // Ask for the currency's own default precision.
    }).resolvedOptions();
    return parts.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Zero codepoints of the decimal-digit blocks worth supporting.
 *
 * Needed because neither `Number('١')` nor `'١'.normalize('NFKD')` converts a
 * non-ASCII digit — both leave it unusable. Subtracting the block's zero does.
 */
const DIGIT_ZEROS = [
  0x0030, // ASCII 0-9
  0x0660, // Arabic-Indic (ar)
  0x06f0, // Extended Arabic-Indic (fa, ur)
  0x0966, // Devanagari (hi)
  0x09e6, // Bengali
  0x0a66, // Gurmukhi
  0x0ae6, // Gujarati
  0x0b66, // Oriya
  0x0be6, // Tamil
  0x0c66, // Telugu
  0x0ce6, // Kannada
  0x0d66, // Malayalam
  0x0e50, // Thai
  0x0ed0, // Lao
  0x1040, // Myanmar
] as const;

/**
 * Maps every supported Unicode decimal digit to ASCII 0-9, leaving anything else
 * untouched.
 *
 * An Arabic-locale user types on an Arabic-Indic keypad ("١٢٣٤"), a Persian or
 * Urdu one on the extended set. A naive `[0-9]` filter deletes those, which would
 * turn a real price into null or a wrong amount.
 */
function toAsciiDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;

    let converted: string | null = null;
    for (const zero of DIGIT_ZEROS) {
      const offset = code - zero;
      if (offset >= 0 && offset <= 9) {
        converted = String(offset);
        break;
      }
    }
    out += converted ?? ch;
  }
  return out;
}

/**
 * Converts what a person typed ("12.50", "1,250", "١٢٫٥٠") into minor units.
 *
 * **No float arithmetic**: the string is split on its decimal separator and the
 * fraction is padded or truncated as text, so 19.99 can never become 1998.
 * Returns null for anything that is not a number, so a caller must handle bad
 * input rather than silently storing 0.
 *
 * Two internationalisation details that are easy to get wrong:
 * - **Non-ASCII digits are normalised first**, so an Arabic or Persian keypad
 *   works.
 * - **"." is accepted as a decimal point** alongside the locale's own separator,
 *   unless the locale GROUPS with "." (de-DE). `ar-KW` decimates with "٫" but
 *   groups with "٬", so a keyboard "." there is a decimal point — treating it as
 *   grouping turned "1.500" KWD into 1500 dinars instead of 1.5.
 */
export function parseMajorToMinor(
  input: string,
  currency: CurrencyCode,
  locale: LocaleTag,
): number | null {
  const exponent = currencyExponent(currency);

  // The locale's own separators: de-DE groups with "." and decimates with ",";
  // ar-KW groups with "٬" and decimates with "٫".
  let localeSep = '.';
  let groupSep = ',';
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
    const dec = parts.find((part) => part.type === 'decimal')?.value;
    const grp = parts.find((part) => part.type === 'group')?.value;
    if (dec) localeSep = dec;
    if (grp) groupSep = grp;
  } catch {
    // Keep the ASCII defaults — safe.
  }

  const normalised = toAsciiDigits(input.trim());
  if (normalised === '') return null;

  const negative = normalised.startsWith('-');

  // "." counts as a decimal point unless THIS LOCALE groups with it (de-DE),
  // where "1.500" means one thousand five hundred. Testing the grouping
  // separator, not the decimal one: ar-KW decimates with "٫" but groups with
  // "٬", so a keyboard "." there is still a decimal point.
  const separators = groupSep === '.' ? [localeSep] : [localeSep, '.'];

  // Keep digits and decimal separators; drop grouping, symbols and spaces.
  let cleaned = '';
  for (const ch of normalised) {
    if (/[0-9]/.test(ch)) cleaned += ch;
    else if (separators.includes(ch)) cleaned += '.';
  }
  if (cleaned === '' || cleaned === '.') return null;

  const parts = cleaned.split('.');
  if (parts.length > 2) return null;

  const whole = parts[0] ?? '';
  const fraction = parts[1] ?? '';
  const wholeDigits = whole === '' ? '0' : whole;
  if (!/^[0-9]+$/.test(wholeDigits)) return null;
  if (fraction !== '' && !/^[0-9]+$/.test(fraction)) return null;

  // Pad or truncate the fraction to the currency's exponent, as TEXT.
  const scaled = (fraction + '0'.repeat(exponent)).slice(0, exponent);
  const minor = Number(wholeDigits + scaled);
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Formats Money for display with the business locale, e.g. "$12.50", "Rs 1,250". */
export function formatMoney(value: Money, locale: LocaleTag): string {
  const exponent = currencyExponent(value.currency);
  // Divide for DISPLAY only; the stored value stays an integer.
  const major = value.amountMinor / 10 ** exponent;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
    }).format(major);
  } catch {
    // Unknown currency code: show the amount with the code beside it.
    return `${major.toFixed(exponent)} ${value.currency}`;
  }
}

/**
 * Minor units as a plain major-unit string for a text input ("12.50").
 * No grouping separators and no currency symbol, so it round-trips through
 * `parseMajorToMinor`.
 */
export function formatMinorAsMajor(amountMinor: number, currency: CurrencyCode): string {
  const exponent = currencyExponent(currency);
  if (exponent === 0) return String(amountMinor);

  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, '0');
  const whole = digits.slice(0, -exponent);
  const fraction = digits.slice(-exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
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
