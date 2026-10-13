import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Dialog } from '@/components/ui/Dialog';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/shared/Avatar';
import { useSignOut } from '@/features/auth';
import { useCurrentScope, useMyProfile, useMyRoleLabel } from '@/lib/permissions';
import { theme } from '@/lib/theme';

export type AccountMenuProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Who-am-I menu opened from the header avatar (desktop/tablet) or the top of
 * the mobile More screen: name, role, business + branch, email, sign out.
 */
export function AccountMenu({ open, onClose }: AccountMenuProps) {
  const { t } = useTranslation();
  const profile = useMyProfile();
  const { business, branchId } = useCurrentScope();
  const role = useMyRoleLabel();
  const signOut = useSignOut();

  const name = profile.data?.full_name ?? '';
  const email = profile.data?.email ?? '';
  const branch = business?.branches.find((item) => item.id === branchId);
  const showBranch = Boolean(branch) && (business?.branches.length ?? 0) > 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={name || email}
      cancelLabel={t('actions.close')}
      confirm={{
        label: t('nav.logout'),
        variant: 'danger',
        onPress: () => {
          onClose();
          signOut.mutate();
        },
        loading: signOut.isPending,
      }}
    >
      <View style={styles.identity}>
        <Avatar name={name} email={email} size={40} />
        <View style={styles.identityText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name || email}
          </Text>
          {role.label ? (
            <Text variant="small" color="textSecondary" numberOfLines={1}>
              {role.label}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rows}>
        {business ? (
          <MenuRow label={t('accountMenu.business')} value={business.name} />
        ) : null}
        {showBranch && branch ? (
          <MenuRow label={t('accountMenu.branch')} value={branch.name} />
        ) : null}
        <MenuRow label={t('accountMenu.email')} value={email} />
      </View>
    </Dialog>
  );
}

function MenuRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="small" color="textSecondary">
        {label}
      </Text>
      <Text variant="small" numberOfLines={1} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[2],
  },
  rows: {
    gap: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
  },
});
