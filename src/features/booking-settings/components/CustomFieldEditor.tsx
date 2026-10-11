import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import { FormField } from '@/components/shared';
import { Button, Dialog, Drawer, SegmentedControl, Text, Toggle, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useSaveCustomField, type CustomField } from '../api/useCustomFields';
import {
  canClearSensitive,
  customFieldSchema,
  formatOptions,
  type CustomFieldFormValues,
  type CustomFieldType,
} from '../schemas/customField.schemas';

export type CustomFieldEditorProps = {
  open: boolean;
  onClose: () => void;
  businessId: string | null;
  /** null = creating a new field. */
  field: CustomField | null;
  /** Services to choose from when scoping to selected services. */
  services: { id: string; name: string }[];
};

function defaultsFor(field: CustomField | null): CustomFieldFormValues {
  return {
    label: field?.label ?? '',
    fieldType: field?.fieldType ?? 'short_text',
    helpText: field?.helpText ?? null,
    isRequired: field?.isRequired ?? false,
    isSensitive: field?.isSensitive ?? false,
    appliesToAllServices: field?.appliesToAllServices ?? true,
    serviceIds: field?.serviceIds ?? [],
    optionsText: formatOptions(field?.options ?? null),
  };
}

/**
 * Create or edit one custom field.
 *
 * Two rules the database enforces and the owner needs told about BEFORE they try:
 *
 *   * **Sensitive can only ever be turned ON.** `enforce_custom_field_guard`
 *     refuses the reverse, because the answers already captured were given under
 *     that promise. So the toggle is disabled once set, with a reason, and turning
 *     it on asks for confirmation — it also escalates every existing answer.
 *   * **The type is frozen once answers exist.** Rather than reading
 *     appointment_field_values to find out, the type picker is disabled for any
 *     saved field and the owner is told to add a new field instead. Slightly
 *     stricter than the DB, and the honest trade: the alternative is offering a
 *     change that fails on save for reasons the owner cannot see.
 */
export function CustomFieldEditor({
  open,
  onClose,
  businessId,
  field,
  services,
}: CustomFieldEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveCustomField(businessId);
  const [confirmSensitive, setConfirmSensitive] = useState(false);

  const isNew = field === null;
  const wasSensitive = field?.isSensitive ?? false;

  const { control, handleSubmit, setValue, reset } = useForm<CustomFieldFormValues>({
    resolver: zodResolver(customFieldSchema),
    defaultValues: defaultsFor(field),
  });

  // `useWatch`, never `watch()` — the React Compiler lint rejects `watch()`
  // (context/_handoff.md).
  const fieldType = useWatch({ control, name: 'fieldType' });
  const isSensitive = useWatch({ control, name: 'isSensitive' });
  const appliesToAll = useWatch({ control, name: 'appliesToAllServices' });
  const serviceIds = useWatch({ control, name: 'serviceIds' });
  const isRequired = useWatch({ control, name: 'isRequired' });

  const onSubmit = useCallback(
    (values: CustomFieldFormValues) => {
      save.mutate(
        { id: field?.id ?? null, values },
        {
          onSuccess: () => {
            toast.show({ message: t('bookingFields.saved'), tone: 'success' });
            reset(defaultsFor(null));
            onClose();
          },
          onError: () => {
            toast.show({ message: t('bookingFields.saveFailed'), tone: 'error' });
          },
        },
      );
    },
    [save, field?.id, toast, t, reset, onClose],
  );

  const toggleService = useCallback(
    (serviceId: string) => {
      const next = serviceIds.includes(serviceId)
        ? serviceIds.filter((id) => id !== serviceId)
        : [...serviceIds, serviceId];
      setValue('serviceIds', next, { shouldValidate: true });
    },
    [serviceIds, setValue],
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={isNew ? t('bookingFields.addTitle') : t('bookingFields.editTitle')}
        footer={
          <View style={styles.footer}>
            <Button onPress={handleSubmit(onSubmit)} loading={save.isPending} fullWidth>
              {t('bookingFields.save')}
            </Button>
          </View>
        }
      >
        <View style={styles.body}>
          <FormField
            control={control}
            name="label"
            label={t('bookingFields.label')}
            required
            placeholder={t('bookingFields.labelPlaceholder')}
          />

          <SegmentedControl
            label={t('bookingFields.type')}
            options={[
              { value: 'short_text', label: t('bookingFields.typeShortText') },
              { value: 'long_text', label: t('bookingFields.typeLongText') },
              { value: 'dropdown', label: t('bookingFields.typeDropdown') },
              { value: 'yes_no', label: t('bookingFields.typeYesNo') },
              { value: 'number', label: t('bookingFields.typeNumber') },
            ]}
            value={fieldType}
            onChange={(v) => setValue('fieldType', v as CustomFieldType, { shouldValidate: true })}
            // Frozen after the first save: a type change would make existing
            // answers unreadable (a "yes" in a number field).
            disabled={!isNew}
            hint={isNew ? undefined : t('bookingFields.typeLocked')}
          />

          {/* A dropdown's choices, one per line, so they can be pasted in. */}
          {fieldType === 'dropdown' ? (
            <FormField
              control={control}
              name="optionsText"
              label={t('bookingFields.options')}
              hint={t('bookingFields.optionsHint')}
              multiline
              numberOfLines={5}
              placeholder={t('bookingFields.optionsPlaceholder')}
            />
          ) : null}

          <FormField
            control={control}
            name="helpText"
            label={t('bookingFields.helpText')}
            hint={t('bookingFields.helpTextHint')}
          />

          <View style={styles.toggleGroup}>
            <Toggle
              value={isRequired}
              onValueChange={(v) => setValue('isRequired', v)}
              label={t('bookingFields.required')}
            />
            <Text variant="helper" color="textSecondary">
              {t('bookingFields.requiredHint')}
            </Text>
          </View>

          <View style={styles.toggleGroup}>
            <Toggle
              value={isSensitive}
              onValueChange={(next) => {
                // Turning it ON is a one-way door AND escalates every existing
                // answer, so it is confirmed rather than just toggled.
                if (next) setConfirmSensitive(true);
                else setValue('isSensitive', false);
              }}
              label={t('bookingFields.sensitive')}
              // Once on, it can never go off (DB guard).
              disabled={!canClearSensitive(wasSensitive) && isSensitive}
            />
            <Text variant="helper" color="textSecondary">
              {isSensitive && wasSensitive
                ? t('bookingFields.sensitiveLocked')
                : t('bookingFields.sensitiveHint')}
            </Text>
          </View>

          <View style={styles.toggleGroup}>
            <Toggle
              value={appliesToAll}
              onValueChange={(v) => setValue('appliesToAllServices', v, { shouldValidate: true })}
              label={t('bookingFields.allServices')}
            />
            <Text variant="helper" color="textSecondary">
              {t('bookingFields.allServicesHint')}
            </Text>
          </View>

          {/* Service picker, only when scoped. */}
          {!appliesToAll ? (
            <View style={styles.serviceList}>
              <Text variant="label" color="textPrimary">
                {t('bookingFields.selectServices')}
              </Text>
              {services.length === 0 ? (
                <Text variant="helper" color="textMuted">
                  {t('bookingFields.noServices')}
                </Text>
              ) : (
                services.map((service) => (
                  <Toggle
                    key={service.id}
                    value={serviceIds.includes(service.id)}
                    onValueChange={() => toggleService(service.id)}
                    label={service.name}
                  />
                ))
              )}
            </View>
          ) : null}

          <Text variant="helper" color="textSecondary">
            {t('bookingFields.versionNote')}
          </Text>
        </View>
      </Drawer>

      <Dialog
        open={confirmSensitive}
        onClose={() => setConfirmSensitive(false)}
        title={t('bookingFields.sensitiveConfirmTitle')}
        message={t('bookingFields.sensitiveConfirmBody')}
        confirm={{
          label: t('bookingFields.sensitiveConfirmAction'),
          onPress: () => {
            setValue('isSensitive', true);
            setConfirmSensitive(false);
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing[18],
  },
  toggleGroup: {
    gap: theme.spacing[6],
  },
  serviceList: {
    gap: theme.spacing[10],
    paddingTop: theme.spacing[6],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  footer: {
    flexDirection: 'row',
  },
});
