import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ErrorState, Skeleton, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useAppointmentAnswers } from '../api/useAppointmentAnswers';
import { appointmentErrorKey } from '../appointmentErrorKey';
import { BookingAnswersList } from './BookingAnswersList';

/** The booking-form answers on one appointment (detail drawer). RLS decides what is visible. */
export function AppointmentAnswersSection({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation();
  const { businessId } = useCurrentScope();
  const answers = useAppointmentAnswers(businessId, appointmentId);

  return (
    <View style={styles.section}>
      <Text variant="label" color="textSecondary">
        {t('appointments.answers.title')}
      </Text>
      {answers.isPending ? (
        <Skeleton height={48} radius="md" />
      ) : answers.isError ? (
        <ErrorState
          title={t('appointments.answers.loadError')}
          description={t(appointmentErrorKey(answers.error))}
          onRetry={() => void answers.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : answers.data.length === 0 ? (
        <Text variant="helper" color="textMuted">
          {t('appointments.answers.empty')}
        </Text>
      ) : (
        <BookingAnswersList answers={answers.data} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing[8],
  },
});
