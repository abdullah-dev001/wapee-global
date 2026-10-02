import { Lock, Mail } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Card, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { useSignOut } from '@/features/auth';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

/**
 * Shown when the business is inactive — the 14-day trial ended, or a super admin
 * suspended it (product doc §10, decision 12).
 *
 * The screen is a dead end on purpose: there is no plan self-service yet, so the
 * only ways forward are contacting us or signing out. Settings and billing stay
 * reachable through the sidebar/More, because an owner who cannot see their own
 * billing can never fix this.
 *
 * `business_is_active()` is the real boundary: every operational RLS policy goes
 * through `can()`, so the data is already locked whatever this screen shows.
 */
export function TrialEndedScreen() {
  const { t } = useTranslation();
  const { business } = useCurrentScope();
  const signOut = useSignOut();

  const email = `mailto:${brand.supportEmail}?subject=${encodeURIComponent(
    t('billing.locked.emailSubject', { business: business?.name ?? '' }),
  )}`;

  return (
    // `edges={['top']}`: this renders inside the bottom tabs, which already sit in
    // the bottom inset. Keeping the default would pad it twice — a ~48px dead gap
    // on Android with 3-button navigation (CLAUDE.md §4).
    <Screen edges={['top']}>
      <PageContainer maxWidth={theme.layout.dialogMaxWidth}>
        <Card style={styles.card}>
          <View style={styles.iconCircle}>
            <Lock
              size={theme.iconSize.xl}
              strokeWidth={theme.iconStroke}
              color={theme.colors.warning}
            />
          </View>

          <Text variant="dialogTitle" align="center">
            {t('billing.locked.title')}
          </Text>

          <Text variant="paragraph" color="textSecondary" align="center">
            {business?.status === 'suspended'
              ? t('billing.locked.suspended')
              : t('billing.locked.trialEnded')}
          </Text>

          <Text variant="helper" color="textMuted" align="center">
            {t('billing.locked.dataSafe')}
          </Text>

          <View style={styles.actions}>
            <Button
              fullWidth
              startIcon={Mail}
              onPress={() => {
                void Linking.openURL(email);
              }}
            >
              {t('billing.locked.contact')}
            </Button>

            <Button
              variant="ghost"
              fullWidth
              loading={signOut.isPending}
              onPress={() => signOut.mutate()}
            >
              {t('nav.logout')}
            </Button>
          </View>
        </Card>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: theme.spacing[12],
    // Breathing room on a phone, where this card is the whole screen.
    marginTop: Platform.OS === 'web' ? theme.spacing[40] : theme.spacing[24],
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
});
