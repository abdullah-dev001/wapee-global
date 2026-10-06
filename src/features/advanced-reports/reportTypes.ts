/**
 * Typed shapes of `get_advanced_report` per section, and the defensive parsers
 * that turn the jsonb into them. Money is integer minor units per CURRENCY (never
 * merged across currencies); rates are basis points (10000 = 100%), null when the
 * base is 0. A field the caller may not see arrives as null / empty and stays so.
 */

export type SectionKey = 'revenue' | 'staff' | 'services' | 'clients' | 'appointments' | 'branches';
export const SECTION_KEYS: readonly SectionKey[] = [
  'revenue',
  'staff',
  'services',
  'clients',
  'appointments',
  'branches',
];

export type DailyPoint = { date: string; netRevenueMinor: number; collectedMinor: number };
export type RevenueCurrency = {
  currency: string;
  invoiceCount: number;
  invoicedMinor: number;
  creditedMinor: number;
  taxMinor: number;
  netRevenueMinor: number;
  collectedMinor: number;
  discountsMinor: number;
  discountedLines: number;
  byMethod: { method: string; amountMinor: number }[];
  daily: DailyPoint[];
};
export type RevenueData = { currencies: RevenueCurrency[] };

export type StaffRow = {
  staffId: string;
  staffName: string;
  appointments: { total: number; completed: number; cancelled: number; noShow: number };
  money: { currency: string; netRevenueMinor: number | null; commissionNetMinor: number | null }[];
};
export type StaffData = { staff: StaffRow[] };

export type ServicesData = {
  mostBooked: { serviceId: string; name: string; booked: number }[];
  highestEarning: {
    serviceId: string;
    name: string;
    currency: string;
    netMinor: number;
    quantity: number;
  }[];
};

export type ClientsData = {
  active: number;
  new: number;
  returning: number;
  prevActive: number | null;
  retained: number | null;
  retentionBp: number | null;
};

export type AppointmentsData = {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  completedBp: number | null;
  cancelledBp: number | null;
  noShowBp: number | null;
};

export type BranchRow = {
  branchId: string;
  name: string;
  currency: string;
  archived: boolean;
  invoiceCount: number | null;
  netRevenueMinor: number | null;
  collectedMinor: number | null;
  appointments: {
    total: number;
    completed: number;
    cancelled: number;
    noShow: number;
    completedBp: number | null;
    cancelledBp: number | null;
    noShowBp: number | null;
  } | null;
};
export type BranchesData = { branches: BranchRow[] };

export type SectionData = {
  revenue: RevenueData;
  staff: StaffData;
  services: ServicesData;
  clients: ClientsData;
  appointments: AppointmentsData;
  branches: BranchesData;
};

export type ReportPeriodInfo = {
  type: string;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
};

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const appts = (v: unknown) => {
  const a = rec(v);
  return {
    total: num(a.total),
    completed: num(a.completed),
    cancelled: num(a.cancelled),
    noShow: num(a.no_show),
    completedBp: numOrNull(a.completed_bp),
    cancelledBp: numOrNull(a.cancelled_bp),
    noShowBp: numOrNull(a.no_show_bp),
  };
};

export const PARSERS: { [K in SectionKey]: (raw: unknown) => SectionData[K] } = {
  revenue: (raw) => ({
    currencies: arr(rec(raw).currencies).map((entry): RevenueCurrency => {
      const c = rec(entry);
      return {
        currency: str(c.currency),
        invoiceCount: num(c.invoice_count),
        invoicedMinor: num(c.invoiced_minor),
        creditedMinor: num(c.credited_minor),
        taxMinor: num(c.tax_minor),
        netRevenueMinor: num(c.net_revenue_minor),
        collectedMinor: num(c.collected_minor),
        discountsMinor: num(c.discounts_minor),
        discountedLines: num(c.discounted_lines),
        byMethod: arr(c.by_method).map((m) => ({
          method: str(rec(m).method),
          amountMinor: num(rec(m).amount_minor),
        })),
        daily: arr(c.daily).map((d) => ({
          date: str(rec(d).date),
          netRevenueMinor: num(rec(d).net_revenue_minor),
          collectedMinor: num(rec(d).collected_minor),
        })),
      };
    }),
  }),
  staff: (raw) => ({
    staff: arr(rec(raw).staff).map((entry): StaffRow => {
      const s = rec(entry);
      const a = rec(s.appointments);
      return {
        staffId: str(s.staff_id),
        staffName: str(s.staff_name),
        appointments: {
          total: num(a.total),
          completed: num(a.completed),
          cancelled: num(a.cancelled),
          noShow: num(a.no_show),
        },
        money: arr(s.money).map((m) => ({
          currency: str(rec(m).currency),
          netRevenueMinor: numOrNull(rec(m).net_revenue_minor),
          commissionNetMinor: numOrNull(rec(m).commission_net_minor),
        })),
      };
    }),
  }),
  services: (raw) => {
    const r = rec(raw);
    return {
      mostBooked: arr(r.most_booked).map((e) => ({
        serviceId: str(rec(e).service_id),
        name: str(rec(e).name),
        booked: num(rec(e).booked),
      })),
      highestEarning: arr(r.highest_earning).map((e) => ({
        serviceId: str(rec(e).service_id),
        name: str(rec(e).name),
        currency: str(rec(e).currency),
        netMinor: num(rec(e).net_minor),
        quantity: num(rec(e).quantity),
      })),
    };
  },
  clients: (raw) => {
    const r = rec(raw);
    return {
      active: num(r.active),
      new: num(r.new),
      returning: num(r.returning),
      prevActive: numOrNull(r.prev_active),
      retained: numOrNull(r.retained),
      retentionBp: numOrNull(r.retention_bp),
    };
  },
  appointments: (raw) => {
    const r = rec(raw);
    return {
      total: num(r.total),
      pending: num(r.pending),
      confirmed: num(r.confirmed),
      completed: num(r.completed),
      cancelled: num(r.cancelled),
      noShow: num(r.no_show),
      completedBp: numOrNull(r.completed_bp),
      cancelledBp: numOrNull(r.cancelled_bp),
      noShowBp: numOrNull(r.no_show_bp),
    };
  },
  branches: (raw) => ({
    branches: arr(rec(raw).branches).map((entry): BranchRow => {
      const b = rec(entry);
      return {
        branchId: str(b.branch_id),
        name: str(b.name),
        currency: str(b.currency),
        archived: b.archived === true,
        invoiceCount: numOrNull(b.invoice_count),
        netRevenueMinor: numOrNull(b.net_revenue_minor),
        collectedMinor: numOrNull(b.collected_minor),
        appointments: b.appointments ? appts(b.appointments) : null,
      };
    }),
  }),
};

export function parsePeriod(raw: unknown): ReportPeriodInfo {
  const p = rec(raw);
  return {
    type: str(p.type),
    from: str(p.from),
    to: str(p.to),
    prevFrom: str(p.prev_from),
    prevTo: str(p.prev_to),
  };
}
