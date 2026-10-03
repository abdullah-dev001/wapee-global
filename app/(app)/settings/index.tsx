import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { RouteGuard } from '@/features/auth';
import { usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

/**
 * Settings hub.
 *
 * Only Booking exists so far; business, tax, branches and billing arrive in later
 * phases. It is a list rather than tabs because the sections are unrelated and
 * each is a screen in its own right.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const canEditBooking = usePermission('settings.booking');

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer title={t('nav.settings')}>
          <View style={styles.list}>
            {/* Visible to any member: reading the settings needs no permission,
                and hiding the row would leave a receptionist unable to see how
                booking is configured. Editing is gated inside the screen. */}
            <Card onPress={() => router.push('/settings/booking')}>
              <View style={styles.row}>
                <CalendarCheck
                  size={theme.iconSize.lg}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.primary}
                  accessibilityElementsHidden
                />
                <View style={styles.rowText}>
                  <Text variant="cardTitle" color="textPrimary">
                    {t('bookingSettings.title')}
                  </Text>
                  <Text variant="helper" color="textSecondary">
                    {canEditBooking.allowed
                      ? t('bookingSettings.subtitle')
                      : t('bookingSettings.readOnly')}
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
