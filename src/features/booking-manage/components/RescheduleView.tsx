import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Calendar } from '@/components/shared';
import { Button, Dialog, ErrorState, Skeleton, Text, useToast } from '@/components/ui';
import { addDaysToLocalDate, todayInZone, type LocalDate } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useManageSlots, useRescheduleBooking } from '../api';
import { SlotGrid } from '@/features/booking-public/components';
import { actionFor } from '@/features/booking-public/errorHandling';
import { PublicApiError } from '@/features/booking-public/types';
import type { ManageBookingView, ManageSlot } from '../types';

export type RescheduleViewProps = {
  token: string;
  booking: ManageBookingView;
  onCancel: () => void;
  onRescheduled: () => void;
};

/** The booking window is bounded the same way a fresh booking is (doc §6.2); 60 days covers every branch's current setting with room to spare. */
const FALLBACK_WINDOW_DAYS = 60;

/**
 * Step: pick a new date and time for an existing booking. Reuses `Calendar`
 * and `SlotGrid` from the public booking flow — the SAME components, not a
 * copy — so this screen never re-derives availability itself (CLAUDE.md §6).
 * Same staff member as today; there is no staff-reselection step here.
 */
export function RescheduleView({ token, booking, onCancel, onRescheduled }: RescheduleViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const reschedule = useRescheduleBooking();

  const today = useMemo(() => todayInZone(booking.timezone), [booking.timezone]);
  const maxDate = useMemo(() => addDaysToLocalDate(today, FALLBACK_WINDOW_DAYS), [today]);
  const [selectedDate, setSelectedDate] = useState<LocalDate>(today);
  const [pendingSlot, setPendingSlot] = useState<ManageSlot | null>(null);

  const slots = useManageSlots({ token, fromDate: selectedDate, toDate: selectedDate });

  const handleConfirm = () => {
    if (!pendingSlot) return;
    reschedule.mutate(
      { token, startsAt: pendingSlot.startsAt },
      {
        onSuccess: (result) => {
          setPendingSlot(null);
          toast.show({
            message: result.needsApproval
              ? t('bookingManage.rescheduleNeedsApproval')
              : t('bookingManage.rescheduleSuccess'),
            tone: result.needsApproval ? 'warning' : 'success',
          });
          onRescheduled();
        },
        onError: (error) => {
          setPendingSlot(null);
          const code = error instanceof PublicApiError ? error.code : 'server_error';
          const action = actionFor(code);

          if (action.kind === 'refresh_slots') {
            toast.show({ message: t('bookingManage.slotGone'), tone: 'warning' });
            void slots.refetch();
          } else if (action.kind === 'not_allowed') {
            toast.show({ message: t('bookingManage.cancelNotAllowed'), tone: 'warning' });
            onCancel();
          } else if (action.kind === 'invalid_link' || action.kind === 'not_available') {
            toast.show({ message: t('bookingManage.rescheduleFailed'), tone: 'error' });
            onCancel();
          } else {
            toast.show({ message: t('bookingManage.rescheduleFailed'), tone: 'error' });
          }
        },
      },
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Button variant="ghost" size="sm" onPress={onCancel}>
          {t('actions.back')}
        </Button>
        <Text variant="sectionTitle" style={styles.title} numberOfLines={1}>
          {t('bookingManage.reschedule')}
        </Text>
      </View>

      <Calendar
        value={selectedDate}
        onChange={setSelectedDate}
        minDate={today}
        maxDate={maxDate}
        timeZone={booking.timezone}
      />

      <Text variant="helper" color="textSecondary" align="center">
        {t('bookingPublic.timezoneNote', { timezone: booking.timezone })}
      </Text>

      {slots.isPending ? (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={72} height={theme.layout.minTouchTarget} radius="md" />
          ))}
        </View>
      ) : slots.isError ? (
        <ErrorState
          title={t('bookingPublic.slotsErrorTitle')}
          description={t('bookingPublic.slotsErrorBody')}
          onRetry={() => slots.refetch()}
          retryLabel={t('actions.retry')}
          compact
        />
      ) : (
        <SlotGrid
          slots={slots.data?.slots ?? []}
          selectedStartsAt={null}
          onSelect={(startsAt) => {
            const slot = slots.data?.slots.find((s) => s.startsAt === startsAt);
            if (slot) setPendingSlot(slot);
          }}
          slotDisplay="only_available"
        />
      )}

      <Dialog
        open={pendingSlot !== null}
        onClose={() => setPendingSlot(null)}
        title={t('bookingManage.rescheduleConfirmTitle')}
        message={t('bookingManage.rescheduleConfirmBody')}
        busy={reschedule.isPending}
        confirm={{
          label: t('bookingManage.rescheduleConfirmAction'),
          onPress: handleConfirm,
          loading: reschedule.isPending,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  title: {
    flex: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
});
