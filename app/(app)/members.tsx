import { UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Drawer, ErrorState } from '@/components/ui';
import { RouteGuard, useSession } from '@/features/auth';
import { useMembers, type MemberRow } from '@/features/members/api/useMembers';
import { InviteMemberForm } from '@/features/members/components/InviteMemberForm';
import { MemberList } from '@/features/members/components/MemberList';
import { MemberManageDrawer } from '@/features/members/components/MemberManageDrawer';
import { usePermission, useCurrentScope } from '@/lib/permissions';

/**
 * Who is in this business: active members and pending invites, plus the invite
 * form. Reading the list needs `staff.view`; inviting needs `users.invite`, so
 * a manager who may invite but not manage roles still works.
 */
export default function MembersScreen() {
  const { t } = useTranslation();
  const { businessId } = useCurrentScope();
  const members = useMembers(businessId);
  const canInvite = usePermission('users.invite');
  const canManage = usePermission('roles.manage');
  const { user } = useSession();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [managing, setManaging] = useState<MemberRow | null>(null);

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer
          title={t('members.title')}
          count={members.data?.length}
          actions={
            canInvite.allowed ? (
              <Button size="sm" startIcon={UserPlus} onPress={() => setInviteOpen(true)}>
                {t('members.invite.action')}
              </Button>
            ) : null
          }
        >
          {members.isError ? (
            <ErrorState
              title={t('members.error.title')}
              description={members.error.message}
              onRetry={() => void members.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : (
            <MemberList
              members={members.data ?? []}
              isPending={members.isPending}
              onManage={canManage.allowed || canInvite.allowed ? setManaging : undefined}
            />
          )}
        </PageContainer>

        <Drawer
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title={t('members.invite.title')}
          subtitle={t('members.invite.subtitle')}
        >
          <InviteMemberForm onDone={() => setInviteOpen(false)} />
        </Drawer>
        <MemberManageDrawer
          member={managing}
          isSelf={Boolean(managing?.userId && managing.userId === user?.id)}
          onClose={() => setManaging(null)}
        />
      </Screen>
    </RouteGuard>
  );
}
