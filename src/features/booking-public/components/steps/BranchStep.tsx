import { MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { focusRing, theme } from '@/lib/theme';

import type { PublicBranch } from '../../types';

export type BranchStepProps = {
  branches: readonly PublicBranch[];
  onSelect: (branchId: string) => void;
};

/**
 * Location picker: shown only when the business has two or more bookable locations and the link
 * does not name one. Each row shows the name, the address and the time zone the times will be in.
 * Services, prices, staff and times that follow all belong to the chosen location.
 */
export function BranchStep({ branches, onSelect }: BranchStepProps) {
  return (
    <View style={styles.wrapper}>
      {branches.map((branch) => (
        <BranchRow key={branch.id} branch={branch} onPress={() => onSelect(branch.id)} />
      ))}
    </View>
  );
}

function BranchRow({ branch, onPress }: { branch: PublicBranch; onPress: () => void }) {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={branch.name}
      style={[styles.row, showHover && styles.rowHovered, showFocusRing && focusRing()]}
    >
      <MapPin
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textSecondary}
      />
      <View style={styles.text}>
        <Text variant="bodyStrong" color="textPrimary" numberOfLines={2}>
          {branch.name}
        </Text>
        {branch.address ? (
          <Text variant="helper" color="textSecondary" numberOfLines={3}>
            {branch.address}
          </Text>
        ) : null}
        <Text variant="helper" color="textMuted">
          {t('bookingPublic.timezoneNote', { timezone: branch.timezone })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[8],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    minHeight: theme.layout.minTouchTarget,
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[14],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  rowHovered: {
    borderColor: theme.colors.textMuted,
  },
  text: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
