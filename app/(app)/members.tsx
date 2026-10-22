import { UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Drawer, ErrorState } from '@/components/ui';
import { RouteGuard, useSession } from '@/features/auth';
import { useMembers, type MemberRow } from '@/features/members/api/useMembers';
import { AddMemberForm } from '@/features/members/components/AddMemberForm';
import { MemberList } from '@/features/members/components/MemberList';
import { MemberManageDrawer } from '@/features/members/components/MemberManageDrawer';
import { usePermission, useCurrentScope } from '@/lib/permissions';

/**
 * Who is in this business: active members and pending adds, plus the "add by
 * email" form. Reading the list needs `staff.view`; adding needs `users.invite`,
 * so a manager who may add people but not manage roles still works.
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
              description={t('auth.errors.generic')}
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
          <AddMemberForm onDone={() => setInviteOpen(false)} />
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
