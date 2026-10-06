import { type ReactNode } from 'react';

import { PageContainer, Screen } from '@/components/layout';
import { Skeleton } from '@/components/ui';
import { type FeatureKey } from '@/features/plans/featureLogic';
import { useFeatureFlag } from '@/lib/permissions';

import { NotIncludedState } from './NotIncludedState';

/**
 * Wraps a screen (or a block with `compact`) that depends on a plan / add-on
 * feature. Off or unknown renders the calm not-included state, so a typed URL
 * lands somewhere honest instead of a wall of failed requests.
 */
export function RequireFeature({
  feature,
  children,
  compact = false,
}: {
  feature: FeatureKey;
  children: ReactNode;
  compact?: boolean;
}) {
  const { enabled, isPending } = useFeatureFlag(feature);
  if (isPending) {
    const bar = <Skeleton height={24} width="40%" />;
    return compact ? (
      bar
    ) : (
      <Screen edges={['top']}>
        <PageContainer>{bar}</PageContainer>
      </Screen>
    );
  }
  if (!enabled) return <NotIncludedState compact={compact} />;
  return <>{children}</>;
}
