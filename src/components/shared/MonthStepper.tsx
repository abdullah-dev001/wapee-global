import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { stepIcons } from '@/lib/i18n/stepIcons';
import { theme } from '@/lib/theme';
import { type LocalDate } from '@/lib/time';

/**
 * "‹ March 2027 ›": steps a month at a time. The anchor is a local date inside the
 * month; the chevrons swap in right-to-left languages.
 */
export function MonthStepper({
  anchor,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
}: {
  anchor: LocalDate;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
}) {
  const { i18n } = useTranslation();
  const { Previous, Next } = stepIcons(i18n.language);
  const label = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`));

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        onPress={onPrevious}
        style={styles.arrow}
      >
        <Previous
          size={theme.iconSize.lg}
          strokeWidth={theme.iconStroke}
          color={theme.colors.textPrimary}
        />
      </Pressable>
      <Text variant="cardTitle" style={styles.label}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        onPress={onNext}
        style={styles.arrow}
      >
        <Next
          size={theme.iconSize.lg}
          strokeWidth={theme.iconStroke}
          color={theme.colors.textPrimary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { textAlign: 'center' },
  arrow: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
