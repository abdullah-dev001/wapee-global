import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { useCurrentScope } from '@/lib/permissions';
import { focusRing, theme, useBreakpoint } from '@/lib/theme';

import { trialCountdown } from '../trialCountdown';
import { useTrialBannerVisible } from '../useTrialBannerVisible';

/**
 * "Your trial ends in N days", with a way through to billing.
 *
 * Shown only in the last 3 days, and only to someone who could actually act on
 * it — `settings.billing`, which is Owner-only (product doc §9). A receptionist
 * being nagged about billing they cannot reach would be noise.
 *
 * The last day uses the error tint instead of warning, because by then it is the
 * difference between working tomorrow and not.
 *
 * Lives in `AppShell`, so one copy serves mobile, tablet and desktop.
 */
export function TrialBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { business } = useCurrentScope();
  // Same rule the shell uses to decide whether to hand us the top inset.
  const visible = useTrialBannerVisible();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const insets = useSafeAreaInsets();
  const { isMobile } = useBreakpoint();

  // On mobile this bar is the topmost thing on screen — there is no `Header` —
  // so it owns the top inset, or it would sit under the notch and status bar.
  // On tablet/desktop the Header already consumed it.
  const paddingTop = (isMobile ? insets.top : 0) + theme.spacing[10];

  const { daysLeft, isLastDay } = trialCountdown(
    business?.trial_ends_at ?? null,
    business?.status ?? null,
  );

  if (!visible) return null;

  const message = isLastDay
    ? t('billing.trialBanner.today')
    : daysLeft === 1
      ? t('billing.trialBanner.oneDay')
      : t('billing.trialBanner.days', { count: daysLeft });

  const tint = isLastDay
    ? {
        background: theme.colors.errorLight,
        border: theme.colors.errorBorder,
        icon: theme.colors.error,
      }
    : {
        background: theme.colors.warningLight,
        border: theme.colors.warningBorder,
        icon: theme.colors.warning,
      };

  return (
    <Pressable
      {...handlers}
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={`${message} ${t('billing.trialBanner.action')}`}
      style={[
        styles.bar,
        { backgroundColor: tint.background, borderBottomColor: tint.border, paddingTop },
        showHover ? styles.hover : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <AlertTriangle size={theme.iconSize.sm} strokeWidth={theme.iconStroke} color={tint.icon} />

      <Text variant="small" numberOfLines={2} style={styles.message}>
        {message}
      </Text>

      <View style={styles.action}>
        <Text variant="small" color="primary" numberOfLines={1}>
          {t('billing.trialBanner.action')}
        </Text>
        <ChevronRight size={theme.iconSize.xs} strokeWidth={2} color={theme.colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    // paddingTop is set inline: on mobile it carries the status-bar inset.
    paddingBottom: theme.spacing[10],
    paddingHorizontal: theme.layout.pagePaddingMobile,
    borderBottomWidth: theme.borderWidth.hairline,
    // 44px target: the whole bar is tappable.
    minHeight: theme.layout.minTouchTarget,
  },
  hover: {
    opacity: 0.9,
  },
  message: {
    flex: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
});
