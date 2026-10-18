import { CalendarOff, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateRangePicker } from '@/components/shared';
import {
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useStaff } from '@/features/staff/api/useStaff';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { dayRangeUtc, todayInZone, type LocalDate } from '@/lib/time';

import {
  getStaffTimeOffConflicts,
  useDeleteTimeOff,
  useSaveTimeOff,
  useTimeOff,
} from '../api/useSchedule';
import { scheduleErrorKey } from '../scheduleErrorKey';
import { formatBranchDay, timeOffDisplayRange } from '../timeOffDisplay';

/** Upcoming time off, with a form to add more. No approval step (doc §6.3). */
export function TimeOffList() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  // The branch owns the timezone, so it decides what "today" means.
  const branchTimeZone = business?.branches.find((entry) => entry.id === branchId)?.timezone;
  const timeOff = useTimeOff(businessId);
  const staff = useStaff(businessId, branchId);
  const save = useSaveTimeOff(businessId);
  const remove = useDeleteTimeOff(businessId);
  const canManage = usePermission('staff.manage_schedule');

  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [range, setRange] = useState<{ startDate: LocalDate | null; endDate: LocalDate | null }>({
    startDate: null,
    endDate: null,
  });
  const [reason, setReason] = useState('');
  // Set when the chosen range overlaps a future appointment: asks before
  // saving rather than silently booking the time off (nothing is deleted
  // either way, so this warns rather than refusing — see the migration this
  // reads, staff_time_off_conflicts).
  const [conflictCount, setConflictCount] = useState<number | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ startsAt: string; endsAt: string } | null>(
    null,
  );


  const doSave = (startsAt: string, endsAt: string) => {
    if (!staffId) return;
    save.mutate(
      { staffId, startsAt, endsAt, reason: reason.trim() === '' ? null : reason.trim() },
      {
        onSuccess: () => {
          toast.show({ message: t('schedule.timeOffSaved'), tone: 'success' });
          setAdding(false);
          setStaffId(null);
          setRange({ startDate: null, endDate: null });
          setReason('');
        },
        onError: (error) => toast.show({ message: t(scheduleErrorKey(error)), tone: 'error' }),
      },
    );
  };

  const submit = async () => {
    if (!staffId || !range.startDate || !range.endDate || !branchTimeZone) return;
    // Whole days IN THE BRANCH'S TIMEZONE, not UTC: a plain "T00:00:00.000Z"
    // suffix is midnight UTC, which is 20:00/19:00 the PREVIOUS day in
    // America/New_York — a staff member's day off started and ended 4-5 hours
    // too early. `dayRangeUtc` converts the local calendar date correctly
    // (and stays correct across a DST change, since it resolves each day's
    // own offset rather than assuming one for the whole range).
    const startsAt = dayRangeUtc(range.startDate, branchTimeZone).start;
    const endsAt = dayRangeUtc(range.endDate, branchTimeZone).end;

    setCheckingConflicts(true);
    try {
      const count = await getStaffTimeOffConflicts(staffId, startsAt, endsAt);
      setCheckingConflicts(false);
      if (count > 0) {
        setConflictCount(count);
        setPendingSave({ startsAt, endsAt });
        return;
      }
    } catch {
      setCheckingConflicts(false);
      // The check itself failing must not block a save the person can
      // otherwise make; the save call below still validates normally.
    }
    doSave(startsAt, endsAt);
  };

  return (
    <View style={styles.container}>
      {canManage.allowed ? (
        <Button size="sm" startIcon={Plus} onPress={() => setAdding(true)}>
          {t('schedule.addTimeOff')}
        </Button>
      ) : null}

      {timeOff.isError ? (
        <ErrorState
          title={t('schedule.error.title')}
          description={t(scheduleErrorKey(timeOff.error))}
          onRetry={() => void timeOff.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : timeOff.isPending ? (
        <Card noPadding>
          {[0, 1].map((row) => (
            <View key={row} style={styles.row}>
              <Skeleton height={18} width="60%" radius="sm" />
            </View>
          ))}
        </Card>
      ) : (timeOff.data ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={t('schedule.timeOffEmpty.title')}
          description={t('schedule.timeOffEmpty.description')}
        />
      ) : (
        <Card noPadding>
          {(timeOff.data ?? []).map((entry, index) => (
            <View
              key={entry.id}
              style={[
                styles.row,
                index === (timeOff.data ?? []).length - 1 ? null : styles.rowDivider,
              ]}
            >
              <View style={styles.rowMain}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {entry.staffName ?? t('schedule.staffMember')}
                </Text>
                <Text variant="helper" color="textSecondary" numberOfLines={1}>
                  {/* Read in the BRANCH zone; the stored end is exclusive (QA F17). */}
                  {formatBranchDay(
                    timeOffDisplayRange(entry.startsAt, entry.endsAt).firstInstant,
                    branchTimeZone ?? 'UTC',
                    i18n.language,
                  )}
                  {' – '}
                  {formatBranchDay(
                    timeOffDisplayRange(entry.startsAt, entry.endsAt).lastInstant,
                    branchTimeZone ?? 'UTC',
                    i18n.language,
                  )}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </Text>
              </View>

              {canManage.allowed ? (
                <Pressable
                  onPress={() => setDeleting(entry.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('schedule.cancelTimeOff')}
                  hitSlop={6}
                  style={styles.iconButton}
                >
                  <Trash2
                    size={theme.iconSize.md}
                    strokeWidth={theme.iconStroke}
                    color={theme.colors.error}
                  />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      )}

      <Drawer open={adding} onClose={() => setAdding(false)} title={t('schedule.addTimeOff')}>
        <View style={styles.form}>
          <Select
            label={t('schedule.staffMember')}
            required
            options={(staff.data ?? []).map((member) => ({
              value: member.id,
              label: member.displayName,
            }))}
            value={staffId}
            onChange={setStaffId}
          />

          <DateRangePicker
            startDate={range.startDate}
            endDate={range.endDate}
            onChange={setRange}
            required
            // Time off is always in the future, and "today" is the BRANCH's
            // today (decision 23).
            minDate={branchTimeZone ? todayInZone(branchTimeZone) : undefined}
            timeZone={branchTimeZone}
          />

          {/* Plain state, not react-hook-form: this form has three fields. */}
          <Input
            label={t('schedule.timeOffReason')}
            placeholder={t('schedule.timeOffReasonPlaceholder')}
            value={reason}
            onChangeText={setReason}
            returnKeyType="done"
          />

          <Button
            fullWidth
            loading={save.isPending || checkingConflicts}
            disabled={!staffId || !range.startDate || !range.endDate}
            onPress={submit}
          >
            {t('actions.save')}
          </Button>
        </View>
      </Drawer>

      <Dialog
        open={conflictCount !== null}
        onClose={() => {
          setConflictCount(null);
          setPendingSave(null);
        }}
        title={t('schedule.hoursConflict.title')}
        message={t('schedule.timeOffConflict.message', { count: conflictCount ?? 0 })}
        busy={save.isPending}
        confirm={{
          label: t('schedule.hoursConflict.confirm'),
          variant: 'danger',
          onPress: () => {
            if (!pendingSave) return;
            setConflictCount(null);
            doSave(pendingSave.startsAt, pendingSave.endsAt);
          },
        }}
        cancelLabel={t('actions.cancel')}
      />

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('schedule.cancelTimeOff')}
        busy={remove.isPending}
        confirm={{
          label: t('actions.delete'),
          variant: 'danger',
          onPress: () => {
            if (!deleting) return;
            remove.mutate(deleting, {
              onSuccess: () => setDeleting(null),
              onError: (error) => toast.show({ message: t(scheduleErrorKey(error)), tone: 'error' }),
            });
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
  form: {
    gap: theme.spacing[16],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
  },
  rowDivider: {
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowMain: {
    flex: 1,
    gap: theme.spacing[2],
  },
  iconButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
