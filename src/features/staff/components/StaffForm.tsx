import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import { Button, Text, Toggle, useToast } from '@/components/ui';
import { useServices } from '@/features/services/api/useServices';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useSaveStaff, type StaffListItem } from '../api/useStaff';
import { emptyStaff, staffSchema, type StaffValues } from '../schemas/staff.schemas';

export function StaffForm({
  member,
  onDone,
}: {
  /** Undefined = creating a new one. */
  member?: StaffListItem;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const services = useServices(businessId, branchId, { includeInactive: false });
  const save = useSaveStaff(businessId);

  const branches = business?.branches ?? [];

  const { control, handleSubmit, setValue } = useForm<StaffValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: member
      ? {
          displayName: member.displayName,
          jobTitle: member.jobTitle,
          email: member.email,
          phone: member.phone,
          isActive: member.isActive,
          isBookableOnline: member.isBookableOnline,
          branchIds: member.branchIds,
          serviceIds: member.serviceIds,
        }
      : // A new staff member starts at the branch being viewed.
        { ...emptyStaff, branchIds: branchId ? [branchId] : [] },
  });

  const isActive = useWatch({ control, name: 'isActive' });
  const isBookableOnline = useWatch({ control, name: 'isBookableOnline' });
  const branchIds = useWatch({ control, name: 'branchIds' });
  const serviceIds = useWatch({ control, name: 'serviceIds' });

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      { ...values, ...(member ? { id: member.id } : {}) },
      {
        onSuccess: () => {
          toast.show({ message: t('staff.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => toast.show({ message: error.message, tone: 'error' }),
      },
    );
  });

  const toggleIn = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((entry) => entry !== id);

  return (
    // A plain View: `Drawer` already owns the scrolling body, and nesting a
    // second scroll view breaks scrolling on Android.
    <View style={styles.form}>
      <FormField
        control={control}
        name="displayName"
        label={t('staff.fields.displayName')}
        placeholder={t('staff.fields.displayNamePlaceholder')}
        required
        autoComplete="name"
        returnKeyType="next"
      />

      <FormField
        control={control}
        name="jobTitle"
        label={t('staff.fields.jobTitle')}
        placeholder={t('staff.fields.jobTitlePlaceholder')}
        returnKeyType="next"
      />

      <FormField
        control={control}
        name="email"
        label={t('staff.fields.email')}
        // This is a contact detail, NOT a login: an app account only comes from
        // an invite (see context/staff.md).
        hint={t('staff.fields.emailHint')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />

      <FormField
        control={control}
        name="phone"
        label={t('staff.fields.phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
      />

      {branches.length > 1 ? (
        <View style={styles.block}>
          <Text variant="label">{t('staff.fields.branches')}</Text>
          {branches.map((branch) => (
            <Toggle
              key={branch.id}
              label={branch.name}
              value={branchIds.includes(branch.id)}
              onValueChange={(on) =>
                setValue('branchIds', toggleIn(branchIds, branch.id, on), {
                  shouldValidate: true,
                })
              }
            />
          ))}
        </View>
      ) : null}

      {(services.data ?? []).length > 0 ? (
        <View style={styles.block}>
          <Text variant="label">{t('staff.fields.services')}</Text>
          {(services.data ?? []).map((service) => (
            <Toggle
              key={service.id}
              label={service.name}
              value={serviceIds.includes(service.id)}
              onValueChange={(on) =>
                setValue('serviceIds', toggleIn(serviceIds, service.id, on), {
                  shouldValidate: true,
                })
              }
            />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <Toggle
          label={t('staff.fields.isActive')}
          value={isActive}
          onValueChange={(on) => setValue('isActive', on, { shouldValidate: true })}
        />
        <Toggle
          label={t('staff.fields.isBookableOnline')}
          value={isBookableOnline}
          onValueChange={(on) => setValue('isBookableOnline', on, { shouldValidate: true })}
        />
      </View>

      <Button onPress={onSubmit} loading={save.isPending} fullWidth>
        {member ? t('actions.save') : t('staff.create')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing[16],
  },
  block: {
    gap: theme.spacing[10],
  },
});
