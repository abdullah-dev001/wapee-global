import { MapPin } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Select } from '@/components/ui';
import { useCurrentScope, useScopeSelection } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useMyBranches } from '../api/useBranches';
import { resolveSelectedBranch, showSwitcher } from '../branchLogic';

/**
 * Switches the location every screen works in (Calendar, Clients, Invoices,
 * Reports read it from the current scope). Shown only when the person can work
 * in more than one live location, and only lists the ones they have a role in.
 */
export function BranchSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { businessId, branchId } = useCurrentScope();
  const mine = useMyBranches(businessId);
  const setBranch = useScopeSelection((state) => state.setBranch);

  const live = useMemo(
    () => (mine.data?.branches ?? []).filter((branch) => !branch.archived),
    [mine.data],
  );
  const options = useMemo(
    () => live.map((branch) => ({ value: branch.id, label: branch.name, hint: branch.currency })),
    [live],
  );

  if (!showSwitcher(live)) return null;
  const selected = resolveSelectedBranch(live, branchId);

  return (
    <View style={[styles.wrap, compact ? styles.compact : null]}>
      <MapPin
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textMuted}
        accessibilityElementsHidden
      />
      <View style={styles.select}>
        <Select
          options={options}
          value={selected}
          onChange={(value) => setBranch(value)}
          title={t('branches.switcher.a11y')}
          label={compact ? undefined : t('branches.switcher.label')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing[8] },
  compact: { alignItems: 'center', minWidth: 160, maxWidth: 260 },
  select: { flex: 1 },
});
