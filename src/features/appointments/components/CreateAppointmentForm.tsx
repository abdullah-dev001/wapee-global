import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Calendar, FormField, PhoneInput, SearchInput, TimePicker } from '@/components/shared';
import { Button, SegmentedControl, Select, Text, Toggle, useToast } from '@/components/ui';
import { useServices } from '@/features/services/api/useServices';
import { useBranchSchedule } from '@/features/schedule/api/useBranchSchedule';
import { useStaffSchedule } from '@/features/schedule/api/useSchedule';
import { useStaff } from '@/features/staff/api/useStaff';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { todayInZone, weekdayOfLocalDate, zonedToUtc, type IanaTimeZone } from '@/lib/time';

import { useCreateAppointment } from '../api/useAppointments';
import { useClientSearch } from '../api/useClientSearch';
import { useMyStaffProfile } from '../api/useMyStaffProfile';
import {
  createAppointmentSchema,
  emptyCreateAppointment,
  type CreateAppointmentValues,
} from '../schemas/createAppointment.schemas';
import { AppointmentRpcError, type AppointmentErrorCode } from '../types';

export type CreateAppointmentFormProps = {
  timeZone: IanaTimeZone;
  /** Pre-fills the date/time when opened from a tapped slot. */
  initialDate?: string;
  initialMinute?: number;
  initialStaffId?: string | null;
  onDone: () => void;
  /** Reports whether the form has unsaved changes, so the caller can confirm before closing. */
  onDirtyChange?: (isDirty: boolean) => void;
};

export function CreateAppointmentForm({
  timeZone,
  initialDate,
  initialMinute,
  initialStaffId,
  onDone,
  onDirtyChange,
}: CreateAppointmentFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const canViewAllStaff = usePermission('calendar.view_all_staff');
  const myStaffProfile = useMyStaffProfile(businessId);
  const services = useServices(businessId, branchId, { includeInactive: false });
  const staff = useStaff(businessId, branchId, { includeInactive: false });
  const create = useCreateAppointment(businessId);

  const [clientSearch, setClientSearch] = useState('');
  const clientResults = useClientSearch(businessId, clientSearch);
  const [serverError, setServerError] = useState<AppointmentErrorCode | null>(null);

  const isOwnScopeOnly = !canViewAllStaff.allowed;

  const { control, handleSubmit, setValue, formState } = useForm<CreateAppointmentValues>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      ...emptyCreateAppointment,
      date: initialDate ?? todayInZone(timeZone),
      minute: initialMinute ?? emptyCreateAppointment.minute,
      staffId: isOwnScopeOnly ? (myStaffProfile.data ?? null) : (initialStaffId ?? null),
    },
  });

  useEffect(() => {
    onDirtyChange?.(formState.isDirty);
    // react-hook-form's formState is a Proxy that only reports a field as
    // read/changed once something has actually touched it, so `isDirty` alone
    // is a safe "has anything been typed" signal here (same as FormStep's).
  }, [formState.isDirty, onDirtyChange]);

  const clientMode = useWatch({ control, name: 'clientMode' });
  const clientId = useWatch({ control, name: 'clientId' });
  const serviceId = useWatch({ control, name: 'serviceId' });
  const staffId = useWatch({ control, name: 'staffId' });
  const date = useWatch({ control, name: 'date' });
  const minute = useWatch({ control, name: 'minute' });
  const isWalkIn = useWatch({ control, name: 'isWalkIn' });
  const phoneField = useController({ control, name: 'clientPhone' }).field;

  const isOutOfHours = useOutOfHoursWarning(businessId, branchId, staffId, date, minute);

  const serviceOptions = useMemo(
    () => (services.data ?? []).map((service) => ({ value: service.id, label: service.name })),
    [services.data],
  );
  const staffOptions = useMemo(() => {
    const options = (staff.data ?? []).map((member) => ({
      value: member.id,
      label: member.displayName,
    }));
    return [{ value: '', label: t('appointments.form.anyStaff') }, ...options];
  }, [staff.data, t]);

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    const startsAt = zonedToUtc(values.date, minuteToTimeText(values.minute), timeZone);

    create.mutate(
      {
        branchId: branchId ?? '',
        serviceId: values.serviceId,
        startsAt,
        staffId: values.staffId || undefined,
        clientId: values.clientMode === 'existing' ? values.clientId : undefined,
        clientName: values.clientMode === 'new' ? values.clientName : undefined,
        clientPhone: values.clientMode === 'new' ? values.clientPhone : undefined,
        clientEmail: values.clientMode === 'new' ? values.clientEmail : undefined,
        clientNotes: values.clientNotes,
        internalNotes: values.internalNotes,
        source: values.isWalkIn ? 'walk_in' : 'dashboard',
      },
      {
        onSuccess: () => {
          toast.show({ message: t('appointments.form.submit'), tone: 'success' });
          onDone();
        },
        onError: (error) => {
          if (error instanceof AppointmentRpcError) {
            setServerError(error.code as AppointmentErrorCode);
          } else {
            toast.show({ message: error.message, tone: 'error' });
          }
        },
      },
    );
  });

  return (
    <View style={styles.container}>
      <SegmentedControl
        label={t('appointments.form.client')}
        options={[
          { value: 'existing', label: t('appointments.form.existingClient') },
          { value: 'new', label: t('appointments.form.newClient') },
        ]}
        value={clientMode}
        onChange={(value) => setValue('clientMode', value, { shouldDirty: true })}
      />

      {clientMode === 'existing' ? (
        <View style={styles.clientSearch}>
          <SearchInput
            onSearch={setClientSearch}
            placeholder={t('appointments.form.clientSearchPlaceholder')}
          />
          {clientResults.data && clientResults.data.length > 0 ? (
            <View style={styles.clientResults}>
              {clientResults.data.map((result) => (
                <Pressable
                  key={result.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    result.phoneE164 ? `${result.fullName}, ${result.phoneE164}` : result.fullName
                  }
                  accessibilityState={{ selected: clientId === result.id }}
                  onPress={() => setValue('clientId', result.id, { shouldDirty: true })}
                  style={[
                    styles.clientRow,
                    clientId === result.id ? styles.clientRowSelected : null,
                  ]}
                >
                  <Text variant="bodyStrong">{result.fullName}</Text>
                  <Text variant="caption" color="textSecondary">
                    {result.phoneE164}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.newClientFields}>
          <FormField
            control={control}
            name="clientName"
            label={t('appointments.form.clientName')}
            required
          />
          <PhoneInput
            label={t('appointments.form.clientPhone')}
            value={phoneField.value ?? ''}
            onChange={phoneField.onChange}
          />
          <FormField
            control={control}
            name="clientEmail"
            label={t('appointments.form.clientEmail')}
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>
      )}

      <Select
        label={t('appointments.form.service')}
        options={serviceOptions}
        value={serviceId || null}
        onChange={(value) => setValue('serviceId', value, { shouldDirty: true })}
        required
      />

      {!isOwnScopeOnly ? (
        <Select
          label={t('appointments.form.staff')}
          options={staffOptions}
          value={staffId ?? ''}
          onChange={(value) => setValue('staffId', value || null, { shouldDirty: true })}
        />
      ) : null}

      <Calendar
        value={date}
        onChange={(value) => setValue('date', value, { shouldDirty: true })}
        timeZone={timeZone}
      />

      <TimePicker
        label={t('appointments.form.time')}
        value={minute}
        onChange={(value) => setValue('minute', value ?? 0, { shouldDirty: true })}
      />

      {isOutOfHours ? (
        <Text variant="helper" color="warning">
          {t('appointments.outOfHoursWarning')}
        </Text>
      ) : null}

      <View style={styles.walkInRow}>
        <Toggle
          value={isWalkIn}
          onValueChange={(value) => setValue('isWalkIn', value, { shouldDirty: true })}
          label={t('appointments.form.isWalkIn')}
        />
      </View>

      <FormField
        control={control}
        name="clientNotes"
        label={t('appointments.form.notes')}
        multiline
      />
      <FormField
        control={control}
        name="internalNotes"
        label={t('appointments.form.internalNotes')}
        multiline
      />

      {serverError ? (
        <Text variant="helper" color="error">
          {t(`appointments.errors.${serverError}`)}
        </Text>
      ) : null}

      <Button onPress={onSubmit} loading={create.isPending}>
        {isWalkIn ? t('appointments.form.submitWalkIn') : t('appointments.form.submit')}
      </Button>
    </View>
  );
}

function minuteToTimeText(minute: number): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Warns when the chosen slot falls outside the staff member's recurring
 * working hours for that weekday, OR outside the branch's hours when no
 * staff is picked yet. Doc §6.2: staff can still book it — this is advisory
 * only, never a block, and the RPC enforces nothing based on it.
 */
function useOutOfHoursWarning(
  businessId: string | null,
  branchId: string | null,
  staffId: string | null,
  date: string,
  minute: number,
): boolean {
  const branchSchedule = useBranchSchedule(businessId, branchId);
  const staffSchedule = useStaffSchedule(businessId, branchId, staffId);

  if (!date) return false;
  const dayOfWeek = weekdayOfLocalDate(date);

  const intervals = staffId ? staffSchedule.data?.workingHours : branchSchedule.data?.hours;
  if (!intervals) return false;

  const withinHours = intervals.some(
    (interval) =>
      interval.dayOfWeek === dayOfWeek &&
      minute >= interval.startMinute &&
      minute < interval.endMinute,
  );
  return !withinHours;
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
  },
  clientSearch: {
    gap: theme.spacing[8],
  },
  clientResults: {
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  clientRow: {
    padding: theme.spacing[12],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  clientRowSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  newClientFields: {
    gap: theme.spacing[12],
  },
  walkInRow: {
    flexDirection: 'row',
  },
});
