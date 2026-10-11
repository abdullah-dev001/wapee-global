import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { theme } from '@/lib/theme';

export type AvatarProps = {
  /** Full name; only the initials are shown. */
  name: string;
  /** Diameter in px. Default matches a list row (28px, DESIGN_GUIDE §12.27 scale). */
  size?: number;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Round initials avatar for a person (client or staff) — `BusinessAvatar` is the separate rounded-square variant. */
export function Avatar({ name, size = 28 }: AvatarProps) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text variant="small" color="primary" style={{ fontSize: size * 0.4 }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight,
  },
});
