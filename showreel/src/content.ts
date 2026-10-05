import { Palette, Scissors, Sparkles, type LucideIcon } from 'lucide-react';

/**
 * One consistent story: Sara books a haircut with Amira at Studio Nova, and the same
 * booking reappears in the calendar, notifications, invoice, review and website.
 */
export const BUSINESS = {
  name: 'Studio Nova',
  initials: 'SN',
  area: 'Camden',
  slug: 'studio-nova',
  blurb: 'Hair, beard and colour in Camden. Open six days a week.',
  owner: { name: 'Nadia Rahman', initials: 'NR' },
} as const;

export type Service = { name: string; minutes: number; priceMinor: number; Icon: LucideIcon };

export const SERVICES: Service[] = [
  { name: 'Haircut & style', minutes: 45, priceMinor: 4500, Icon: Scissors },
  { name: 'Beard trim', minutes: 20, priceMinor: 2000, Icon: Sparkles },
  { name: 'Colour & gloss', minutes: 90, priceMinor: 9500, Icon: Palette },
];

export const STAFF = ['Amira', 'Daniel', 'Mei'] as const;

export const CLIENT = {
  name: 'Sara Khan',
  short: 'Sara K.',
  first: 'Sara',
  initials: 'SK',
  dial: '+44',
  phone: '7700 900 123',
  email: 'sara.khan@mail.com',
  visits: 12,
  note: 'Prefers a quiet chair by the window. Patch test before any colour.',
} as const;

/** What the owner types in the client search. */
export const SEARCH_QUERY = 'Sar';

export const BOOKING = {
  service: SERVICES[0],
  staff: 'Amira',
  weekday: 'Tue',
  date: '14 Oct',
  dateLong: 'Tuesday, 14 October',
  time: '10:30',
  /** Hours after the calendar's first row (9:00). */
  calendarStart: 1.5,
} as const;

export const BOOKING_LINE = `${BOOKING.weekday} ${BOOKING.date} · ${BOOKING.time} · ${BOOKING.service.name} with ${BOOKING.staff}`;

export const INVOICE = {
  number: 'INV-0042',
  date: '14 Oct 2026',
  vatRate: 0.2,
  lines: [
    { name: BOOKING.service.name, detail: `${BOOKING.staff} · ${BOOKING.service.minutes} min`, minor: BOOKING.service.priceMinor },
    { name: 'Repair hair mask', detail: 'Product', minor: 2000 },
  ],
  paidNote: 'Paid by card in store · 14 Oct',
} as const;

export const REVIEW = {
  stars: 5,
  when: '2 days ago',
  text: 'Booked in seconds, and Amira remembered exactly how I like it.',
  reply: 'Thank you, Sara! See you in six weeks.',
} as const;

export const PACKAGE = {
  name: 'Blow-dry package',
  sessions: 6,
  expires: 'Expires 14 Apr 2027',
  log: [
    { date: 'Tue 14 Oct', staff: 'Amira' },
    { date: 'Tue 21 Oct', staff: 'Amira' },
  ],
} as const;
