import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Text,
  Toggle,
} from '@/components/ui';
import { theme } from '@/lib/theme';

import { AdminRpcError } from '../adminLogic';
import { usePresets, useSavePreset, type PresetRow } from '../api/useAdmin';
import {
  parseStarterFields,
  parseTerminology,
  presetSchema,
  startersToText,
  terminologyToText,
  type PresetValues,
} from '../schemas/admin.schemas';
import { AdminFormDialog } from './AdminFormDialog';
import { useAdminMessage } from './useAdminMessage';

/**
 * Industry presets: key, name, terminology (term = Label lines), starter custom
 * fields (one per line) and the website template key. The server validates again.
 */
export function PresetsEditor() {
  const { t } = useTranslation();
  const messageOf = useAdminMessage();
  const presets = usePresets();
  const save = useSavePreset();
  const [editing, setEditing] = useState<PresetRow | 'new' | null>(null);
  const current = editing && editing !== 'new' ? editing : null;

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Text variant="helper" color="textSecondary" style={styles.grow}>
          {t('admin.presets.hint')}
        </Text>
        <Button size="sm" onPress={() => setEditing('new')}>
          {t('admin.presets.add')}
        </Button>
      </View>
      {presets.isError ? (
        <ErrorState
          title={messageOf(presets.error)}
          onRetry={() => void presets.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : presets.isPending ? (
        <Skeleton height={160} radius="lg" />
      ) : presets.data.length === 0 ? (
        <EmptyState
          compact
          title={t('admin.presets.empty')}
          description={t('admin.presets.emptyHint')}
        />
      ) : (
        presets.data.map((p) => (
          <Card key={p.key}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text variant="cardTitle">{p.name}</Text>
                <Text variant="helper" color="textSecondary">
                  {`${p.key} · ${p.templateKey}`}
                </Text>
              </View>
              {p.active ? null : <Badge tone="neutral">{t('admin.prices.inactive')}</Badge>}
              <Button size="sm" variant="secondary" onPress={() => setEditing(p)}>
                {t('actions.edit')}
              </Button>
            </View>
          </Card>
        ))
      )}

      <AdminFormDialog<PresetValues>
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t('admin.presets.edit', { name: current.name }) : t('admin.presets.add')}
        auditNote={t('admin.audited')}
        confirmLabel={t('actions.save')}
        schema={presetSchema}
        defaultValues={{
          key: current?.key ?? '',
          name: current?.name ?? '',
          templateKey: current?.templateKey ?? 'default',
          terminology: current ? terminologyToText(current.terminology) : '',
          fields: current ? startersToText(current.starterFields) : '',
          active: current?.active ?? true,
        }}
        successMessage={t('admin.presets.saved')}
        onSubmit={async (v) => {
          const terminology = parseTerminology(v.terminology);
          if (!terminology.ok) throw new AdminRpcError('invalid_terminology');
          const fields = parseStarterFields(v.fields);
          if (!fields.ok) throw new AdminRpcError('invalid_fields');
          await save.mutateAsync({
            key: v.key,
            name: v.name,
            templateKey: v.templateKey,
            active: v.active,
            terminology: terminology.value,
            fields: fields.value,
          });
        }}
      >
        {(control) => (
          <>
            <FormField
              control={control}
              name="key"
              label={t('admin.presets.key')}
              autoCapitalize="none"
              editable={current === null}
            />
            <FormField control={control} name="name" label={t('admin.presets.name')} />
            <FormField
              control={control}
              name="templateKey"
              label={t('admin.presets.template')}
              autoCapitalize="none"
            />
            <FormField
              control={control}
              name="terminology"
              label={t('admin.presets.terminology')}
              hint={t('admin.presets.terminologyHint')}
              multiline
              autoCapitalize="none"
            />
            <FormField
              control={control}
              name="fields"
              label={t('admin.presets.fields')}
              hint={t('admin.presets.fieldsHint')}
              multiline
            />
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Toggle
                  value={field.value}
                  onValueChange={field.onChange}
                  label={t('admin.prices.active')}
                />
              )}
            />
          </>
        )}
      </AdminFormDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  grow: { flex: 1, gap: theme.spacing[2] },
});
