import { zodResolver } from '@hookform/resolvers/zod';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Select, Text, useToast } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useAssignableRoles } from '../api/useAssignableRoles';
import { useInviteMember, type InviteResult } from '../api/useMembers';
import { inviteSchema, type InviteValues } from '../schemas/invite.schemas';

/** Value used by the branch picker for "every branch" (the RPC wants null). */
const ALL_BRANCHES = 'all';

/**
 * Invite someone with a role and a branch.
 *
 * Email delivery is Phase 6 (Resend). Until then the link is shown here with a
 * copy button and the inviter sends it themselves — the raw token is returned
 * once and cannot be read again.
 */
export function InviteMemberForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const { roles, isPending: rolesPending } = useAssignableRoles(businessId, branchId);
  const invite = useInviteMember(businessId);
  const [result, setResult] = useState<InviteResult | null>(null);

  const { control, handleSubmit, setValue, reset } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', roleId: '', branchId },
  });

  // useWatch, not watch(): watch() returns a fresh function each render, which
  // the React Compiler cannot memoize (same reason as the onboarding form).
  const selectedRole = useWatch({ control, name: 'roleId' });
  const selectedBranch = useWatch({ control, name: 'branchId' });

  const branchOptions = [
    { value: ALL_BRANCHES, label: t('members.invite.allBranches') },
    ...(business?.branches ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
  ];

  const onSubmit = handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: (data) => {
        setResult(data);
        reset({ email: '', roleId: '', branchId });
      },
      onError: (error) => toast.show({ message: error.message, tone: 'error' }),
    });
  });

  // The link is shown once. Until it is dismissed the form stays out of the way,
  // so the inviter cannot lose the token by starting another invite.
  if (result) {
    return (
      <InviteLink
        result={result}
        onDone={() => {
          setResult(null);
          onDone?.();
        }}
      />
    );
  }

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
          onChange={(value) =>
            setValue('branchId', value === ALL_BRANCHES ? null : value, { shouldValidate: true })
          }
        />
      ) : null}

      <Button onPress={onSubmit} loading={invite.isPending} fullWidth>
        {t('members.invite.submit')}
      </Button>
    </View>
  );
}

/** The one-time invite link, with a copy button. */
function InviteLink({ result, onDone }: { result: InviteResult; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(result.url);
    setCopied(true);
    toast.show({ message: t('members.invite.copied'), tone: 'success' });
  };

  return (
    <View style={styles.form}>
      <Text variant="bodyStrong">{t('members.invite.linkReady')}</Text>
      <Text variant="helper" color="textSecondary">
        {t('members.invite.linkOnce')}
      </Text>

      <View style={styles.linkBox}>
        {/* Selectable so it can be copied by hand if the clipboard is blocked. */}
        <Text variant="small" selectable numberOfLines={3} style={styles.linkText}>
          {result.url}
        </Text>
      </View>

      <Pressable
        onPress={() => void copy()}
        accessibilityRole="button"
        accessibilityLabel={t('members.invite.copy')}
        style={styles.copyRow}
      >
        {copied ? (
          <Check size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.success} />
        ) : (
          <Copy
            size={theme.iconSize.sm}
            strokeWidth={theme.iconStroke}
            color={theme.colors.primary}
          />
        )}
        <Text variant="bodyStrong" color={copied ? 'success' : 'primary'}>
          {copied ? t('members.invite.copied') : t('members.invite.copy')}
        </Text>
      </Pressable>

      <Button variant="ghost" onPress={onDone} fullWidth>
        {t('actions.done')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing[16],
  },
  linkBox: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing[12],
  },
  linkText: {
    color: theme.colors.primary,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
    minHeight: theme.layout.minTouchTarget,
  },
});
