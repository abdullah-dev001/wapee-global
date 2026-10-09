import { CalendarClock, ChevronRight, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Card, EmptyState, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { useCurrentScope } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

import { type StaffListItem } from '../api/useStaff';
import { hasNoWorkingHours } from '../staffHours';

export type StaffListProps = {
  staff: readonly StaffListItem[];
  isPending: boolean;
  isSearching: boolean;
  onSelect?: (member: StaffListItem) => void;
  /** Opens the schedule editor for one person. */
  onOpenSchedule?: (member: StaffListItem) => void;
};

export function StaffList({
  staff,
  isPending,
  isSearching,
  onSelect,
  onOpenSchedule,
}: StaffListProps) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <Card noPadding>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.row}>
            <Skeleton height={18} width="55%" radius="sm" />
          </View>
        ))}
      </Card>
    );
  }

  if (staff.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={isSearching ? t('staff.emptySearch.title') : t('staff.empty.title')}
        description={
          isSearching ? t('staff.emptySearch.description') : t('staff.empty.description')
        }
      />
    );
  }

  return (
    <Card noPadding>
      {staff.map((member, index) => (
        <StaffRow
          key={member.id}
          member={member}
          isLast={index === staff.length - 1}
          onPress={onSelect ? () => onSelect(member) : undefined}
          onOpenSchedule={onOpenSchedule ? () => onOpenSchedule(member) : undefined}
        />
      ))}
    </Card>
  );
}

function StaffRow({
  member,
  isLast,
  onPress,
  onOpenSchedule,
}: {
  member: StaffListItem;
  isLast: boolean;
  onPress?: () => void;
  onOpenSchedule?: () => void;
}) {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const { branchId } = useCurrentScope();
  const noHours = hasNoWorkingHours(member, branchId);

  return (
    <View style={[styles.row, isLast ? null : styles.rowDivider]}>
      <Pressable
        {...handlers}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : 'text'}
        style={[
          styles.rowMain,
          showHover && onPress ? { opacity: 0.8 } : null,
          showFocusRing ? focusRing() : null,
        ]}
      >
        <View style={styles.rowTitle}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {member.displayName}
          </Text>
          {!member.isActive ? <Badge tone="neutral">{t('staff.inactive')}</Badge> : null}
          {/* A staff member with no login is normal, not a problem — shown so an
              owner knows who can actually open the app. */}
          {member.memberId === null ? <Badge tone="info">{t('staff.noLogin')}</Badge> : null}
        </View>

        {member.jobTitle ? (
          <Text variant="helper" color="textSecondary" numberOfLines={1}>
            {member.jobTitle}
          </Text>
        ) : null}

        {/* No fallback to branch hours exists: without hours this person has no online slots. */}
        {noHours ? (
          <View style={styles.warning}>
            <Badge tone="warning">
              {t('staff.noHours')}
            </Badge>
          </View>
        ) : null}
      </Pressable>

      {onOpenSchedule ? (
        <Pressable
          onPress={onOpenSchedule}
          accessibilityRole="button"
          accessibilityLabel={t('schedule.title')}
          hitSlop={6}
          style={styles.scheduleButton}
        >
          <CalendarClock
            size={theme.iconSize.md}
            strokeWidth={theme.iconStroke}
            color={theme.colors.primary}
          />
        </Pressable>
      ) : null}

      {onPress ? (
        <ChevronRight size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
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
    justifyContent: 'center',
    minHeight: theme.layout.minTouchTarget,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
  },
  name: {
    flexShrink: 1,
  },
  warning: {
    alignItems: 'flex-start',
    marginTop: theme.spacing[4],
  },
  scheduleButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
