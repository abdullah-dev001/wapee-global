import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { AlertTriangle, Info } from 'lucide-react-native';

import { Button, Card, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import type { BookingWarning } from '../bookingWarnings';

export type BookingWarningsProps = {
  warnings: BookingWarning[];
};

/**
 * The setup problems that stop this branch taking bookings, shown ABOVE the
 * settings.
 *
 * Placed first and not hidden behind a disclosure because the commonest failure in
 * this feature is an owner carefully configuring booking settings for a branch
 * whose opening hours were never set — the settings are all correct and the page
 * still offers nothing. The warning has to arrive before they start tuning.
 *
 * Each warning carries the route that fixes it (`bookingWarnings.ts`), so the
 * owner is one tap from the screen they need rather than hunting for it.
 */
export function BookingWarnings({ warnings }: BookingWarningsProps) {
  const { t } = useTranslation();
  const router = useRouter();

  if (warnings.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {warnings.map((warning) => {
        const isError = warning.severity === 'error';
        const Icon = isError ? AlertTriangle : Info;

        return (
          <Card key={warning.code} style={isError ? styles.errorCard : styles.infoCard}>
            <View style={styles.row}>
              <Icon
                size={theme.iconSize.md}
                strokeWidth={theme.iconStroke}
                color={isError ? theme.colors.error : theme.colors.info}
                // Decorative: the text says the same thing.
                accessibilityElementsHidden
              />
              <View style={styles.text}>
                <Text variant="body" color="textPrimary">
                  {t(`bookingSettings.warning.${warning.code}`)}
                </Text>

                {warning.fixRoute ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push(warning.fixRoute as '/schedule')}
                  >
                    {t('bookingSettings.warning.fix')}
                  </Button>
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[10],
  },
  errorCard: {
    borderColor: theme.colors.errorBorder,
    backgroundColor: theme.colors.errorLight,
  },
  infoCard: {
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoLight,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing[10],
    // Top, not centre: the icon should sit beside the FIRST line of a wrapped
    // message, not float in the middle of three lines.
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
    gap: theme.spacing[6],
    alignItems: 'flex-start',
  },
});
