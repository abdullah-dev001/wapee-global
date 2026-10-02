import { AlertTriangle, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { theme } from '@/lib/theme';

import { Button } from './Button';
import { Text } from './Text';

/** Muted icon circle diameter, matching `EmptyState`. */
const ICON_CIRCLE_SIZE = 44;
const DESCRIPTION_MAX_WIDTH = 352;

type ErrorStateBase = {
  title: string;
  /** The failure detail. Keep it short; a raw stack trace is not useful here. */
  description?: string;
  icon?: LucideIcon;
  /** Tighter padding for use inside a card or drawer. */
  compact?: boolean;
  style?: ViewStyle;
};

/**
 * Retry is all-or-nothing: the handler and its label travel together, so this
 * component never has to invent user-facing text (CLAUDE.md §8).
 */
export type ErrorStateProps = ErrorStateBase &
  ({ onRetry: () => void; retryLabel: string } | { onRetry?: never; retryLabel?: never });

/**
 * Shown when a query fails. Pairs with `EmptyState`: same shape and spacing, but
 * an error tint and a retry action, so a failure never looks like "no data".
 */
export function ErrorState({
  title,
  description,
  icon: Icon = AlertTriangle,
  onRetry,
  retryLabel,
  compact = false,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, compact ? styles.compact : styles.regular, style]}>
      <View style={styles.iconCircle}>
        <Icon size={theme.iconSize.xl} strokeWidth={theme.iconStroke} color={theme.colors.error} />
      </View>

      <Text variant="cardTitle" align="center">
        {title}
      </Text>

      {description ? (
        <Text variant="helper" color="textSecondary" align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}

      {onRetry && retryLabel ? (
        <Button variant="ghost" size="sm" onPress={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  regular: {
    paddingVertical: theme.spacing[40],
    paddingHorizontal: theme.spacing[24],
  },
  compact: {
    paddingVertical: theme.spacing[24],
    paddingHorizontal: theme.spacing[16],
  },
  iconCircle: {
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
  },
  description: {
    maxWidth: DESCRIPTION_MAX_WIDTH,
  },
});
