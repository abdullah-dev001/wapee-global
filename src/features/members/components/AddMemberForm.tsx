import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Select, useToast } from '@/components/ui';
import { useStaff } from '@/features/staff/api/useStaff';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useAssignableRoles } from '../api/useAssignableRoles';
import { useAddMember } from '../api/useMembers';
import { memberAddErrorKey } from '../memberAddErrorKey';
import { addMemberSchema, type AddMemberValues } from '../schemas/addMember.schemas';

/** Value used by the branch picker for "every branch" (the RPC wants null). */
const ALL_BRANCHES = 'all';
/** Value used by the staff-profile picker for "none". */
const NO_STAFF = 'none';

/**
 * Add someone by email with a role and a branch (`add_member_by_email`).
 *
 * There is no link to copy: the person gets a plain "you were added" email and joins when they
 * sign in with that email once it is verified (Google, or a confirmed email account).
 */
export function AddMemberForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const add = useAddMember(businessId);
  // Linking a staff profile is a staff.manage action (the RPC checks it again).
  const canManageStaff = usePermission('staff.manage');
  const staff = useStaff(businessId, null, { includeInactive: false });
  const unlinkedStaff = (staff.data ?? []).filter((entry) => entry.memberId === null);

  const { control, handleSubmit, setValue, reset } = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: '', roleId: '', branchId, staffId: null },
  });

  // useWatch, not watch(): watch() returns a fresh function each render, which
  // the React Compiler cannot memoize (same reason as the onboarding form).
  const selectedRole = useWatch({ control, name: 'roleId' });
  const selectedBranch = useWatch({ control, name: 'branchId' });
  const selectedStaff = useWatch({ control, name: 'staffId' });

  // Re-filtered as the form's own branch choice changes: a role grantable at
  // one branch is not always grantable at another (`can_grant_at`); `branchId`
  // (the caller's own current scope) is only the form's starting value.
  const { roles, isPending: rolesPending } = useAssignableRoles(businessId, selectedBranch ?? null);

  const branchOptions = [
    { value: ALL_BRANCHES, label: t('members.invite.allBranches') },
    ...(business?.branches ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
  ];

  const onSubmit = handleSubmit((values) => {
    add.mutate(values, {
      onSuccess: () => {
        toast.show({
          message: t('members.invite.added', { email: values.email }),
          tone: 'success',
        });
        reset({ email: '', roleId: '', branchId, staffId: null });
        onDone?.();
      },
      onError: (error) => toast.show({ message: t(memberAddErrorKey(error)), tone: 'error' }),
    });
  });

  return (
    <View style={styles.form}>
      <FormField
        control={control}
        name="email"
        label={t('members.invite.email')}
        placeholder={t('members.invite.emailPlaceholder')}
        required
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />

      <Select
        label={t('members.invite.role')}
        required
        options={roles.map((role) => ({ value: role.id, label: role.name }))}
        value={selectedRole || null}
        onChange={(value) => setValue('roleId', value, { shouldValidate: true })}
        placeholder={rolesPending ? t('common.loading') : t('members.invite.rolePlaceholder')}
        disabled={rolesPending}
        hint={t('members.invite.roleHint')}
      />

      {branchOptions.length > 1 ? (
        <Select
          label={t('members.invite.branch')}
          options={branchOptions}
          value={selectedBranch ?? ALL_BRANCHES}
          onChange={(value) => {
            setValue('branchId', value === ALL_BRANCHES ? null : value, { shouldValidate: true });
            // The role list is about to be re-filtered for the new branch; the
            // previous choice may no longer be offered.
            setValue('roleId', '', { shouldValidate: true });
          }}
        />
      ) : null}

      {canManageStaff.allowed && unlinkedStaff.length > 0 ? (
        <Select
          label={t('members.invite.staffProfile')}
          hint={t('members.invite.staffProfileHint')}
          options={[
            { value: NO_STAFF, label: t('members.invite.noStaffProfile') },
            ...unlinkedStaff.map((entry) => ({
              value: entry.id,
              label: entry.displayName,
              ...(entry.jobTitle ? { hint: entry.jobTitle } : {}),
            })),
          ]}
          value={selectedStaff ?? NO_STAFF}
          onChange={(value) =>
            setValue('staffId', value === NO_STAFF ? null : value, { shouldValidate: true })
          }
        />
      ) : null}

      <Button onPress={onSubmit} loading={add.isPending} fullWidth>
        {t('members.invite.submit')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing[16],
  },
});
