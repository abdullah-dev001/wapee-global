import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen, PageContainer } from '@/components/layout';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { Button, Dialog, EmptyState, ErrorState, Skeleton, Text, useToast } from '@/components/ui';
import { useOverlayDismiss } from '@/components/ui/useOverlayDismiss';
import { brand } from '@/config/brand';
import { theme, useBreakpoint } from '@/lib/theme';
import { Calendar as CalendarIcon } from 'lucide-react-native';

import { useBookingPage, useCreateBooking } from '../api';
import {
  currentStep,
  initialFlowState,
  previousStep,
  resetFrom,
  type BookingFlowState,
  type BookingStep,
} from '../flowState';
import { actionFor } from '../errorHandling';
import { PublicApiError, type CreateBookingResult, type PublicSlot } from '../types';
import { ServiceStep, StaffStep, SlotStep, FormStep, ConfirmationStep } from './steps';

export type BookingFlowProps = {
  slug: string;
};

const DESKTOP_MAX_WIDTH = 560;

/**
 * Orchestrates the public booking flow for one slug: service -> staff (maybe
 * skipped) -> slot -> form -> confirmation. All business rules (availability,
 * buffer, notice, window, capacity, answer validation) live server-side
 * (`get_booking_page`, `get_slots`, `create_booking`) — this component only
 * tracks which step the customer is on and what they have chosen so far.
 */
export function BookingFlow({ slug }: BookingFlowProps) {
  const { t, i18n } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const toast = useToast();

  const page = useBookingPage(slug);
  const createBooking = useCreateBooking();

  const [flow, setFlow] = useState<BookingFlowState>(initialFlowState);
  const [confirmed, setConfirmed] = useState<CreateBookingResult | null>(null);
  const [startToken, setStartToken] = useState<string | null>(null);
  const [serverFieldError, setServerFieldError] = useState<{
    fieldId: string | null;
    message: 'missing' | 'invalid';
  } | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  // Set by FormStep the moment any field is touched. The form's own values
  // live inside FormStep's react-hook-form instance and are lost if it
  // unmounts, so going back from a dirty form must confirm first rather than
  // silently discard what the customer typed (CLAUDE.md §4: "Unsaved form ->
  // confirm before leaving").
  const [formDirty, setFormDirty] = useState(false);
  const [confirmLeaveForm, setConfirmLeaveForm] = useState(false);

  const staffChoice = page.data?.settings.staffChoice ?? 'optional';
  const step: BookingStep = currentStep(flow, staffChoice, confirmed !== null);

  const stepBack = useCallback(() => {
    const prev = previousStep(step, staffChoice);
    if (!prev) return;
    // Clear the TARGET step's own choice (and anything after it), not the
    // step we are leaving — resetFrom('slot') clears startsAt, which is what
    // "go back to the slot step" must do. Passing `step` here was a bug: it
    // cleared the step we were already on (already-empty fields), so the
    // on-screen Back button and Android hardware back did nothing at all.
    setFlow((current) => resetFrom(current, prev));
    setFormDirty(false);
  }, [step, staffChoice]);

  const goBack = useCallback(() => {
    if (step === 'form' && formDirty) {
      setConfirmLeaveForm(true);
      return;
    }
    stepBack();
  }, [step, formDirty, stepBack]);

  // Hardware/Escape back moves one step back through the flow instead of
  // leaving the page, as long as we are not on the very first step — the
  // CLAUDE.md requirement that back-through-steps never loses entered data
  // without asking, because `resetFrom` only clears fields that genuinely
  // stop being valid, and a dirty form confirms first (above).
  useOverlayDismiss(step !== 'service' && step !== 'confirmation', goBack);

  const fieldsForService = useMemo(() => {
    const serviceId = flow.serviceId;
    if (!page.data || !serviceId) return [];
    return page.data.fields.filter(
      (f) => f.appliesToAllServices || f.serviceIds.includes(serviceId),
    );
  }, [page.data, flow.serviceId]);

  const handleSlotSelect = useCallback((slot: PublicSlot, token: string) => {
    setStartToken(token);
    setFlow((current) => ({ ...current, startsAt: slot.startsAt }));
  }, []);

  const handleFormSubmit = useCallback(
    (values: {
      name: string;
      phone: string;
      email: string;
      notes: string;
      answers: { customFieldId: string; value: string }[];
      honeypotValue: string;
    }) => {
      const { serviceId, startsAt, staffId } = flow;
      if (!page.data || !serviceId || !startsAt || !startToken) return;
      setServerFieldError(null);

      const submit = (token: string) =>
        createBooking.mutate(
          {
            slug,
            serviceId,
            startsAt,
            staffId,
            client: {
              name: values.name,
              phone: values.phone,
              email: values.email || null,
              notes: values.notes || null,
            },
            answers: values.answers,
            startToken: token,
            honeypotValue: values.honeypotValue,
          },
          {
            onSuccess: (result) => setConfirmed(result),
            onError: (error) => {
              if (!(error instanceof PublicApiError)) {
                toast.show({ message: t('bookingPublic.errors.generic'), tone: 'error' });
                return;
              }

              const action = actionFor(error.code, {
                retryAfterSeconds: error.retryAfterSeconds,
                fieldId: error.fieldId,
              });

              switch (action.kind) {
                case 'rate_limited':
                  setIsRateLimited(true);
                  setTimeout(() => setIsRateLimited(false), action.retryAfterSeconds * 1000);
                  break;
                case 'retry_once':
                  // The page can recover gracefully from a too-quick submit:
                  // wait a beat, then resubmit with the SAME answers once.
                  setTimeout(() => submit(token), 1200);
                  break;
                case 'refresh_slots':
                  setFlow((current) => resetFrom(current, 'slot'));
                  toast.show({ message: t('bookingPublic.errors.slotGone'), tone: 'warning' });
                  break;
                case 'highlight_field':
                  setServerFieldError({ fieldId: action.fieldId, message: action.message });
                  break;
                case 'not_available':
                  // Handled by the top-level not_bookable branch below on reload;
                  // mid-flow this reads as a generic failure.
                  toast.show({ message: t('bookingPublic.errors.generic'), tone: 'error' });
                  break;
                case 'retry_button':
                  toast.show({ message: t('bookingPublic.errors.generic'), tone: 'error' });
                  break;
              }
            },
          },
        );

      submit(startToken);
    },
    [page.data, flow, startToken, slug, createBooking, toast, t],
  );

  if (page.isPending) {
    return (
      <Screen>
        <PageContainer maxWidth={isDesktop ? DESKTOP_MAX_WIDTH : undefined}>
          <View style={styles.skeletons}>
            <Skeleton height={28} width="60%" />
            <Skeleton height={80} radius="md" />
            <Skeleton height={80} radius="md" />
            <Skeleton height={80} radius="md" />
          </View>
        </PageContainer>
      </Screen>
    );
  }

  if (page.isError) {
    const code = page.error instanceof PublicApiError ? page.error.code : 'server_error';
    if (code === 'not_bookable') {
      return (
        <Screen>
          <PageContainer maxWidth={isDesktop ? DESKTOP_MAX_WIDTH : undefined}>
            <EmptyState
              icon={CalendarIcon}
              title={t('bookingPublic.notAvailableTitle')}
              description={t('bookingPublic.notAvailableBody')}
            />
          </PageContainer>
        </Screen>
      );
    }
    return (
      <Screen>
        <PageContainer maxWidth={isDesktop ? DESKTOP_MAX_WIDTH : undefined}>
          <ErrorState
            title={t('bookingPublic.errors.loadTitle')}
            description={t('bookingPublic.errors.loadBody')}
            onRetry={() => page.refetch()}
            retryLabel={t('actions.retry')}
          />
        </PageContainer>
      </Screen>
    );
  }

  if (!page.data) return null;
  const data = page.data;

  if (confirmed) {
    const manageUrl = `${brand.urls.site}/${slug}/manage#token=${encodeURIComponent(confirmed.manageToken)}`;
    return (
      <Screen>
        <PageContainer maxWidth={isDesktop ? DESKTOP_MAX_WIDTH : undefined}>
          <ConfirmationStep result={confirmed} manageUrl={manageUrl} locale={i18n.language} />
        </PageContainer>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageContainer title={data.branch.name} maxWidth={isDesktop ? DESKTOP_MAX_WIDTH : undefined}>
        <View style={styles.stepHeader}>
          {step !== 'service' ? (
            <Button variant="ghost" size="sm" onPress={goBack}>
              {t('actions.back')}
            </Button>
          ) : null}
          <Text variant="sectionTitle" style={styles.stepTitle} numberOfLines={1}>
            {t(stepTitleKey(step))}
          </Text>
        </View>

        {step === 'service' ? (
          <ServiceStep
            services={data.services}
            selectedId={flow.serviceId}
            onSelect={(id) => setFlow({ ...initialFlowState, serviceId: id })}
            showPrices={data.settings.showPrices}
            locale={i18n.language}
          />
        ) : null}

        {step === 'staff' && flow.serviceId ? (
          <StaffStep
            serviceId={flow.serviceId}
            staff={data.staff}
            serviceStaff={data.serviceStaff}
            selectedId={flow.staffId}
            onSelect={(id) =>
              setFlow((current) => ({ ...current, staffId: id, staffChosen: true }))
            }
            mode={staffChoice}
          />
        ) : null}

        {step === 'slot' && flow.serviceId ? (
          <SlotStep
            slug={slug}
            serviceId={flow.serviceId}
            staffId={flow.staffId}
            timezone={data.branch.timezone}
            bookingWindowDays={data.settings.bookingWindowDays}
            slotDisplay={data.settings.slotDisplay}
            onSelect={handleSlotSelect}
          />
        ) : null}

        {step === 'form' ? (
          isRateLimited ? (
            <EmptyState
              title={t('bookingPublic.errors.rateLimitedTitle')}
              description={t('bookingPublic.errors.rateLimitedBody')}
            />
          ) : (
            <FormStep
              fields={fieldsForService}
              requireClientEmail={data.settings.requireClientEmail}
              defaultCountry={data.branch.countryCode}
              submitting={createBooking.isPending}
              serverFieldError={serverFieldError}
              onDirtyChange={setFormDirty}
              onSubmit={handleFormSubmit}
            />
          )
        ) : null}
        <LegalLinks />
      </PageContainer>

      <Dialog
        open={confirmLeaveForm}
        onClose={() => setConfirmLeaveForm(false)}
        title={t('bookingPublic.form.leaveTitle')}
        message={t('bookingPublic.form.leaveBody')}
        confirm={{
          label: t('bookingPublic.form.leaveConfirm'),
          variant: 'danger',
          onPress: () => {
            setConfirmLeaveForm(false);
            stepBack();
          },
        }}
      />
    </Screen>
  );
}

function stepTitleKey(
  step: BookingStep,
):
  | 'bookingPublic.steps.service'
  | 'bookingPublic.steps.staff'
  | 'bookingPublic.steps.slot'
  | 'bookingPublic.steps.form'
  | 'bookingPublic.steps.confirmation' {
  switch (step) {
    case 'service':
      return 'bookingPublic.steps.service';
    case 'staff':
      return 'bookingPublic.steps.staff';
    case 'slot':
      return 'bookingPublic.steps.slot';
    case 'form':
      return 'bookingPublic.steps.form';
    case 'confirmation':
      return 'bookingPublic.steps.confirmation';
  }
}

const styles = StyleSheet.create({
  skeletons: {
    gap: theme.spacing[16],
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[16],
  },
  stepTitle: {
    flex: 1,
  },
});
