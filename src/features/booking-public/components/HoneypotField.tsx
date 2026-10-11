import { StyleSheet, TextInput } from 'react-native';

export type HoneypotFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The bot-protection honeypot (booking-public-api.md). Any real customer never
 * sees or fills this; any value at all means a bot.
 *
 * Hidden with `position: absolute; left: -9999px`, NOT `display: none` or
 * `type="hidden"` — a naive filter that skips those two still finds this field
 * unless it is actually off-screen. `tabIndex={-1}` and `autoComplete="off"`
 * keep it unreachable by keyboard navigation and by a browser's autofill.
 */
export function HoneypotField({ value, onChange }: HoneypotFieldProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      autoComplete="off"
      importantForAutofill="no"
      // RN Views don't have tabIndex; on web this prop passes through to the
      // underlying <input>, which is where it matters.
      tabIndex={-1}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.offscreen}
    />
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 1,
    height: 1,
  },
});
