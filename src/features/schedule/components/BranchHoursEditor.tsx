import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DayHoursRow, type DayInterval } from '@/components/shared';
import { Button, Skeleton, Text, useToast } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useBranchSchedule, useSaveBranchHours, type BranchHour } from '../api/useBranchSchedule';
import { orderedWeekdays, weekdayNames, type DayOfWeek } from '../weekdays';

function toDayMap(hours: readonly BranchHour[]): Map<number, DayInterval[]> {
  const map = new Map<number, DayInterval[]>();
  for (const hour of hours) {
    const list = map.get(hour.dayOfWeek) ?? [];
    list.push({ id: hour.id, startMinute: hour.startMinute, endMinute: hour.endMinute });
    map.set(hour.dayOfWeek, list);
  }
  return map;
}

/** When the branch itself is open. A weekday with no interval is closed. */
export function BranchHoursEditor() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const schedule = useBranchSchedule(businessId, branchId);
  const save = useSaveBranchHours(businessId, branchId);
  // Branch hours are a property of the location, so settings.business — which
  // after the seed fix is Owner-only.
  const canEdit = usePermission('settings.business');

  const [draft, setDraft] = useState<Map<number, DayInterval[]> | null>(null);
  const [draftFor, setDraftFor] = useState<string | null>(null);

  // Reset in render when the branch or the loaded data changes: no stale frame.
  if (schedule.data && (draft === null || draftFor !== branchId)) {
    setDraft(toDayMap(schedule.data.hours));
    setDraftFor(branchId);
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

  return (
    <View style={styles.container}>
      <Text variant="helper" color="textSecondary">
        {t('schedule.branchHoursHint')}
      </Text>

      <View style={styles.days}>
        {days.map((day) => (
          <DayHoursRow
            key={day}
            dayLabel={names[day] ?? String(day)}
            intervals={draft.get(day) ?? []}
            onChange={(intervals) => setDay(day, intervals)}
            disabled={!canEdit.allowed}
          />
        ))}
      </View>

      {canEdit.allowed ? (
        <Button
          fullWidth
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              {
                intervals: [...draft.entries()].flatMap(([day, list]) =>
                  list.map((interval) => ({
                    dayOfWeek: day,
                    startMinute: interval.startMinute,
                    endMinute: interval.endMinute,
                  })),
                ),
              },
              {
                onSuccess: () => toast.show({ message: t('schedule.saved'), tone: 'success' }),
                onError: (error) => toast.show({ message: error.message, tone: 'error' }),
              },
            )
          }
        >
          {t('actions.save')}
        </Button>
      ) : null}
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
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.borderSubtle,
  },
});
