import { Inbox, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { theme } from '@/lib/theme';

import { Button, type ButtonProps } from './Button';
import { Text } from './Text';

/** Muted icon circle diameter (DESIGN_GUIDE §12.24). */
const ICON_CIRCLE_SIZE = 44;
/** Description max width, keeps the text to a readable measure. */
const DESCRIPTION_MAX_WIDTH = 352;

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Lucide icon in the muted circle. Default `Inbox`. */
  icon?: LucideIcon;
  /** Optional call to action, e.g. "Add service" or "Clear filters". */
  action?: Pick<ButtonProps, 'children' | 'onPress' | 'variant' | 'startIcon'>;
  /** Tighter padding for use inside a card or drawer. */
  compact?: boolean;
  style?: ViewStyle;
};

/** Shown whenever a list has nothing to display (empty, or no search results). */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact ? styles.compact : styles.regular, style]}>
      <View style={styles.iconCircle}>
        <Icon
          size={theme.iconSize.xl}
          strokeWidth={theme.iconStroke}
          color={theme.colors.textMuted}
        />
      </View>
      <Text variant="cardTitle" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="small" color="textSecondary" align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button
            variant={action.variant ?? 'primary'}
            onPress={action.onPress}
            startIcon={action.startIcon}
          >
            {action.children}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
  },
  regular: {
    paddingVertical: theme.spacing[40],
    paddingHorizontal: theme.spacing[16],
  },
  compact: {
    paddingVertical: theme.spacing[24],
    paddingHorizontal: theme.spacing[16],
  },
  iconCircle: {
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
  },
  description: {
    maxWidth: DESCRIPTION_MAX_WIDTH,
  },
  action: {
    marginTop: theme.spacing[12],
  },
});
