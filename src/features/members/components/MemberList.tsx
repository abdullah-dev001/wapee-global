import { Clock, UserX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, EmptyState, Skeleton, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { type MemberRow } from '../api/useMembers';

/** Has this pending invite passed its expiry? */
function isExpired(member: MemberRow, now: Date): boolean {
  if (member.status !== 'invited' || !member.inviteExpiresAt) return false;
  return new Date(member.inviteExpiresAt) <= now;
}

export function MemberList({ members, isPending }: { members: MemberRow[]; isPending: boolean }) {
  const { t } = useTranslation();
  const now = new Date();

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

  if (members.length === 0) {
    return (
      <EmptyState
        icon={UserX}
        title={t('members.empty.title')}
        description={t('members.empty.description')}
      />
    );
  }

  return (
    <Card noPadding>
      {members.map((member, index) => (
        <MemberRowView
          key={member.id}
          member={member}
          expired={isExpired(member, now)}
          isLast={index === members.length - 1}
        />
      ))}
    </Card>
  );
}

function MemberRowView({
  member,
  expired,
  isLast,
}: {
  member: MemberRow;
  expired: boolean;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const roleNames = member.roles
    .map((role) => role.roleName)
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.row, isLast ? null : styles.rowDivider]}>
      <View style={styles.rowMain}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {member.fullName ?? member.email ?? t('members.unknown')}
        </Text>
        {member.fullName && member.email ? (
          <Text variant="helper" color="textSecondary" numberOfLines={1}>
            {member.email}
          </Text>
        ) : null}
        {roleNames ? (
          <Text variant="helper" color="textMuted" numberOfLines={1}>
            {roleNames}
          </Text>
        ) : null}
      </View>

      <StatusBadge status={member.status} expired={expired} />
    </View>
  );
}

function StatusBadge({ status, expired }: { status: MemberRow['status']; expired: boolean }) {
  const { t } = useTranslation();

  if (status === 'invited') {
    return expired ? (
      <Badge tone="error">{t('members.status.expired')}</Badge>
    ) : (
      <Badge
        tone="warning"
        icon={<Clock size={theme.iconSize.xs} strokeWidth={2} color={theme.colors.warning} />}
      >
        {t('members.status.invited')}
      </Badge>
    );
  }
  if (status === 'disabled') return <Badge tone="neutral">{t('members.status.disabled')}</Badge>;
  return <Badge tone="success">{t('members.status.active')}</Badge>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[14],
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
});
