import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { initialsOf } from './initials';

export type AvatarProps = {
  /** Full name; only the initials are shown. */
  name: string;
  /** Used for the initial when `name` is empty (e.g. no `profiles.full_name` yet). */
  email?: string | null;
  /** Diameter in px. Default matches a list row (28px, DESIGN_GUIDE §12.27 scale). */
  size?: number;
};

/** Round initials avatar for a person (client or staff) — `BusinessAvatar` is the separate rounded-square variant. */
export function Avatar({ name, email, size = 28 }: AvatarProps) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text variant="small" color="primary" style={{ fontSize: size * 0.4 }}>
        {initialsOf(name, email)}
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
