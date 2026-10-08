/**
 * Message templates. Short and plain.
 *
 * Translatable by the BUSINESS language (`businesses.language`): one catalogue per
 * language, English is the base and the fallback. Adding a language is adding a
 * catalogue below, nothing else. No sentence is built by concatenating pieces:
 * every sentence is a whole catalogue string with {placeholders}, and an optional
 * line is its own key.
 *
 * The product name never appears here: messages are from the business
 * (`business_name`). The sender display name comes from the RESEND_FROM_EMAIL secret.
 *
 * Pure: no Deno, no I/O (tested with vitest).
 */

import { lowStockPushVars, renderLowStockEmail } from './lowStock.ts';
import { renderReportEmail } from './report.ts';
import type { Job, OutboxEvent } from './types.ts';

type EmailEntry = { subject: string; lines: string[] };
type Catalogue = {
  email: Partial<Record<OutboxEvent, EmailEntry>>;
  sms: Partial<Record<OutboxEvent, string>>;
  push: Partial<Record<OutboxEvent, { title: string; body: string }>>;
  lines: {
    manage: string;
    manage_pending: string;
    review: string;
    form: string;
    portal: string;
    unsubscribe: string;
    address: string;
  };
};

const en: Catalogue = {
  email: {
    booking_confirmed: {
      subject: 'Your booking at {business} is confirmed',
      lines: ['Hi {first},', 'Your {service} at {business} is confirmed for {when}.'],
    },
    pending_received: {
      subject: 'We received your booking request',
      lines: [
        'Hi {first},',
        'We received your request for {service} at {business} on {when}. {business} will confirm it soon.',
      ],
    },
    reminder: {
      subject: 'Reminder: your {service} on {when}',
      lines: ['Hi {first},', 'A reminder of your {service} at {business} on {when}.'],
    },
    rescheduled: {
      subject: 'Your booking has a new time',
      lines: ['Hi {first},', 'Your {service} at {business} is now on {when}.'],
    },
    cancelled: {
      subject: 'Your booking was cancelled',
      lines: ['Hi {first},', 'Your {service} at {business} on {when} was cancelled.'],
    },
    manage_link: {
      subject: 'Manage your booking at {business}',
      lines: [
        'Hi {first},',
        'Here is the link to view, change or cancel your {service} on {when}.',
      ],
    },
    portal_login: {
      subject: 'Your sign-in link for {business}',
      lines: [
        'Hi {first},',
        'Use this link to sign in to your {business} account. It works once and expires in 15 minutes.',
        'If you did not ask for it, you can ignore this email: nothing will happen.',
      ],
    },
    form_request: {
      subject: 'Please complete your form for {business}',
      lines: [
        'Hi {first},',
        '{business} has asked you to complete a short form before your visit.',
      ],
    },
    review_request: {
      subject: 'How was your visit to {business}?',
      lines: [
        'Hi {first},',
        'Thank you for visiting {business}. Would you take a minute to rate your visit?',
      ],
    },
  },
  sms: {
    booking_confirmed: '{business}: your {service} is confirmed for {when}.',
    pending_received: '{business}: we got your request for {when}. We will confirm it soon.',
    reminder: '{business}: reminder, {service} on {when}.',
    rescheduled: '{business}: your booking is now on {when}.',
    cancelled: '{business}: your booking on {when} was cancelled.',
    manage_link: '{business}: manage your booking:',
    review_request: '{business}: how was your visit? Rate it:',
    form_request: '{business}: please complete your form:',
  },
  push: {
    staff_new_booking: { title: 'New booking', body: '{client} · {service} · {when}' },
    staff_pending_approval: {
      title: 'Booking needs approval',
      body: '{client} · {service} · {when}',
    },
    staff_cancelled: { title: 'Booking cancelled', body: '{client} · {service} · {when}' },
    staff_reminder: { title: 'Coming up', body: '{client} · {service} · {when}' },
    staff_low_stock: { title: 'Low stock', body: '{product} · {stock} left' },
  },
  lines: {
    manage: 'Need to change it? {url}',
    manage_pending: 'View or change your request: {url}',
    review: 'Rate your visit: {url}',
    form: 'Open the form: {url}',
    portal: 'Sign in: {url}',
    unsubscribe: 'Stop these emails: {url}',
    address: '{address}',
  },
};

const CATALOGUES: Record<string, Catalogue> = { en };

function catalogueFor(language: string | null): { cat: Catalogue; locale: string } {
  const primary = (language ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  const cat = CATALOGUES[primary];
  return cat ? { cat, locale: primary } : { cat: en, locale: 'en' };
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

export function formatWhen(iso: string | null, timeZone: string, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(date);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type Links = {
  manageUrl: string | null;
  reviewUrl: string | null;
  formUrl?: string | null;
  portalUrl?: string | null;
  unsubscribeUrl: string | null;
  oneClickUrl?: string | null;
};

function vars(job: Job, locale: string): Record<string, string> {
  return {
    business: job.business_name,
    first: job.client_first_name || '',
    client: job.client_name || '',
    service: job.service_name || '',
    when: formatWhen(job.starts_at, job.timezone, locale),
    branch: job.branch_name || '',
    address: job.branch_address || '',
    ...lowStockPushVars(job.payload),
  };
}

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderEmail(job: Job, links: Links): RenderedEmail | null {
  if (job.event === 'report_summary') return renderReportEmail(job);
  if (job.event === 'low_stock') return renderLowStockEmail(job);
  const { cat, locale } = catalogueFor(job.language);
  const entry = cat.email[job.event];
  if (!entry) return null;
  const v = vars(job, locale);
  const pending = job.event === 'rescheduled' && job.appointment_status === 'pending';

  const lines = entry.lines
    .map((l) => fill(l, v))
    .filter((l) => l.trim() !== '' && !/^Hi ,$/.test(l));
  if (job.branch_address && (job.event === 'booking_confirmed' || job.event === 'reminder')) {
    lines.push(fill(cat.lines.address, v));
  }
  if (links.manageUrl && job.event !== 'cancelled') {
    lines.push(
      fill(
        job.event === 'pending_received' || pending ? cat.lines.manage_pending : cat.lines.manage,
        { url: links.manageUrl },
      ),
    );
  }
  if (links.reviewUrl && job.event === 'review_request')
    lines.push(fill(cat.lines.review, { url: links.reviewUrl }));
  if (links.formUrl && job.event === 'form_request')
    lines.push(fill(cat.lines.form, { url: links.formUrl }));
  if (links.portalUrl && job.event === 'portal_login')
    lines.push(fill(cat.lines.portal, { url: links.portalUrl }));
  if (links.unsubscribeUrl) lines.push(fill(cat.lines.unsubscribe, { url: links.unsubscribeUrl }));

  const subject = fill(entry.subject, v);
  const text = lines.join('\n\n');
  const html = lines
    .map(
      (l) =>
        `<p>${escapeHtml(l).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`)}</p>`,
    )
    .join('\n');
  return { subject, text, html };
}

/** One short plain-text body; the link (if any) goes last. */
export function renderSms(job: Job, links: Links): string | null {
  const { cat, locale } = catalogueFor(job.language);
  const tpl = cat.sms[job.event];
  if (!tpl) return null;
  const body = fill(tpl, vars(job, locale)).replace(/\s+/g, ' ').trim();
  const url =
    job.event === 'review_request'
      ? links.reviewUrl
      : job.event === 'form_request'
        ? (links.formUrl ?? null)
        : links.manageUrl;
  return url && job.event !== 'cancelled' ? `${body} ${url}` : body;
}

/** Where tapping a web push opens. Same-origin paths only. */
const PUSH_URL: Partial<Record<OutboxEvent, string>> = {
  staff_new_booking: '/calendar',
  staff_pending_approval: '/calendar',
  staff_cancelled: '/calendar',
  staff_reminder: '/calendar',
  staff_low_stock: '/inventory',
};

export function renderPush(job: Job): { title: string; body: string; url: string } | null {
  const { cat, locale } = catalogueFor(job.language);
  const entry = cat.push[job.event];
  if (!entry) return null;
  const v = vars(job, locale);
  return {
    url: PUSH_URL[job.event] ?? '/today',
    title: fill(entry.title, v),
    body: fill(entry.body, v)
      .replace(/^\s*·\s*/, '')
      .trim(),
  };
}
