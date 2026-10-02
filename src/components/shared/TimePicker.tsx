import { useMemo } from 'react';

import { Select } from '@/components/ui';
import { MINUTES_PER_DAY, formatMinuteOfDay, parseMinuteOfDay, type MinuteOfDay } from '@/lib/time';

/** Options every quarter hour by default — the usual salon/clinic granularity. */
export const DEFAULT_TIME_STEP_MINUTES = 15;

export type TimePickerProps = {
  /** Minutes from local midnight, or null for nothing chosen. */
  value: MinuteOfDay | null;
  onChange: (minute: MinuteOfDay) => void;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Minutes between options. 15 by default. */
  stepMinutes?: number;
  /** Earliest selectable minute, inclusive. Default 0 (00:00). */
  minMinute?: MinuteOfDay;
  /** Latest selectable minute, inclusive. Default 1440 (24:00). */
  maxMinute?: MinuteOfDay;
  /** Include 24:00 as "end of day". Only meaningful for an end time. */
  includeEndOfDay?: boolean;
  placeholder?: string;
  testID?: string;
};

/**
 * Time field built on `Select`, so it is the same sheet-based list on Android,
 * iOS and web.
 *
 * A native spinner (`@react-native-community/datetimepicker`) was deliberately
 * not used: it is a new native module needing a rebuild, it looks and behaves
 * differently on each platform, and it has no web implementation — while a
 * schedule only ever needs times on a fixed step. `Select` already handles long
 * lists with a `FlatList`, and 96 quarter-hours is nothing.
 *
 * Values are **minutes from local midnight**, matching how the schedule tables
 * store hours (see context/schedule.md).
 */
export function TimePicker({
  value,
  onChange,
  stepMinutes = DEFAULT_TIME_STEP_MINUTES,
  minMinute = 0,
  maxMinute = MINUTES_PER_DAY,
  includeEndOfDay = false,
  ...selectProps
}: TimePickerProps) {
  const options = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    const last = includeEndOfDay ? maxMinute : Math.min(maxMinute, MINUTES_PER_DAY - 1);

    for (let minute = minMinute; minute <= last; minute += stepMinutes) {
      result.push({ value: String(minute), label: formatMinuteOfDay(minute) });
    }

    // A stored value off the step (an imported schedule, or a step change) must
    // still be selectable, or opening the picker would silently change it.
    if (value !== null && !result.some((option) => option.value === String(value))) {
      result.push({ value: String(value), label: formatMinuteOfDay(value) });
      result.sort((a, b) => Number(a.value) - Number(b.value));
    }
    return result;
  }, [stepMinutes, minMinute, maxMinute, includeEndOfDay, value]);

  return (
    <Select
      {...selectProps}
      options={options}
      value={value === null ? null : String(value)}
      onChange={(next) => {
        const minute = Number(next);
        if (Number.isInteger(minute)) onChange(minute);
      }}
    />
  );
}

/** Parses "HH:MM" to minutes, for a web `<input type="time">` or a paste. */
export function timeTextToMinute(text: string): MinuteOfDay | null {
  return parseMinuteOfDay(text);
}
