import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, Dialog, Text, useToast } from '@/components/ui';
import { formatMoney, money } from '@/lib/money';
import { formatMinuteOfDay } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useCancelBooking } from '../api';
import { actionFor } from '@/features/booking-public/errorHandling';
import { PublicApiError } from '@/features/booking-public/types';
import type { ManageBookingView } from '../types';

export type ManageViewProps = {
  token: string;
  booking: ManageBookingView;
  onReschedule: () => void;
  onCancelled: () => void;
};

const STATUS_TONE: Record<
  ManageBookingView['status'],
  'warning' | 'success' | 'neutral' | 'error'
> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'neutral',
  cancelled: 'error',
  no_show: 'error',
};

/**
 * The view/cancel screen: business name, service, staff, LOCAL time in the
 * branch timezone, status, first name only — nothing else (CLAUDE.md §13).
 */
export function ManageView({ token, booking, onReschedule, onCancelled }: ManageViewProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const cancelBooking = useCancelBooking();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isFinished = booking.status === 'completed' || booking.status === 'no_show';
  const isCancelled = booking.status === 'cancelled';

  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${booking.localDate}T00:00:00.000Z`));

  const handleCancel = () => {
    cancelBooking.mutate(
      { token },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          toast.show({ message: t('bookingManage.cancelSuccess'), tone: 'success' });
          onCancelled();
        },
        onError: (error) => {
          setConfirmOpen(false);
          const code = error instanceof PublicApiError ? error.code : 'server_error';
          const action = actionFor(code);
          if (action.kind === 'not_allowed') {
            toast.show({ message: t('bookingManage.cancelNotAllowed'), tone: 'warning' });
          } else {
            toast.show({ message: t('bookingManage.cancelFailed'), tone: 'error' });
          }
        },
      },
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.statusRow}>
        <Badge tone={STATUS_TONE[booking.status]}>
          {t(`bookingManage.status.${booking.status}`)}
        </Badge>
      </View>

      <Text variant="headline" align="center">
        {t('bookingManage.greeting', { name: booking.clientFirstName })}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {booking.businessName}
        {booking.branchName && booking.branchName !== booking.businessName
          ? ` · ${booking.branchName}`
          : ''}
      </Text>

      <Card>
        <Row label={t('bookingPublic.form.service')} value={booking.serviceName} />
        {booking.staffName ? (
          <Row label={t('bookingPublic.form.staff')} value={booking.staffName} />
        ) : null}
        <Row
          label={t('bookingPublic.form.time')}
          value={`${dateLabel} · ${formatMinuteOfDay(booking.localMinute)}`}
        />
        <Text variant="helper" color="textSecondary" style={styles.timezoneNote}>
          {t('bookingPublic.timezoneNote', { timezone: booking.timezone })}
        </Text>
        {booking.branchAddress || booking.branchName !== booking.businessName ? (
          <Row
            label={t('bookingPublic.confirmation.location')}
            value={
              booking.branchAddress
                ? `${booking.branchName}, ${booking.branchAddress}`
                : booking.branchName
            }
          />
        ) : null}
        {booking.priceMinor !== null && booking.currency ? (
          <Row
            label={t('bookingPublic.confirmation.price')}
            value={formatMoney(money(booking.priceMinor, booking.currency), i18n.language)}
          />
        ) : null}
      </Card>

      {!isFinished && !isCancelled ? (
        <View style={styles.actions}>
          {booking.canReschedule ? (
            <Button variant="secondary" onPress={onReschedule} fullWidth>
              {t('bookingManage.reschedule')}
            </Button>
          ) : null}
          {booking.canCancel ? (
            <Button
              variant="danger"
              onPress={() => setConfirmOpen(true)}
              loading={cancelBooking.isPending}
              fullWidth
            >
              {t('bookingManage.cancel')}
            </Button>
          ) : null}
          {!booking.canCancel && !booking.canReschedule ? (
            <Text variant="helper" color="textSecondary" align="center">
              {t('bookingManage.windowPassed', { hours: booking.cancelCutoffHours })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {isCancelled ? (
        <Text variant="body" color="textSecondary" align="center">
          {t('bookingManage.cancelledNote')}
        </Text>
      ) : null}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('bookingManage.cancelConfirmTitle')}
        message={t('bookingManage.cancelConfirmBody')}
        busy={cancelBooking.isPending}
        confirm={{
          label: t('bookingManage.cancelConfirmAction'),
          variant: 'danger',
          onPress: handleCancel,
          loading: cancelBooking.isPending,
        }}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <Text variant="bodyStrong" style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
    alignItems: 'stretch',
  },
  statusRow: {
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[6],
  },
  summaryValue: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'right',
  },
  timezoneNote: {
    marginTop: theme.spacing[4],
  },
  actions: {
    gap: theme.spacing[8],
  },
});
