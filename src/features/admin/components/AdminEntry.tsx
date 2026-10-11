import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { focusRing, theme } from '@/lib/theme';

import { useAdminEnabled } from '../api/useAdminAccess';

/**
 * Menu entry to the super admin area. Renders only for the platform flag AND an
 * aal2 session; for everyone else it renders nothing (not even a placeholder).
 */
export function AdminEntry({
  variant,
  onNavigate,
}: {
  variant: 'sidebar' | 'more';
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const enabled = useAdminEnabled();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  if (!enabled) return null;

  const onSidebar = variant === 'sidebar';
  const color = onSidebar
    ? showHover
      ? theme.colors.textOnPrimary
      : theme.colors.sidebarText
    : theme.colors.textSecondary;

  return (
    <Pressable
      {...handlers}
      onPress={() => {
        router.push('/admin');
        onNavigate?.();
      }}
      accessibilityRole="link"
      style={[
        styles.item,
        onSidebar && showHover ? { backgroundColor: theme.colors.sidebarHover } : null,
        !onSidebar && showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <ShieldCheck size={theme.iconSize.sm} strokeWidth={theme.iconStroke} color={color} />
      <Text variant={onSidebar ? 'nav' : 'body'} style={{ color }}>
        {t('admin.nav.entry')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    minHeight: theme.layout.minTouchTarget,
    paddingHorizontal: theme.spacing[12],
    borderRadius: theme.radius.md,
  },
});
