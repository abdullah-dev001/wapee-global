import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Dialog, Drawer, Select, Text, useToast } from '@/components/ui';
import { roleErrorKey } from '@/features/roles/rolesLogic';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useAssignableRoles } from '../api/useAssignableRoles';
import {
  useAssignMemberRole,
  useInviteMember,
  useRemoveMember,
  useRemoveMemberRole,
  useRevokeInvite,
  type InviteResult,
  type MemberRow,
} from '../api/useMembers';
import { InviteLink } from './InviteMemberForm';

const ALL = 'all';

/**
 * One person: their roles per location (add, change, remove), removing them from
 * the business, or - for a pending invite - sending a new link or cancelling it.
 * The role pickers only offer what the signed-in person may grant; the database
 * refuses the rest (and the last Owner, and anything above their own role).
 */
export function MemberManageDrawer({
  member,
  isSelf,
  onClose,
}: {
  member: MemberRow | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  if (!member) return null;
  return <Body key={member.id} member={member} isSelf={isSelf} onClose={onClose} />;
}

function Body({
  member,
  isSelf,
  onClose,
}: {
  member: MemberRow;
  isSelf: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, business } = useCurrentScope();
  const canRoles = usePermission('roles.manage');
  const canInvite = usePermission('users.invite');
  const { roles } = useAssignableRoles(businessId);
  const assign = useAssignMemberRole(businessId);
  const unassign = useRemoveMemberRole(businessId);
  const removeMember = useRemoveMember(businessId);
  const revoke = useRevokeInvite(businessId);
  const resend = useInviteMember(businessId);

  const [addRole, setAddRole] = useState<string | null>(null);
  const [addBranch, setAddBranch] = useState<string>(ALL);
  const [changing, setChanging] = useState<{
    assignmentId: string;
    branchId: string | null;
  } | null>(null);
  const [changeTo, setChangeTo] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'remove' | 'revoke' | null>(null);
  const [link, setLink] = useState<InviteResult | null>(null);

  const branches = business?.branches ?? [];
  const branchName = (id: string | null) =>
    id
      ? (branches.find((branch) => branch.id === id)?.name ?? '')
      : t('members.manage.allBranches');
  const name = member.fullName ?? member.email ?? t('members.unknown');
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));
  const branchOptions = [
    { value: ALL, label: t('members.manage.allBranches') },
    ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
  ];

  const fail = (error: Error) =>
    toast.show({ message: t(roleErrorKey(rpcCode(error))), tone: 'error' });

  if (link) {
    return (
      <Drawer open onClose={onClose} title={t('members.manage.title', { name })}>
        <InviteLink result={link} onDone={onClose} />
      </Drawer>
    );
  }

  const invited = member.status === 'invited';

  return (
    <Drawer
      open
      onClose={onClose}
      title={t('members.manage.title', { name })}
      subtitle={invited ? t('members.manage.subtitleInvited') : t('members.manage.subtitleActive')}
    >
      <View style={styles.body}>
        <View style={styles.section}>
          <Text variant="sectionTitle">{t('members.manage.rolesTitle')}</Text>
          {member.roles.length === 0 ? (
            <Text variant="helper" color="textMuted">
              {t('members.manage.noRoles')}
            </Text>
          ) : (
            member.roles.map((role) => (
              <View key={role.assignmentId} style={styles.roleRow}>
                <View style={styles.roleText}>
                  <Text variant="bodyStrong">{role.roleName}</Text>
                  <Text variant="helper" color="textSecondary">
                    {branchName(role.branchId)}
                  </Text>
                </View>
                {canRoles.allowed && !invited ? (
                  <View style={styles.roleActions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setChanging({ assignmentId: role.assignmentId, branchId: role.branchId });
                        setChangeTo(null);
                      }}
                    >
                      {t('members.manage.changeRole')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      startIcon={Trash2}
                      loading={
                        unassign.isPending && unassign.variables?.assignmentId === role.assignmentId
                      }
                      onPress={() =>
                        unassign.mutate(
                          { assignmentId: role.assignmentId },
                          {
                            onSuccess: () =>
                              toast.show({
                                message: t('members.manage.roleRemoved'),
                                tone: 'success',
                              }),
                            onError: fail,
                          },
                        )
                      }
                    >
                      {t('members.manage.removeRole')}
                    </Button>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

        {changing ? (
          <View style={styles.section}>
            <Select
              label={t('members.manage.changeTo')}
              options={roleOptions}
              value={changeTo}
              onChange={setChangeTo}
              placeholder={t('members.invite.rolePlaceholder')}
            />
            <View style={styles.inline}>
              <Button variant="ghost" onPress={() => setChanging(null)}>
                {t('actions.cancel')}
              </Button>
              <Button
                loading={assign.isPending || unassign.isPending}
                disabled={!changeTo}
                onPress={() => {
                  if (!changeTo) return;
                  // Add the new role FIRST: if the database refuses it, the old one stays.
                  assign.mutate(
                    { memberId: member.id, roleId: changeTo, branchId: changing.branchId },
                    {
                      onSuccess: () =>
                        unassign.mutate(
                          { assignmentId: changing.assignmentId },
                          {
                            onSuccess: () => {
                              toast.show({ message: t('members.manage.changed'), tone: 'success' });
                              setChanging(null);
                            },
                            onError: fail,
                          },
                        ),
                      onError: fail,
                    },
                  );
                }}
              >
                {t('members.manage.saveChange')}
              </Button>
            </View>
          </View>
        ) : null}

        {canRoles.allowed && !invited ? (
          <View style={styles.section}>
            <Text variant="sectionTitle">{t('members.manage.addTitle')}</Text>
            <Select
              label={t('members.manage.addRole')}
              options={roleOptions}
              value={addRole}
              onChange={setAddRole}
              placeholder={t('members.invite.rolePlaceholder')}
            />
            {branchOptions.length > 2 ? (
              <Select
                label={t('members.manage.addBranch')}
                options={branchOptions}
                value={addBranch}
                onChange={setAddBranch}
              />
            ) : null}
            <Button
              loading={assign.isPending && !changing}
              disabled={!addRole}
              onPress={() => {
                if (!addRole) return;
                assign.mutate(
                  {
                    memberId: member.id,
                    roleId: addRole,
                    branchId: addBranch === ALL ? null : addBranch,
                  },
                  {
                    onSuccess: () => {
                      toast.show({ message: t('members.manage.added'), tone: 'success' });
                      setAddRole(null);
                    },
                    onError: fail,
                  },
                );
              }}
            >
              {t('members.manage.addAction')}
            </Button>
          </View>
        ) : null}

        {invited && canInvite.allowed ? (
          <View style={styles.section}>
            <Button
              variant="secondary"
              loading={resend.isPending}
              disabled={!member.invitedEmail || member.roles.length === 0}
              onPress={() => {
                const first = member.roles[0];
                if (!member.invitedEmail || !first) return;
                resend.mutate(
                  {
                    email: member.invitedEmail,
                    roleId: first.roleId,
                    branchId: first.branchId,
                    staffId: null,
                  },
                  {
                    onSuccess: (result) => {
                      toast.show({ message: t('members.manage.resent'), tone: 'success' });
                      setLink(result);
                    },
                    onError: (error) => toast.show({ message: error.message, tone: 'error' }),
                  },
                );
              }}
            >
              {t('members.manage.resend')}
            </Button>
            <Button variant="danger" onPress={() => setConfirm('revoke')}>
              {t('members.manage.revoke')}
            </Button>
          </View>
        ) : null}

        {!invited && canRoles.allowed && !isSelf ? (
          <Button variant="danger" onPress={() => setConfirm('remove')}>
            {t('members.manage.removeMember')}
          </Button>
        ) : null}
      </View>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === 'revoke'
            ? t('members.manage.revokeTitle')
            : t('members.manage.removeTitle', { name })
        }
        message={
          confirm === 'revoke'
            ? t('members.manage.revokeMessage')
            : t('members.manage.removeMessage')
        }
        cancelLabel={t('actions.cancel')}
        busy={removeMember.isPending || revoke.isPending}
        confirm={{
          label:
            confirm === 'revoke'
              ? t('members.manage.revokeConfirm')
              : t('members.manage.removeConfirm'),
          loading: removeMember.isPending || revoke.isPending,
          onPress: () => {
            const done = (message: string) => {
              toast.show({ message, tone: 'success' });
              setConfirm(null);
              onClose();
            };
            if (confirm === 'revoke') {
              revoke.mutate(
                { memberId: member.id },
                { onSuccess: () => done(t('members.manage.revoked')), onError: fail },
              );
            } else {
              removeMember.mutate(
                { memberId: member.id },
                { onSuccess: () => done(t('members.manage.removed')), onError: fail },
              );
            }
          },
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing[24] },
  section: { gap: theme.spacing[12] },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[8],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  roleText: { flex: 1, gap: theme.spacing[2] },
  roleActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  inline: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing[8] },
});
