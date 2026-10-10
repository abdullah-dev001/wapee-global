import { Plus, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { SearchInput } from '@/components/shared';
import { Button, Dialog, Drawer, ErrorState, useToast } from '@/components/ui';
import { useMyStaffProfile } from '@/features/appointments/api/useMyStaffProfile';
import { RouteGuard } from '@/features/auth';
import { planErrorKey } from '@/features/plans/planErrors';
import { StaffScheduleEditor } from '@/features/schedule/components/StaffScheduleEditor';
import {
  useAddMeAsStaff,
  useDeleteStaff,
  useStaff,
  type StaffListItem,
} from '@/features/staff/api/useStaff';
import { StaffForm } from '@/features/staff/components/StaffForm';
import { StaffList } from '@/features/staff/components/StaffList';
import { linkErrorKey } from '@/features/staff/staffLogin';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

/**
 * The team. A staff member is a profile, not necessarily an app user: someone
 * with no login is the normal case (see context/staff.md). Inviting someone to
 * the app is a separate screen (`/members`).
 */
export default function StaffScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffListItem | null>(null);
  const [deleting, setDeleting] = useState<StaffListItem | null>(null);
  const [scheduling, setScheduling] = useState<StaffListItem | null>(null);

  const staff = useStaff(businessId, branchId, { search });
  const canManage = usePermission('staff.manage');
  const canSchedule = usePermission('staff.manage_schedule');
  const remove = useDeleteStaff(businessId);
  const myProfile = useMyStaffProfile(businessId);
  const addMe = useAddMeAsStaff(businessId, branchId);
  // Offered only while the signed-in person has no profile of their own (a solo owner).
  const canAddMe = canManage.allowed && myProfile.isSuccess && myProfile.data === null;

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer
          title={t('staff.title')}
          count={staff.data?.length}
          actions={
            canManage.allowed ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing[8] }}>
                {canAddMe ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    startIcon={UserPlus}
                    loading={addMe.isPending}
                    onPress={() =>
                      addMe.mutate(undefined, {
                        onSuccess: () =>
                          toast.show({ message: t('staff.addMe.done'), tone: 'success' }),
                        onError: (error) => {
                          const planKey = planErrorKey(error);
                          const key = planKey ?? linkErrorKey(error);
                          toast.show({ message: key ? t(key) : error.message, tone: 'error' });
                        },
                      })
                    }
                  >
                    {t('staff.addMe.action')}
                  </Button>
                ) : null}
                <Button size="sm" startIcon={Plus} onPress={() => setCreating(true)}>
                  {t('staff.create')}
                </Button>
              </View>
            ) : null
          }
        >
          <View style={{ gap: theme.spacing[16] }}>
            <SearchInput
              onSearch={setSearch}
              placeholder={t('staff.title')}
              accessibilityLabel={t('actions.search')}
            />

            {staff.isError ? (
              <ErrorState
                title={t('staff.error.title')}
                description={staff.error.message}
                onRetry={() => void staff.refetch()}
                retryLabel={t('actions.retry')}
              />
            ) : (
              <StaffList
                staff={staff.data ?? []}
                isPending={staff.isPending}
                isSearching={search.length > 0}
                onSelect={canManage.allowed ? setEditing : undefined}
                // Staff may edit their OWN schedule, so this is offered more
                // widely than editing the profile itself.
                onOpenSchedule={canSchedule.allowed ? setScheduling : undefined}
              />
            )}
          </View>
        </PageContainer>

        <Drawer open={creating} onClose={() => setCreating(false)} title={t('staff.create')}>
          <StaffForm onDone={() => setCreating(false)} />
        </Drawer>

        <Drawer
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={editing?.displayName ?? ''}
          footer={
            <Button
              variant="danger"
              fullWidth
              onPress={() => {
                const target = editing;
                setEditing(null);
                setDeleting(target);
              }}
            >
              {t('staff.deleteConfirm.confirm')}
            </Button>
          }
        >
          {editing ? (
            <StaffForm
              member={editing}
              onDone={() => setEditing(null)}
              onOpenSchedule={
                canSchedule.allowed
                  ? () => {
                      const target = editing;
                      setEditing(null);
                      setScheduling(target);
                    }
                  : undefined
              }
            />
          ) : null}
        </Drawer>

        <Drawer
          open={scheduling !== null}
          onClose={() => setScheduling(null)}
          title={scheduling?.displayName ?? ''}
          subtitle={t('schedule.workingHours')}
        >
          {scheduling ? (
            <StaffScheduleEditor staffId={scheduling.id} onDone={() => setScheduling(null)} />
          ) : null}
        </Drawer>

        <Dialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          title={t('staff.deleteConfirm.title')}
          message={t('staff.deleteConfirm.message')}
          busy={remove.isPending}
          confirm={{
            label: t('staff.deleteConfirm.confirm'),
            variant: 'danger',
            onPress: () => {
              if (!deleting) return;
              remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
            },
          }}
          cancelLabel={t('actions.cancel')}
        />
      </Screen>
    </RouteGuard>
  );
}
