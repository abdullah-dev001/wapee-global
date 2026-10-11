import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Dialog, Select, Text, useToast } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useDeleteRole, type RoleRow } from '../api/useRolesAdmin';
import { roleErrorKey } from '../rolesLogic';

/**
 * Delete a custom role. A role nobody holds just goes. A role in use needs a
 * replacement: everyone moves to it in one transaction (the database refuses the
 * delete otherwise, with `role_in_use`).
 */
export function DeleteRoleDialog({
  role,
  roles,
  onClose,
}: {
  role: RoleRow | null;
  roles: readonly RoleRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const del = useDeleteRole(businessId);
  const [replacement, setReplacement] = useState<string | null>(null);

  if (!role) return null;
  const inUse = role.memberCount > 0;
  const options = roles
    .filter((candidate) => candidate.id !== role.id)
    .map((candidate) => ({ value: candidate.id, label: candidate.name }));

  const close = () => {
    setReplacement(null);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={close}
      title={t('roles.deleteTitle', { name: role.name })}
      message={inUse ? undefined : t('roles.deleteMessage')}
      cancelLabel={t('actions.cancel')}
      busy={del.isPending}
      confirm={{
        label: t('roles.deleteConfirm'),
        loading: del.isPending,
        onPress: () => {
          if (inUse && !replacement) return;
          del.mutate(
            { roleId: role.id, replacementId: inUse ? replacement : null },
            {
              onSuccess: () => {
                toast.show({ message: t('roles.deleted'), tone: 'success' });
                close();
              },
              onError: (error) =>
                toast.show({ message: t(roleErrorKey(rpcCode(error))), tone: 'error' }),
            },
          );
        },
      }}
    >
      {inUse ? (
        <View style={styles.body}>
          <Text variant="paragraph" color="textSecondary">
            {t('roles.deleteInUseMessage', { count: role.memberCount })}
          </Text>
          <Select
            label={t('roles.replacement')}
            placeholder={t('roles.replacementPlaceholder')}
            options={options}
            value={replacement}
            onChange={setReplacement}
            required
          />
        </View>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({ body: { gap: theme.spacing[12] } });
