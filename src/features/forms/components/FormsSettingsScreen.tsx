import { ClipboardSignature, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useDeleteFormTemplate, useFormTemplates, type FormTemplate } from '../api/useForms';
import { formErrorKey } from '../formsLogic';
import { FormTemplateEditor } from './FormTemplateEditor';

/** Settings > Forms: the templates of the business (intake and consent forms). `forms.manage` + the add-on. */
export function FormsSettingsScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const list = useFormTemplates(businessId);
  const remove = useDeleteFormTemplate(businessId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [deleting, setDeleting] = useState<FormTemplate | null>(null);
  const rows = list.data ?? [];

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('forms.title')}
        actions={
          <Button size="sm" startIcon={Plus} onPress={() => setCreating(true)}>
            {t('forms.create')}
          </Button>
        }
      >
        <View style={styles.stack}>
          <Text variant="helper" color="textSecondary">
            {t('forms.intro')}
          </Text>
          {list.isError ? (
            <ErrorState
              title={t('forms.error')}
              description={list.error.message}
              onRetry={() => void list.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : list.isPending ? (
            <View style={styles.stack}>
              {[0, 1].map((i) => (
                <Skeleton key={i} height={84} />
              ))}
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ClipboardSignature}
              title={t('forms.empty.title')}
              description={t('forms.empty.description')}
              action={{
                children: t('forms.create'),
                onPress: () => setCreating(true),
                startIcon: Plus,
              }}
            />
          ) : (
            rows.map((tpl) => (
              <Pressable
                key={tpl.id}
                accessibilityRole="button"
                accessibilityLabel={tpl.title}
                onPress={() => setEditing(tpl)}
              >
                <Card>
                  <View style={styles.head}>
                    <View style={styles.grow}>
                      <Text variant="cardTitle" numberOfLines={1}>
                        {tpl.title}
                      </Text>
                      <Text variant="helper" color="textSecondary">
                        {t(tpl.kind === 'consent' ? 'forms.kind.consent' : 'forms.kind.intake')} ·{' '}
                        {t('forms.card.questions', { count: tpl.fields.length })} ·{' '}
                        {t('forms.card.services', { count: tpl.serviceIds.length })}
                      </Text>
                    </View>
                    <View style={styles.badges}>
                      <Badge tone="neutral">
                        {t('forms.card.version', { version: tpl.version })}
                      </Badge>
                      {!tpl.isActive ? (
                        <Badge tone="warning">{t('forms.card.inactive')}</Badge>
                      ) : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </PageContainer>

      <Drawer open={creating} onClose={() => setCreating(false)} title={t('forms.create')}>
        <FormTemplateEditor onDone={() => setCreating(false)} />
      </Drawer>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.title ?? ''}
        footer={
          <Button
            variant="danger"
            fullWidth
            onPress={() => {
              setDeleting(editing);
              setEditing(null);
            }}
          >
            {t('actions.delete')}
          </Button>
        }
      >
        {editing ? <FormTemplateEditor template={editing} onDone={() => setEditing(null)} /> : null}
      </Drawer>
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('forms.delete.title')}
        message={t('forms.delete.message')}
        busy={remove.isPending}
        confirm={{
          label: t('forms.delete.confirm'),
          variant: 'danger',
          onPress: () => {
            if (!deleting) return;
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                toast.show({ message: t('forms.deleted'), tone: 'success' });
              },
              onError: (error) => {
                setDeleting(null);
                toast.show({ message: t(formErrorKey(rpcCode(error))), tone: 'error' });
              },
            });
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  grow: { flex: 1, gap: theme.spacing[4] },
  badges: { alignItems: 'flex-end', gap: theme.spacing[4] },
});
