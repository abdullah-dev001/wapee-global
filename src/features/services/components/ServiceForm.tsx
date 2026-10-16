import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, MoneyInput } from '@/components/shared';
import { Button, Select, Text, Toggle, useToast } from '@/components/ui';
import { useStaff } from '@/features/staff/api/useStaff';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useSaveService, useServiceCategories, type ServiceListItem } from '../api/useServices';
import { serviceErrorKey } from '../serviceErrorKey';
import { emptyService, serviceSchema, type ServiceValues } from '../schemas/service.schemas';

/** Durations offered in the picker. Anything else can be typed in minutes. */
const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

/** Value used by the category picker for "no category". */
const NO_CATEGORY = 'none';

export function ServiceForm({
  service,
  onDone,
}: {
  /** Undefined = creating a new one. */
  service?: ServiceListItem;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const categories = useServiceCategories(businessId);
  const staff = useStaff(businessId, branchId);
  const save = useSaveService(businessId, branchId);

  // Currency always comes from the BRANCH (decision 23), never the business.
  const branch = business?.branches.find((entry) => entry.id === branchId);
  const currency = branch?.currency ?? 'USD';

  const { control, handleSubmit, setValue } = useForm<ServiceValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: service
      ? {
          name: service.name,
          description: service.description,
          categoryId: service.categoryId,
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
          priceMinor: service.priceMinor,
          isActive: service.isActive,
          isBookableOnline: service.isBookableOnline,
          staffIds: service.staffIds,
        }
      : emptyService,
  });

  // useWatch, never watch(): watch() returns a fresh function each render and the
  // React Compiler lint rejects it.
  const categoryId = useWatch({ control, name: 'categoryId' });
  const durationMinutes = useWatch({ control, name: 'durationMinutes' });
  const bufferMinutes = useWatch({ control, name: 'bufferMinutes' });
  const priceMinor = useWatch({ control, name: 'priceMinor' });
  const isActive = useWatch({ control, name: 'isActive' });
  const isBookableOnline = useWatch({ control, name: 'isBookableOnline' });
  const staffIds = useWatch({ control, name: 'staffIds' });

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      { ...values, ...(service ? { id: service.id } : {}) },
      {
        onSuccess: () => {
          toast.show({ message: t('services.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => toast.show({ message: t(serviceErrorKey(error)), tone: 'error' }),
      },
    );
  });

  return (
    // A plain View, not a ScrollView: `Drawer` already owns the scrolling body,
    // and nesting a second scroll view breaks scrolling on Android.
    <View style={styles.form}>
      <FormField
        control={control}
        name="name"
        label={t('services.fields.name')}
        placeholder={t('services.fields.namePlaceholder')}
        required
        returnKeyType="next"
      />

      <Select
        label={t('services.fields.category')}
        options={[
          { value: NO_CATEGORY, label: t('services.uncategorised') },
          ...(categories.data ?? []).map((category) => ({
            value: category.id,
            label: category.name,
          })),
        ]}
        value={categoryId ?? NO_CATEGORY}
        onChange={(value) =>
          setValue('categoryId', value === NO_CATEGORY ? null : value, { shouldValidate: true })
        }
        hint={t('services.fields.categoryHint')}
      />

      <View style={styles.pair}>
        <View style={styles.half}>
          <Select
            label={t('services.fields.duration')}
            required
            options={DURATION_OPTIONS.map((minutes) => ({
              value: String(minutes),
              label: t('services.minutes', { count: minutes }),
            }))}
            value={String(durationMinutes)}
            onChange={(value) =>
              setValue('durationMinutes', Number(value), { shouldValidate: true })
            }
          />
        </View>

        <View style={styles.half}>
          <MoneyInput
            label={t('services.fields.price')}
            value={priceMinor}
            onChange={(next) => setValue('priceMinor', next, { shouldValidate: true })}
            currency={currency}
            locale={i18n.language}
            hint={t('services.fields.priceHint', { currency })}
          />
        </View>
      </View>

      <Select
        label={t('services.fields.buffer')}
        options={BUFFER_OPTIONS.map((minutes) => ({
          value: String(minutes),
          label: minutes === 0 ? t('services.noBuffer') : t('services.minutes', { count: minutes }),
        }))}
        value={String(bufferMinutes)}
        onChange={(value) => setValue('bufferMinutes', Number(value), { shouldValidate: true })}
        hint={t('services.fields.bufferHint')}
      />

      <FormField
        control={control}
        name="description"
        label={t('services.fields.description')}
        multiline
        numberOfLines={3}
      />

      {/* Who performs it. Empty means nobody yet, so it cannot be booked. */}
      {(staff.data ?? []).length > 0 ? (
        <View style={styles.block}>
          <Text variant="label">{t('services.fields.staff')}</Text>
          {(staff.data ?? []).map((member) => (
            <Toggle
              key={member.id}
              label={member.displayName}
              value={staffIds.includes(member.id)}
              onValueChange={(on) =>
                setValue(
                  'staffIds',
                  on ? [...staffIds, member.id] : staffIds.filter((id) => id !== member.id),
                  { shouldValidate: true },
                )
              }
            />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <Toggle
          label={t('services.fields.isActive')}
          value={isActive}
          onValueChange={(on) => setValue('isActive', on, { shouldValidate: true })}
        />
        <Toggle
          label={t('services.fields.isBookableOnline')}
          value={isBookableOnline}
          onValueChange={(on) => setValue('isBookableOnline', on, { shouldValidate: true })}
        />
      </View>

      <Button onPress={onSubmit} loading={save.isPending} fullWidth>
        {service ? t('actions.save') : t('services.create')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing[16],
    paddingBottom: theme.spacing[16],
  },
  pair: {
    flexDirection: 'row',
    gap: theme.spacing[8],
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  block: {
    gap: theme.spacing[10],
  },
});
