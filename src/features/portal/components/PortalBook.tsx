import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Calendar } from '@/components/shared';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useBookingPage, useSlots } from '@/features/booking-public/api';
import { ServiceList, SlotGrid, StaffChoice } from '@/features/booking-public/components';
import { actionFor } from '@/features/booking-public/errorHandling';
import { PublicApiError } from '@/features/booking-public/types';
import { addDaysToLocalDate, todayInZone, type LocalDate } from '@/lib/time';
import { theme } from '@/lib/theme';

import { usePortalBook, type PortalClient } from '../api/usePortal';
import { portalErrorKey } from '../portalLogic';

type Props = { slug: string; session: string; clients: PortalClient[]; onClose: () => void };

/** Book a new visit. The services, staff and free times all come from the public engine; nothing is re-derived here. */
export function PortalBook({ slug, session, clients, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const page = useBookingPage(slug);
  const book = usePortalBook(slug, session);
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<LocalDate | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const zone = page.data?.settings.timezone ?? 'UTC';
  const today = useMemo(() => todayInZone(zone), [zone]);
  const day = date ?? today;
  const maxDate = useMemo(
    () => addDaysToLocalDate(today, page.data?.settings.bookingWindowDays ?? 60),
    [today, page.data],
  );
  const slots = useSlots(
    serviceId ? { slug, serviceId, staffId, fromDate: day, toDate: day } : null,
  );
  const staff = useMemo(() => {
    if (!page.data || !serviceId) return [];
    const ids = new Set(
      page.data.serviceStaff.filter((x) => x.serviceId === serviceId).map((x) => x.staffId),
    );
    return page.data.staff.filter((s) => ids.has(s.id));
  }, [page.data, serviceId]);

  const submit = () => {
    if (!serviceId || !slot) return;
    book.mutate(
      { clientId, serviceId, startsAt: slot, staffId, notes: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.show({ message: t('portal.book.booked'), tone: 'success' });
          onClose();
        },
        onError: (error) => {
          const code = error instanceof PublicApiError ? error.code : null;
          const gone = code !== null && actionFor(code).kind === 'refresh_slots';
          setSlot(null);
          toast.show({
            message: gone ? t('portal.bookings.slotGone') : t(portalErrorKey(code)),
            tone: gone ? 'warning' : 'error',
          });
          if (gone) void slots.refetch();
        },
      },
    );
  };

  let body: React.ReactNode;
  if (page.isPending) body = <Skeleton height={96} radius="md" />;
  else if (page.isError) {
    body = (
      <ErrorState
        title={t('portal.loadErrorTitle')}
        description={t('portal.loadErrorBody')}
        onRetry={() => page.refetch()}
        retryLabel={t('actions.retry')}
        compact
      />
    );
  } else if (page.data.services.length === 0) {
    body = <EmptyState title={t('portal.book.noServices')} />;
  } else {
    body = (
      <>
        {clients.length > 1 ? (
          <SegmentedControl
            label={t('portal.book.who')}
            value={clientId}
            onChange={setClientId}
            options={clients.map((c) => ({ value: c.id, label: c.first_name }))}
          />
        ) : null}
        <Text variant="cardTitle">{t('portal.book.service')}</Text>
        <ServiceList
          services={page.data.services}
          selectedId={serviceId}
          onSelect={(id) => {
            setServiceId(id);
            setStaffId(null);
            setSlot(null);
          }}
          showPrices={page.data.settings.showPrices}
          locale={i18n.language}
        />
        {serviceId ? (
          <>
            <StaffChoice
              staff={staff}
              selectedId={staffId}
              onSelect={(id) => {
                setStaffId(id);
                setSlot(null);
              }}
              mode={page.data.settings.staffChoice}
            />
            <Text variant="cardTitle">{t('portal.book.pickTime')}</Text>
            <Calendar
              value={day}
              onChange={(d) => {
                setDate(d);
                setSlot(null);
              }}
              minDate={today}
              maxDate={maxDate}
              timeZone={zone}
            />
            {slots.isPending ? (
              <Skeleton height={theme.layout.minTouchTarget} radius="md" />
            ) : slots.isError ? (
              <ErrorState
                title={t('bookingPublic.slotsErrorTitle')}
                description={t('bookingPublic.slotsErrorBody')}
                onRetry={() => slots.refetch()}
                retryLabel={t('actions.retry')}
                compact
              />
            ) : (
              <SlotGrid
                slots={slots.data.slots}
                selectedStartsAt={slot}
                onSelect={setSlot}
                slotDisplay={page.data.settings.slotDisplay}
              />
            )}
            <Input
              label={t('portal.book.note')}
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
            />
            <Button disabled={!slot} onPress={submit} loading={book.isPending}>
              {t('portal.book.confirm')}
            </Button>
          </>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Button variant="ghost" size="sm" onPress={onClose}>
          {t('actions.back')}
        </Button>
        <Text variant="sectionTitle" style={styles.grow}>
          {t('portal.book.title')}
        </Text>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[16] },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
});
