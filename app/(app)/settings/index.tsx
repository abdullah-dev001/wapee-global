import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  Bell,
  BellRing,
  CalendarCheck,
  ChevronRight,
  Coins,
  MessageSquareText,
} from 'lucide-react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { RouteGuard } from '@/features/auth';
import { usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import type { LucideIcon } from 'lucide-react-native';

/**
 * Settings hub.
 *
 * Only Booking exists so far; business, tax, branches and billing arrive in later
 * phases. It is a list rather than tabs because the sections are unrelated and
 * each is a screen in its own right.
 */
type HubItem = {
  route:
    | '/settings/booking'
    | '/settings/notifications'
    | '/settings/sms-credits'
    | '/settings/messages'
    | '/settings/my-notifications';
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

function HubCard({ item, onPress }: { item: HubItem; onPress: () => void }) {
  const Icon = item.icon;
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <Icon
          size={theme.iconSize.lg}
          strokeWidth={theme.iconStroke}
          color={theme.colors.primary}
          accessibilityElementsHidden
        />
        <View style={styles.rowText}>
          <Text variant="cardTitle" color="textPrimary">
            {item.title}
          </Text>
          <Text variant="helper" color="textSecondary">
            {item.subtitle}
          </Text>
        </View>
        <ChevronRight
          size={theme.iconSize.md}
          strokeWidth={theme.iconStroke}
          color={theme.colors.textMuted}
          accessibilityElementsHidden
        />
      </View>
    </Card>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const canEditBooking = usePermission('settings.booking');
  const canSeeCredits = usePermission('sms.send');

  // Each card appears only for a member who may open it (RLS is the real boundary).
  const items: HubItem[] = [
    {
      route: '/settings/booking',
      icon: CalendarCheck,
      title: t('bookingSettings.title'),
      subtitle: canEditBooking.allowed
        ? t('bookingSettings.subtitle')
        : t('bookingSettings.readOnly'),
    },
    ...(canEditBooking.allowed
      ? [
          {
            route: '/settings/notifications' as const,
            icon: Bell,
            title: t('notifications.hub.settingsTitle'),
            subtitle: t('notifications.hub.settingsSubtitle'),
          },
          {
            route: '/settings/messages' as const,
            icon: MessageSquareText,
            title: t('notifications.hub.logTitle'),
            subtitle: t('notifications.hub.logSubtitle'),
          },
        ]
      : []),
    ...(canSeeCredits.allowed
      ? [
          {
            route: '/settings/sms-credits' as const,
            icon: Coins,
            title: t('notifications.hub.creditsTitle'),
            subtitle: t('notifications.hub.creditsSubtitle'),
          },
        ]
      : []),
    {
      route: '/settings/my-notifications',
      icon: BellRing,
      title: t('notifications.hub.myTitle'),
      subtitle: t('notifications.hub.mySubtitle'),
    },
  ];

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer title={t('nav.settings')}>
          <View style={styles.list}>
            {items.map((item) => (
              <HubCard key={item.route} item={item} onPress={() => router.push(item.route)} />
            ))}
          </View>
        </PageContainer>
      </Screen>
    </RouteGuard>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing[12],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[14],
    minHeight: theme.layout.minTouchTarget,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
