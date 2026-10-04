import { CalendarClock, Menu } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Badge } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { brand } from '@/config/brand';
import { usePendingApprovalCount } from '@/features/appointments/api/usePendingApprovalCount';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

export type HeaderProps = {
  /** Shown on tablet to open the off-canvas sidebar. Omitted on desktop. */
  onOpenMenu?: () => void;
};

/**
 * 64px top bar for tablet and desktop (DESIGN_GUIDE §13.3).
 * It holds the business name and the user menu; the page title lives in
 * `PageContainer`, not here.
 */
export function Header({ onOpenMenu }: HeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { businessId, branchId } = useCurrentScope();
  const canApprove = usePermission('appointments.approve');
  // Only roles holding appointments.approve see this (doc §9) — a Staff
  // member can't act on a pending appointment, so it would just be noise.
  const pendingApproval = usePendingApprovalCount(canApprove.allowed ? businessId : null, branchId);

  return (
    <View style={styles.header}>
      {onOpenMenu ? (
        <IconButton label={t('nav.openMenu')} onPress={onOpenMenu}>
          <Menu
            size={theme.iconSize.xl}
            strokeWidth={theme.iconStroke}
            color={theme.colors.textPrimary}
          />
        </IconButton>
      ) : null}

      <Text variant="cardTitle" numberOfLines={1} style={styles.businessName}>
        {/* TODO(phase 1): the signed-in business name. */}
        {brand.name}
      </Text>

      <View style={styles.right}>
        {canApprove.allowed && pendingApproval.data ? (
          <Pressable
            onPress={() => router.push('/calendar')}
            accessibilityRole="button"
            accessibilityLabel={t('appointments.pendingApproval', { count: pendingApproval.data })}
          >
            <Badge
              tone="warning"
              icon={<CalendarClock size={11} strokeWidth={2} color={theme.colors.warning} />}
            >
              {t('appointments.pendingApproval', { count: pendingApproval.data })}
            </Badge>
          </Pressable>
        ) : null}
        {/* TODO(phase 1): user menu (profile, switch business, sign out). */}
        <View
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel={t('nav.account')}
        >
          <Text variant="label" color="primary">
            W
          </Text>
        </View>
      </View>
    </View>
  );
}

function IconButton({
  children,
  label,
  onPress,
}: {
  children: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.iconButton,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    height: theme.layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingHorizontal: theme.layout.pagePadding,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
    zIndex: theme.zIndex.header,
  },
  businessName: {
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
  },
  iconButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    marginStart: -theme.spacing[8],
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
