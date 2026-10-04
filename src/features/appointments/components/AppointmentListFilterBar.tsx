import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SearchInput } from '@/components/shared';
import { Select } from '@/components/ui';
import { useServices } from '@/features/services/api/useServices';
import { useStaff } from '@/features/staff/api/useStaff';
import { theme } from '@/lib/theme';

import { type AppointmentListFilters } from '../api/useAppointments';
import { type AppointmentStatus } from '../types';

export type AppointmentListFilterBarProps = {
  businessId: string | null;
  branchId: string | null;
  filters: AppointmentListFilters;
  onChange: (filters: AppointmentListFilters) => void;
};

const STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

/**
 * Status / staff / service / search filters for the List view. Lives in the
 * caller's state, which the screen mirrors to the URL on web (CLAUDE.md §6).
 */
export function AppointmentListFilterBar({
  businessId,
  branchId,
  filters,
  onChange,
}: AppointmentListFilterBarProps) {
  const { t } = useTranslation();
  const services = useServices(businessId, branchId, { includeInactive: true });
  const staff = useStaff(businessId, branchId, { includeInactive: true });

  const statusOptions = [
    { value: '', label: t('appointments.list.allStatuses') },
    ...STATUSES.map((status) => ({ value: status, label: t(`appointments.status.${status}`) })),
  ];
  const serviceOptions = [
    { value: '', label: t('appointments.list.allServices') },
    ...(services.data ?? []).map((service) => ({ value: service.id, label: service.name })),
  ];
  const staffOptions = [
    { value: '', label: t('appointments.allStaff') },
    ...(staff.data ?? []).map((member) => ({ value: member.id, label: member.displayName })),
  ];

  return (
    <View style={styles.container}>
      <SearchInput
        onSearch={(search) => onChange({ ...filters, search })}
        placeholder={t('appointments.list.searchPlaceholder')}
        initialValue={filters.search}
      />
      <View style={styles.row}>
        <View style={styles.field}>
          <Select
            label={t('appointments.list.filterStatus')}
            options={statusOptions}
            value={filters.status ?? ''}
            onChange={(value) =>
              onChange({ ...filters, status: (value || null) as AppointmentStatus | null })
            }
          />
        </View>
        <View style={styles.field}>
          <Select
            label={t('appointments.list.filterStaff')}
            options={staffOptions}
            value={filters.staffId ?? ''}
            onChange={(value) => onChange({ ...filters, staffId: value || null })}
          />
        </View>
        <View style={styles.field}>
          <Select
            label={t('appointments.list.filterService')}
            options={serviceOptions}
            value={filters.serviceId ?? ''}
            onChange={(value) => onChange({ ...filters, serviceId: value || null })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[12],
    paddingHorizontal: theme.layout.pagePadding,
    paddingBottom: theme.spacing[12],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
  field: {
    minWidth: 160,
    flexGrow: 1,
  },
});
