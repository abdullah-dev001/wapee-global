import { MapPin, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Badge, Button, Card, ErrorState, Skeleton, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useBranchAdmin } from '../api/useBranches';
import { bpToPercentText, branchErrorKey, type BranchRow } from '../branchLogic';
import { BranchFormDrawer } from './BranchFormDrawer';

/**
 * "Business location" for plans with ONE location (Solo, Team): the same edit form the Locations
 * screen uses, without the list / add / archive tools (those stay behind `multi_branch`). Currency
 * and time zone changes are refused by `update_branch` when unsafe; the form says so up front.
 */
export function LocationScreen() {
  const { t } = useTranslation();
  const { businessId } = useCurrentScope();
  const branches = useBranchAdmin(businessId);
  const [editing, setEditing] = useState(false);

  const all = branches.data ?? [];
  const branch =
    all.find((b) => b.isPrimary && !b.archived) ?? all.find((b) => !b.archived) ?? null;

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('branches.location.title')}
        subtitle={t('branches.location.subtitle')}
      >
        {branches.isError ? (
          <ErrorState
            title={t('branches.error.title')}
            description={t(branchErrorKey(rpcCode(branches.error)))}
            onRetry={() => void branches.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : branches.isPending || !branch ? (
          <Skeleton height={160} radius="md" />
        ) : (
          <>
            <Card>
              <View style={styles.stack}>
                <View style={styles.header}>
                  <MapPin
                    size={theme.iconSize.md}
                    strokeWidth={theme.iconStroke}
                    color={theme.colors.textSecondary}
                  />
                  <Text variant="cardTitle" style={styles.grow}>
                    {branch.name}
                  </Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    startIcon={Pencil}
                    onPress={() => setEditing(true)}
                  >
                    {t('branches.location.edit')}
                  </Button>
                </View>
                <Detail label={t('branches.form.address')} value={branch.address} />
                <Detail label={t('branches.form.phone')} value={branch.phone} />
                <Detail label={t('branches.form.timezone')} value={branch.timezone} />
                <Detail label={t('branches.form.currency')} value={branch.currency} />
                <Detail label={t('branches.form.taxNumber')} value={branch.taxNumber} />
                <Detail
                  label={t('branches.form.taxRate')}
                  value={`${bpToPercentText(branch.taxRateBp)}%`}
                />
                <Detail
                  label={t('branches.form.prefix')}
                  value={branch.invoicePrefix}
                  badge={branch.invoiceNextNo > 1 ? t('branches.location.prefixLocked') : undefined}
                />
              </View>
            </Card>
            <Text variant="helper" color="textSecondary" style={styles.note}>
              {t('branches.location.note')}
            </Text>
            <BranchFormDrawer
              branch={editing ? (branch satisfies BranchRow) : null}
              open={editing}
              branches={all}
              onClose={() => setEditing(false)}
            />
          </>
        )}
      </PageContainer>
    </Screen>
  );
}

function Detail({ label, value, badge }: { label: string; value: string | null; badge?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.detail}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text variant="body" color={value ? 'textPrimary' : 'textMuted'} style={styles.grow}>
          {value || t('branches.location.notSet')}
        </Text>
        {badge ? <Badge tone="neutral">{badge}</Badge> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
  detail: { gap: theme.spacing[2] },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  note: { marginTop: theme.spacing[12] },
});
