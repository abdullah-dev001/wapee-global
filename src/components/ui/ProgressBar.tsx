import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

export type ProgressBarProps = {
  /** 0..1; clamped. */
  ratio: number;
  /** Screen-reader description, e.g. "2 of 6 steps done". */
  accessibilityLabel: string;
  tone?: 'primary' | 'success' | 'warning';
};

/** A thin determinate bar. Colour comes from the tone, never a raw value. */
export function ProgressBar({ ratio, accessibilityLabel, tone = 'primary' }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const percent = Math.round(clamped * 100);

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.colors[tone] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: theme.spacing[6],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: theme.radius.full,
  },
});
