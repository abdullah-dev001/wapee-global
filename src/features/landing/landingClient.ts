/**
 * Browser script for the static landing page (/). The build script strips the types,
 * inlines `pricingModel.ts` in place of the import and writes one classic script.
 * Keep it dependency-free: no React, no Supabase client (one GET to a public RPC).
 *
 * Prices are never in this file or the HTML: they come from `get_public_pricing()`.
 */
import type en from './i18n/en.json';
import {
  addonAvailability,
  addonOffered,
  compareRows,
  currencyDigits,
  escapeHtml,
  formatAmount,
  interpolate,
  parsePublicPricing,
  perMonthMinor,
  planChoiceHref,
  planHighlights,
  POPULAR_PLAN,
  yearlyMonthsFree,
  type DisplayFeature,
  type Period,
  type PublicPlan,
  type PublicPricing,
} from './pricingModel.ts';

type PricingStrings = (typeof en)['pricing'];

/** Written by the build script into `<script type="application/json" id="landing-config">`. */
export type LandingConfig = {
  rpcUrl: string;
  apiKey: string;
  locale: string;
  signupPath: string;
  /** Where a signed-in visitor's plan button goes (the app's Billing screen). */
  billingPath: string;
  jsonLd: Record<string, unknown>;
  strings: PricingStrings;
};

const FETCH_TIMEOUT_MS = 10_000;
const CHECK_ICON =
  '<svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function readConfig(): LandingConfig | null {
  try {
    const el = byId('landing-config');
    return el?.textContent ? (JSON.parse(el.textContent) as LandingConfig) : null;
  } catch {
    return null;
  }
}

async function fetchPricing(cfg: LandingConfig): Promise<PublicPricing> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // GET (the function is STABLE): cacheable, no body, anon key only.
    const res = await fetch(cfg.rpcUrl, {
      headers: { apikey: cfg.apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`pricing ${res.status}`);
    const parsed = parsePublicPricing(await res.json());
    if (!parsed) throw new Error('pricing payload');
    return parsed;
  } finally {
    window.clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function t(template: string, vars?: Record<string, string | number>): string {
  return escapeHtml(interpolate(template, vars));
}

function staffLine(plan: PublicPlan, s: PricingStrings): string {
  if (plan.staffCap === null) return t(s.staff.unlimited);
  if (plan.staffCap === 1) return t(s.staff.one);
  return t(s.staff.upTo, { count: plan.staffCap });
}

function locationLine(plan: PublicPlan, s: PricingStrings): string {
  if (plan.perBranch) return t(s.locations.perBranch);
  if (plan.maxBranches === 1) return t(s.locations.one);
  if (plan.maxBranches === null) return t(s.locations.perBranch);
  return t(s.locations.upTo, { count: plan.maxBranches });
}

function forLine(plan: PublicPlan, s: PricingStrings): string {
  const lines: Record<string, string> = s.for;
  return lines[plan.key] ? t(lines[plan.key] ?? '') : '';
}

function featureLabel(key: DisplayFeature, s: PricingStrings): string {
  return t(s.feature[key]);
}

function planCard(data: PublicPricing, index: number, period: Period, cfg: LandingConfig): string {
  const s = cfg.strings;
  const plan = data.plans[index];
  if (!plan) return '';
  const popular = plan.key === POPULAR_PLAN;
  const amount = formatAmount(perMonthMinor(plan, period), plan.currency, cfg.locale);
  const yearly = formatAmount(plan.annualMinor, plan.currency, cfg.locale);
  const billed =
    period === 'monthly'
      ? t(s.billedMonthly)
      : t(plan.perBranch ? s.billedYearlyPerBranch : s.billedYearly, { amount: yearly });
  const { inheritsFrom, features } = planHighlights(data.plans, index);
  const extras = data.addons
    .filter((a) => a.key in s.feature && addonOffered(a, plan))
    .map(
      (a) =>
        `<li class="addon-line">${t(s.addonFeature, { feature: interpolate(s.feature[a.key as DisplayFeature]) })}</li>`,
    );
  const checks = [
    `<li>${CHECK_ICON}<span>${staffLine(plan, s)}</span></li>`,
    `<li>${CHECK_ICON}<span>${locationLine(plan, s)}</span></li>`,
    inheritsFrom ? `<li class="inherit">${t(s.everythingIn, { plan: inheritsFrom })}</li>` : '',
    ...features.map((k) => `<li>${CHECK_ICON}<span>${featureLabel(k, s)}</span></li>`),
    ...extras,
  ].join('');
  const id = `plan-${escapeHtml(plan.key)}`;
  return `<article class="plan${popular ? ' plan-popular' : ''}" aria-labelledby="${id}">
  ${popular ? `<p class="plan-badge">${t(s.popular)}</p>` : ''}
  <h3 id="${id}" class="plan-name">${escapeHtml(plan.name)}</h3>
  <p class="plan-for">${forLine(plan, s)}</p>
  <p class="plan-price"><span class="plan-amount">${escapeHtml(amount)}</span> <span class="plan-unit">${t(plan.perBranch ? s.perBranchMonth : s.perMonth)}</span></p>
  <p class="plan-billed">${billed}</p>
  <a class="btn ${popular ? 'btn-primary' : 'btn-outline'} btn-block auth-out" href="${escapeHtml(planChoiceHref(cfg.signupPath, plan.key, period))}">${t(s.cta)}</a>
  <a class="btn ${popular ? 'btn-primary' : 'btn-outline'} btn-block auth-in" href="${escapeHtml(planChoiceHref(cfg.billingPath, plan.key, period))}">${t(s.ctaSignedIn)}</a>
  <ul class="checks">${checks}</ul>
</article>`;
}

function addonsRows(data: PublicPricing, period: Period, cfg: LandingConfig): string {
  const s = cfg.strings.addons;
  const descriptions: Record<string, string> = s.items;
  return data.addons
    .map((a) => {
      const { onlyOn, includedIn } = addonAvailability(a, data.plans);
      let where = onlyOn ? t(s.onlyOn, { plans: onlyOn.join(', ') }) : t(s.allPlans);
      if (includedIn.length > 0) where += `; ${t(s.includedIn, { plans: includedIn.join(', ') })}`;
      const price =
        period === 'monthly'
          ? t(s.perMonth, { amount: formatAmount(a.monthlyMinor, a.currency, cfg.locale) })
          : t(s.perYear, { amount: formatAmount(a.annualMinor, a.currency, cfg.locale) });
      return `<tr>
  <th scope="row" data-label="${t(s.name)}">${escapeHtml(a.name)}</th>
  <td data-label="${t(s.description)}">${descriptions[a.key] ? t(descriptions[a.key] ?? '') : ''}</td>
  <td data-label="${t(s.price)}" class="nowrap">${price}</td>
  <td data-label="${t(s.availability)}">${where}</td>
</tr>`;
    })
    .join('');
}

function compareTable(data: PublicPricing, cfg: LandingConfig): string {
  const s = cfg.strings;
  const c = s.compare;
  const cell = (v: 'yes' | 'no' | 'addon'): string =>
    v === 'yes'
      ? `<td class="cell-yes">${CHECK_ICON}<span class="sr-only">${t(c.included)}</span></td>`
      : v === 'addon'
        ? `<td class="cell-addon">${t(c.addon)}</td>`
        : `<td class="cell-no"><span aria-hidden="true">–</span><span class="sr-only">${t(c.notIncluded)}</span></td>`;
  const head = data.plans.map((p) => `<th scope="col">${escapeHtml(p.name)}</th>`).join('');
  const staff = data.plans
    .map((p) => `<td>${p.staffCap === null ? t(c.unlimited) : String(p.staffCap)}</td>`)
    .join('');
  const locations = data.plans
    .map((p) => `<td>${p.maxBranches === null ? t(c.unlimited) : String(p.maxBranches)}</td>`)
    .join('');
  const rows = compareRows(data.plans, data.addons)
    .map((r) => {
      const label = r.label ? escapeHtml(r.label) : featureLabel(r.key as DisplayFeature, s);
      return `<tr><th scope="row">${label}</th>${r.cells.map(cell).join('')}</tr>`;
    })
    .join('');
  return `<table class="compare-table">
  <caption class="sr-only">${t(c.caption)}</caption>
  <thead><tr><th scope="col">${t(c.feature)}</th>${head}</tr></thead>
  <tbody>
    <tr><th scope="row">${t(c.staff)}</th>${staff}</tr>
    <tr><th scope="row">${t(c.locations)}</th>${locations}</tr>
    ${rows}
  </tbody>
</table>`;
}

function updateJsonLd(data: PublicPricing, cfg: LandingConfig): void {
  const el = byId('ld-json');
  if (!el) return;
  const offers = data.plans.map((p) => ({
    '@type': 'Offer',
    name: p.name,
    price: (p.monthlyMinor / 10 ** currencyDigits(p.currency)).toFixed(currencyDigits(p.currency)),
    priceCurrency: p.currency,
    category: 'subscription',
  }));
  el.textContent = JSON.stringify({ ...cfg.jsonLd, offers });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function setupMenu(): void {
  const button = byId<HTMLButtonElement>('menu-button');
  const nav = byId('site-nav');
  if (!button || !nav) return;
  const set = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      set(false);
      button.focus();
    }
  });
}

function setupPricing(cfg: LandingConfig): void {
  const plansEl = byId('plans');
  const addonsEl = byId('addons-body');
  const compareEl = byId('compare');
  const errorEl = byId('pricing-error');
  const region = byId('pricing-region');
  const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-period]'));
  const saveEl = byId('yearly-save');
  let period: Period = 'monthly';
  let data: PublicPricing | null = null;

  const render = () => {
    if (!data || !plansEl) return;
    plansEl.innerHTML = data.plans
      .map((_, i) => planCard(data as PublicPricing, i, period, cfg))
      .join('');
    if (addonsEl) addonsEl.innerHTML = addonsRows(data, period, cfg);
    for (const b of toggles) b.setAttribute('aria-pressed', String(b.dataset.period === period));
  };

  const load = async () => {
    region?.setAttribute('aria-busy', 'true');
    errorEl?.setAttribute('hidden', '');
    document.body.classList.remove('pricing-failed');
    document.body.classList.add('pricing-loading');
    try {
      data = await fetchPricing(cfg);
      const free = yearlyMonthsFree(data.plans);
      if (saveEl) {
        saveEl.textContent = free ? interpolate(cfg.strings.yearlySave, { count: free }) : '';
        saveEl.hidden = !free;
      }
      render();
      if (compareEl) compareEl.innerHTML = compareTable(data, cfg);
      updateJsonLd(data, cfg);
      document.querySelector('.loading-label')?.remove();
      document.body.classList.remove('pricing-loading');
    } catch {
      document.body.classList.remove('pricing-loading');
      document.body.classList.add('pricing-failed');
      errorEl?.removeAttribute('hidden');
    } finally {
      region?.setAttribute('aria-busy', 'false');
    }
  };

  for (const b of toggles) {
    b.addEventListener('click', () => {
      const next = b.dataset.period === 'yearly' ? 'yearly' : 'monthly';
      if (next === period) return;
      period = next;
      render();
    });
  }
  byId('pricing-retry')?.addEventListener('click', () => void load());
  void load();
}

function boot(): void {
  const cfg = readConfig();
  setupMenu();
  if (cfg) setupPricing(cfg);
  else document.body.classList.add('pricing-failed');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
