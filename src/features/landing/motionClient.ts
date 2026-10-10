/**
 * Landing page motion helpers (browser only, no imports; inlined by scripts/build-landing.mjs
 * after landingClient.ts). The CSS lives in render/motion.ts.
 *
 * - `.site-header.is-scrolled` once the page has scrolled (blur + hairline).
 * - `.reveal` elements get `.is-visible` the first time they enter the viewport (once).
 * - `[data-motion]` containers get `.in-view` while on screen; CSS pauses loops otherwise.
 * - `html.page-hidden` while the tab is hidden pauses every loop.
 * Sets `window.__landingMotion` so the head script's 3 s safety net (`reveal-all`) stands down.
 */

export function setupMotion(): void {
  const root = document.documentElement;
  (window as unknown as { __landingMotion?: boolean }).__landingMotion = true;

  const header = document.querySelector<HTMLElement>('.site-header');
  if (header) {
    let ticking = false;
    const update = () => {
      ticking = false;
      header.classList.toggle('is-scrolled', window.scrollY > 4);
    };
    update();
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
  }

  const syncHidden = () => root.classList.toggle('page-hidden', document.hidden);
  syncHidden();
  document.addEventListener('visibilitychange', syncHidden);

  if (!('IntersectionObserver' in window)) {
    root.classList.add('reveal-all');
    document.querySelectorAll('[data-motion]').forEach((el) => el.classList.add('in-view'));
    return;
  }

  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        reveal.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));

  const inView = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('in-view', entry.isIntersecting);
  });
  document.querySelectorAll('[data-motion]').forEach((el) => inView.observe(el));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupMotion);
  else setupMotion();
}
