import { fromE164 } from '@/config/e164';
import { DEFAULT_DIAL_CODE } from '@/config/dialCodes';

/** "+447700900123" -> "tel:+447700900123". Anything but digits after the + is dropped. */
export function telUrl(e164: string): string {
  return `tel:+${e164.replace(/\D/g, '')}`;
}

/** wa.me wants the number as digits only, no "+": "https://wa.me/447700900123". */
export function whatsappUrl(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}`;
}

export function mailtoUrl(email: string): string {
  return `mailto:${email.trim()}`;
}

/** "+447700900123" -> "+44 770 090 0123" (groups of 3; a lone last digit joins the previous group). */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith('+')) return e164;
  const { country, nationalNumber } = fromE164(e164, DEFAULT_DIAL_CODE);
  const groups: string[] = [];
  for (let i = 0; i < nationalNumber.length; i += 3) groups.push(nationalNumber.slice(i, i + 3));
  if (groups.length > 1 && (groups[groups.length - 1] as string).length === 1) {
    const last = groups.pop() as string;
    groups[groups.length - 1] += last;
  }
  return [`+${country.dialCode}`, ...groups].join(' ');
}

/**
 * What the contact block shows. `hidden`: the viewer may not see contact details (name
 * only, nothing is even requested). `missing`: allowed, but none on file. `present`.
 */
export type ContactState = 'hidden' | 'missing' | 'present';

export function contactState(canViewContact: boolean, value: string | null | undefined): ContactState {
  if (!canViewContact) return 'hidden';
  return value && value.trim() !== '' ? 'present' : 'missing';
}
