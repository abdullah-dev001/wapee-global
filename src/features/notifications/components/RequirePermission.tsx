import { Lock } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState, Skeleton } from '@/components/ui';
import { type PermissionKey } from '@/config/permissions';
import { usePermission } from '@/lib/permissions';

/**
 * Blocks a screen for a member who lacks `permission` (hiding the hub card is not
 * enough: the route can be typed in). RLS and the RPCs are the real boundary;
 * this only avoids a wall of failed queries. Staff never see these screens.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const check = usePermission(permission);

  if (check.isPending) {
    return (
      <Screen edges={['top']}>
        <PageContainer>
          <Skeleton height={24} width="40%" />
        </PageContainer>
      </Screen>
    );
  }
  if (!check.allowed) {
    return (
      <Screen edges={['top']}>
        <PageContainer fill>
          <EmptyState
            icon={Lock}
            title={t('notifications.noAccess.title')}
            description={t('notifications.noAccess.message')}
          />
        </PageContainer>
      </Screen>
    );
  }
  return <>{children}</>;
}
