import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarX } from 'lucide-react-native';

import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { PublicApiError } from '@/features/booking-public/types';
import { formatMoney, money } from '@/lib/money';
import { formatDateTime, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { usePortalBookings, usePortalCancel, type PortalBooking } from '../api/usePortal';
import { portalErrorKey } from '../portalLogic';

const TONE: Record<string, 'warning' | 'success' | 'neutral' | 'error'> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'neutral',
  cancelled: 'error',
  no_show: 'error',
};

type Props = {
  slug: string;
  session: string;
  onReschedule: (b: PortalBooking) => void;
  onBook: () => void;
};

export function PortalBookings({ slug, session, onReschedule, onBook }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelling, setCancelling] = useState<PortalBooking | null>(null);
  const list = usePortalBookings(slug, session, scope);
  const cancel = usePortalCancel(slug, session);

  const confirmCancel = () => {
    if (!cancelling) return;
    cancel.mutate(
      { appointmentId: cancelling.id },
      {
        onSuccess: () => {
          setCancelling(null);
          toast.show({ message: t('portal.bookings.cancelled'), tone: 'success' });
        },
        onError: (error) => {
          setCancelling(null);
          const code = error instanceof PublicApiError ? error.code : null;
          toast.show({ message: t(portalErrorKey(code)), tone: 'error' });
        },
      },
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <SegmentedControl
          value={scope}
          onChange={setScope}
          options={[
            { value: 'upcoming', label: t('portal.bookings.upcoming') },
            { value: 'past', label: t('portal.bookings.past') },
          ]}
        />
        <Button onPress={onBook}>{t('portal.bookings.book')}</Button>
      </View>

      {list.isPending ? (
        <Skeleton height={96} radius="md" />
      ) : list.isError ? (
        <ErrorState
          title={t('portal.loadErrorTitle')}
          description={t('portal.loadErrorBody')}
          onRetry={() => list.refetch()}
          retryLabel={t('actions.retry')}
          compact
        />
      ) : list.data.rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={
            scope === 'upcoming'
              ? t('portal.bookings.emptyUpcoming')
              : t('portal.bookings.emptyPast')
          }
          description={scope === 'upcoming' ? t('portal.bookings.emptyUpcomingBody') : undefined}
        />
      ) : (
        list.data.rows.map((b) => (
          <Card key={b.id}>
            <View style={styles.row}>
              <Text variant="cardTitle" style={styles.grow}>
                {b.service_name}
              </Text>
              <Badge tone={TONE[b.status] ?? 'neutral'} dot>
                {t(`portal.bookings.status.${b.status as 'pending'}`)}
              </Badge>
            </View>
            <Text variant="body">
              {formatDateTime(b.starts_at as UtcIso, b.timezone, i18n.language, 'long')}
            </Text>
            <Text variant="helper" color="textSecondary">
              {[
                b.staff_name ? t('portal.bookings.with', { name: b.staff_name }) : null,
                b.branch_name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {b.price_minor !== null ? (
              <Text variant="helper" color="textSecondary">
                {formatMoney(money(b.price_minor, b.currency), i18n.language)}
              </Text>
            ) : null}
            {b.client_notes ? (
              <Text variant="helper" color="textSecondary">
                {t('portal.bookings.yourNote', { note: b.client_notes })}
              </Text>
            ) : null}
            {scope === 'upcoming' ? (
              <View style={styles.actions}>
                {b.can_cancel ? (
                  <>
                    <Button variant="secondary" size="sm" onPress={() => onReschedule(b)}>
                      {t('portal.bookings.reschedule')}
                    </Button>
                    <Button variant="danger" size="sm" onPress={() => setCancelling(b)}>
                      {t('portal.bookings.cancel')}
                    </Button>
                  </>
                ) : b.cancel_cutoff_hours !== null ? (
                  <Text variant="helper" color="textMuted">
                    {t('portal.bookings.cancelCutoff', { hours: b.cancel_cutoff_hours })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Card>
        ))
      )}

      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={t('portal.bookings.cancelTitle')}
        message={t('portal.bookings.cancelBody')}
        busy={cancel.isPending}
        confirm={{
          label: t('portal.bookings.cancelConfirm'),
          onPress: confirmCancel,
          loading: cancel.isPending,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[12] },
  bar: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
});
