import { useTranslation } from 'react-i18next';

import { Badge, type BadgeTone } from '@/components/ui';
import { type Database } from '@/lib/supabase/database.types';

export type AppointmentStatus = Database['public']['Enums']['appointment_status'];

const TONE_BY_STATUS: Record<AppointmentStatus, BadgeTone> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'info',
  cancelled: 'error',
  no_show: 'neutral',
};

export type StatusBadgeProps = {
  status: AppointmentStatus;
};

/** Appointment status pill: tone + translated label, so callers never repeat the mapping. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONE_BY_STATUS[status]} dot>
      {t(`appointments.status.${status}`)}
    </Badge>
  );
}
