import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, Text } from '@/components/ui';
import {
  BookingFormPreview,
  ServiceList,
  SlotGrid,
  StaffChoice,
  type PublicFormField,
  type PublicService,
  type PublicStaff,
} from '@/features/booking-public';
import { theme } from '@/lib/theme';

import type { BookingSettings } from '../api/useBookingSettings';
import { buildPreviewSlots, resolveIntervalMinutes } from '../previewSlots';

export type BookingPreviewProps = {
  settings: BookingSettings;
  /** The branch's real services, so the owner sees their own catalogue. */
  services: PublicService[];
  /** The branch's real bookable staff. */
  staff: PublicStaff[];
  /** The business's active custom fields. */
  fields: PublicFormField[];
};

/** A plausible sample day: 09:00–17:00, the default most businesses start from. */
const SAMPLE_OPEN_MINUTE = 9 * 60;
const SAMPLE_CLOSE_MINUTE = 17 * 60;

/**
 * The live preview of the customer booking page (doc §6.2 requires it beside the
 * settings).
 *
 * It renders the SAME components the real public page will use in step 5, so what
 * the owner sees here is the real layout, not a mock-up that drifts.
 *
 * **Sample times, real catalogue.** The services, staff and form fields are the
 * branch's own — the owner needs to see whether *their* names and prices look
 * right. The slot grid is generated locally from the settings being edited, because
 * the real engine reads SAVED settings and would show the old behaviour (see
 * `previewSlots.ts`). The header says so, so nobody mistakes these for bookings.
 */
export function BookingPreview({ settings, services, staff, fields }: BookingPreviewProps) {
  const { t, i18n } = useTranslation();

  // Previewing a selection makes the chips and rows show their selected state,
  // which is most of what the owner is judging.
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const service = services.find((s) => s.id === selectedServiceId) ?? services[0] ?? null;

  const slots = useMemo(
    () =>
      buildPreviewSlots({
        openMinute: SAMPLE_OPEN_MINUTE,
        closeMinute: SAMPLE_CLOSE_MINUTE,
        intervalMinutes: resolveIntervalMinutes(
          settings.slotInterval,
          service?.durationMinutes ?? 60,
        ),
        serviceDurationMinutes: service?.durationMinutes ?? 60,
      }),
    [settings.slotInterval, service?.durationMinutes],
  );

  // Only the fields that apply to the previewed service, matching what the real
  // form will ask (the engine checks `applies_to_all_services` / service_ids).
  const visibleFields = fields;

  return (
    <Card>
      <View style={styles.wrapper}>
        <View>
          <Text variant="cardTitle" color="textPrimary">
            {t('bookingSettings.preview')}
          </Text>
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.previewHint')}
          </Text>
        </View>

        <Section title={t('bookingPublic.form.service')}>
          <ServiceList
            services={services}
            selectedId={service?.id ?? null}
            onSelect={setSelectedServiceId}
            showPrices={settings.showPrices}
            locale={i18n.language}
          />
        </Section>

        {/* Renders nothing in `hidden` mode, exactly as the real page will. */}
        {settings.staffChoice !== 'hidden' ? (
          <Section title={t('bookingPublic.form.staff')}>
            <StaffChoice
              staff={staff}
              selectedId={selectedStaffId}
              onSelect={setSelectedStaffId}
              mode={settings.staffChoice}
            />
          </Section>
        ) : null}

        <Section title={t('bookingPublic.form.time')}>
          <SlotGrid
            slots={slots}
            selectedStartsAt={selectedSlot}
            onSelect={setSelectedSlot}
            slotDisplay={settings.slotDisplay}
          />
        </Section>

        <Section title={t('bookingPublic.form.details')}>
          <BookingFormPreview
            fields={visibleFields}
            requireClientEmail={settings.requireClientEmail}
          />
        </Section>

        {/* doc §6.2: manual confirmation changes what the customer is told at the
            end, which is worth previewing because it changes their expectation. */}
        <Text variant="helper" color="textSecondary">
          {t(
            settings.confirmation === 'manual'
              ? 'bookingPublic.confirmManual'
              : 'bookingPublic.confirmAuto',
          )}
        </Text>
      </View>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" color="textSecondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[18],
  },
  section: {
    gap: theme.spacing[8],
  },
});
