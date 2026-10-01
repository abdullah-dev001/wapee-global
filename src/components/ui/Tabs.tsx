import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { focusRing, theme } from '@/lib/theme';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

export type TabItem<TValue extends string = string> = {
  value: TValue;
  label: string;
};

export type TabsProps<TValue extends string = string> = {
  items: readonly TabItem<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  style?: ViewStyle;
};

/** Underline tabs. The strip scrolls horizontally when the tabs do not fit. */
export function Tabs<TValue extends string = string>({
  items,
  value,
  onChange,
  style,
}: TabsProps<TValue>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.strip, style]}
      contentContainerStyle={styles.stripContent}
    >
      {items.map((item) => (
        <Tab
          key={item.value}
          item={item}
          active={item.value === value}
          onPress={() => onChange(item.value)}
        />
      ))}
    </ScrollView>
  );
}

type TabProps<TValue extends string> = {
  item: TabItem<TValue>;
  active: boolean;
  onPress: () => void;
};

function Tab<TValue extends string>({ item, active, onPress }: TabProps<TValue>) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const color = active ? 'primary' : showHover ? 'textPrimary' : 'textSecondary';

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, showFocusRing ? focusRing() : null]}
    >
      <Text variant={active ? 'bodyStrong' : 'nav'} color={color} numberOfLines={1}>
        {item.label}
      </Text>
      <View style={[styles.underline, active ? styles.underlineActive : null]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  stripContent: {
    gap: theme.spacing[4],
  },
  tab: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[12],
    alignItems: 'center',
    gap: theme.spacing[10],
  },
  underline: {
    height: theme.borderWidth.thick,
    alignSelf: 'stretch',
    // Sits on top of the strip's bottom border so the active tab overlaps it.
    marginBottom: -theme.borderWidth.hairline,
    backgroundColor: theme.colors.transparent,
  },
  underlineActive: {
    backgroundColor: theme.colors.primary,
  },
});
