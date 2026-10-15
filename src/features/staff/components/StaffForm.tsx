import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import { Badge, Button, Select, Text, Toggle, useToast } from '@/components/ui';
import { useMembers } from '@/features/members/api/useMembers';
import { planErrorKey } from '@/features/plans/planErrors';
import { useServices } from '@/features/services/api/useServices';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { StaffLinkError, useSaveStaff, useStaff, type StaffListItem } from '../api/useStaff';
import { hasNoWorkingHours } from '../staffHours';
import { linkErrorKey, loginOptions, NO_LOGIN, staffErrorKey } from '../staffLogin';
import { emptyStaff, staffSchema, type StaffValues } from '../schemas/staff.schemas';

export function StaffForm({
  member,
  onDone,
  onOpenSchedule,
}: {
  /** Undefined = creating a new one. */
  member?: StaffListItem;
  onDone: () => void;
  /** Opens the working-hours editor for this person (edit mode only). */
  onOpenSchedule?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const services = useServices(businessId, branchId, { includeInactive: false });
  const save = useSaveStaff(businessId);
  // Set when the profile was saved but linking the login was refused: the form stays open on THAT
  // profile (a retry updates it instead of creating a second one) and says what happened.
  const [partial, setPartial] = useState<{
    staffId: string;
    reasonKey: string | null;
    reason: string;
  } | null>(null);
  const members = useMembers(businessId);
  // Every profile of the business (not just this branch): a login can own one profile only.
  const allStaff = useStaff(businessId, null);

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
          memberId: member.memberId,
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
  const memberId = useWatch({ control, name: 'memberId' });

  const logins = loginOptions({
    members: members.data ?? [],
    staff: allStaff.data ?? [],
    currentStaffId: member?.id ?? null,
    noLoginLabel: t('staff.login.none'),
    pendingLabel: t('staff.login.pending'),
    unnamedLabel: t('staff.login.unnamed'),
  });

  const onSubmit = handleSubmit((values) => {
    const targetId = partial?.staffId ?? member?.id;
    save.mutate(
      {
        ...values,
        ...(targetId
          ? { id: targetId, originalMemberId: partial ? null : (member?.memberId ?? null) }
          : {}),
      },
      {
        onSuccess: () => {
          toast.show({ message: t('staff.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => {
          if (error instanceof StaffLinkError) {
            const key = linkErrorKey(error.cause);
            setPartial({ staffId: error.staffId, reasonKey: key, reason: error.message });
            // The refused login is no longer a valid choice: fall back to "No login" so a retry saves cleanly.
            setValue('memberId', null, { shouldValidate: true });
            toast.show({
              message: key
                ? t('staff.login.savedNotLinkedKey', { reason: t(key) })
                : t('staff.login.savedNotLinked'),
              tone: 'warning',
            });
            return;
          }
          // Plan refusals (staff cap) get a specific, calm message.
          const planKey = planErrorKey(error);
          const linkKey = linkErrorKey(error);
          toast.show({
            message: t(planKey ?? linkKey ?? staffErrorKey(error)),
            tone: 'error',
          });
        },
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

      {partial ? (
        <View style={styles.partial}>
          <Badge tone="warning">{t('staff.login.partialBadge')}</Badge>
          <Text variant="helper" color="textSecondary">
            {partial.reasonKey
              ? t(partial.reasonKey as 'staff.login.errors.forbidden')
              : partial.reason}
          </Text>
        </View>
      ) : null}

      <Select
        label={t('staff.login.label')}
        hint={t('staff.login.hint')}
        options={logins}
        value={memberId ?? NO_LOGIN}
        onChange={(value) =>
          setValue('memberId', value === NO_LOGIN ? null : value, { shouldValidate: true })
        }
        disabled={members.isPending}
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

      {member && onOpenSchedule ? (
        <View style={styles.block}>
          <Text variant="label">{t('schedule.workingHours')}</Text>
          {hasNoWorkingHours(member, branchId) ? (
            <Badge tone="warning">{t('staff.noHours')}</Badge>
          ) : null}
          <Button variant="secondary" startIcon={CalendarClock} onPress={onOpenSchedule} fullWidth>
            {t('staff.noHoursAction')}
          </Button>
        </View>
      ) : null}

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
  partial: {
    gap: theme.spacing[6],
    alignItems: 'flex-start',
  },
});
