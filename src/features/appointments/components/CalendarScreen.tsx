import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Dialog, Drawer, Tabs } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { todayInZone } from '@/lib/time';

import { type AppointmentListFilters } from '../api/useAppointments';
import { useAppointmentsRealtime } from '../api/useAppointmentsRealtime';
import { type AppointmentRow, type AppointmentStatus } from '../types';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';
import { AppointmentListFilterBar } from './AppointmentListFilterBar';
import { AppointmentListView } from './AppointmentListView';
import { CreateAppointmentForm } from './CreateAppointmentForm';
import { DayView } from './DayView';
import { WeekView } from './WeekView';

type CalendarViewTab = 'day' | 'week' | 'list';

/**
 * Calendar screen: Day / Week / List views over the same appointments data
 * (doc §6.3). Replaces the Phase 4 placeholder.
 */
export function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string;
    status?: string;
    staffId?: string;
    serviceId?: string;
    search?: string;
  }>();
  const { businessId, branchId, business } = useCurrentScope();
  const canCreate = usePermission('appointments.create');

  const timeZone = useMemo(() => {
    const branch = business?.branches.find((b) => b.id === branchId);
    return branch?.timezone ?? 'UTC';
  }, [business, branchId]);

  const tab: CalendarViewTab = params.tab === 'week' || params.tab === 'list' ? params.tab : 'day';
  const setTab = (next: CalendarViewTab) => router.setParams({ tab: next });

  const [selectedDate, setSelectedDate] = useState(() => todayInZone(timeZone));
  const [creating, setCreating] = useState<{
    date: string;
    minute: number;
    staffId: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [createIsDirty, setCreateIsDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Filters live in URL params on web (shareable, back button works — CLAUDE.md §6).
  const listFilters: AppointmentListFilters = {
    branchId,
    status: (params.status as AppointmentStatus | undefined) ?? null,
    staffId: params.staffId ?? null,
    serviceId: params.serviceId ?? null,
    search: params.search ?? '',
  };
  const setListFilters = (next: AppointmentListFilters) =>
    router.setParams({
      status: next.status ?? undefined,
      staffId: next.staffId ?? undefined,
      serviceId: next.serviceId ?? undefined,
      search: next.search ?? undefined,
    });

  useAppointmentsRealtime(businessId, branchId);

  return (
    <Screen edges={['top']} scroll={false}>
      <PageContainer
        title={t('appointments.title')}
        actions={
          canCreate.allowed ? (
            <Button
              size="sm"
              startIcon={Plus}
              onPress={() => setCreating({ date: selectedDate, minute: 9 * 60, staffId: null })}
            >
              {t('appointments.newAppointment')}
            </Button>
          ) : null
        }
      >
        <View style={styles.tabs}>
          <Tabs
            items={[
              { value: 'day', label: t('appointments.views.day') },
              { value: 'week', label: t('appointments.views.week') },
              { value: 'list', label: t('appointments.views.list') },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
      </PageContainer>

      <View style={styles.body}>
        {tab === 'day' ? (
          <DayView
            businessId={businessId}
            branchId={branchId}
            timeZone={timeZone}
            locale={i18n.language}
            date={selectedDate}
            onChangeDate={setSelectedDate}
            onPressSlot={(staffId, minute) => setCreating({ date: selectedDate, minute, staffId })}
            onPressAppointment={(_id, row) => setSelected(row)}
          />
        ) : null}

        {tab === 'week' ? (
          <WeekView
            businessId={businessId}
            branchId={branchId}
            timeZone={timeZone}
            locale={i18n.language}
            weekStartDate={selectedDate}
            onChangeWeekStart={setSelectedDate}
            onPressSlot={(staffId, date, minute) => setCreating({ date, minute, staffId })}
            onPressAppointment={(_id, row) => setSelected(row)}
          />
        ) : null}

        {tab === 'list' ? (
          <View style={styles.listContainer}>
            <AppointmentListFilterBar
              businessId={businessId}
              branchId={branchId}
              filters={listFilters}
              onChange={setListFilters}
            />
            <AppointmentListView
              businessId={businessId}
              filters={listFilters}
              timeZone={timeZone}
              locale={i18n.language}
              onSelect={setSelected}
            />
          </View>
        ) : null}
      </View>

      <Drawer
        open={creating !== null}
        onClose={() => (createIsDirty ? setConfirmDiscard(true) : setCreating(null))}
        title={t('appointments.newAppointment')}
      >
        {creating ? (
          <CreateAppointmentForm
            timeZone={timeZone}
            initialDate={creating.date}
            initialMinute={creating.minute}
            initialStaffId={creating.staffId}
            onDirtyChange={setCreateIsDirty}
            onDone={() => {
              setCreateIsDirty(false);
              setCreating(null);
            }}
          />
        ) : null}
      </Drawer>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t('appointments.form.cancelUnsaved')}
        message={t('appointments.form.cancelUnsavedMessage')}
        confirm={{
          label: t('actions.close'),
          variant: 'danger',
          onPress: () => {
            setConfirmDiscard(false);
            setCreateIsDirty(false);
            setCreating(null);
          },
        }}
      />

      <AppointmentDetailDrawer
        appointment={selected}
        onClose={() => setSelected(null)}
        timeZone={timeZone}
        locale={i18n.language}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    marginTop: theme.spacing[8],
  },
  body: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
});
