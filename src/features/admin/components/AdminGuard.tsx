import { Redirect, usePathname } from 'expo-router';
import { FileQuestion } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState, Skeleton } from '@/components/ui';
import { theme } from '@/lib/theme';

import { ADMIN_REAUTH } from '../adminLogic';
import { useAdminAccess } from '../api/useAdminAccess';

/**
 * Wraps the whole (admin) route group. Not a super admin: the area is simply "not
 * found" (it does not advertise itself). Flagged without a fresh password session:
 * only the sign-in-again screen opens. Flag + fresh password session: everything opens. The RPCs enforce the same rule.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const access = useAdminAccess();

  if (access === 'loading') {
    return (
      <Screen>
        <PageContainer>
          <View style={styles.skeleton}>
            <Skeleton width="45%" height={28} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </View>
        </PageContainer>
      </Screen>
    );
  }
  if (access === 'hidden') {
    return (
      <Screen>
        <PageContainer fill>
          <EmptyState icon={FileQuestion} title={t('routes.notFound')} />
        </PageContainer>
      </Screen>
    );
  }
  if (access === 'needs_reauth' && pathname !== ADMIN_REAUTH)
    return <Redirect href={ADMIN_REAUTH} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({ skeleton: { gap: theme.spacing[12] } });
