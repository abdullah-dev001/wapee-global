import { Plus, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, Toggle } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { MINUTES_PER_DAY, type MinuteOfDay } from '@/lib/time';
import { focusRing, theme } from '@/lib/theme';

import { TimePicker } from './TimePicker';

/** One open interval on a day. `id` is local only — not the database row id. */
export type DayInterval = {
  id: string;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
};

export type DayHoursRowProps = {
  /** Already-translated weekday name, so this component does no date maths. */
  dayLabel: string;
  intervals: readonly DayInterval[];
  onChange: (intervals: DayInterval[]) => void;
  /** Minutes between time options. */
  stepMinutes?: number;
  /** What a new interval starts as when the day is switched on. */
  defaultInterval?: { startMinute: MinuteOfDay; endMinute: MinuteOfDay };
  disabled?: boolean;
};

/** 09:00–17:00 is the least surprising starting point. */
const DEFAULT_INTERVAL = { startMinute: 540, endMinute: 1020 };

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `interval-${localIdCounter}`;
}

/**
 * One weekday of a schedule: a toggle for open/closed and a list of intervals,
 * so a split shift (09:00–13:00, 14:00–18:00) is just two rows.
 *
 * It validates nothing itself — the database holds the real guarantees (no
 * overlap, no overnight, end after start, via exclusion constraints). This keeps
 * the obvious mistakes out of the way: an end time can only be chosen after its
 * start, and a new interval starts after the previous one ends.
 */
export function DayHoursRow({
  dayLabel,
  intervals,
  onChange,
  stepMinutes,
  defaultInterval = DEFAULT_INTERVAL,
  disabled = false,
}: DayHoursRowProps) {
  const { t } = useTranslation();
  const isOpen = intervals.length > 0;

  const setOpen = (open: boolean) => {
    onChange(open ? [{ id: nextLocalId(), ...defaultInterval }] : []);
  };

  const addInterval = () => {
    const last = intervals[intervals.length - 1];
    // Start the new one where the last ended, so the common case needs no edits.
    const start = last
      ? Math.min(last.endMinute, MINUTES_PER_DAY - 60)
      : defaultInterval.startMinute;
    const end = Math.min(start + 60, MINUTES_PER_DAY);
    onChange([...intervals, { id: nextLocalId(), startMinute: start, endMinute: end }]);
  };

  const updateInterval = (id: string, patch: Partial<Omit<DayInterval, 'id'>>) => {
    onChange(
      intervals.map((interval) => (interval.id === id ? { ...interval, ...patch } : interval)),
    );
  };

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text variant="bodyStrong" style={styles.dayLabel} numberOfLines={1}>
          {dayLabel}
        </Text>
        <Toggle
          value={isOpen}
          onValueChange={setOpen}
          disabled={disabled}
          label={isOpen ? t('schedule.open') : t('schedule.closed')}
        />
      </View>

      {isOpen ? (
        <View style={styles.intervals}>
          {intervals.map((interval) => (
            <View key={interval.id} style={styles.interval}>
              <View style={styles.picker}>
                <TimePicker
                  value={interval.startMinute}
                  onChange={(minute) =>
                    updateInterval(interval.id, {
                      startMinute: minute,
                      // Keep the end after the start without silently losing the
                      // length the person already chose.
                      endMinute:
                        interval.endMinute <= minute
                          ? Math.min(minute + 60, MINUTES_PER_DAY)
                          : interval.endMinute,
                    })
                  }
                  stepMinutes={stepMinutes}
                  disabled={disabled}
                  label={t('schedule.from')}
                />
              </View>

              <View style={styles.picker}>
                <TimePicker
                  value={interval.endMinute}
                  onChange={(minute) => updateInterval(interval.id, { endMinute: minute })}
                  stepMinutes={stepMinutes}
                  // An end time can never be at or before its own start.
                  minMinute={interval.startMinute + (stepMinutes ?? 15)}
                  includeEndOfDay
                  disabled={disabled}
                  label={t('schedule.to')}
                />
              </View>

              {intervals.length > 1 ? (
                <IconButton
                  icon={Trash2}
                  label={t('schedule.removeInterval')}
                  tone="error"
                  disabled={disabled}
                  onPress={() => onChange(intervals.filter((other) => other.id !== interval.id))}
                />
              ) : null}
            </View>
          ))}

          <Pressable
            onPress={addInterval}
            disabled={disabled}
            accessibilityRole="button"
            style={styles.addRow}
          >
            <Plus size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.primary} />
            <Text variant="small" color="primary">
              {t('schedule.addInterval')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function IconButton({
  icon: Icon,
  label,
  onPress,
  tone,
  disabled,
}: {
  icon: typeof Trash2;
  label: string;
  onPress: () => void;
  tone: 'error' | 'primary';
  disabled?: boolean;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const color = tone === 'error' ? theme.colors.error : theme.colors.primary;

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.iconButton,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
        disabled ? { opacity: theme.opacity.disabled } : null,
      ]}
    >
      <Icon size={theme.iconSize.md} strokeWidth={theme.iconStroke} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: theme.spacing[12],
    gap: theme.spacing[12],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    minHeight: theme.layout.minTouchTarget,
  },
  dayLabel: {
    flex: 1,
  },
  intervals: {
    gap: theme.spacing[12],
  },
  interval: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing[8],
  },
  picker: {
    flex: 1,
    minWidth: 0,
  },
  iconButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    minHeight: theme.layout.minTouchTarget,
  },
});
