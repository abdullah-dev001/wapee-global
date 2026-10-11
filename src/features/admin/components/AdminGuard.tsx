import { Redirect, usePathname } from 'expo-router';
import { FileQuestion } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState, Skeleton } from '@/components/ui';
import { theme } from '@/lib/theme';

import { ADMIN_2FA } from '../adminLogic';
import { useAdminAccess } from '../api/useAdminAccess';

/**
 * Wraps the whole (admin) route group. Not a super admin: the area is simply "not
 * found" (it does not advertise itself). Flagged but aal1: only the 2FA screen
 * opens. Flag + aal2: everything opens. The RPCs enforce the same rule.
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
  if (access === 'needs_2fa' && pathname !== ADMIN_2FA) return <Redirect href={ADMIN_2FA} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({ skeleton: { gap: theme.spacing[12] } });
