import { describe, expect, it } from 'vitest';

import { mapInvoiceDetail } from './mappers';
import { mapReport } from './reportMapper';

describe('mapInvoiceDetail', () => {
  const raw = {
    ok: true,
    invoice: {
      id: 'i1',
      status: 'issued',
      number: 'MAI-000001',
      currency: 'GBP',
      issued_at: '2026-10-05T10:00:00Z',
      created_at: '2026-10-05T09:00:00Z',
      notes: null,
      bill_to_name: 'Ada',
      appointment_id: null,
      tax_rate_bp: 2000,
      tax_number: 'GB1',
      subtotal_minor: 3000,
      discount_minor: 0,
      net_minor: 3000,
      tax_minor: 600,
      total_minor: 3600,
      paid_minor: 1000,
      credited_minor: 0,
      net_due_minor: 3600,
      balance_minor: 2600,
      refund_due_minor: 0,
      payment_status: 'partial',
    },
    items: [
      {
        id: 'a',
        service_id: null,
        description: 'Cut',
        quantity: 1,
        unit_price_minor: 3000,
        discount_minor: 0,
        discount_reason: null,
        line_net_minor: 3000,
      },
    ],
    payments: [
      {
        id: 'p',
        kind: 'payment',
        method: 'cash',
        amount_minor: 1000,
        paid_at: '2026-10-05T10:05:00Z',
        reverses_payment_id: null,
        reason: null,
        note: null,
      },
    ],
    credit_notes: [],
    branch: {
      name: 'Main',
      address: null,
      phone: null,
      country_code: 'GB',
      timezone: 'Europe/London',
      currency: 'GBP',
    },
    business: { name: 'Shot' },
    client: null,
  };
  it('maps money, state and children to camelCase', () => {
    const d = mapInvoiceDetail(raw);
    expect(d).toMatchObject({
      number: 'MAI-000001',
      totalMinor: 3600,
      balanceMinor: 2600,
      paymentStatus: 'partial',
      businessName: 'Shot',
      client: null,
    });
    expect(d.items[0]).toMatchObject({ description: 'Cut', lineNetMinor: 3000 });
    expect(d.payments[0]).toMatchObject({ kind: 'payment', method: 'cash', amountMinor: 1000 });
    expect(d.branch.timezone).toBe('Europe/London');
  });
});

describe('mapReport', () => {
  it('keeps revenue per currency and passes withheld sections through as null', () => {
    const r = mapReport({
      ok: true,
      branches: [{ branch_id: 'b', name: 'Main', timezone: 'UTC', currency: 'GBP' }],
      revenue: {
        today: [
          {
            currency: 'PKR',
            invoice_count: 1,
            invoiced_minor: 100,
            credited_minor: 0,
            tax_minor: 0,
            net_revenue_minor: 100,
            collected_minor: 0,
          },
          {
            currency: 'GBP',
            invoice_count: 2,
            invoiced_minor: 240,
            credited_minor: 0,
            tax_minor: 40,
            net_revenue_minor: 200,
            collected_minor: 240,
          },
        ],
        month: [],
      },
      appointments: { today: { total: 3, completed: 2, cancelled: 1 }, month: { total: 0 } },
      top_services: {
        today: [{ service_id: 's', name: 'Cut', completed_appointments: 2, revenue: null }],
        month: [],
      },
    });
    expect(r.today.revenue?.map((x) => x.currency)).toEqual(['PKR', 'GBP']);
    expect(r.today.revenue?.[1]).toMatchObject({
      invoiceCount: 2,
      netRevenueMinor: 200,
      collectedMinor: 240,
    });
    expect(r.today.appointments).toMatchObject({ total: 3, completed: 2 });
    expect(r.today.topServices?.[0]?.revenue).toBeNull();
    expect(r.month.revenue).toEqual([]);
  });
  it('a caller without reports.view_revenue gets revenue null', () => {
    const r = mapReport({
      ok: true,
      branches: [],
      revenue: null,
      appointments: { today: { total: 1 }, month: { total: 1 } },
      top_services: { today: [], month: [] },
    });
    expect(r.today.revenue).toBeNull();
    expect(r.today.appointments).toEqual({ total: 1 });
  });
});
