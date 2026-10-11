/**
 * The low-stock alert email (event `low_stock`, addressed to a team member). Pure: no Deno, no I/O.
 * The payload is built by `enqueue_low_stock` in the database (migration 20261013130000):
 * `{ product, stock, threshold, unit, branch }`. English is the base and the fallback, like
 * `templates.ts` / `report.ts`; every sentence is a whole catalogue string with {placeholders}.
 */

import type { Job } from './types.ts';

export type LowStockPayload = {
  product: string;
  stock: number;
  threshold: number;
  unit: string;
  branch: string | null;
};

type Catalogue = { subject: string; intro: string; line: string; scope: string; action: string };

const en: Catalogue = {
  subject: '{business}: {product} is running low',
  intro: '{product} is running low at {business}.',
  line: 'In stock: {stock} {unit} (alert level: {threshold}).',
  scope: 'Location: {branch}',
  action: 'Open Inventory to restock it.',
};

const CATALOGUES: Record<string, Catalogue> = { en };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''));
}

export function isLowStockPayload(p: unknown): p is LowStockPayload {
  if (!p || typeof p !== 'object') return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.product === 'string' &&
    r.product !== '' &&
    typeof r.stock === 'number' &&
    typeof r.threshold === 'number' &&
    typeof r.unit === 'string'
  );
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLowStockEmail(
  job: Job,
): { subject: string; text: string; html: string } | null {
  if (!isLowStockPayload(job.payload)) return null;
  const p = job.payload;
  const primary = (job.language ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  const cat = CATALOGUES[primary] ?? en;
  const v = {
    business: job.business_name,
    product: p.product,
    stock: p.stock,
    threshold: p.threshold,
    unit: p.unit,
    branch: p.branch ?? '',
  };
  const lines = [fill(cat.intro, v), fill(cat.line, v)];
  if (p.branch) lines.push(fill(cat.scope, v));
  lines.push(cat.action);
  return {
    subject: fill(cat.subject, v),
    text: lines.join('\n\n'),
    html: lines.map((l) => `<p>${escapeText(l)}</p>`).join('\n'),
  };
}

/** Push text variables for `staff_low_stock` (the payload may be malformed: both are optional). */
export function lowStockPushVars(payload: Record<string, unknown>): {
  product: string;
  stock: string;
} {
  return {
    product: typeof payload.product === 'string' ? payload.product : '',
    stock: typeof payload.stock === 'number' ? String(payload.stock) : '',
  };
}
