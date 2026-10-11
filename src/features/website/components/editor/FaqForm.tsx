import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import { Button, Card, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useSaveWebsiteSection } from '../../api/useWebsiteAdmin';
import {
  MAX_FAQ_ITEMS,
  faqContent,
  faqDefaults,
  faqSchema,
  type FaqFormValues,
} from '../../schemas/sectionForms.schema';
import { IconAction } from './IconAction';
import { websiteErrorMessage } from './websiteErrors';

export function FaqForm({
  businessId,
  content,
  onDone,
}: {
  businessId: string | null;
  content: Record<string, unknown>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveWebsiteSection(businessId);

  const { control, handleSubmit } = useForm<FaqFormValues>({
    resolver: zodResolver(faqSchema),
    defaultValues: faqDefaults(content),
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'items' });

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      { type: 'faqs', content: faqContent(values) },
      {
        onSuccess: () => {
          toast.show({ message: t('websiteEditor.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => toast.show({ message: websiteErrorMessage(t, error), tone: 'error' }),
      },
    );
  });

  return (
    <View style={styles.form}>
      <FormField
        control={control}
        name="title"
        label={t('websiteEditor.fields.faqs.title')}
        placeholder={t('websiteEditor.fields.faqs.titlePlaceholder')}
        maxLength={120}
      />

      {fields.map((field, index) => (
        <Card key={field.id}>
          <View style={styles.item}>
            <View style={styles.itemHeader}>
              <Text variant="label">
                {t('websiteEditor.fields.faqs.itemNumber', { n: index + 1 })}
              </Text>
              <View style={styles.itemActions}>
                <IconAction
                  label={t('websiteEditor.moveUp')}
                  disabled={index === 0}
                  onPress={() => move(index, index - 1)}
                  icon={ArrowUp}
                />
                <IconAction
                  label={t('websiteEditor.moveDown')}
                  disabled={index === fields.length - 1}
                  onPress={() => move(index, index + 1)}
                  icon={ArrowDown}
                />
                <IconAction
                  label={t('actions.delete')}
                  onPress={() => remove(index)}
                  icon={Trash2}
                />
              </View>
            </View>
            <FormField
              control={control}
              name={`items.${index}.q`}
              label={t('websiteEditor.fields.faqs.question')}
              maxLength={200}
            />
            <FormField
              control={control}
              name={`items.${index}.a`}
              label={t('websiteEditor.fields.faqs.answer')}
              multiline
              numberOfLines={3}
              maxLength={1500}
            />
          </View>
        </Card>
      ))}

      <Button
        variant="secondary"
        startIcon={Plus}
        disabled={fields.length >= MAX_FAQ_ITEMS}
        onPress={() => append({ q: '', a: '' })}
      >
        {t('websiteEditor.fields.faqs.add')}
      </Button>
      {fields.length >= MAX_FAQ_ITEMS ? (
        <Text variant="helper" color="textSecondary">
          {t('websiteEditor.fields.faqs.max', { max: MAX_FAQ_ITEMS })}
        </Text>
      ) : null}

      <Button fullWidth loading={save.isPending} onPress={() => void onSubmit()}>
        {t('actions.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  item: { gap: theme.spacing[12] },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemActions: { flexDirection: 'row' },
});
