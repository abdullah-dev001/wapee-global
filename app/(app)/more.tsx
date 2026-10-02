import { useRouter } from 'expo-router';
import { ChevronRight, LogOut } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Card, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { navLabelKey, type NavItem } from '@/config/navigation';
import { useSignOut } from '@/features/auth';
import { useVisibleNav } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

/**
 * Mobile "More" tab: every destination that is not in the bottom bar, from the
 * same `config/navigation` list the sidebar uses. On tablet/desktop these all
 * live in the sidebar, so this screen is mobile-only in practice.
 */
export default function MoreScreen() {
  const { t } = useTranslation();
  // Only the destinations this member may open (CLAUDE.md §7).
  const { secondary, isPending } = useVisibleNav();

  return (
    <Screen edges={['top']}>
      <PageContainer title={t('nav.more')}>
        {isPending ? (
          <Card noPadding>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.rowSkeleton}>
                <Skeleton height={20} radius="sm" />
              </View>
            ))}
          </Card>
        ) : secondary.length > 0 ? (
          <Card noPadding>
            {secondary.map((item, index) => (
              <MoreRow key={item.id} item={item} isLast={index === secondary.length - 1} />
            ))}
          </Card>
        ) : null}

        {__DEV__ ? <DevGalleryRow /> : null}

        <View style={styles.signOut}>
          <SignOutRow />
        </View>
      </PageContainer>
    </Screen>
  );
}

function MoreRow({ item, isLast }: { item: NavItem; isLast: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const Icon = item.icon;

  return (
    <Pressable
      {...handlers}
      onPress={() => router.push(item.route)}
      accessibilityRole="link"
      style={[
        styles.row,
        isLast ? null : styles.rowDivider,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <Icon
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textSecondary}
      />
      <Text variant="body" style={styles.rowLabel}>
        {t(navLabelKey(item.id))}
      </Text>
      <ChevronRight size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function DevGalleryRow() {
  const router = useRouter();
  return (
    <View style={styles.devBlock}>
      <Card noPadding>
        <Pressable
          onPress={() => router.push('/_gallery')}
          accessibilityRole="link"
          style={styles.row}
        >
          <Text variant="body" style={styles.rowLabel}>
            Component gallery ({Platform.OS}, dev)
          </Text>
          <ChevronRight size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
        </Pressable>
      </Card>
    </View>
  );
}

function SignOutRow() {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const signOut = useSignOut();
  return (
    <Card noPadding>
      <Pressable
        {...handlers}
        onPress={() => signOut.mutate()}
        disabled={signOut.isPending}
        accessibilityRole="button"
        style={[
          styles.row,
          showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
          showFocusRing ? focusRing() : null,
        ]}
      >
        <LogOut
          size={theme.iconSize.md}
          strokeWidth={theme.iconStroke}
          color={theme.colors.error}
        />
        <Text variant="body" color="error" style={styles.rowLabel}>
          {t('nav.logout')}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[14],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
  },
  rowSkeleton: {
    paddingVertical: theme.spacing[14],
    paddingHorizontal: theme.spacing[16],
    // Matches `row`, so the list does not jump when the real rows arrive.
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
  },
  rowDivider: {
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowLabel: {
    flex: 1,
  },
  devBlock: {
    marginTop: theme.spacing[16],
  },
  signOut: {
    marginTop: theme.spacing[16],
  },
});
