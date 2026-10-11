import { type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { useInteractionState } from '@/components/ui/useInteractionState';
import { focusRing, theme } from '@/lib/theme';

export type DateNavButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
};

/**
 * Small icon-only button for the Day/Week date navigator (prev/next). Not
 * promoted to `ui/` yet — `Header` and `DayHoursRow` already have their own
 * private versions of this exact shape; unifying all three is a reasonable
 * follow-up but out of scope for this task (see end-of-task report).
 */
export function DateNavButton({ icon: Icon, label, onPress }: DateNavButtonProps) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.button,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <Icon
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textPrimary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
});
