import { formatMinorAsMajor } from '@/lib/money';

import {
  type AppointmentsData,
  type BranchesData,
  type ClientsData,
  type RevenueData,
  type SectionData,
  type SectionKey,
  type ServicesData,
  type StaffData,
} from './reportTypes';

/** Change from `previous` to `current` in basis points; null when there is no base to compare to. */
export function deltaBp(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000);
}

export type Trend = 'up' | 'down' | 'flat' | 'none';

export function trendOf(delta: number | null): Trend {
  if (delta === null) return 'none';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

/** 6364 -> "63.6%". Null -> "-". */
export function formatBp(bp: number | null, digits = 1): string {
  if (bp === null) return '-';
  return `${(bp / 100).toFixed(digits)}%`;
}

/** Signed change text: "+12.5%", "-3.0%", "0.0%"; null -> "-". */
export function formatDelta(delta: number | null): string {
  if (delta === null) return '-';
  const text = formatBp(Math.abs(delta));
  return delta > 0 ? `+${text}` : delta < 0 ? `-${text}` : text;
}

/** Bar width 0-100, with a visible minimum for any positive value. Negative = 0. */
export function barWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(3, Math.round((value / max) * 100));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One CSV cell. Quotes and escapes per RFC 4180, and neutralises spreadsheet
 * formulas: a text cell that starts with = + - @ (or a tab/CR) gets a leading
 * apostrophe so Excel/Sheets never runs a name like "=HYPERLINK(...)".
 * Numbers are written as numbers, untouched (a negative amount stays "-12.50").
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const major = (minor: number | null, currency: string): number | string =>
  minor === null ? '' : formatMinorAsMajor(minor, currency);

export const CSV_LABEL_KEYS = [
  'currency',
  'invoices',
  'invoiced',
  'credited',
  'tax',
  'net',
  'previousNet',
  'collected',
  'previousCollected',
  'discounts',
  'date',
  'method',
  'amount',
  'metric',
  'current',
  'previous',
  'currentRate',
  'previousRate',
  'total',
  'completed',
  'cancelled',
  'noShow',
  'staff',
  'appointments',
  'commission',
  'service',
  'booked',
  'quantity',
  'active',
  'newClients',
  'returningClients',
  'retention',
  'branch',
] as const;
export type CsvLabels = Record<(typeof CSV_LABEL_KEYS)[number], string>;

/**
 * The rows of one section as a CSV (current period; the previous period's totals
 * sit in their own column where the section has money or counts). Amounts are
 * plain major-unit numbers in the row's own currency; currencies are never added.
 * `l` holds the already-translated column names.
 */
export function sectionCsv<K extends SectionKey>(
  section: K,
  current: SectionData[K],
  previous: SectionData[K],
  l: CsvLabels,
): string {
  if (section === 'revenue') {
    const cur = current as RevenueData;
    const prev = previous as RevenueData;
    const rows: (string | number | null)[][] = [
      [
        l.currency,
        l.invoices,
        l.invoiced,
        l.credited,
        l.tax,
        l.net,
        l.previousNet,
        l.collected,
        l.previousCollected,
        l.discounts,
      ],
    ];
    for (const c of cur.currencies) {
      const p = prev.currencies.find((x) => x.currency === c.currency);
      rows.push([
        c.currency,
        c.invoiceCount,
        major(c.invoicedMinor, c.currency),
        major(c.creditedMinor, c.currency),
        major(c.taxMinor, c.currency),
        major(c.netRevenueMinor, c.currency),
        major(p?.netRevenueMinor ?? 0, c.currency),
        major(c.collectedMinor, c.currency),
        major(p?.collectedMinor ?? 0, c.currency),
        major(c.discountsMinor, c.currency),
      ]);
    }
    rows.push([]);
    rows.push([l.currency, l.date, l.net, l.collected]);
    for (const c of cur.currencies) {
      for (const d of c.daily)
        rows.push([
          c.currency,
          d.date,
          major(d.netRevenueMinor, c.currency),
          major(d.collectedMinor, c.currency),
        ]);
    }
    rows.push([]);
    rows.push([l.currency, l.method, l.amount]);
    for (const c of cur.currencies)
      for (const m of c.byMethod)
        rows.push([c.currency, m.method, major(m.amountMinor, c.currency)]);
    return toCsv(rows);
  }
  if (section === 'staff') {
    const rows: (string | number | null)[][] = [
      [
        l.staff,
        l.appointments,
        l.completed,
        l.cancelled,
        l.noShow,
        l.currency,
        l.net,
        l.commission,
      ],
    ];
    for (const s of (current as StaffData).staff) {
      const base = [
        s.staffName,
        s.appointments.total,
        s.appointments.completed,
        s.appointments.cancelled,
        s.appointments.noShow,
      ];
      if (s.money.length === 0) rows.push([...base, '', '', '']);
      for (const m of s.money) {
        rows.push([
          ...base,
          m.currency,
          major(m.netRevenueMinor, m.currency),
          major(m.commissionNetMinor, m.currency),
        ]);
      }
    }
    return toCsv(rows);
  }
  if (section === 'services') {
    const cur = current as ServicesData;
    const rows: (string | number | null)[][] = [
      [l.service, l.booked],
      ...cur.mostBooked.map((s) => [s.name, s.booked]),
    ];
    rows.push([]);
    rows.push([l.service, l.currency, l.net, l.quantity]);
    for (const s of cur.highestEarning)
      rows.push([s.name, s.currency, major(s.netMinor, s.currency), s.quantity]);
    return toCsv(rows);
  }
  if (section === 'clients') {
    const c = current as ClientsData;
    const p = previous as ClientsData;
    return toCsv([
      [l.metric, l.current, l.previous],
      [l.active, c.active, p.active],
      [l.newClients, c.new, p.new],
      [l.returningClients, c.returning, p.returning],
      [l.retention, c.retentionBp === null ? '' : c.retentionBp / 100, ''],
    ]);
  }
  if (section === 'appointments') {
    const c = current as AppointmentsData;
    const p = previous as AppointmentsData;
    const pct = (bp: number | null) => (bp === null ? '' : bp / 100);
    return toCsv([
      [l.metric, l.current, l.previous, l.currentRate, l.previousRate],
      [l.total, c.total, p.total, '', ''],
      [l.completed, c.completed, p.completed, pct(c.completedBp), pct(p.completedBp)],
      [l.cancelled, c.cancelled, p.cancelled, pct(c.cancelledBp), pct(p.cancelledBp)],
      [l.noShow, c.noShow, p.noShow, pct(c.noShowBp), pct(p.noShowBp)],
    ]);
  }
  const cur = current as BranchesData;
  const prev = previous as BranchesData;
  const rows: (string | number | null)[][] = [
    [
      l.branch,
      l.currency,
      l.invoices,
      l.net,
      l.previousNet,
      l.collected,
      l.appointments,
      l.completed,
    ],
  ];
  for (const b of cur.branches) {
    const p = prev.branches.find((x) => x.branchId === b.branchId);
    rows.push([
      b.name,
      b.currency,
      b.invoiceCount,
      major(b.netRevenueMinor, b.currency),
      major(p?.netRevenueMinor ?? null, b.currency),
      major(b.collectedMinor, b.currency),
      b.appointments?.total ?? null,
      b.appointments?.completed ?? null,
    ]);
  }
  return toCsv(rows);
}

export function csvFileName(section: string, from: string, to: string): string {
  return `report-${section}-${from}_${to}.csv`;
}
