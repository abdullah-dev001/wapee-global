/** Static content sections of the landing page (everything except pricing). */
import { attr, tx, type PageContext } from './context.ts';
import { icon, type IconName } from './icons.ts';
import {
  heroIllustration,
  stepManageIllustration,
  stepSetupIllustration,
  stepShareIllustration,
} from './illustrations.ts';

const check = () => icon('check', 'icon-check');

function sectionHead(ctx: PageContext, id: string, title: string, subtitle?: string): string {
  return `<div class="section-head"><h2 id="${id}">${tx(ctx, title)}</h2>${
    subtitle ? `<p>${tx(ctx, subtitle)}</p>` : ''
  }</div>`;
}

export function hero(ctx: PageContext): string {
  const h = ctx.s.hero;
  const p = ctx.s.features.promise;
  return `<section class="hero" aria-labelledby="hero-title">
<div class="wrap hero-grid">
  <div>
    <p class="eyebrow">${tx(ctx, h.eyebrow)}</p>
    <h1 id="hero-title">${tx(ctx, h.title)}</h1>
    <p class="hero-sub">${tx(ctx, h.subtitle)}</p>
    <div class="hero-ctas">
      <a class="btn btn-primary btn-lg" href="${attr(ctx.paths.signup)}">${tx(ctx, h.primary)}</a>
      <a class="btn btn-outline btn-lg" href="#pricing">${tx(ctx, h.secondary)}</a>
    </div>
    <p class="hero-note">${tx(ctx, h.note)}</p>
    <ul class="promises">
      <li>${check()}${tx(ctx, p.commission)}</li>
      <li>${check()}${tx(ctx, p.isolated)}</li>
    </ul>
  </div>
  <div class="hero-art" role="img" aria-label="${tx(ctx, h.illustration)}">${heroIllustration()}</div>
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
      `<li class="who-item"><span class="icon-tile">${icon(i.icon)}</span>${tx(ctx, w.items[i.key])}</li>`,
  ).join('');
  // The product name in the closing line gets the accent highlight.
  const line = tx(ctx, w.line).replace(attr(ctx.brandName), `<mark>${attr(ctx.brandName)}</mark>`);
  return `<section class="section" aria-labelledby="who-title">
<div class="wrap">
  ${sectionHead(ctx, 'who-title', w.title)}
  <ul class="who-grid">${items}</ul>
  <p class="who-line">${line}</p>
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
      (step, i) => `<li class="card">
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
  <ol class="steps grid grid-3">${steps}</ol>
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
  const cards = FEATURES.map(
    (i) => `<li class="card">
  <span class="icon-tile">${icon(i.icon)}</span>
  <h3>${tx(ctx, f.items[i.key].title)}</h3>
  <p>${tx(ctx, f.items[i.key].body)}</p>
</li>`,
  ).join('');
  return `<section id="features" class="section" aria-labelledby="features-title">
<div class="wrap">
  ${sectionHead(ctx, 'features-title', f.title, f.subtitle)}
  <ul class="grid grid-4 plain-list">${cards}</ul>
  <p class="addons-note">${tx(ctx, f.addons)} <a href="#pricing-addons">${tx(ctx, f.addonsLink)}</a></p>
</div>
</section>`;
}

export function faq(ctx: PageContext): string {
  const q = ctx.s.faq;
  const items = Object.values(q.items)
    .map(
      (item) => `<details>
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
  <div class="cta-band">
    <h2 id="cta-title">${tx(ctx, c.title)}</h2>
    <p>${tx(ctx, c.body)}</p>
    <div class="hero-ctas">
      <a class="btn btn-accent btn-lg" href="${attr(ctx.paths.signup)}">${tx(ctx, c.primary)}</a>
      <a class="btn btn-outline btn-lg" href="${attr(ctx.paths.login)}">${tx(ctx, c.secondary)}</a>
    </div>
  </div>
</div>
</section>`;
}
