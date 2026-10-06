import { Lock } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type PermissionKey } from '@/config/permissions';
import { SegmentedControl, Text } from '@/components/ui';
import { featureForPermission, isFeatureOn } from '@/features/plans/featureLogic';
import { type Grant } from '@/lib/permissions/types';
import { type FeatureMap } from '@/features/plans/featureLogic';
import { theme } from '@/lib/theme';

import { AREA_LABEL_KEYS, PERMISSION_LABEL_KEYS } from '../permissionLabels';
import {
  allowedScopes,
  groupPermissions,
  heldRank,
  isOwnerOnly,
  scopeRank,
  setScope,
  type RoleDraft,
  type ScopeChoice,
} from '../rolesLogic';

/**
 * The permission matrix: every permission, grouped by area, each with a scope
 * choice (None / Own / Branch / All). A choice the editor could not grant is not
 * offered (the database refuses it anyway); billing is Owner-only and locked.
 */
export function PermissionMatrix({
  draft,
  onChange,
  readOnly,
  grants,
  isSuperAdmin,
  features,
}: {
  draft: RoleDraft;
  onChange: (next: RoleDraft) => void;
  readOnly: boolean;
  grants: readonly Grant[];
  isSuperAdmin: boolean;
  features: FeatureMap | null;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupPermissions(), []);

  return (
    <View style={styles.matrix}>
      {groups.map((group) => (
        <View key={group.area} style={styles.group}>
          <Text variant="sectionTitle">{t(AREA_LABEL_KEYS[group.area])}</Text>
          {group.keys.map((permission) => (
            <MatrixRow
              key={permission}
              permission={permission}
              current={draft[permission] ?? 'none'}
              held={heldRank(grants, permission, isSuperAdmin)}
              readOnly={readOnly}
              planOff={(() => {
                const feature = featureForPermission(permission);
                return feature !== null && !isFeatureOn(features, feature);
              })()}
              onPick={(choice) => onChange(setScope(draft, permission, choice))}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function MatrixRow({
  permission,
  current,
  held,
  readOnly,
  planOff,
  onPick,
}: {
  permission: PermissionKey;
  current: ScopeChoice;
  held: number;
  readOnly: boolean;
  planOff: boolean;
  onPick: (choice: ScopeChoice) => void;
}) {
  const { t } = useTranslation();
  const choices = allowedScopes(held, current, permission);
  const ownerOnly = isOwnerOnly(permission);
  // Higher than the editor holds: only shown because it is already there.
  const lacksHigher = !readOnly && !ownerOnly && held < scopeRank('all');

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="body" numberOfLines={2}>
          {t(PERMISSION_LABEL_KEYS[permission])}
        </Text>
        {ownerOnly ? (
          <View style={styles.note}>
            <Lock
              size={theme.iconSize.xs}
              strokeWidth={theme.iconStroke}
              color={theme.colors.textMuted}
            />
            <Text variant="helper" color="textMuted">
              {t('roles.ownerOnly')}
            </Text>
          </View>
        ) : planOff ? (
          <Text variant="helper" color="textMuted">
            {t('roles.needsPlan')}
          </Text>
        ) : lacksHigher && choices.length === 1 && !readOnly ? (
          <Text variant="helper" color="textMuted">
            {t('roles.cannotGrant')}
          </Text>
        ) : null}
      </View>
      <View style={styles.control}>
        <SegmentedControl<ScopeChoice>
          options={(readOnly ? [current] : choices).map((choice) => ({
            value: choice,
            label: t(`roles.scope.${choice}`),
          }))}
          value={current}
          onChange={onPick}
          disabled={readOnly || ownerOnly}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matrix: { gap: theme.spacing[20] },
  group: { gap: theme.spacing[8] },
  row: {
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[8],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowText: { gap: theme.spacing[2] },
  note: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] },
  control: { alignSelf: 'stretch' },
});
