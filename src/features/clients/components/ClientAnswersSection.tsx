import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ErrorState, Skeleton, Text } from '@/components/ui';
import { useClientAnswers } from '@/features/appointments/api/useAppointmentAnswers';
import { appointmentErrorKey } from '@/features/appointments/appointmentErrorKey';
import { BookingAnswersList } from '@/features/appointments/components/BookingAnswersList';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDateTime, type IanaTimeZone, type LocaleTag } from '@/lib/time';

export type ClientAnswersSectionProps = {
  clientId: string;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
};

/**
 * Booking-form answers across the client's visits, newest first, 20 visits a
 * page. Only visits the viewer can see are listed, and sensitive answers only
 * with `clients.view_sensitive` (both enforced by RLS).
 */
export function ClientAnswersSection({ clientId, timeZone, locale }: ClientAnswersSectionProps) {
  const { t } = useTranslation();
  const { businessId } = useCurrentScope();
  const answers = useClientAnswers(businessId, clientId);
  const visits = answers.data?.pages.flatMap((page) => page.visits) ?? [];

  return (
    <View style={styles.section}>
      <Text variant="sectionTitle">{t('appointments.answers.title')}</Text>
      {answers.isPending ? (
        <Skeleton height={80} radius="md" />
      ) : answers.isError ? (
        <ErrorState
          title={t('appointments.answers.loadError')}
          description={t(appointmentErrorKey(answers.error))}
          onRetry={() => void answers.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : visits.length === 0 ? (
        <Text variant="helper" color="textMuted">
          {t('appointments.answers.emptyClient')}
        </Text>
      ) : (
        <View style={styles.visits}>
          {visits.map((visit) => (
            <Card key={visit.appointmentId}>
              <View style={styles.visit}>
                <Text variant="helper" color="textSecondary">
                  {formatDateTime(visit.startsAt, timeZone, locale, 'medium')}
                  {visit.serviceName ? ` · ${visit.serviceName}` : ''}
                </Text>
                <BookingAnswersList answers={visit.answers} />
              </View>
            </Card>
          ))}
        </View>
      )}
      {answers.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          loading={answers.isFetchingNextPage}
          onPress={() => void answers.fetchNextPage()}
        >
          {t('appointments.answers.loadMore')}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing[8],
  },
  visits: {
    gap: theme.spacing[12],
  },
  visit: {
    gap: theme.spacing[12],
  },
});
