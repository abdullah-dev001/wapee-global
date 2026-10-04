import { formatMoney, money } from '@/lib/money';
import { formatDate, type IanaTimeZone, type UtcIso } from '@/lib/time';

/** Minor units -> "£12.50" / "Rs 1,250" in the business locale. Display only. */
export function formatMinor(amountMinor: number, currency: string, locale: string): string {
  return formatMoney(money(amountMinor, currency), locale);
}

export function formatInvoiceDate(
  instant: string | null,
  timeZone: IanaTimeZone,
  locale: string,
): string {
  return instant ? formatDate(instant as UtcIso, timeZone, locale, 'medium') : '—';
}
