import { ChevronRight, Scissors } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Card, EmptyState, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { formatMoney, money, type CurrencyCode } from '@/lib/money';
import { focusRing, theme } from '@/lib/theme';
import { formatDuration } from '@/lib/time';

import { type ServiceListItem } from '../api/useServices';

export type ServiceListProps = {
  services: readonly ServiceListItem[];
  isPending: boolean;
  /** Whether a search is active, so the empty state can say so. */
  isSearching: boolean;
  /** Branch currency (decision 23). */
  currency: CurrencyCode;
  onSelect?: (service: ServiceListItem) => void;
};

/**
 * Services grouped by category, uncategorised last.
 *
 * Mobile and desktop share this card list; a `DataTable` variant for desktop is
 * noted in context/services.md but is not needed for the handful of columns here.
 */
export function ServiceList({
  services,
  isPending,
  isSearching,
  currency,
  onSelect,
}: ServiceListProps) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <Card noPadding>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.row}>
            <Skeleton height={18} width="60%" radius="sm" />
          </View>
        ))}
      </Card>
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title={isSearching ? t('services.emptySearch.title') : t('services.empty.title')}
        description={
          isSearching ? t('services.emptySearch.description') : t('services.empty.description')
        }
      />
    );
  }

  // Group by category, keeping the server's order inside each group.
  const groups = new Map<string, { name: string | null; items: ServiceListItem[] }>();
  for (const service of services) {
    const key = service.categoryId ?? '__none__';
    const group = groups.get(key);
    if (group) group.items.push(service);
    else groups.set(key, { name: service.categoryName, items: [service] });
  }
  // Uncategorised goes last: it is a fallback, not a real category.
  const ordered = [...groups.entries()].sort(([keyA], [keyB]) => {
    if (keyA === '__none__') return 1;
    if (keyB === '__none__') return -1;
    return 0;
  });

  return (
    <View style={styles.groups}>
      {ordered.map(([key, group]) => (
        <View key={key} style={styles.group}>
          <Text variant="label" color="textSecondary">
            {group.name ?? t('services.uncategorised')}
          </Text>
          <Card noPadding>
            {group.items.map((service, index) => (
              <ServiceRow
                key={service.id}
                service={service}
                currency={currency}
                isLast={index === group.items.length - 1}
                onPress={onSelect ? () => onSelect(service) : undefined}
              />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

function ServiceRow({
  service,
  currency,
  isLast,
  onPress,
}: {
  service: ServiceListItem;
  currency: CurrencyCode;
  isLast: boolean;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  const price =
    service.priceMinor === null
      ? t('services.noPrice')
      : formatMoney(money(service.priceMinor, currency), i18n.language);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={[
        styles.row,
        isLast ? null : styles.rowDivider,
        showHover && onPress ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTitle}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {service.name}
          </Text>
          {!service.isActive ? <Badge tone="neutral">{t('services.inactive')}</Badge> : null}
          {service.isActive && !service.isBookableOnline ? (
            <Badge tone="warning">{t('services.notBookableOnline')}</Badge>
          ) : null}
        </View>
        <Text variant="helper" color="textSecondary" numberOfLines={1}>
          {formatDuration(service.durationMinutes, i18n.language)}
          {' · '}
          {price}
        </Text>
      </View>

      {onPress ? (
        <ChevronRight size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groups: {
    gap: theme.spacing[16],
  },
  group: {
    gap: theme.spacing[6],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
  },
  rowDivider: {
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowMain: {
    flex: 1,
    gap: theme.spacing[2],
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
  },
  name: {
    flexShrink: 1,
  },
});
