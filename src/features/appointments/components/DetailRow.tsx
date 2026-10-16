import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { theme } from '@/lib/theme';

/** A label above a value, as the appointment detail drawer shows each field. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: theme.spacing[4],
  },
});
