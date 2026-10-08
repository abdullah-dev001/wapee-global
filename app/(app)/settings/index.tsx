import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  Bell,
  BellRing,
  Building2,
  CalendarCheck,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardSignature,
  Coins,
  CreditCard,
  Inbox,
  Trash2,
  MessageSquareText,
  ShieldCheck,
  UserRound,
} from 'lucide-react-native';

import { PageContainer, Screen } from '@/components/layout';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { Card, Text } from '@/components/ui';
import { RouteGuard } from '@/features/auth';
import { useFeatureFlag, usePermission } from '@/lib/permissions';
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
    | '/settings/my-notifications'
    | '/settings/billing'
    | '/settings/roles'
    | '/settings/branches'
    | '/settings/advanced-reports'
    | '/settings/forms'
    | '/settings/data-requests'
    | '/settings/delete-business'
    | '/settings/account';
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
  const canSeeBilling = usePermission('settings.billing');
  const canRoles = usePermission('roles.manage');
  const canBranches = usePermission('settings.business');
  const canAdvanced = usePermission('reports.view_advanced');
  const canForms = usePermission('forms.manage');
  const canRequests = usePermission('clients.export');
  const canEraseBusiness = usePermission('clients.erase');
  const formsOn = useFeatureFlag('forms_consent');
  const customRoles = useFeatureFlag('custom_roles');
  const multiBranch = useFeatureFlag('multi_branch');
  const advancedReports = useFeatureFlag('advanced_reports');

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
    ...(canSeeBilling.allowed
      ? [
          {
            route: '/settings/billing' as const,
            icon: CreditCard,
            title: t('plans.hub.billingTitle'),
            subtitle: t('plans.hub.billingSubtitle'),
          },
        ]
      : []),
    // Plan features appear only when the plan has them AND the person may use them.
    ...(canRoles.allowed && customRoles.enabled
      ? [
          {
            route: '/settings/roles' as const,
            icon: ShieldCheck,
            title: t('roles.hubTitle'),
            subtitle: t('roles.hubSubtitle'),
          },
        ]
      : []),
    ...(canBranches.allowed && multiBranch.enabled
      ? [
          {
            route: '/settings/branches' as const,
            icon: Building2,
            title: t('branches.hubTitle'),
            subtitle: t('branches.hubSubtitle'),
          },
        ]
      : []),
    ...(canForms.allowed && formsOn.enabled
      ? [
          {
            route: '/settings/forms' as const,
            icon: ClipboardSignature,
            title: t('forms.hubTitle'),
            subtitle: t('forms.hubSubtitle'),
          },
        ]
      : []),
    ...(canAdvanced.allowed && advancedReports.enabled
      ? [
          {
            route: '/settings/advanced-reports' as const,
            icon: ChartNoAxesCombined,
            title: t('advReports.hubTitle'),
            subtitle: t('advReports.hubSubtitle'),
          },
        ]
      : []),
    ...(canRequests.allowed
      ? [
          {
            route: '/settings/data-requests' as const,
            icon: Inbox,
            title: t('dataRights.hub.requestsTitle'),
            subtitle: t('dataRights.hub.requestsSubtitle'),
          },
        ]
      : []),
    ...(canEraseBusiness.allowed
      ? [
          {
            route: '/settings/delete-business' as const,
            icon: Trash2,
            title: t('dataRights.hub.deleteTitle'),
            subtitle: t('dataRights.hub.deleteSubtitle'),
          },
        ]
      : []),
    {
      route: '/settings/my-notifications',
      icon: BellRing,
      title: t('notifications.hub.myTitle'),
      subtitle: t('notifications.hub.mySubtitle'),
    },
    {
      route: '/settings/account',
      icon: UserRound,
      title: t('account.title'),
      subtitle: t('account.hubSubtitle'),
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
          <LegalLinks />
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
