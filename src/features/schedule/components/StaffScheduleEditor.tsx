import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DayHoursRow, type DayInterval } from '@/components/shared';
import { Button, Dialog, Skeleton, Tabs, Text, useToast } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import {
  getStaffScheduleConflicts,
  useSaveStaffSchedule,
  useStaffSchedule,
  type ScheduleInterval,
} from '../api/useSchedule';
import { scheduleErrorKey } from '../scheduleErrorKey';
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
  // Set when saving the draft hours would leave future appointments outside
  // them: asks before saving rather than silently going ahead (nothing is
  // deleted either way, so this warns rather than refusing — see the
  // migration this reads, staff_schedule_conflicts).
  const [conflictCount, setConflictCount] = useState<number | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

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

  const currentIntervals = () =>
    [...draft.entries()].flatMap(([day, list]) =>
      list.map((interval) => ({
        dayOfWeek: day,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
      })),
    );

  const doSave = (intervals: ReturnType<typeof currentIntervals>) => {
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
        // The DB refuses overlaps and overnight shifts; map the code rather
        // than showing raw server text (CLAUDE.md: zero hard-coded strings).
        onError: (error) => toast.show({ message: t(scheduleErrorKey(error)), tone: 'error' }),
      },
    );
  };

  const onSave = async () => {
    const intervals = currentIntervals();

    // Only working hours can leave a future appointment stranded outside
    // them; breaks are fine-grained and already tolerated outside hours
    // with no effect (context/schedule.md).
    if (which === 'hours' && branchId) {
      setCheckingConflicts(true);
      try {
        const count = await getStaffScheduleConflicts(staffId, branchId, intervals);
        setCheckingConflicts(false);
        if (count > 0) {
          setConflictCount(count);
          return;
        }
      } catch {
        setCheckingConflicts(false);
        // The check itself failing must not block a save the person can
        // otherwise make; the save call below still validates normally.
      }
    }
    doSave(intervals);
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

      <Button onPress={onSave} loading={save.isPending || checkingConflicts} fullWidth>
        {t('actions.save')}
      </Button>

      <Dialog
        open={conflictCount !== null}
        onClose={() => setConflictCount(null)}
        title={t('schedule.hoursConflict.title')}
        message={t('schedule.hoursConflict.message', { count: conflictCount ?? 0 })}
        busy={save.isPending}
        confirm={{
          label: t('schedule.hoursConflict.confirm'),
          variant: 'danger',
          onPress: () => {
            setConflictCount(null);
            doSave(currentIntervals());
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
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
