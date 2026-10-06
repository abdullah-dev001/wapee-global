import { Layers } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState } from '@/components/ui';

/**
 * Calm "not part of your plan" state, for a route or setting whose feature is off.
 * No prices and no upsell (decided with the user): it just says so. The RPCs and
 * triggers refuse the same actions regardless.
 */
export function NotIncludedState({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const body = (
    <EmptyState
      compact={compact}
      icon={Layers}
      title={t('plans.notIncluded.title')}
      description={t('plans.notIncluded.description')}
    />
  );
  if (compact) return body;
  return (
    <Screen edges={['top']}>
      <PageContainer fill>{body}</PageContainer>
    </Screen>
  );
}
