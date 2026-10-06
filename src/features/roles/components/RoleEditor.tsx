import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Drawer, Input, Select, Text, useToast } from '@/components/ui';
import { useMyFeatures } from '@/features/plans/api/useMyFeatures';
import { useCurrentScope, useGrantSet } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useSaveRole, type RoleRow } from '../api/useRolesAdmin';
import {
  draftCount,
  draftFromRows,
  roleDraftProblem,
  roleErrorKey,
  type RoleDraft,
} from '../rolesLogic';
import { PermissionMatrix } from './PermissionMatrix';

export type EditorMode =
  | { kind: 'view'; role: RoleRow }
  | { kind: 'edit'; role: RoleRow }
  | { kind: 'create'; cloneFrom: RoleRow | null };

const BLANK = 'blank';

/** Create, clone, edit or just view a role's permission matrix. */
export function RoleEditor({
  mode,
  roles,
  onClose,
}: {
  mode: EditorMode | null;
  roles: readonly RoleRow[];
  onClose: () => void;
}) {
  if (!mode) return null;
  const key =
    mode.kind === 'create'
      ? `create:${mode.cloneFrom?.id ?? 'blank'}`
      : `${mode.kind}:${mode.role.id}`;
  // Keyed, so each opening starts from its own role with fresh form state.
  return <RoleEditorBody key={key} mode={mode} roles={roles} onClose={onClose} />;
}

function RoleEditorBody({
  mode,
  roles,
  onClose,
}: {
  mode: EditorMode;
  roles: readonly RoleRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const { set } = useGrantSet();
  const features = useMyFeatures(businessId).data?.features ?? null;
  const save = useSaveRole(businessId);

  const [name, setName] = useState(() =>
    mode.kind === 'create'
      ? mode.cloneFrom
        ? t('roles.cloneName', { name: mode.cloneFrom.name })
        : ''
      : mode.role.name,
  );
  const [draft, setDraft] = useState<RoleDraft>(() =>
    mode.kind === 'create'
      ? mode.cloneFrom
        ? draftFromRows(mode.cloneFrom.permissions)
        : {}
      : draftFromRows(mode.role.permissions),
  );
  const [cloneFrom, setCloneFrom] = useState<string | null>(
    mode.kind === 'create' ? (mode.cloneFrom?.id ?? null) : null,
  );

  const readOnly = mode.kind === 'view';
  const problem = roleDraftProblem(name, draft);
  const title =
    mode.kind === 'create'
      ? mode.cloneFrom
        ? t('roles.cloneTitle', { name: mode.cloneFrom.name })
        : t('roles.createTitle')
      : mode.kind === 'edit'
        ? t('roles.editTitle')
        : t('roles.viewTitle', { name: mode.role.name });

  const onSave = () => {
    if (problem || readOnly) return;
    save.mutate(
      {
        name,
        draft,
        ...(mode.kind === 'edit' ? { roleId: mode.role.id } : { cloneFrom }),
      },
      {
        onSuccess: (result) => {
          toast.show({
            message: mode.kind === 'edit' ? t('roles.saved') : t('roles.created'),
            tone: 'success',
          });
          if (result.stripped.length > 0)
            toast.show({ message: t('roles.stripped'), tone: 'warning' });
          onClose();
        },
        onError: (error) => toast.show({ message: t(roleErrorKey(rpcCode(error))), tone: 'error' }),
      },
    );
  };

  const cloneOptions = [
    { value: BLANK, label: t('roles.startBlank') },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      subtitle={readOnly ? t('roles.systemNote') : t('roles.matrixHint')}
      footer={
        readOnly ? (
          <Button variant="secondary" onPress={onClose} fullWidth>
            {t('actions.close')}
          </Button>
        ) : (
          <View style={styles.footer}>
            <Text variant="helper" color="textSecondary" style={styles.count}>
              {t('roles.selected', { count: draftCount(draft) })}
            </Text>
            <Button onPress={onSave} loading={save.isPending} disabled={problem !== null} fullWidth>
              {t('roles.save')}
            </Button>
          </View>
        )
      }
    >
      <View style={styles.body}>
        <Input
          label={t('roles.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('roles.namePlaceholder')}
          editable={!readOnly}
          error={problem === 'name' && name.length > 0 ? t('roles.errors.invalid_name') : undefined}
        />
        {mode.kind === 'create' && !mode.cloneFrom ? (
          <Select
            label={t('roles.startFrom')}
            options={cloneOptions}
            value={cloneFrom ?? BLANK}
            onChange={(value) => {
              const source = roles.find((role) => role.id === value);
              setCloneFrom(source?.id ?? null);
              setDraft(source ? draftFromRows(source.permissions) : {});
            }}
          />
        ) : null}
        <Text variant="sectionTitle">{t('roles.matrix')}</Text>
        <PermissionMatrix
          draft={draft}
          onChange={setDraft}
          readOnly={readOnly}
          grants={set.grants}
          isSuperAdmin={set.isSuperAdmin}
          features={features}
        />
      </View>
    </Drawer>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing[16] },
  footer: { gap: theme.spacing[8] },
  count: { textAlign: 'center' },
});
