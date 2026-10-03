import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  Collapsible,
  NumberStepper,
  SegmentedControl,
  Skeleton,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { formatMinuteOfDay } from '@/lib/time';
import { theme } from '@/lib/theme';

import {
  SaveSettingsError,
  useBookingSettings,
  useSaveBookingSettings,
  type BookingSettings,
} from '../api/useBookingSettings';
import { bufferExplanationKey } from '../bookingWarnings';

export type BookingSettingsFormProps = {
  businessId: string | null;
  branchId: string | null;
  /** False for a member who may read but not change (anyone without settings.booking). */
  canEdit: boolean;
  /** Non-zero per-service buffers at this branch, for the buffer explanation. */
  serviceBufferMinutes: number[];
  /** Lifted so the preview beside this form reacts to unsaved edits. */
  draft: BookingSettings | null;
  onDraftChange: (draft: BookingSettings) => void;
};

/**
 * The booking settings editor: Basics visible, Advanced collapsed (doc §6.2).
 *
 * The draft lives in the PARENT so the live preview can render the unsaved values
 * — that is the whole point of a live preview, and it is why this component takes
 * `draft`/`onDraftChange` rather than owning the state.
 */
export function BookingSettingsForm({
  businessId,
  branchId,
  canEdit,
  serviceBufferMinutes,
  draft,
  onDraftChange,
}: BookingSettingsFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const settings = useBookingSettings(businessId, branchId);
  const save = useSaveBookingSettings(businessId, branchId);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const saved = settings.data ?? null;
  const current = draft ?? saved;

  const set = useCallback(
    <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => {
      if (!current) return;
      // A new edit means the previous conflict message is stale.
      setConflictMessage(null);
      onDraftChange({ ...current, [key]: value });
    },
    [current, onDraftChange],
  );

  // Only send what changed: the RPC updates just the keys present, so a focused
  // patch also means a focused `people_per_slot` guard check.
  const patch = useMemo<Partial<BookingSettings>>(() => {
    if (!draft || !saved) return {};
    const out: Partial<BookingSettings> = {};
    for (const key of Object.keys(draft) as (keyof BookingSettings)[]) {
      if (draft[key] !== saved[key]) {
        // A per-key assignment keeps the union types intact; a spread would widen
        // every value to the union of all of them.
        Object.assign(out, { [key]: draft[key] });
      }
    }
    return out;
  }, [draft, saved]);

  const isDirty = Object.keys(patch).length > 0;

  const onSave = useCallback(() => {
    setConflictMessage(null);
    save.mutate(patch, {
      onSuccess: () => {
        toast.show({ message: t('bookingSettings.saved'), tone: 'success' });
      },
      onError: (error) => {
        if (!(error instanceof SaveSettingsError)) {
          toast.show({ message: t('bookingSettings.error.invalid_value'), tone: 'error' });
          return;
        }

        const { failure } = error;

        if (failure.code === 'people_per_slot_conflict') {
          const c = failure.conflict;
          // Shown inline rather than as a toast: it is several sentences and the
          // owner needs to be able to re-read it while deciding what to do.
          setConflictMessage(
            c.conflictingSlots > 1
              ? t('bookingSettings.error.peopleConflictMany', {
                  limit: c.newLimit,
                  count: c.conflictingSlots,
                  booked: c.booked,
                  service: c.serviceName ?? '',
                  staff: c.staffName ?? '',
                  time: formatMinuteOfDay(c.localMinute),
                  date: c.localDate,
                })
              : t('bookingSettings.error.peopleConflictOne', {
                  limit: c.newLimit,
                  booked: c.booked,
                  service: c.serviceName ?? '',
                  staff: c.staffName ?? '',
                  time: formatMinuteOfDay(c.localMinute),
                  date: c.localDate,
                }),
          );
          return;
        }

        toast.show({ message: t(`bookingSettings.error.${failure.code}`), tone: 'error' });
      },
    });
  }, [patch, save, t, toast]);

  if (settings.isPending || !current) {
    return (
      <View style={styles.group}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </View>
    );
  }

  const bufferKey = bufferExplanationKey(current.bufferMinutes, serviceBufferMinutes);

  return (
    <View style={styles.wrapper}>
      {!canEdit ? (
        <Card>
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.readOnly')}
          </Text>
        </Card>
      ) : null}

      {/* ---------------- Basics (doc §6.2) ---------------- */}
      <Card>
        <View style={styles.group}>
          <Text variant="cardTitle" color="textPrimary">
            {t('bookingSettings.basic')}
          </Text>

          <Toggle
            value={current.onlineBookingEnabled}
            onValueChange={(v) => set('onlineBookingEnabled', v)}
            label={t('bookingSettings.onlineBooking')}
            disabled={!canEdit}
          />
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.onlineBookingHint')}
          </Text>

          <SegmentedControl
            label={t('bookingSettings.staffChoice')}
            options={[
              { value: 'hidden', label: t('bookingSettings.staffChoiceHidden') },
              { value: 'optional', label: t('bookingSettings.staffChoiceOptional') },
              { value: 'required', label: t('bookingSettings.staffChoiceRequired') },
            ]}
            value={current.staffChoice}
            onChange={(v) => set('staffChoice', v)}
            disabled={!canEdit}
            // The hint changes with the choice, so the owner reads what THEIR
            // setting does rather than a generic description of all three.
            hint={t(
              current.staffChoice === 'hidden'
                ? 'bookingSettings.staffChoiceHiddenHint'
                : current.staffChoice === 'optional'
                  ? 'bookingSettings.staffChoiceOptionalHint'
                  : 'bookingSettings.staffChoiceRequiredHint',
            )}
          />

          <SegmentedControl
            label={t('bookingSettings.slotDisplay')}
            options={[
              { value: 'only_available', label: t('bookingSettings.slotDisplayAvailable') },
              { value: 'all_greyed', label: t('bookingSettings.slotDisplayGreyed') },
            ]}
            value={current.slotDisplay}
            onChange={(v) => set('slotDisplay', v)}
            disabled={!canEdit}
            hint={t(
              current.slotDisplay === 'only_available'
                ? 'bookingSettings.slotDisplayAvailableHint'
                : 'bookingSettings.slotDisplayGreyedHint',
            )}
          />

          <SegmentedControl
            label={t('bookingSettings.confirmation')}
            options={[
              { value: 'auto', label: t('bookingSettings.confirmationAuto') },
              { value: 'manual', label: t('bookingSettings.confirmationManual') },
            ]}
            value={current.confirmation}
            onChange={(v) => set('confirmation', v)}
            disabled={!canEdit}
            hint={t(
              current.confirmation === 'auto'
                ? 'bookingSettings.confirmationAutoHint'
                : 'bookingSettings.confirmationManualHint',
            )}
          />

          <Toggle
            value={current.showPrices}
            onValueChange={(v) => set('showPrices', v)}
            label={t('bookingSettings.showPrices')}
            disabled={!canEdit}
          />
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.showPricesHint')}
          </Text>

          <Toggle
            value={current.requireClientEmail}
            onValueChange={(v) => set('requireClientEmail', v)}
            label={t('bookingSettings.requireEmail')}
            disabled={!canEdit}
          />
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.requireEmailHint')}
          </Text>
        </View>
      </Card>

      {/* ---------------- Advanced, collapsed (doc §6.2) ---------------- */}
      <Collapsible
        title={t('bookingSettings.advanced')}
        subtitle={t('bookingSettings.advancedHint')}
      >
        <SegmentedControl
          label={t('bookingSettings.slotInterval')}
          options={[
            { value: 'min_15', label: t('bookingSettings.slotInterval15') },
            { value: 'min_30', label: t('bookingSettings.slotInterval30') },
            { value: 'min_60', label: t('bookingSettings.slotInterval60') },
            { value: 'service_length', label: t('bookingSettings.slotIntervalService') },
          ]}
          value={current.slotInterval}
          onChange={(v) => set('slotInterval', v)}
          disabled={!canEdit}
          hint={t('bookingSettings.slotIntervalHint')}
        />

        <NumberStepper
          label={t('bookingSettings.buffer')}
          value={current.bufferMinutes}
          onChange={(v) => set('bufferMinutes', v)}
          min={0}
          max={1440}
          step={5}
          suffix={t('bookingSettings.bufferUnit')}
          disabled={!canEdit}
          // Describes what the ENGINE actually does with two buffers, not a guess.
          hint={t(`bookingSettings.bufferExplain.${bufferKey}`)}
        />

        <NumberStepper
          label={t('bookingSettings.minimumNotice')}
          value={current.minimumNoticeMinutes}
          onChange={(v) => set('minimumNoticeMinutes', v)}
          min={0}
          max={43200}
          step={15}
          suffix={t('bookingSettings.minimumNoticeUnit')}
          disabled={!canEdit}
          hint={t('bookingSettings.minimumNoticeHint')}
        />

        <NumberStepper
          label={t('bookingSettings.bookingWindow')}
          value={current.bookingWindowDays}
          onChange={(v) => set('bookingWindowDays', v)}
          min={1}
          max={730}
          suffix={t('bookingSettings.bookingWindowUnit')}
          disabled={!canEdit}
          hint={t('bookingSettings.bookingWindowHint')}
        />

        <View style={styles.group}>
          <Toggle
            value={current.customerCanCancel}
            onValueChange={(v) => set('customerCanCancel', v)}
            label={t('bookingSettings.customerCanCancel')}
            disabled={!canEdit}
          />
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.customerCanCancelHint')}
          </Text>

          {/* The cutoff only means anything when cancelling is allowed. */}
          {current.customerCanCancel ? (
            <NumberStepper
              label={t('bookingSettings.cancelCutoff')}
              value={current.cancelCutoffHours}
              onChange={(v) => set('cancelCutoffHours', v)}
              min={0}
              max={8760}
              suffix={t('bookingSettings.cancelCutoffUnit')}
              disabled={!canEdit}
              hint={t('bookingSettings.cancelCutoffHint')}
            />
          ) : null}
        </View>

        <View style={styles.group}>
          <Toggle
            value={current.useResources}
            onValueChange={(v) => set('useResources', v)}
            label={t('bookingSettings.useResources')}
            disabled={!canEdit}
          />
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.useResourcesHint')}
          </Text>
        </View>

        <NumberStepper
          label={t('bookingSettings.peoplePerSlot')}
          value={current.peoplePerSlot}
          onChange={(v) => set('peoplePerSlot', v)}
          min={1}
          max={100}
          suffix={t('bookingSettings.peoplePerSlotUnit')}
          disabled={!canEdit}
          hint={t('bookingSettings.peoplePerSlotHint')}
        />
      </Collapsible>

      {/* The people_per_slot refusal: several sentences, so inline not a toast. */}
      {conflictMessage ? (
        <Card>
          <Text variant="body" color="error">
            {conflictMessage}
          </Text>
        </Card>
      ) : null}

      {canEdit ? (
        <View style={styles.actions}>
          <Button onPress={onSave} disabled={!isDirty} loading={save.isPending}>
            {t('bookingSettings.save')}
          </Button>
          {isDirty ? (
            <Button
              variant="ghost"
              onPress={() => {
                setConflictMessage(null);
                if (saved) onDraftChange(saved);
              }}
            >
              {t('bookingSettings.discard')}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  group: {
    gap: theme.spacing[10],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    flexWrap: 'wrap',
  },
});
