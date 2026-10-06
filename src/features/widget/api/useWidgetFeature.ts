import { useFeatureFlag } from '@/lib/permissions';

/**
 * Plan gating for the embed widget (doc §7.4: Team and Business). Reads the
 * server's `my_features()` answer; the database seam `widget_feature_enabled()`
 * and the widget RPCs refuse regardless of what this returns.
 */
export function useWidgetFeatureEnabled(): boolean {
  return useFeatureFlag('embed_widget').enabled;
}
