import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DayHoursRow, type DayInterval } from '@/components/shared';
import { Button, Skeleton, Tabs, Text, useToast } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useSaveStaffSchedule, useStaffSchedule, type ScheduleInterval } from '../api/useSchedule';
import { orderedWeekdays, weekdayNames, type DayOfWeek } from '../weekdays';

type Which = 'hours' | 'breaks';

/** Stored rows → the local shape `DayHoursRow` edits, keyed by weekday. */
function toDayMap(intervals: readonly ScheduleInterval[]): Map<number, DayInterval[]> {
  const map = new Map<number, DayInterval[]>();
  for (const interval of intervals) {
    const list = map.get(interval.dayOfWeek) ?? [];
    list.push({
      id: interval.id,
      startMinute: interval.startMinute,
      endMinute: interval.endMinute,
    });
    map.set(interval.dayOfWeek, list);
  }
  return map;
}

/**
 * One person's weekly hours and breaks at the current branch.
 *
 * The whole week is edited locally and saved in one action, because saving each
 * row as it changes would fight the exclusion constraints: dragging 09:00–17:00
 * to 10:00–18:00 overlaps itself for an instant and would be refused. Saving
 * replaces the week (see `useSaveStaffSchedule`).
 */
export function StaffScheduleEditor({ staffId, onDone }: { staffId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const schedule = useStaffSchedule(businessId, branchId, staffId);
  const save = useSaveStaffSchedule(businessId, branchId);

  const [which, setWhich] = useState<Which>('hours');
  // null until loaded, so an edit is never applied to an empty week.
  const [draft, setDraft] = useState<Map<number, DayInterval[]> | null>(null);
  const [draftFor, setDraftFor] = useState<{ staffId: string; which: Which } | null>(null);

  const stored = which === 'hours' ? schedule.data?.workingHours : schedule.data?.breaks;

  // Reset the draft when the person, the tab or the loaded data changes. Done in
  // render rather than an effect so there is no frame of stale rows.
  if (stored && (draft === null || draftFor?.staffId !== staffId || draftFor.which !== which)) {
    setDraft(toDayMap(stored));
    setDraftFor({ staffId, which });
  }

  if (schedule.isPending || draft === null) {
    return (
      <View style={styles.loading}>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} height={44} radius="md" />
        ))}
      </View>
    );
  }

  const names = weekdayNames(i18n.language);
  const days = orderedWeekdays(i18n.language);

  const setDay = (day: DayOfWeek, intervals: DayInterval[]) => {
    const next = new Map(draft);
    if (intervals.length === 0) next.delete(day);
    else next.set(day, intervals);
    setDraft(next);
  };

  const onSave = () => {
    const intervals = [...draft.entries()].flatMap(([day, list]) =>
      list.map((interval) => ({
        dayOfWeek: day,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
      })),
    );

    save.mutate(
      {
        staffId,
        intervals,
        table: which === 'hours' ? 'staff_working_hours' : 'staff_breaks',
      },
      {
        onSuccess: () => {
          toast.show({ message: t('schedule.saved'), tone: 'success' });
          onDone();
        },
        // The DB refuses overlaps and overnight shifts; surface that verbatim
        // rather than guessing which row was at fault.
        onError: (error) => toast.show({ message: error.message, tone: 'error' }),
      },
    );
  };

  return (
    <View style={styles.container}>
      <Tabs
        items={[
          { value: 'hours', label: t('schedule.workingHours') },
          { value: 'breaks', label: t('schedule.breaks') },
        ]}
        value={which}
        onChange={setWhich}
      />

      {which === 'breaks' ? (
        <Text variant="helper" color="textSecondary">
          {t('schedule.breaksHint')}
        </Text>
      ) : null}

      <View style={styles.days}>
        {days.map((day) => (
          <DayHoursRow
            key={day}
            dayLabel={names[day] ?? String(day)}
            intervals={draft.get(day) ?? []}
            onChange={(intervals) => setDay(day, intervals)}
          />
        ))}
      </View>

      <Button onPress={onSave} loading={save.isPending} fullWidth>
        {t('actions.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
  },
  loading: {
    gap: theme.spacing[12],
  },
  days: {
    // Divider between weekdays keeps a long list readable.
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.borderSubtle,
  },
});
