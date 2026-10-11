/**
 * The pricing section SHELL: toggle, skeletons, error box and empty tables. It holds
 * no price at all; `landingClient.ts` fills it from `get_public_pricing()`.
 */
import { attr, tx, type PageContext } from './context.ts';

const SKELETON_PLANS = 3;
const SKELETON_ROWS = 4;

function planSkeleton(): string {
  return `<div class="plan plan-skeleton" aria-hidden="true">
  <div class="skeleton sk-title"></div><div class="skeleton sk-line"></div>
  <div class="skeleton sk-price"></div><div class="skeleton sk-btn"></div>
  <div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div>
</div>`;
}

function rowSkeleton(cols: number): string {
  const cells = Array.from(
    { length: cols },
    () => '<td><div class="skeleton sk-line"></div></td>',
  ).join('');
  return `<tr class="sk-row" aria-hidden="true">${cells}</tr>`;
}

export function pricing(ctx: PageContext): string {
  const p = ctx.s.pricing;
  const a = p.addons;
  const email = `<a href="mailto:${attr(ctx.supportEmail)}">${attr(ctx.supportEmail)}</a>`;
  const plansSkeleton = Array.from({ length: SKELETON_PLANS }, planSkeleton).join('');
  const addonSkeleton = Array.from({ length: SKELETON_ROWS }, () => rowSkeleton(4)).join('');
  const compareSkeleton = `<table class="compare-table" aria-hidden="true"><tbody>${Array.from(
    { length: SKELETON_ROWS },
    () => rowSkeleton(4),
  ).join('')}</tbody></table>`;
  return `<section id="pricing" class="section section-alt" aria-labelledby="pricing-title">
<div class="wrap">
  <div class="section-head"><h2 id="pricing-title">${tx(ctx, p.title)}</h2><p>${tx(ctx, p.subtitle)}</p></div>
  <div class="toggle-row">
    <div class="toggle" role="group" aria-label="${tx(ctx, p.billing)}">
      <button type="button" data-period="monthly" aria-pressed="true">${tx(ctx, p.monthly)}</button>
      <button type="button" data-period="yearly" aria-pressed="false">${tx(ctx, p.yearly)} <span class="save" id="yearly-save" hidden></span></button>
    </div>
  </div>
  <div id="pricing-error" class="pricing-error" role="alert" hidden>
    <p><strong>${tx(ctx, p.error)}</strong></p>
    <p>${tx(ctx, p.errorHelp, { email: '__EMAIL__' }).replace('__EMAIL__', email)}</p>
    <button class="btn btn-primary" id="pricing-retry" type="button">${tx(ctx, p.retry)}</button>
  </div>
  <noscript><div class="pricing-error"><p>${tx(ctx, p.errorHelp, { email: '__EMAIL__' }).replace('__EMAIL__', email)}</p></div></noscript>
  <div id="pricing-region" aria-live="polite" aria-busy="true">
    <p class="sr-only loading-label">${tx(ctx, p.loading)}</p>
    <div class="plans" id="plans">${plansSkeleton}</div>
  </div>
  <p class="fineprint">${tx(ctx, p.fineprint)}</p>

  <div class="price-dependent">
    <h3 class="subhead" id="pricing-addons">${tx(ctx, a.title)}</h3>
    <p>${tx(ctx, a.subtitle)}</p>
    <div class="table-wrap">
      <table class="addons-table">
        <caption class="sr-only">${tx(ctx, a.title)}</caption>
        <thead><tr>
          <th scope="col">${tx(ctx, a.name)}</th><th scope="col">${tx(ctx, a.description)}</th>
          <th scope="col">${tx(ctx, a.price)}</th><th scope="col">${tx(ctx, a.availability)}</th>
        </tr></thead>
        <tbody id="addons-body">${addonSkeleton}</tbody>
      </table>
    </div>

    <h3 class="subhead" id="compare-title">${tx(ctx, p.compare.title)}</h3>
    <p>${tx(ctx, p.compare.caption)}</p>
    <div class="table-wrap" id="compare" role="region" aria-labelledby="compare-title" tabindex="0">${compareSkeleton}</div>
  </div>
</div>
</section>`;
}
