import { CalendarClock, Menu } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/shared/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { LowStockBadge } from '@/features/inventory/components/LowStockBadge';
import { usePendingApprovalCount } from '@/features/appointments/api/usePendingApprovalCount';
import { BranchSwitcher } from '@/features/branches/components';
import { useCurrentScope, useMyProfile, useMyRoleLabel, usePermission } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

import { AccountMenu } from './AccountMenu';

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
  const { business, businessId, branchId } = useCurrentScope();
  const profile = useMyProfile();
  const role = useMyRoleLabel();
  const canApprove = usePermission('appointments.approve');
  // Only roles holding appointments.approve see this (doc §9) — a Staff
  // member can't act on a pending appointment, so it would just be noise.
  const pendingApproval = usePendingApprovalCount(canApprove.allowed ? businessId : null, branchId);
  const [accountOpen, setAccountOpen] = useState(false);

  const name = profile.data?.full_name ?? '';
  const email = profile.data?.email ?? '';
  const branchName = business?.branches.find((item) => item.id === branchId)?.name;
  const businessLabel =
    branchName && business && business.branches.length > 1
      ? `${business.name} · ${branchName}`
      : (business?.name ?? '');

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
        {businessLabel}
      </Text>

      <BranchSwitcher compact />

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
        <LowStockBadge />
        <AccountTrigger
          name={name}
          email={email}
          roleLabel={role.label}
          onPress={() => setAccountOpen(true)}
        />
      </View>

      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />
    </View>
  );
}

function AccountTrigger({
  name,
  email,
  roleLabel,
  onPress,
}: {
  name: string;
  email: string;
  roleLabel: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('accountMenu.open')}
      style={[
        styles.account,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <View style={styles.accountText}>
        <Text variant="label" numberOfLines={1} style={styles.accountName}>
          {name || email}
        </Text>
        {roleLabel ? (
          <Text variant="small" color="textSecondary" numberOfLines={1}>
            {roleLabel}
          </Text>
        ) : null}
      </View>
      <Avatar name={name} email={email} size={32} />
    </Pressable>
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
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    minHeight: theme.layout.minTouchTarget,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.md,
  },
  accountText: {
    alignItems: 'flex-end',
    maxWidth: 160,
  },
  accountName: {
    maxWidth: 160,
  },
});
