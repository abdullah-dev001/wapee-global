import { Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { answerDisplayKind, type AnswerRow } from '../answers';

/** Question + answer pairs from a booking form, labelled from the form version they were given under. */
export function BookingAnswersList({ answers }: { answers: readonly AnswerRow[] }) {
  const { t } = useTranslation();

  return (
    <View style={styles.list}>
      {answers.map((answer) => {
        const kind = answerDisplayKind(answer);
        return (
          <View key={answer.id} style={styles.row}>
            <View style={styles.labelRow}>
              <Text variant="label" color="textSecondary">
                {answer.label ?? t('appointments.answers.unknownField')}
              </Text>
              {answer.isSensitive ? (
                <View
                  style={styles.sensitive}
                  accessibilityLabel={t('appointments.answers.sensitive')}
                >
                  <Lock size={14} strokeWidth={1.75} color={theme.colors.textMuted} />
                  <Text variant="caption" color="textMuted">
                    {t('appointments.answers.sensitive')}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="body">
              {kind === 'yes' ? t('common.yes') : kind === 'no' ? t('common.no') : answer.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing[12],
  },
  row: {
    gap: theme.spacing[4],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
  sensitive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
});
