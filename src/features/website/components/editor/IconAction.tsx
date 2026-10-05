import { type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

/** A 44px icon-only button with an accessible name. */
export function IconAction({
  label,
  icon: Icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.icon, disabled ? styles.iconDisabled : null]}
    >
      <Icon
        size={theme.iconSize.lg}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDisabled: { opacity: theme.opacity.disabled },
});
