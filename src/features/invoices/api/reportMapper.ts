import { type Raw } from './mappers';

export type ReportPeriod = 'today' | 'month';

export type RevenueRow = {
  currency: string;
  invoiceCount: number;
  invoicedMinor: number;
  creditedMinor: number;
  taxMinor: number;
  netRevenueMinor: number;
  collectedMinor: number;
};

export type TopService = {
  serviceId: string;
  name: string;
  completedAppointments: number;
  /** Null when the caller lacks `reports.view_revenue`. */
  revenue: { currency: string; netMinor: number }[] | null;
};

export type PeriodReport = {
  /** Null without `reports.view_revenue`. */
  revenue: RevenueRow[] | null;
  /** Null without `reports.view_basic`. */
  appointments: Record<string, number> | null;
  topServices: TopService[] | null;
};

export type BasicReport = {
  branches: { branchId: string; name: string; timezone: string; currency: string }[];
  today: PeriodReport;
  month: PeriodReport;
};

function mapRevenue(rows: Raw[] | undefined): RevenueRow[] {
  return (rows ?? []).map((r) => ({
    currency: String(r.currency),
    invoiceCount: Number(r.invoice_count ?? 0),
    invoicedMinor: Number(r.invoiced_minor ?? 0),
    creditedMinor: Number(r.credited_minor ?? 0),
    taxMinor: Number(r.tax_minor ?? 0),
    netRevenueMinor: Number(r.net_revenue_minor ?? 0),
    collectedMinor: Number(r.collected_minor ?? 0),
  }));
}

function mapTop(rows: Raw[] | undefined): TopService[] {
  return (rows ?? []).map((r) => ({
    serviceId: String(r.service_id),
    name: String(r.name),
    completedAppointments: Number(r.completed_appointments ?? 0),
    revenue: Array.isArray(r.revenue)
      ? (r.revenue as Raw[]).map((x) => ({
          currency: String(x.currency),
          netMinor: Number(x.net_minor ?? 0),
        }))
      : null,
  }));
}

export function mapReport(result: Raw): BasicReport {
  const revenue = result.revenue as Record<ReportPeriod, Raw[]> | null;
  const appointments = result.appointments as Record<ReportPeriod, Record<string, number>> | null;
  const top = result.top_services as Record<ReportPeriod, Raw[]> | null;
  const period = (key: ReportPeriod): PeriodReport => ({
    revenue: revenue ? mapRevenue(revenue[key]) : null,
    appointments: appointments ? (appointments[key] ?? { total: 0 }) : null,
    topServices: top ? mapTop(top[key]) : null,
  });
  return {
    branches: ((result.branches as Raw[]) ?? []).map((b) => ({
      branchId: String(b.branch_id),
      name: String(b.name),
      timezone: String(b.timezone),
      currency: String(b.currency),
    })),
    today: period('today'),
    month: period('month'),
  };
}
