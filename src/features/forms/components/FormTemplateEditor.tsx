import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Input,
  SegmentedControl,
  Select,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { useServices } from '@/features/services/api/useServices';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useSaveFormTemplate, type FormTemplate } from '../api/useForms';
import {
  BLOCK_TYPES,
  FIELD_TYPES,
  draftProblem,
  formErrorKey,
  newField,
  type BlockType,
  type FieldType,
  type FormBlock,
  type FormField,
  type TemplateDraft,
} from '../formsLogic';

function toDraft(template?: FormTemplate): TemplateDraft {
  if (!template) {
    return {
      kind: 'consent',
      title: '',
      requiresSignature: true,
      isActive: true,
      serviceIds: [],
      body: [],
      fields: [],
    };
  }
  return {
    kind: template.kind,
    title: template.title,
    requiresSignature: template.requiresSignature,
    isActive: template.isActive,
    serviceIds: template.serviceIds,
    body: template.body,
    fields: template.fields,
  };
}

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
};

/**
 * Builds a form template: the five field types of the booking form plus a plain-text consent text
 * (headings, paragraphs, bullets) and an optional signature. Saving a CHANGED template creates a new
 * immutable version; copies already signed keep the version they were signed on.
 */
export function FormTemplateEditor({
  template,
  onDone,
}: {
  template?: FormTemplate;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const services = useServices(businessId, branchId, { includeInactive: false });
  const save = useSaveFormTemplate(businessId);
  const [draft, setDraft] = useState<TemplateDraft>(() => toDraft(template));
  const [touched, setTouched] = useState(false);
  const problem = draftProblem(draft);

  const set = (patch: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setField = (i: number, patch: Partial<FormField>) =>
    set({ fields: draft.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const setBlock = (i: number, patch: Partial<FormBlock>) =>
    set({ body: draft.body.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });

  const onSave = () => {
    setTouched(true);
    if (problem) return;
    save.mutate(
      { templateId: template?.id ?? null, draft },
      {
        onSuccess: (r) => {
          toast.show({
            message: t(r.new_version ? 'forms.editor.savedNewVersion' : 'forms.editor.saved', {
              version: r.version,
            }),
            tone: 'success',
          });
          onDone();
        },
        onError: (error) => toast.show({ message: t(formErrorKey(rpcCode(error))), tone: 'error' }),
      },
    );
  };

  return (
    <View style={styles.stack}>
      <Input
        label={t('forms.editor.title')}
        value={draft.title}
        onChangeText={(title) => set({ title })}
        required
        error={touched && problem === 'invalid_title' ? t('forms.errors.invalid_title') : undefined}
      />
      {template ? (
        <Text variant="helper" color="textSecondary">
          {t(template.kind === 'consent' ? 'forms.kind.consent' : 'forms.kind.intake')} ·{' '}
          {t('forms.editor.versionNow', { version: template.version })}
        </Text>
      ) : (
        <SegmentedControl<'intake' | 'consent'>
          label={t('forms.editor.kind')}
          hint={t('forms.editor.kindHint')}
          options={[
            { value: 'consent', label: t('forms.kind.consent') },
            { value: 'intake', label: t('forms.kind.intake') },
          ]}
          value={draft.kind}
          onChange={(kind) => set({ kind })}
        />
      )}
      <Toggle
        label={t('forms.editor.requiresSignature')}
        value={draft.requiresSignature}
        onValueChange={(v) => set({ requiresSignature: v })}
      />
      <Toggle
        label={t('forms.editor.active')}
        value={draft.isActive}
        onValueChange={(v) => set({ isActive: v })}
      />

      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('forms.editor.services')}</Text>
        <Text variant="helper" color="textSecondary">
          {t('forms.editor.servicesHint')}
        </Text>
        {(services.data ?? []).map((service) => (
          <Toggle
            key={service.id}
            label={service.name}
            value={draft.serviceIds.includes(service.id)}
            onValueChange={(on) =>
              set({
                serviceIds: on
                  ? [...draft.serviceIds, service.id]
                  : draft.serviceIds.filter((id) => id !== service.id),
              })
            }
          />
        ))}
      </View>

      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('forms.editor.text')}</Text>
        <Text variant="helper" color="textSecondary">
          {t('forms.editor.textHint')}
        </Text>
        {draft.body.map((block, i) => (
          <Card key={i}>
            <View style={styles.stack}>
              <Select
                label={t('forms.editor.blockType')}
                options={BLOCK_TYPES.map((b) => ({ value: b, label: t(`forms.block.${b}`) }))}
                value={block.type}
                onChange={(v) => setBlock(i, { type: v as BlockType })}
              />
              <Input
                label={t('forms.editor.blockText')}
                value={block.text}
                multiline
                onChangeText={(text) => setBlock(i, { text })}
                error={
                  touched && problem === 'invalid_body' && block.text.trim() === ''
                    ? t('forms.errors.invalid_body')
                    : undefined
                }
              />
              <View style={styles.row}>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={ArrowUp}
                  accessibilityLabel={t('forms.editor.moveUp')}
                  onPress={() => set({ body: move(draft.body, i, i - 1) })}
                >
                  {t('forms.editor.moveUp')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={ArrowDown}
                  accessibilityLabel={t('forms.editor.moveDown')}
                  onPress={() => set({ body: move(draft.body, i, i + 1) })}
                >
                  {t('forms.editor.moveDown')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={Trash2}
                  accessibilityLabel={t('forms.editor.remove')}
                  onPress={() => set({ body: draft.body.filter((_, idx) => idx !== i) })}
                >
                  {t('forms.editor.remove')}
                </Button>
              </View>
            </View>
          </Card>
        ))}
        <Button
          variant="secondary"
          startIcon={Plus}
          onPress={() => set({ body: [...draft.body, { type: 'paragraph', text: '' }] })}
        >
          {t('forms.editor.addBlock')}
        </Button>
      </View>

      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('forms.editor.questions')}</Text>
        {draft.fields.map((field, i) => (
          <Card key={field.id}>
            <View style={styles.stack}>
              <Select
                label={t('forms.editor.fieldType')}
                options={FIELD_TYPES.map((f) => ({ value: f, label: t(`forms.field.${f}`) }))}
                value={field.type}
                onChange={(v) =>
                  setField(i, {
                    type: v as FieldType,
                    options:
                      v === 'dropdown' ? (field.options?.length ? field.options : ['', '']) : null,
                  })
                }
              />
              <Input
                label={t('forms.editor.fieldLabel')}
                value={field.label}
                onChangeText={(label) => setField(i, { label })}
                error={
                  touched && problem === 'invalid_field_label' && field.label.trim() === ''
                    ? t('forms.errors.invalid_field_label')
                    : undefined
                }
              />
              <Input
                label={t('forms.editor.fieldHelp')}
                value={field.help ?? ''}
                onChangeText={(help) => setField(i, { help })}
              />
              {field.type === 'dropdown' ? (
                <Input
                  label={t('forms.editor.options')}
                  hint={t('forms.editor.optionsHint')}
                  multiline
                  value={(field.options ?? []).join('\n')}
                  onChangeText={(text) => setField(i, { options: text.split('\n') })}
                  error={
                    touched && problem === 'invalid_options'
                      ? t('forms.errors.invalid_options')
                      : undefined
                  }
                />
              ) : null}
              <Toggle
                label={t('forms.editor.required')}
                value={field.required}
                onValueChange={(v) => setField(i, { required: v })}
              />
              <Toggle
                label={t('forms.editor.sensitive')}
                value={field.sensitive}
                onValueChange={(v) => setField(i, { sensitive: v })}
              />
              {field.sensitive ? (
                <Text variant="helper" color="textSecondary">
                  {t('forms.editor.sensitiveHint')}
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={ArrowUp}
                  accessibilityLabel={t('forms.editor.moveUp')}
                  onPress={() => set({ fields: move(draft.fields, i, i - 1) })}
                >
                  {t('forms.editor.moveUp')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={ArrowDown}
                  accessibilityLabel={t('forms.editor.moveDown')}
                  onPress={() => set({ fields: move(draft.fields, i, i + 1) })}
                >
                  {t('forms.editor.moveDown')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={Trash2}
                  accessibilityLabel={t('forms.editor.remove')}
                  onPress={() => set({ fields: draft.fields.filter((_, idx) => idx !== i) })}
                >
                  {t('forms.editor.remove')}
                </Button>
              </View>
            </View>
          </Card>
        ))}
        <Button
          variant="secondary"
          startIcon={Plus}
          onPress={() => set({ fields: [...draft.fields, newField()] })}
        >
          {t('forms.editor.addQuestion')}
        </Button>
      </View>

      {template ? (
        <Text variant="helper" color="textSecondary">
          {t('forms.editor.versionNote')}
        </Text>
      ) : null}
      <Button onPress={onSave} loading={save.isPending} fullWidth>
        {t('forms.editor.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
});
