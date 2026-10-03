import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Drawer, ErrorState, Tabs } from '@/components/ui';
import { RouteGuard } from '@/features/auth';
import {
  useBookingSettings,
  useBranchBookable,
  usePreviewCatalogue,
  type BookingSettings,
} from '@/features/booking-settings/api';
import {
  BookingLinkCard,
  BookingPreview,
  BookingSettingsForm,
  BookingWarnings,
  CustomFieldList,
} from '@/features/booking-settings/components';
import { bookingLinkIsLive, bookingWarnings } from '@/features/booking-settings/bookingWarnings';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme, useBreakpoint } from '@/lib/theme';

/**
 * Booking settings for the current branch (doc §6.2), with the live preview the
 * doc asks to sit beside them.
 *
 * Layout, mobile first:
 *   * mobile/tablet — settings full width, preview behind a "Show preview" button
 *     in a full-screen sheet. A 375px column cannot show both, and the preview is
 *     the thing you consult rather than the thing you edit.
 *   * desktop (≥1024) — two columns, settings left and preview permanently right,
 *     which is what "beside the settings" means when there is room.
 */
export default function BookingSettingsScreen() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const { businessId, branchId, business } = useCurrentScope();
  const canEdit = usePermission('settings.booking', branchId);

  // The draft is held here so the preview re-renders as the owner edits, before
  // anything is saved — the point of a live preview.
  const [draft, setDraft] = useState<BookingSettings | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Two tabs rather than one long page: the settings and the form builder are
  // separate jobs, and the builder's drawer would fight a long scroll.
  const [tab, setTab] = useState<'settings' | 'form'>('settings');

  const settings = useBookingSettings(businessId, branchId);
  const bookable = useBranchBookable(businessId, branchId);

  // The branch owns the currency (decision 23), so the preview's prices use it.
  const currency = useMemo(() => {
    const branch = business?.branches.find((b) => b.id === branchId);
    return branch?.currency ?? 'GBP';
  }, [business, branchId]);

  const catalogue = usePreviewCatalogue(businessId, branchId, currency);

  const effective = draft ?? settings.data ?? null;

  const warnings = useMemo(
    () =>
      bookingWarnings(bookable.data, {
        // The SAVED buffer, not the draft: the warning is about the real
        // interaction with per-service buffers, which are also saved values.
        branchBufferMinutes: settings.data?.bufferMinutes ?? 0,
        serviceBufferMinutes: catalogue.data?.serviceBufferMinutes ?? [],
      }),
    [bookable.data, settings.data?.bufferMinutes, catalogue.data?.serviceBufferMinutes],
  );

  const onDraftChange = useCallback((next: BookingSettings) => setDraft(next), []);

  const preview =
    effective && catalogue.data ? (
      <BookingPreview
        settings={effective}
        services={catalogue.data.services}
        staff={catalogue.data.staff}
        fields={catalogue.data.fields}
      />
    ) : null;

  if (settings.isError) {
    return (
      <RouteGuard>
        <Screen edges={['top']}>
          <PageContainer title={t('bookingSettings.title')}>
            <ErrorState
              title={t('bookingSettings.error.unknown_branch')}
              onRetry={() => void settings.refetch()}
              retryLabel={t('actions.retry')}
            />
          </PageContainer>
        </Screen>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer
          title={t('bookingSettings.title')}
          subtitle={t('bookingSettings.subtitle')}
          actions={
            // The preview toggle only exists where the preview is not already
            // visible beside the settings.
            !isDesktop && preview ? (
              <Button
                variant="ghost"
                size="sm"
                startIcon={previewOpen ? EyeOff : Eye}
                onPress={() => setPreviewOpen(true)}
              >
                {t('bookingSettings.showPreview')}
              </Button>
            ) : undefined
          }
        >
          <View style={styles.stack}>
            <Tabs
              items={[
                { value: 'settings', label: t('bookingFields.settingsTab') },
                { value: 'form', label: t('bookingFields.tab') },
              ]}
              value={tab}
              onChange={setTab}
            />

            <View style={isDesktop ? styles.twoColumn : undefined}>
              <View style={isDesktop ? styles.settingsColumn : styles.stack}>
                {/* The warnings and the link describe the branch as a whole, so
                    they stay visible on both tabs. */}
                <BookingWarnings warnings={warnings} />

                <BookingLinkCard
                  businessSlug={business?.slug ?? null}
                  isLive={bookingLinkIsLive(bookable.data)}
                />

                {tab === 'settings' ? (
                  <BookingSettingsForm
                    businessId={businessId}
                    branchId={branchId}
                    canEdit={canEdit.allowed}
                    serviceBufferMinutes={catalogue.data?.serviceBufferMinutes ?? []}
                    draft={draft}
                    onDraftChange={onDraftChange}
                  />
                ) : (
                  <CustomFieldList
                    businessId={businessId}
                    canEdit={canEdit.allowed}
                    services={(catalogue.data?.services ?? []).map((service) => ({
                      id: service.id,
                      name: service.name,
                    }))}
                    requireClientEmail={effective?.requireClientEmail ?? false}
                  />
                )}
              </View>

              {isDesktop ? <View style={styles.previewColumn}>{preview}</View> : null}
            </View>
          </View>
        </PageContainer>

        {/* Mobile and tablet: the preview is a full-screen sheet (Drawer handles
            that responsively and already owns its own ScrollView). */}
        {!isDesktop ? (
          <Drawer
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            title={t('bookingSettings.preview')}
            subtitle={t('bookingSettings.previewHint')}
          >
            {preview}
          </Drawer>
        ) : null}
      </Screen>
    </RouteGuard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing[16],
  },
  twoColumn: {
    flexDirection: 'row',
    gap: theme.spacing[24],
    alignItems: 'flex-start',
  },
  settingsColumn: {
    flex: 1,
    gap: theme.spacing[16],
    // Stops the settings column collapsing when the preview is wide.
    minWidth: 0,
  },
  previewColumn: {
    // Roughly a phone's width, so the preview reads as the customer's view
    // rather than as a stretched desktop page.
    width: 400,
    flexShrink: 0,
  },
});
