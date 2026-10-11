/**
 * The scheduled report summary email (event `report_summary`). Pure: no Deno,
 * no I/O. The payload is built by `enqueue_due_report_summaries_at` in the
 * database (migration 20261011130000): dates are LOCAL dates, money is integer
 * minor units per currency (never summed across currencies), rates are basis
 * points. Revenue is `null` for a recipient without `reports.view_revenue`.
 *
 * English is the base and the fallback (same rule as `templates.ts`); every
 * sentence is a whole catalogue string with {placeholders}.
 */

import type { Job } from './types.ts';

type Rev = {
  currency: string;
  net_revenue_minor: number;
  collected_minor: number;
  invoice_count: number;
  discounts_minor: number;
  prev_net_revenue_minor: number;
  prev_collected_minor: number;
};

type Appts = {
  total: number;
  completed: number;
  cancelled: number;
  no_show: number;
  completed_bp: number | null;
  cancelled_bp: number | null;
  no_show_bp: number | null;
  prev_total: number;
  prev_completed: number;
};

export type ReportPayload = {
  frequency: 'weekly' | 'monthly';
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  scope_branch: string | null;
  appointments: Appts;
  revenue: Rev[] | null;
};

type Catalogue = {
  subject: Record<ReportPayload['frequency'], string>;
  intro: Record<ReportPayload['frequency'], string>;
  scope: string;
  revenue: string;
  collected: string;
  invoices: string;
  discounts: string;
  appointments: string;
  rates: string;
  none: string;
};

const en: Catalogue = {
  subject: {
    weekly: '{business}: your weekly summary, {range}',
    monthly: '{business}: your monthly summary, {range}',
  },
  intro: {
    weekly: 'Here is the weekly summary for {business}, {range}.',
    monthly: 'Here is the monthly summary for {business}, {range}.',
  },
  scope: 'Location: {branch}',
  revenue: 'Revenue ({currency}, before tax): {value} (previous period: {prev})',
  collected: 'Collected ({currency}): {value} (previous period: {prev})',
  invoices: 'Invoices issued ({currency}): {count}',
  discounts: 'Discounts given ({currency}): {value}',
  appointments: 'Appointments: {total} (previous period: {prev})',
  rates: 'Completed {completed}, cancelled {cancelled}, no-show {noShow}.',
  none: 'No activity in this period.',
};

const CATALOGUES: Record<string, Catalogue> = { en };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''));
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

/** Integer minor units -> "£1,234.50". PKR/JPY have no minor unit, KWD has three. */
export function formatMinor(minor: number, currency: string, locale: string): string {
  try {
    const nf = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
    return nf.format(minor / 10 ** digits);
  } catch {
    return `${minor} ${currency}`;
  }
}

function pct(bp: number | null): string {
  return bp === null || bp === undefined ? '-' : `${(bp / 100).toFixed(1)}%`;
}

export function isReportPayload(p: unknown): p is ReportPayload {
  if (!p || typeof p !== 'object') return false;
  const r = p as Record<string, unknown>;
  return (
    (r.frequency === 'weekly' || r.frequency === 'monthly') &&
    typeof r.from === 'string' &&
    typeof r.to === 'string' &&
    !!r.appointments &&
    typeof r.appointments === 'object'
  );
}

export function renderReportEmail(
  job: Job,
): { subject: string; text: string; html: string } | null {
  if (!isReportPayload(job.payload)) return null;
  const p = job.payload;
  const primary = (job.language ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  const cat = CATALOGUES[primary] ?? en;
  const locale = CATALOGUES[primary] ? primary : 'en';
  const range = `${fmtDate(p.from, locale)} - ${fmtDate(p.to, locale)}`;
  const v = { business: job.business_name, range };

  const lines: string[] = [fill(cat.intro[p.frequency], v)];
  if (p.scope_branch) lines.push(fill(cat.scope, { branch: p.scope_branch }));

  for (const r of p.revenue ?? []) {
    lines.push(
      fill(cat.revenue, {
        currency: r.currency,
        value: formatMinor(r.net_revenue_minor, r.currency, locale),
        prev: formatMinor(r.prev_net_revenue_minor, r.currency, locale),
      }),
      fill(cat.collected, {
        currency: r.currency,
        value: formatMinor(r.collected_minor, r.currency, locale),
        prev: formatMinor(r.prev_collected_minor, r.currency, locale),
      }),
      fill(cat.invoices, { currency: r.currency, count: r.invoice_count }),
    );
    if (r.discounts_minor > 0) {
      lines.push(
        fill(cat.discounts, {
          currency: r.currency,
          value: formatMinor(r.discounts_minor, r.currency, locale),
        }),
      );
    }
  }

  const a = p.appointments;
  lines.push(fill(cat.appointments, { total: a.total, prev: a.prev_total }));
  if (a.total > 0) {
    lines.push(
      fill(cat.rates, {
        completed: pct(a.completed_bp),
        cancelled: pct(a.cancelled_bp),
        noShow: pct(a.no_show_bp),
      }),
    );
  } else if ((p.revenue ?? []).length === 0) {
    lines.push(cat.none);
  }

  const escape = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return {
    subject: fill(cat.subject[p.frequency], v),
    text: lines.join('\n\n'),
    html: lines.map((l) => `<p>${escape(l)}</p>`).join('\n'),
  };
}
