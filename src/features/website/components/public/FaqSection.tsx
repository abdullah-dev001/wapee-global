import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

import { SectionShell } from './SectionShell';
import { WText } from './WText';
import { useWebsiteTheme } from './WebsiteThemeContext';

/** Accordion: one question open at a time, each header a >= 44px button with an expanded state. */
export function FaqSection({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  const { theme: site } = useWebsiteTheme();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <SectionShell title={title}>
      <View style={[styles.list, { borderRadius: site.cardRadius }]}>
        {items.map((item, index) => {
          const isOpen = open === index;
          return (
            <View key={`${item.q}-${index}`} style={index > 0 ? styles.divider : null}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen(isOpen ? null : index)}
                style={styles.header}
              >
                <WText variant="bodyStrong" style={styles.question}>
                  {item.q}
                </WText>
                <ChevronDown
                  size={theme.iconSize.lg}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.textSecondary}
                  style={isOpen ? styles.chevronOpen : undefined}
                />
              </Pressable>
              {isOpen ? (
                <View style={styles.answer}>
                  <WText variant="paragraph" color="textSecondary">
                    {item.a}
                  </WText>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </SectionShell>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: theme.borderWidth.hairline, borderTopColor: theme.colors.border },
  header: {
    minHeight: theme.layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[12],
  },
  question: { flexShrink: 1 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  answer: { paddingHorizontal: theme.spacing[16], paddingBottom: theme.spacing[16] },
});
