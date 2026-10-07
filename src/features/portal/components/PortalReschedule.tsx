import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Calendar } from '@/components/shared';
import { Button, Dialog, ErrorState, Skeleton, Text, useToast } from '@/components/ui';
import { SlotGrid } from '@/features/booking-public/components';
import { actionFor } from '@/features/booking-public/errorHandling';
import { PublicApiError } from '@/features/booking-public/types';
import { addDaysToLocalDate, todayInZone, type LocalDate } from '@/lib/time';
import { theme } from '@/lib/theme';

import { usePortalReschedule, usePortalSlots, type PortalBooking } from '../api/usePortal';
import { portalErrorKey } from '../portalLogic';

const WINDOW_DAYS = 60;

type Props = { slug: string; session: string; booking: PortalBooking; onClose: () => void };

/** Pick a new time for one of the customer's bookings. Same Calendar + SlotGrid as the public page; the server engine decides what is free. */
export function PortalReschedule({ slug, session, booking, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const reschedule = usePortalReschedule(slug, session);
  const today = useMemo(() => todayInZone(booking.timezone), [booking.timezone]);
  const maxDate = useMemo(() => addDaysToLocalDate(today, WINDOW_DAYS), [today]);
  const [date, setDate] = useState<LocalDate>(today);
  const [pending, setPending] = useState<string | null>(null);
  const slots = usePortalSlots(slug, session, booking.id, date);

  const confirm = () => {
    if (!pending) return;
    reschedule.mutate(
      { appointmentId: booking.id, startsAt: pending },
      {
        onSuccess: () => {
          setPending(null);
          toast.show({ message: t('portal.bookings.rescheduled'), tone: 'success' });
          onClose();
        },
        onError: (error) => {
          setPending(null);
          const code = error instanceof PublicApiError ? error.code : null;
          const gone = code !== null && actionFor(code).kind === 'refresh_slots';
          toast.show({
            message: gone ? t('portal.bookings.slotGone') : t(portalErrorKey(code)),
            tone: gone ? 'warning' : 'error',
          });
          if (gone) void slots.refetch();
        },
      },
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Button variant="ghost" size="sm" onPress={onClose}>
          {t('actions.back')}
        </Button>
        <Text variant="sectionTitle" style={styles.grow} numberOfLines={1}>
          {booking.service_name}
        </Text>
      </View>
      <Calendar
        value={date}
        onChange={setDate}
        minDate={today}
        maxDate={maxDate}
        timeZone={booking.timezone}
      />
      <Text variant="helper" color="textSecondary" align="center">
        {t('bookingPublic.timezoneNote', { timezone: booking.timezone })}
      </Text>
      {slots.isPending ? (
        <Skeleton height={theme.layout.minTouchTarget} radius="md" />
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
          slots={slots.data.slots}
          selectedStartsAt={null}
          onSelect={setPending}
          slotDisplay="only_available"
        />
      )}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('portal.bookings.rescheduleConfirmTitle')}
        message={t('portal.bookings.rescheduleConfirmBody')}
        busy={reschedule.isPending}
        confirm={{
          label: t('portal.bookings.rescheduleConfirm'),
          variant: 'primary',
          onPress: confirm,
          loading: reschedule.isPending,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[16] },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
});
