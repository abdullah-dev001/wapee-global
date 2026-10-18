/**
 * Keeping the browser history in step with an in-page, multi-step flow (QA F26).
 *
 * The public booking flow and the guest manage page change steps without
 * changing the route, so the browser/Android Back button used to leave the
 * page entirely. Each step deeper than the first now owns one history entry:
 * going forward pushes, Back pops one entry and the flow steps back.
 *
 * Pure and renderer-free so it can be unit-tested; `useWebStepHistory` does the
 * window.history side effects.
 */

/** What to do to the history so it holds `depth` entries above the base. */
export type HistorySync = { kind: 'none' } | { kind: 'push'; count: number } | { kind: 'back'; count: number };

/**
 * `pushed`: entries this flow has added above the page's own entry.
 * `depth`: how many it should have now (0 = first step).
 */
export function planHistorySync(pushed: number, depth: number): HistorySync {
  const target = Math.max(0, Math.floor(depth));
  if (target > pushed) return { kind: 'push', count: target - pushed };
  if (target < pushed) return { kind: 'back', count: pushed - target };
  return { kind: 'none' };
}
