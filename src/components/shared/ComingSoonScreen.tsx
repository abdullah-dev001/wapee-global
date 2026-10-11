import { type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState } from '@/components/ui';

export type ComingSoonScreenProps = {
  title: string;
  icon: LucideIcon;
  /** Build-plan phase that fills this screen in. */
  phase: number;
};

/**
 * TEMPORARY stand-in for a screen whose feature is not built yet. It uses the real
 * Screen + PageContainer + EmptyState, so the shell is verifiable now.
 * DELETE each usage as its phase lands.
 */
export function ComingSoonScreen({ title, icon, phase }: ComingSoonScreenProps) {
  const { t } = useTranslation();
  // Inside the bottom tabs, so the tab bar owns the bottom inset.
  return (
    <Screen edges={['top']}>
      <PageContainer title={title}>
        <EmptyState
          icon={icon}
          title={t('screens.comingSoon', { phase })}
          description={t('screens.comingSoonBody', { phase })}
        />
      </PageContainer>
    </Screen>
  );
}
