import { usePathname } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState, Skeleton } from '@/components/ui';
import { useVisibleNav } from '@/lib/permissions';
import { theme } from '@/lib/theme';

/**
 * Blocks a route the signed-in member may not open, including one typed straight
 * into the address bar or restored from history. Hiding the menu item is not
 * enough (CLAUDE.md §4, §7).
 *
 * It renders a "no access" screen rather than redirecting, so the URL stays put
 * and the back button still works. The data behind the screen is protected by
 * RLS either way; this only avoids a wall of failed queries.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isRouteAllowed, isPending } = useVisibleNav();

  // Wait for the permission set: denying first and allowing a frame later would
  // flash "no access" on every cold start.
  if (isPending) return <RouteGuardSkeleton />;

  if (!isRouteAllowed(pathname)) return <NoAccessScreen />;

  return <>{children}</>;
}

function RouteGuardSkeleton() {
  return (
    <Screen edges={['top']}>
      <PageContainer>
        <View style={styles.skeleton}>
          <Skeleton width="55%" height={28} />
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      </PageContainer>
    </Screen>
  );
}

function NoAccessScreen() {
  const { t } = useTranslation();
  return (
    <Screen edges={['top']}>
      <PageContainer>
        <EmptyState
          icon={Lock}
          title={t('permissions.noAccess.title')}
          description={t('permissions.noAccess.description')}
        />
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    gap: theme.spacing[12],
  },
});
