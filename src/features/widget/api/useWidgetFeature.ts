/**
 * Plan gating seam for the embed widget (doc §7.4: Team and above).
 *
 * Phase 8 replaces this with `useFeature('widget')`-style gating from the plan
 * catalogue. Until then every business may use it, matching the database seam
 * `widget_feature_enabled()` (always true). Keep call sites going through this
 * hook so Phase 8 is a one-file change.
 */
export function useWidgetFeatureEnabled(): boolean {
  return true;
}
