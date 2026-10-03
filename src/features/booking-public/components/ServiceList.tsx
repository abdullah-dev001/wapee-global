import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { formatDuration } from '@/lib/time';
import { formatMoney, money } from '@/lib/money';
import { focusRing, theme } from '@/lib/theme';
import { useInteractionState } from '@/components/ui/useInteractionState';

import type { PublicService } from '../types';

export type ServiceListProps = {
  services: PublicService[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** doc §6.2 show_prices. When false, no price is rendered at all. */
  showPrices: boolean;
  /** Locale for the price format. */
  locale: string;
  /** Preview mode: nothing is really selectable, so presses are ignored. */
  readOnly?: boolean;
};

/**
 * Step 1 of the public booking flow: pick a service.
 *
 * Used by BOTH the settings live preview and (step 5) the real public page, which
 * is why it takes a view model and no query hooks — see `../types.ts`.
 *
 * Grouped by category when any service has one, because a salon with 20 services
 * across 4 categories is unusable as a flat list. Services with no category come
 * last under no heading, rather than under an invented "Other".
 */
export function ServiceList({
  services,
  selectedId,
  onSelect,
  showPrices,
  locale,
  readOnly = false,
}: ServiceListProps) {
  const { t } = useTranslation();

  // Preserve the order the caller gave (the query sorts it); only group.
  const groups = new Map<string | null, PublicService[]>();
  for (const service of services) {
    const key = service.categoryName ?? null;
    const existing = groups.get(key);
    if (existing) existing.push(service);
    else groups.set(key, [service]);
  }
  // Uncategorised last.
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === null) return 1;
    if (b[0] === null) return -1;
    return 0;
  });

  if (services.length === 0) {
    return (
      <Text variant="helper" color="textMuted">
        {t('bookingPublic.noServices')}
      </Text>
    );
  }

  return (
    <View style={styles.wrapper}>
      {ordered.map(([category, items]) => (
        <View key={category ?? '__none'} style={styles.group}>
          {category ? (
            <Text variant="label" color="textSecondary">
              {category}
            </Text>
          ) : null}

          {items.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              selected={service.id === selectedId}
              showPrices={showPrices}
              locale={locale}
              readOnly={readOnly}
              onPress={() => onSelect(service.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function ServiceRow({
  service,
  selected,
  showPrices,
  locale,
  readOnly,
  onPress,
}: {
  service: PublicService;
  selected: boolean;
  showPrices: boolean;
  locale: string;
  readOnly: boolean;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(readOnly);

  return (
    <Pressable
      {...handlers}
      onPress={readOnly ? undefined : onPress}
      // In preview the rows are illustrative, so they are not announced as
      // buttons — a screen reader user should not be invited to tap them.
      accessibilityRole={readOnly ? 'text' : 'radio'}
      accessibilityState={readOnly ? undefined : { selected }}
      style={[
        styles.row,
        selected && styles.rowSelected,
        showHover && !selected && styles.rowHovered,
        showFocusRing && focusRing(),
      ]}
    >
      <View style={styles.rowText}>
        <Text variant="bodyStrong" color="textPrimary" numberOfLines={2}>
          {service.name}
        </Text>
        <Text variant="helper" color="textSecondary">
          {formatDuration(service.durationMinutes, locale)}
        </Text>
      </View>

      {/* doc §6.2: when show_prices is off the customer sees no price at all. */}
      {showPrices && service.priceMinor !== null ? (
        <Text variant="bodyStrong" color="textPrimary">
          {formatMoney(money(service.priceMinor, service.currency), locale)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  group: {
    gap: theme.spacing[8],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    minHeight: theme.layout.minTouchTarget,
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[14],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  rowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  rowHovered: {
    borderColor: theme.colors.textMuted,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
