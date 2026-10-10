/** Static content sections of the landing page (everything except pricing). */
import { attr, tx, type PageContext } from './context.ts';
import { icon, type IconName } from './icons.ts';
import { heroVisual } from './heroVisual.ts';
import {
  stepManageIllustration,
  stepSetupIllustration,
  stepShareIllustration,
} from './illustrations.ts';

const check = () => icon('check', 'icon-check');

/** Stagger class for the n-th item of a revealed list (0, 90, 180, 270 ms). */
const delay = (i: number) => (i % 4 === 0 ? '' : ` reveal-d${i % 4}`);

function sectionHead(ctx: PageContext, id: string, title: string, subtitle?: string): string {
  return `<div class="section-head reveal"><h2 id="${id}">${tx(ctx, title)}</h2>${
    subtitle ? `<p>${tx(ctx, subtitle)}</p>` : ''
  }</div>`;
}

export function hero(ctx: PageContext): string {
  const h = ctx.s.hero;
  // The highlighted phrase gets the lime marker; the rest of the sentence comes from the same string.
  const title = tx(ctx, h.title, { highlight: '__HL__' }).replace(
    '__HL__',
    `<span class="marker">${tx(ctx, h.titleHighlight)}</span>`,
  );
  return `<section class="hero" aria-labelledby="hero-title">
<div class="wrap hero-grid">
  <div class="hero-copy">
    <p class="eyebrow">${tx(ctx, h.eyebrow)}</p>
    <h1 id="hero-title">${title}</h1>
    <p class="hero-sub">${tx(ctx, h.subtitle)}</p>
    <div class="hero-ctas">
      <a class="btn btn-primary btn-lg auth-out" href="${attr(ctx.paths.signup)}">${tx(ctx, h.primary)}</a>
      <a class="btn btn-primary btn-lg auth-in" href="${attr(ctx.paths.dashboard)}">${tx(ctx, h.dashboard)}</a>
      <a class="btn btn-outline btn-lg" href="#pricing">${tx(ctx, h.secondary)}</a>
    </div>
    <p class="hero-note">${tx(ctx, h.note)}</p>
  </div>
  ${heroVisual(ctx)}
</div>
</section>`;
}

const WHO: readonly { key: keyof PageContext['s']['who']['items']; icon: IconName }[] = [
  { key: 'salons', icon: 'scissors' },
  { key: 'beauty', icon: 'sparkles' },
  { key: 'clinics', icon: 'clinic' },
  { key: 'fitness', icon: 'fitness' },
  { key: 'tutoring', icon: 'tutoring' },
  { key: 'repair', icon: 'repair' },
];

export function who(ctx: PageContext): string {
  const w = ctx.s.who;
  const items = WHO.map(
    (i) =>
      `<li class="who-item reveal${delay(WHO.indexOf(i))}"><span class="icon-tile">${icon(i.icon)}</span>${tx(ctx, w.items[i.key])}</li>`,
  ).join('');
  // The product name in the closing line gets the accent highlight.
  const line = tx(ctx, w.line).replace(attr(ctx.brandName), `<mark>${attr(ctx.brandName)}</mark>`);
  return `<section class="section" aria-labelledby="who-title">
<div class="wrap">
  ${sectionHead(ctx, 'who-title', w.title)}
  <ul class="who-grid" data-motion>${items}</ul>
  <p class="who-line reveal">${line}</p>
</div>
</section>`;
}

export function how(ctx: PageContext): string {
  const h = ctx.s.how;
  const steps = [
    { s: h.steps.setup, art: stepSetupIllustration() },
    { s: h.steps.share, art: stepShareIllustration() },
    { s: h.steps.manage, art: stepManageIllustration() },
  ]
    .map(
      (step, i) => `<li class="card reveal${delay(i)}">
  <div class="step-art">${step.art}</div>
  <p class="step-num">${tx(ctx, h.step, { n: i + 1 })}</p>
  <h3>${tx(ctx, step.s.title)}</h3>
  <p>${tx(ctx, step.s.body)}</p>
</li>`,
    )
    .join('');
  return `<section id="how" class="section section-alt" aria-labelledby="how-title">
<div class="wrap">
  ${sectionHead(ctx, 'how-title', h.title, h.subtitle)}
  <ol class="steps grid grid-3" data-motion>${steps}</ol>
</div>
</section>`;
}

const FEATURES: readonly { key: keyof PageContext['s']['features']['items']; icon: IconName }[] = [
  { key: 'booking', icon: 'booking' },
  { key: 'calendar', icon: 'calendar' },
  { key: 'clients', icon: 'clients' },
  { key: 'invoices', icon: 'invoice' },
  { key: 'reports', icon: 'reports' },
  { key: 'website', icon: 'website' },
  { key: 'team', icon: 'team' },
  { key: 'app', icon: 'phone' },
];

export function features(ctx: PageContext): string {
  const f = ctx.s.features;
  const p = f.promise;
  const cards = FEATURES.map(
    (i, n) => `<li class="card reveal${delay(n)}">
  <span class="icon-tile">${icon(i.icon)}</span>
  <h3>${tx(ctx, f.items[i.key].title)}</h3>
  <p>${tx(ctx, f.items[i.key].body)}</p>
</li>`,
  ).join('');
  return `<section id="features" class="section" aria-labelledby="features-title">
<div class="wrap">
  ${sectionHead(ctx, 'features-title', f.title, f.subtitle)}
  <ul class="grid grid-4 plain-list" data-motion>${cards}</ul>
  <p class="addons-note reveal">${tx(ctx, f.addons)} <a href="#pricing-addons">${tx(ctx, f.addonsLink)}</a></p>
  <ul class="promises reveal">
    <li>${check()}${tx(ctx, p.commission)}</li>
    <li>${check()}${tx(ctx, p.isolated)}</li>
  </ul>
</div>
</section>`;
}

export function faq(ctx: PageContext): string {
  const q = ctx.s.faq;
  const items = Object.values(q.items)
    .map(
      (item, i) => `<details class="reveal${delay(i)}">
  <summary>${tx(ctx, item.q)}${icon('chevron')}</summary>
  <p>${tx(ctx, item.a)}</p>
</details>`,
    )
    .join('');
  return `<section id="faq" class="section" aria-labelledby="faq-title">
<div class="wrap">
  ${sectionHead(ctx, 'faq-title', q.title)}
  <div class="faq">${items}</div>
</div>
</section>`;
}

export function ctaBand(ctx: PageContext): string {
  const c = ctx.s.cta;
  return `<section class="section cta-section" aria-labelledby="cta-title">
<div class="wrap">
  <div class="cta-band reveal" data-motion>
    <span class="cta-shape cta-shape-1" aria-hidden="true"></span>
    <span class="cta-shape cta-shape-2" aria-hidden="true"></span>
    <span class="cta-shape cta-shape-3" aria-hidden="true"></span>
    <h2 id="cta-title">${tx(ctx, c.title)}</h2>
    <p>${tx(ctx, c.body)}</p>
    <div class="hero-ctas">
      <a class="btn btn-accent btn-lg auth-out" href="${attr(ctx.paths.signup)}">${tx(ctx, c.primary)}</a>
      <a class="btn btn-accent btn-lg auth-in" href="${attr(ctx.paths.dashboard)}">${tx(ctx, c.dashboard)}</a>
      <a class="btn btn-outline btn-lg" href="${attr(ctx.paths.login)}">${tx(ctx, c.secondary)}</a>
    </div>
  </div>
</div>
</section>`;
}
