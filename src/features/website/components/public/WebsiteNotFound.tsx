import { Globe } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState } from '@/components/ui';

/**
 * The ONE page shown for a slug that has no public website: unknown, unpublished,
 * inactive — indistinguishable on purpose. It says nothing about why.
 */
export function WebsiteNotFound() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PageContainer fill>
        <EmptyState
          icon={Globe}
          title={t('website.notFoundTitle')}
          description={t('website.notFoundMessage')}
        />
      </PageContainer>
    </Screen>
  );
}
