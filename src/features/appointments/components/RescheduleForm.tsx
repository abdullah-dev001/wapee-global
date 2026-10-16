import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Calendar, TimePicker } from '@/components/shared';
import { Button, Select, Text, useToast } from '@/components/ui';
import { useStaff } from '@/features/staff/api/useStaff';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDateTime, type IanaTimeZone, type LocaleTag } from '@/lib/time';

import { useUpdateAppointment } from '../api/useAppointments';
import { appointmentErrorKey, type AppointmentErrorKey } from '../appointmentErrorKey';
import {
  eligibleStaff,
  initialRescheduleValues,
  rescheduleInput,
  type RescheduleScope,
  type RescheduleValues,
} from '../reschedule';
import { type AppointmentRow } from '../types';
import { useOutOfHoursWarning } from '../useOutOfHoursWarning';

export type RescheduleFormProps = {
  appointment: AppointmentRow;
  /** `own`: the staff member stays the caller (Own scope); `branch`: any eligible staff. */
  scope: Exclude<RescheduleScope, 'none'>;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  onDone: () => void;
  onCancel: () => void;
};

/**
 * Move an appointment to another time and/or staff member (same service).
 * `update_appointment` validates everything server-side (permission, scope,
 * status, collision with its own row excluded, buffer); the customer gets the
 * existing "rescheduled" email from the appointments trigger when the time changes.
 */
export function RescheduleForm({
  appointment,
  scope,
  timeZone,
  locale,
  onDone,
  onCancel,
}: RescheduleFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const update = useUpdateAppointment(businessId);
  const staff = useStaff(businessId, appointment.branchId, { includeInactive: false });

  const [values, setValues] = useState<RescheduleValues>(() =>
    initialRescheduleValues(appointment, timeZone),
  );
  const [errorKey, setErrorKey] = useState<AppointmentErrorKey | null>(null);

  const isOutOfHours = useOutOfHoursWarning(
    businessId,
    appointment.branchId,
    values.staffId,
    values.date,
    values.minute,
  );

  const staffOptions = useMemo(
    () =>
      eligibleStaff(
        staff.data ?? [],
        appointment.serviceId,
        appointment.branchId,
        appointment.staffId,
      ).map((member) => ({ value: member.id, label: member.displayName })),
    [staff.data, appointment.serviceId, appointment.branchId, appointment.staffId],
  );

  const input = rescheduleInput(appointment, values, timeZone);

  const change = (patch: Partial<RescheduleValues>) => {
    setErrorKey(null);
    setValues((current) => ({ ...current, ...patch }));
  };

  const save = () => {
    if (!input) return;
    setErrorKey(null);
    update.mutate(
      { appointmentId: appointment.id, startsAt: input.startsAt, staffId: input.staffId },
      {
        onSuccess: () => {
          toast.show({ message: t('appointments.reschedule.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => setErrorKey(appointmentErrorKey(error)),
      },
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text variant="label" color="textSecondary">
          {t('appointments.reschedule.current')}
        </Text>
        <Text variant="body">
          {formatDateTime(appointment.startsAt, timeZone, locale, 'long')}
          {appointment.staffName ? ` · ${appointment.staffName}` : ''}
        </Text>
      </View>

      {scope === 'branch' ? (
        <Select
          label={t('appointments.form.staff')}
          options={staffOptions}
          value={values.staffId}
          onChange={(value) => change({ staffId: value })}
        />
      ) : null}

      <Calendar value={values.date} onChange={(date) => change({ date })} timeZone={timeZone} />

      <TimePicker
        label={t('appointments.form.time')}
        value={values.minute}
        onChange={(minute) => change({ minute: minute ?? 0 })}
      />

      {isOutOfHours ? (
        <Text variant="helper" color="warning">
          {t('appointments.reschedule.outOfHours')}
        </Text>
      ) : null}

      {input?.startsAt ? (
        <Text variant="helper" color="textSecondary">
          {t('appointments.reschedule.clientNotified')}
        </Text>
      ) : null}

      {errorKey ? (
        <Text variant="helper" color="error">
          {t(errorKey)}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button onPress={save} loading={update.isPending} disabled={!input}>
          {t('appointments.reschedule.save')}
        </Button>
        <Button variant="ghost" onPress={onCancel} disabled={update.isPending}>
          {t('appointments.reschedule.back')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
  },
  row: {
    gap: theme.spacing[4],
  },
  actions: {
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
});
