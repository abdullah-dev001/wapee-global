import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Calendar } from '@/components/shared';
import { ErrorState, Skeleton, Text } from '@/components/ui';
import { addDaysToLocalDate, todayInZone, type IanaTimeZone, type LocalDate } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useSlots } from '../../api';
import { SlotGrid } from '../SlotGrid';
import type { PublicSlot } from '../../types';

export type SlotStepProps = {
  slug: string;
  serviceId: string;
  staffId: string | null;
  timezone: IanaTimeZone;
  bookingWindowDays: number;
  slotDisplay: 'only_available' | 'all_greyed';
  /** Called with the chosen slot AND the start_token it came with. */
  onSelect: (slot: PublicSlot, startToken: string) => void;
};

/**
 * Date + time step: a `Calendar` restricted to the branch's booking window,
 * paired with the real `SlotGrid` fed by `get_slots`.
 *
 * This component NEVER derives availability itself — buffer, notice, window and
 * capacity are the slot engine's rules alone (CLAUDE.md §6). It only asks
 * `get_slots` for one day at a time and renders what comes back.
 */
export function SlotStep({
  slug,
  serviceId,
  staffId,
  timezone,
  bookingWindowDays,
  slotDisplay,
  onSelect,
}: SlotStepProps) {
  const { t } = useTranslation();
  const today = useMemo(() => todayInZone(timezone), [timezone]);
  const maxDate = useMemo(
    () => addDaysToLocalDate(today, bookingWindowDays),
    [today, bookingWindowDays],
  );
  const [selectedDate, setSelectedDate] = useState<LocalDate>(today);

  const slots = useSlots({
    slug,
    serviceId,
    staffId,
    fromDate: selectedDate,
    toDate: selectedDate,
  });

  return (
    <View style={styles.wrapper}>
      <Calendar
        value={selectedDate}
        onChange={setSelectedDate}
        minDate={today}
        maxDate={maxDate}
        timeZone={timezone}
      />

      <View style={styles.timezoneRow}>
        <Text variant="helper" color="textSecondary">
          {t('bookingPublic.timezoneNote', { timezone })}
        </Text>
      </View>

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
            if (slot && slots.data) onSelect(slot, slots.data.startToken);
          }}
          slotDisplay={slotDisplay}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  timezoneRow: {
    alignItems: 'center',
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
});
