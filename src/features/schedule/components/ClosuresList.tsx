import { CalendarX, DoorClosed, Plus, Trash2 } from 'lucide-react-native';
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
  Input,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { type LocalDate } from '@/lib/time';

import {
  useBranchSchedule,
  useDeleteClosure,
  useDeleteResource,
  useResources,
  useSaveClosure,
  useSaveResource,
} from '../api/useBranchSchedule';

/** Holidays and closed days for the branch. */
export function ClosuresList() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const branchTimeZone = business?.branches.find((entry) => entry.id === branchId)?.timezone;
  const schedule = useBranchSchedule(businessId, branchId);
  const save = useSaveClosure(businessId, branchId);
  const remove = useDeleteClosure(businessId);
  const canEdit = usePermission('settings.business');

  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [range, setRange] = useState<{ startDate: LocalDate | null; endDate: LocalDate | null }>({
    startDate: null,
    endDate: null,
  });

  const formatter = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const closures = schedule.data?.closures ?? [];

  return (
    <View style={styles.container}>
      {canEdit.allowed ? (
        <Button size="sm" startIcon={Plus} onPress={() => setAdding(true)}>
          {t('schedule.addHoliday')}
        </Button>
      ) : null}

      {schedule.isPending ? (
        <Card noPadding>
          {[0, 1].map((row) => (
            <View key={row} style={styles.row}>
              <Skeleton height={18} width="55%" radius="sm" />
            </View>
          ))}
        </Card>
      ) : closures.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={t('schedule.holidaysEmpty.title')}
          description={t('schedule.holidaysEmpty.description')}
        />
      ) : (
        <Card noPadding>
          {closures.map((closure, index) => (
            <View
              key={closure.id}
              style={[styles.row, index === closures.length - 1 ? null : styles.rowDivider]}
            >
              <View style={styles.rowMain}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {closure.name}
                </Text>
                <Text variant="helper" color="textSecondary" numberOfLines={1}>
                  {/* The stored range is INCLUSIVE, so both ends are real days. */}
                  {closure.startsOn === closure.endsOn
                    ? formatter.format(new Date(`${closure.startsOn}T00:00:00Z`))
                    : `${formatter.format(new Date(`${closure.startsOn}T00:00:00Z`))} – ${formatter.format(new Date(`${closure.endsOn}T00:00:00Z`))}`}
                </Text>
              </View>

              {canEdit.allowed ? (
                <Pressable
                  onPress={() => setDeleting(closure.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('actions.delete')}
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

      <Drawer open={adding} onClose={() => setAdding(false)} title={t('schedule.addHoliday')}>
        <View style={styles.form}>
          <Input
            label={t('schedule.holidayName')}
            placeholder={t('schedule.holidayNamePlaceholder')}
            value={name}
            onChangeText={setName}
            required
            returnKeyType="next"
          />

          <DateRangePicker
            startDate={range.startDate}
            endDate={range.endDate}
            onChange={setRange}
            required
            // No past floor: a closure can be recorded after the fact.
            timeZone={branchTimeZone}
          />

          <Button
            fullWidth
            loading={save.isPending}
            disabled={name.trim() === '' || !range.startDate || !range.endDate}
            onPress={() => {
              if (!range.startDate || !range.endDate) return;
              save.mutate(
                { startsOn: range.startDate, endsOn: range.endDate, name: name.trim() },
                {
                  onSuccess: () => {
                    toast.show({ message: t('schedule.saved'), tone: 'success' });
                    setAdding(false);
                    setName('');
                    setRange({ startDate: null, endDate: null });
                  },
                  onError: (error) => toast.show({ message: error.message, tone: 'error' }),
                },
              );
            }}
          >
            {t('actions.save')}
          </Button>
        </View>
      </Drawer>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('actions.delete')}
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

/**
 * Rooms, chairs and bays.
 *
 * Built because the Build Plan puts resources in Phase 2, but **nothing uses them
 * yet**: the slot engine reads them in Phase 3, and the booking setting that
 * turns them on does not exist. The screen says so rather than implying they
 * already affect bookings.
 */
export function ResourcesList() {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const resources = useResources(businessId, branchId);
  const save = useSaveResource(businessId, branchId);
  const remove = useDeleteResource(businessId);
  const canEdit = usePermission('services.manage');

  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState('');

  const rows = resources.data ?? [];

  return (
    <View style={styles.container}>
      <Text variant="helper" color="textSecondary">
        {t('schedule.resourcesHint')}
      </Text>

      {canEdit.allowed ? (
        <Button size="sm" startIcon={Plus} onPress={() => setAdding(true)}>
          {t('schedule.addResource')}
        </Button>
      ) : null}

      {resources.isPending ? (
        <Card noPadding>
          <View style={styles.row}>
            <Skeleton height={18} width="50%" radius="sm" />
          </View>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={DoorClosed}
          title={t('schedule.resourcesEmpty.title')}
          description={t('schedule.resourcesEmpty.description')}
        />
      ) : (
        <Card noPadding>
          {rows.map((resource, index) => (
            <View
              key={resource.id}
              style={[styles.row, index === rows.length - 1 ? null : styles.rowDivider]}
            >
              <Text variant="body" numberOfLines={1} style={styles.rowMain}>
                {resource.name}
              </Text>
              {canEdit.allowed ? (
                <Pressable
                  onPress={() => setDeleting(resource.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('actions.delete')}
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

      <Drawer open={adding} onClose={() => setAdding(false)} title={t('schedule.addResource')}>
        <View style={styles.form}>
          <Input
            label={t('schedule.resourceName')}
            placeholder={t('schedule.resourceNamePlaceholder')}
            value={name}
            onChangeText={setName}
            required
            returnKeyType="done"
          />
          <Button
            fullWidth
            loading={save.isPending}
            disabled={name.trim() === ''}
            onPress={() =>
              save.mutate(
                { name: name.trim(), capacity: 1 },
                {
                  onSuccess: () => {
                    toast.show({ message: t('schedule.saved'), tone: 'success' });
                    setAdding(false);
                    setName('');
                  },
                  onError: (error) => toast.show({ message: error.message, tone: 'error' }),
                },
              )
            }
          >
            {t('actions.save')}
          </Button>
        </View>
      </Drawer>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('actions.delete')}
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
