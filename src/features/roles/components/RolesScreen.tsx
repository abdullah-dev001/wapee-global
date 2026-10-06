import { Copy, Eye, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useRolesAdmin, type RoleRow } from '../api/useRolesAdmin';
import { DeleteRoleDialog } from './DeleteRoleDialog';
import { RoleEditor, type EditorMode } from './RoleEditor';

/**
 * Default and custom roles. Default roles are read-only (view / clone); custom
 * roles can be edited, cloned and deleted. Everything the person may not do is
 * refused by the database as well (`roles.manage`, no granting what you lack).
 */
export function RolesScreen() {
  const { t } = useTranslation();
  const { businessId } = useCurrentScope();
  const roles = useRolesAdmin(businessId);
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const list = roles.data ?? [];
  const system = list.filter((role) => role.isSystem);
  const custom = list.filter((role) => !role.isSystem);

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        actions={
          <Button
            size="sm"
            startIcon={Plus}
            onPress={() => setMode({ kind: 'create', cloneFrom: null })}
          >
            {t('roles.create')}
          </Button>
        }
      >
        {roles.isError ? (
          <ErrorState
            title={t('roles.error.title')}
            description={roles.error.message}
            onRetry={() => void roles.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : roles.isPending ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={72} radius="lg" />
            ))}
          </View>
        ) : (
          <View style={styles.sections}>
            <Section title={t('roles.customRoles')}>
              {custom.length === 0 ? (
                <EmptyState
                  compact
                  icon={ShieldCheck}
                  title={t('roles.noCustom')}
                  description={t('roles.noCustomHint')}
                />
              ) : (
                custom.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    actions={
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          startIcon={Pencil}
                          onPress={() => setMode({ kind: 'edit', role })}
                        >
                          {t('roles.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          startIcon={Copy}
                          onPress={() => setMode({ kind: 'create', cloneFrom: role })}
                        >
                          {t('roles.clone')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          startIcon={Trash2}
                          onPress={() => setDeleting(role)}
                        >
                          {t('roles.delete')}
                        </Button>
                      </>
                    }
                  />
                ))
              )}
            </Section>
            <Section title={t('roles.defaultRoles')}>
              {system.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  isDefault
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        startIcon={Eye}
                        onPress={() => setMode({ kind: 'view', role })}
                      >
                        {t('roles.view')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        startIcon={Copy}
                        onPress={() => setMode({ kind: 'create', cloneFrom: role })}
                      >
                        {t('roles.clone')}
                      </Button>
                    </>
                  }
                />
              ))}
            </Section>
          </View>
        )}
      </PageContainer>

      <RoleEditor mode={mode} roles={list} onClose={() => setMode(null)} />
      <DeleteRoleDialog role={deleting} roles={list} onClose={() => setDeleting(null)} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="sectionTitle">{title}</Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

function RoleCard({
  role,
  isDefault = false,
  actions,
}: {
  role: RoleRow;
  isDefault?: boolean;
  actions: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <Text variant="cardTitle" numberOfLines={1}>
            {role.name}
          </Text>
          <Text variant="helper" color="textSecondary">
            {t('roles.permissionsCount', { count: role.permissions.length })} ·{' '}
            {t('roles.members', { count: role.memberCount })}
          </Text>
        </View>
        {isDefault ? <Badge tone="neutral">{t('roles.default')}</Badge> : null}
      </View>
      <View style={styles.actions}>{actions}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sections: { gap: theme.spacing[24] },
  section: { gap: theme.spacing[12] },
  list: { gap: theme.spacing[12] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  cardTitle: { flex: 1, gap: theme.spacing[2] },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginTop: theme.spacing[12],
  },
});
