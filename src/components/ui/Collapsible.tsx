import { useCallback, useState, type ReactNode } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { useTranslation } from 'react-i18next';

import { focusRing, theme } from '@/lib/theme';
import { isRtl } from '@/lib/i18n';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

export type CollapsibleProps = {
  title: string;
  /** One line under the title, visible whether open or closed. */
  subtitle?: string;
  /** Open on first render. Doc §6.2 wants the Advanced group collapsed. */
  defaultOpen?: boolean;
  children: ReactNode;
  /** Shown at the end of the header row, e.g. a count badge. */
  headerAccessory?: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

/**
 * A disclosure section (DESIGN_GUIDE §12 "to design").
 *
 * Used for the Advanced booking settings, which doc §6.2 asks to be collapsed by
 * default so the common case is a short screen.
 *
 * **Unmounts its children when closed** rather than hiding them. Keeping a dozen
 * form controls mounted behind `display: none` costs render work on every parent
 * update and, worse, lets a hidden input keep focus — which on Android leaves the
 * keyboard open over a section the user cannot see.
 *
 * The chevron direction flips for RTL (CLAUDE.md §8), and the closed chevron
 * points along the reading direction.
 */
export function Collapsible({
  title,
  subtitle,
  defaultOpen = false,
  children,
  headerAccessory,
  style,
  testID,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  // `isRtl` takes the language rather than reading a global, so the current one
  // comes from i18next.
  const { i18n } = useTranslation();

  const toggle = useCallback(() => {
    // `LayoutAnimation` is the cheapest way to animate a height change without
    // measuring children. It is a no-op on web, where the content simply appears
    // — acceptable, and better than animating a measured height on every open.
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext({
        duration: theme.duration.base,
        update: { type: 'easeInEaseOut' },
        // Only fade in; a scaling delete looks wrong on a tall form.
        create: { type: 'easeInEaseOut', property: 'opacity' },
        delete: { type: 'easeInEaseOut', property: 'opacity' },
      });
    }
    setOpen((v) => !v);
  }, []);

  const ClosedChevron = isRtl(i18n.language) ? ChevronLeftLike : ChevronRight;

  return (
    <View style={[styles.wrapper, style]} testID={testID}>
      <Pressable
        {...handlers}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={[styles.header, showHover && styles.headerHovered, showFocusRing && focusRing()]}
      >
        <View style={styles.headerText}>
          <Text variant="cardTitle" color="textPrimary">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="helper" color="textSecondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {headerAccessory}

        {open ? (
          <ChevronDown
            size={theme.iconSize.md}
            strokeWidth={theme.iconStroke}
            color="textSecondary"
          />
        ) : (
          <ClosedChevron
            size={theme.iconSize.md}
            strokeWidth={theme.iconStroke}
            color="textSecondary"
          />
        )}
      </Pressable>

      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

/**
 * lucide's ChevronLeft, by rotating ChevronRight. Importing both icons costs
 * another SVG in the bundle for a glyph that is the same shape mirrored, and
 * `scaleX: -1` is exactly what RTL needs here (CLAUDE.md §8: flip directional
 * icons).
 */
function ChevronLeftLike({
  size,
  strokeWidth,
  color,
}: {
  size: number;
  strokeWidth: number;
  color: string;
}) {
  return (
    <View style={styles.flipped}>
      <ChevronRight size={size} strokeWidth={strokeWidth} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    // Comfortably above the 44px minimum touch target.
    minHeight: 56,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[12],
  },
  headerHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  headerText: {
    flex: 1,
    // `flexShrink` plus `flex: 1` keeps a long translated title from pushing the
    // chevron off a 320px screen.
    flexShrink: 1,
  },
  subtitle: {
    marginTop: theme.spacing[2],
  },
  body: {
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[16],
    gap: theme.spacing[18],
  },
  flipped: {
    transform: [{ scaleX: -1 }],
  },
});
