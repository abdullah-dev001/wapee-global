/**
 * Hero product visual: HTML + CSS + a little inline SVG, no images. A phone books a
 * haircut (service, slots appear, one is selected, "Booked" with a drawn check) while
 * the appointment slides into a team calendar and two small cards pop in.
 *
 * Motion rules: only transform and opacity; one 8 s loop that rests on the final
 * frame. The BASE styles are the final frame, so reduced-motion users (and any
 * browser without animations) see the finished picture. Labels are sample text.
 */
import { colors } from '../../../lib/theme/colors.ts';
import { shadowLevels } from '../../../lib/theme/shadowLevels.ts';
import { radius, spacing } from '../../../lib/theme/tokens.ts';
import { fontSize } from '../../../lib/theme/typography.ts';
import { attr, tx, type PageContext } from './context.ts';

const px = (n: number) => `${n}px`;
/** Loop length; every keyframe below is a share of it. */
const LOOP_S = 8;
/** Index of the slot that gets selected (10:30). */
const PICKED = 2;

const checkSvg = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5 10 17.5 19 7.5"/><rect class="hv-check-cover" x="0" y="0" width="24" height="24"/></svg>`;

function phone(ctx: PageContext): string {
  const v = ctx.s.hero.visual;
  const slots = v.slots
    .map(
      (time, i) =>
        `<li class="hv-slot${i === PICKED ? ' hv-slot-picked' : ''}"><span>${attr(time)}</span></li>`,
    )
    .join('');
  return `<div class="hv-phone">
  <div class="hv-screen">
    <div class="hv-biz"><span class="hv-avatar"></span><span><strong>${tx(ctx, v.business)}</strong><small>${tx(ctx, v.subtitle)}</small></span></div>
    <div class="hv-service"><span class="hv-radio"></span><span class="hv-service-name">${tx(ctx, v.service)}</span><small>${tx(ctx, v.duration)}</small></div>
    <p class="hv-label">${tx(ctx, v.pickTime)}</p>
    <ul class="hv-slots">${slots}</ul>
    <span class="hv-book">${tx(ctx, v.book)}</span>
    <div class="hv-booked">
      <span class="hv-booked-icon">${checkSvg('hv-check')}</span>
      <strong>${tx(ctx, v.booked)}</strong>
      <small>${tx(ctx, v.bookedDetail)}</small>
    </div>
  </div>
</div>`;
}

function calendar(ctx: PageContext): string {
  const v = ctx.s.hero.visual;
  return `<div class="hv-cal">
  <div class="hv-cal-head"><strong>${tx(ctx, v.today)}</strong><span class="hv-dots"><i></i><i></i><i></i></span></div>
  <div class="hv-cal-grid">
    <span class="hv-col-head"></span><span class="hv-col-head"></span><span class="hv-col-head"></span>
    <span class="hv-appt hv-appt-a"></span>
    <span class="hv-appt hv-appt-b"></span>
    <span class="hv-appt hv-appt-c"></span>
    <span class="hv-appt hv-appt-d"></span>
    <span class="hv-appt hv-appt-new"><b>${tx(ctx, v.service)}</b><small>${tx(ctx, v.slots[PICKED] ?? '')}</small></span>
  </div>
</div>`;
}

function floatCard(cls: string, title: string, detail: string, icon: string): string {
  return `<div class="hv-float ${cls}"><div class="hv-float-in"><span class="hv-float-icon">${icon}</span><span><strong>${title}</strong><small>${detail}</small></span></div></div>`;
}

export function heroVisual(ctx: PageContext): string {
  const v = ctx.s.hero.visual;
  const bell = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`;
  const receipt = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="m9 11 2 2 4-4"/></svg>`;
  return `<div class="hero-visual" role="img" aria-label="${tx(ctx, ctx.s.hero.illustration)}" data-motion>
  <div class="hv" aria-hidden="true">
    ${calendar(ctx)}
    ${phone(ctx)}
    ${floatCard('hv-float-1', tx(ctx, v.newBooking), tx(ctx, v.newBookingDetail), bell)}
    ${floatCard('hv-float-2', tx(ctx, v.invoicePaid), tx(ctx, v.invoiceDetail), receipt)}
  </div>
</div>`;
}

/** Keyframe: hidden until `start`%, shown from `end`%, fades out in the last few % of the loop. */
const appear = (name: string, start: number, end: number, from: string) => `
@keyframes ${name} {
  0%, ${start}% { opacity: 0; transform: ${from}; }
  ${end}%, 94% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: none; }
}`;

export const heroVisualCss = `
.hero-visual { position: relative; width: 100%; max-width: 560px; margin: 0 auto; container-type: inline-size; }
/* Everything inside is sized in em from this one value, so the picture scales with its own width. */
.hv { position: relative; aspect-ratio: 560 / 500; font-size: clamp(8px, 2.2cqi, ${px(fontSize.sm)}); line-height: 1.3; color: var(--text); }
.hv small { display: block; color: var(--muted); font-size: 0.9em; }
.hv strong { font-weight: 700; }

/* Calendar card (behind) */
.hv-cal { position: absolute; left: 24%; top: 5%; width: 76%; height: 70%; background: var(--surface); border: 1px solid var(--border); border-radius: ${px(radius.xl)}; box-shadow: ${shadowLevels.lg.web}; padding: 4% 5%; }
.hv-cal-head { display: flex; justify-content: space-between; align-items: center; padding-left: 28%; color: var(--primary); font-size: 1.1em; }
.hv-dots { display: flex; gap: ${px(spacing[4])}; }
.hv-dots i { width: 0.65em; height: 0.65em; border-radius: 50%; background: var(--border); }
.hv-cal-grid { position: absolute; left: 30%; right: 5%; top: 18%; bottom: 7%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 6%;
  background-image: linear-gradient(var(--border) 1px, transparent 1px); background-size: 100% 20%; }
.hv-col-head { height: 6px; border-radius: 3px; background: var(--border); margin: -12px 20% 0; }
.hv-appt { position: absolute; width: 29%; border-radius: ${px(radius.md)}; background: var(--primary-light); border-left: 3px solid var(--primary); }
.hv-appt-a { left: 0; top: 4%; height: 26%; }
.hv-appt-b { left: 35.5%; top: 64%; height: 18%; background: var(--accent-light); }
.hv-appt-c { left: 71%; top: 22%; height: 34%; }
.hv-appt-d { left: 0; top: 60%; height: 30%; background: var(--accent-light); }
.hv-appt-new { left: 35.5%; top: 24%; height: 26%; background: var(--primary); border-left-color: var(--accent); color: var(--on-primary); padding: 5% 7%; overflow: hidden; }
.hv-appt-new b { display: block; font-size: 0.95em; }
.hv-appt-new small { color: ${colors.sidebarText}; }

/* Phone (front) */
.hv-phone { position: absolute; left: 0; top: 13%; width: 43%; height: 85%; border-radius: 2.5em; background: var(--primary); padding: 2.4%; box-shadow: ${shadowLevels.lg.web}; }
.hv-screen { position: relative; height: 100%; border-radius: 2em; background: var(--surface); overflow: hidden; padding: 9% 7%; display: flex; flex-direction: column; gap: 4.5%; }
.hv-biz { display: flex; align-items: center; gap: 8%; margin: -9% -7% 0; padding: 9% 7% 6%; background: var(--primary-light); }
.hv-biz strong { display: block; color: var(--primary); white-space: nowrap; }
.hv-avatar { width: 2.2em; height: 2.2em; flex: none; border-radius: 50%; background: var(--accent); border: 0.55em solid var(--primary); }
.hv-service { display: flex; align-items: center; gap: 6%; padding: 6% 7%; border: 1.5px solid var(--primary); border-radius: ${px(radius.md)}; }
.hv-service small { margin-left: auto; white-space: nowrap; }
.hv-service-name { font-weight: 600; }
.hv-radio { width: 1em; height: 1em; border-radius: 50%; border: 0.3em solid var(--primary); flex: none; }
.hv-label { color: var(--text-2); font-weight: 600; font-size: 0.9em; }
.hv-slots { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55em; }
.hv-slot { position: relative; text-align: center; padding: 0.55em 0; border: 1px solid var(--border); border-radius: ${px(radius.md)}; font-size: 0.9em; font-weight: 600; color: var(--text-2); }
.hv-slot-picked::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; background: var(--accent); border: 1.5px solid var(--primary); z-index: 0; }
.hv-slot span { position: relative; z-index: 1; }
.hv-slot-picked span { color: var(--primary); }
.hv-book { margin-top: auto; text-align: center; padding: 0.7em 0; border-radius: ${px(radius.md)}; background: var(--primary); color: var(--on-primary); font-weight: 700; }
.hv-booked { position: absolute; left: 7%; right: 7%; bottom: 5%; display: grid; justify-items: center; gap: 0.3em; padding: 10% 6%; text-align: center; background: var(--surface); border-radius: ${px(radius.lg)}; box-shadow: ${shadowLevels.lg.web}; border: 1px solid var(--border); }
.hv-booked strong { color: var(--primary); font-size: 1.25em; }
.hv-booked-icon { width: 3.1em; height: 3.1em; border-radius: 50%; background: var(--accent); display: grid; place-items: center; }
.hv-check { width: 1.8em; height: 1.8em; fill: none; stroke: var(--primary); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.hv-check-cover { fill: var(--accent); stroke: none; transform-box: fill-box; transform: translateX(100%); }

/* Floating cards */
.hv-float { position: absolute; z-index: 2; }
.hv-float-1 { right: 0; top: 0; }
.hv-float-2 { right: 4%; bottom: 3%; }
.hv-float-in { display: flex; align-items: center; gap: 0.8em; padding: 0.8em 1.1em; background: var(--surface); border: 1px solid var(--border); border-radius: ${px(radius.lg)}; box-shadow: ${shadowLevels.lg.web}; white-space: nowrap; }
.hv-float-in strong { display: block; color: var(--primary); }
.hv-float-icon { width: 2.4em; height: 2.4em; border-radius: 50%; background: var(--primary-light); display: grid; place-items: center; flex: none; }
.hv-float-2 .hv-float-icon { background: var(--accent); }
.hv-float-icon svg { width: 1.3em; height: 1.3em; fill: none; stroke: var(--primary); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* The timeline (only when the visitor allows motion) */
@media (prefers-reduced-motion: no-preference) {
  .hv-slot { animation: hv-slot ${LOOP_S}s ease both infinite; }
${[2, 3, 4, 5, 6].map((n) => `  .hv-slot:nth-child(${n}) { animation-delay: ${((n - 1) * 0.12).toFixed(2)}s; }`).join('\n')}
  .hv-slot-picked::after { animation: hv-pick ${LOOP_S}s ease both infinite; }
  .hv-booked { animation: hv-booked ${LOOP_S}s cubic-bezier(.2,.8,.2,1) both infinite; }
  .hv-check-cover { animation: hv-draw ${LOOP_S}s ease both infinite; }
  .hv-appt-new { animation: hv-new ${LOOP_S}s cubic-bezier(.2,.8,.2,1) both infinite; }
  .hv-float-1 { animation: hv-float1 ${LOOP_S}s cubic-bezier(.2,.8,.2,1) both infinite; }
  .hv-float-2 { animation: hv-float2 ${LOOP_S}s cubic-bezier(.2,.8,.2,1) both infinite; }
  .hv-float-in { animation: hv-bob 6s ease-in-out infinite; }
  .hv-float-2 .hv-float-in { animation-duration: 7s; animation-delay: -2s; }
  .hv-phone { animation: hv-bob 8s ease-in-out infinite; animation-delay: -3s; }
}
${appear('hv-slot', 6, 14, 'translateY(6px)')}
@keyframes hv-pick { 0%, 26% { opacity: 0; } 32%, 94% { opacity: 1; } 100% { opacity: 0; } }
${appear('hv-booked', 40, 47, 'translateY(12px) scale(.96)')}
@keyframes hv-draw { 0%, 47% { transform: translateX(0); } 55%, 100% { transform: translateX(100%); } }
${appear('hv-new', 52, 60, 'translateY(-14px)')}
${appear('hv-float1', 58, 64, 'translateY(10px) scale(.95)')}
${appear('hv-float2', 68, 74, 'translateY(10px) scale(.95)')}
@keyframes hv-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
`;
