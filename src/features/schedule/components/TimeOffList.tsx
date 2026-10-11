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
import { todayInZone, type LocalDate } from '@/lib/time';

import { useDeleteTimeOff, useSaveTimeOff, useTimeOff } from '../api/useSchedule';

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

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const submit = () => {
    if (!staffId || !range.startDate || !range.endDate) return;
    save.mutate(
      {
        staffId,
        // Whole days: start at midnight, end at the start of the day AFTER the
        // last day off, so a one-day absence covers that whole day.
        startsAt: `${range.startDate}T00:00:00.000Z`,
        endsAt: `${addDays(range.endDate, 1)}T00:00:00.000Z`,
        reason: reason.trim() === '' ? null : reason.trim(),
      },
      {
        onSuccess: () => {
          toast.show({ message: t('schedule.timeOffSaved'), tone: 'success' });
          setAdding(false);
          setStaffId(null);
          setRange({ startDate: null, endDate: null });
          setReason('');
        },
        onError: (error) => toast.show({ message: error.message, tone: 'error' }),
      },
    );
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
          description={timeOff.error.message}
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
                  {dateFormatter.format(new Date(entry.startsAt))}
                  {' – '}
                  {/* The stored end is exclusive, so show the last day OFF. */}
                  {dateFormatter.format(new Date(new Date(entry.endsAt).getTime() - 86400000))}
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
            loading={save.isPending}
            disabled={!staffId || !range.startDate || !range.endDate}
            onPress={submit}
          >
            {t('actions.save')}
          </Button>
        </View>
      </Drawer>

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
            remove.mutate(deleting, { onSuccess: () => setDeleting(null) });
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </View>
  );
}

/** Adds whole days to a "YYYY-MM-DD" date, staying in UTC. */
function addDays(date: LocalDate, days: number): LocalDate {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
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
