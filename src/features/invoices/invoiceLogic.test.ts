import { describe, expect, it } from 'vitest';

import {
  actionsForInvoice,
  barPercent,
  canReversePayment,
  computeDraftTotals,
  creditableNetMinor,
  invoiceStateKey,
  invoiceStateTone,
  reversibleMinor,
  sortByCurrency,
  statusCountRows,
} from './invoiceLogic';

const all = { canView: true, canCreate: true, canCreditNote: true };
const recep = { canView: true, canCreate: true, canCreditNote: false };
const none = { canView: false, canCreate: false, canCreditNote: false };

describe('computeDraftTotals (mirrors invoice_totals)', () => {
  it('tax-exclusive: total = net + tax', () => {
    expect(
      computeDraftTotals(
        [
          { quantity: 2, unitPriceMinor: 2500, discountMinor: 0 },
          { quantity: 1, unitPriceMinor: 4000, discountMinor: 0 },
        ],
        2000,
      ),
    ).toEqual({
      subtotalMinor: 9000,
      discountMinor: 0,
      netMinor: 9000,
      taxMinor: 1800,
      totalMinor: 10800,
    });
  });

  it('rounds half-up like the server: net 1003 at 20% -> 201, net 1001 -> 200', () => {
    expect(
      computeDraftTotals([{ quantity: 1, unitPriceMinor: 1003, discountMinor: 0 }], 2000).taxMinor,
    ).toBe(201);
    expect(
      computeDraftTotals([{ quantity: 1, unitPriceMinor: 1001, discountMinor: 0 }], 2000).taxMinor,
    ).toBe(200);
  });

  it('exact half rounds up: net 4 at 12.5% -> 1', () => {
    expect(
      computeDraftTotals([{ quantity: 1, unitPriceMinor: 4, discountMinor: 0 }], 1250).taxMinor,
    ).toBe(1);
  });

  it('taxes the net AFTER discounts, once on the invoice', () => {
    const totals = computeDraftTotals(
      [{ quantity: 1, unitPriceMinor: 2003, discountMinor: 1000 }],
      2000,
    );
    expect(totals).toMatchObject({
      subtotalMinor: 2003,
      discountMinor: 1000,
      netMinor: 1003,
      taxMinor: 201,
      totalMinor: 1204,
    });
  });

  it('zero rate and empty lines', () => {
    expect(computeDraftTotals([], 2000).totalMinor).toBe(0);
    expect(
      computeDraftTotals([{ quantity: 3, unitPriceMinor: 100, discountMinor: 0 }], 0).totalMinor,
    ).toBe(300);
  });
});

describe('actionsForInvoice', () => {
  const draft = { status: 'draft' as const, paymentStatus: null, balanceMinor: 0, netMinor: 100 };
  const pending = {
    status: 'issued' as const,
    paymentStatus: 'pending' as const,
    balanceMinor: 100,
    netMinor: 100,
  };
  const paid = { ...pending, paymentStatus: 'paid' as const, balanceMinor: 0 };
  const credited = { ...pending, paymentStatus: 'credited' as const, balanceMinor: 0 };

  it('a draft is editable, issuable and discardable; never payable', () => {
    expect(actionsForInvoice(draft, all)).toEqual(['edit', 'issue', 'discard', 'print']);
  });
  it('an issued invoice is immutable: no edit/discard/issue', () => {
    const actions = actionsForInvoice(pending, all);
    expect(actions).not.toContain('edit');
    expect(actions).not.toContain('discard');
    expect(actions).not.toContain('issue');
  });
  it('receptionist: payment yes, credit note no', () => {
    expect(actionsForInvoice(pending, recep)).toEqual(['addPayment', 'print']);
  });
  it('manager/owner: payment and credit note', () => {
    expect(actionsForInvoice(pending, all)).toEqual(['addPayment', 'creditNote', 'print']);
  });
  it('a paid invoice takes no payment but can still be credited', () => {
    expect(actionsForInvoice(paid, all)).toEqual(['creditNote', 'print']);
  });
  it('a fully credited invoice offers neither', () => {
    expect(actionsForInvoice(credited, all)).toEqual(['print']);
  });
  it('no permissions: nothing at all', () => {
    expect(actionsForInvoice(draft, none)).toEqual([]);
    expect(actionsForInvoice(pending, none)).toEqual([]);
  });
});

describe('payment reversal', () => {
  const p1 = { id: 'p1', kind: 'payment' as const, amountMinor: 1000, reversesPaymentId: null };
  const r1 = { id: 'r1', kind: 'reversal' as const, amountMinor: 400, reversesPaymentId: 'p1' };
  it('reversible = amount minus earlier reversals', () => {
    expect(reversibleMinor(p1, [p1])).toBe(1000);
    expect(reversibleMinor(p1, [p1, r1])).toBe(600);
  });
  it('a reversal row itself is never reversible', () => {
    expect(reversibleMinor(r1, [p1, r1])).toBe(0);
  });
  it('needs invoices.credit_note and something left', () => {
    expect(canReversePayment(p1, [p1], all)).toBe(true);
    expect(canReversePayment(p1, [p1], recep)).toBe(false);
    expect(canReversePayment(p1, [p1, { ...r1, amountMinor: 1000 }], all)).toBe(false);
  });
});

describe('credits and state', () => {
  it('creditable net', () => {
    expect(creditableNetMinor(3000, [{ netMinor: 1000 }])).toBe(2000);
    expect(creditableNetMinor(3000, [{ netMinor: 3000 }])).toBe(0);
  });
  it('one state to show', () => {
    expect(invoiceStateKey('draft', null)).toBe('draft');
    expect(invoiceStateKey('issued', 'partial')).toBe('partial');
    expect(invoiceStateTone('issued', 'paid')).toBe('success');
    expect(invoiceStateTone('draft', null)).toBe('neutral');
    expect(invoiceStateTone('issued', 'credited')).toBe('info');
  });
});

describe('report formatting helpers', () => {
  it('currencies sorted, never merged', () => {
    const rows = sortByCurrency([
      { currency: 'PKR', n: 1 },
      { currency: 'GBP', n: 2 },
    ]);
    expect(rows.map((r) => r.currency)).toEqual(['GBP', 'PKR']);
    expect(rows).toHaveLength(2);
  });
  it('status counts in fixed order with zeros', () => {
    expect(statusCountRows({ completed: 3, cancelled: 1, total: 4 })).toEqual([
      { status: 'completed', count: 3 },
      { status: 'confirmed', count: 0 },
      { status: 'pending', count: 0 },
      { status: 'cancelled', count: 1 },
      { status: 'no_show', count: 0 },
    ]);
    expect(statusCountRows(null).every((r) => r.count === 0)).toBe(true);
  });
  it('bar percent', () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(1, 1000)).toBe(4);
    expect(barPercent(3, 0)).toBe(0);
  });
});
