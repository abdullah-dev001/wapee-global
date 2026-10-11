import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import { Button, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useSaveWebsiteSection } from '../../api/useWebsiteAdmin';
import {
  SIMPLE_SECTION_SPECS,
  simpleSectionSchema,
  textContent,
  textDefaults,
  type SimpleSectionType,
} from '../../schemas/sectionForms.schema';
import { websiteErrorMessage } from './websiteErrors';

/** Plain text sections: hero, about, services, testimonials. Spec-driven so there is one form, not four. */
export function SimpleSectionForm({
  businessId,
  type,
  content,
  onDone,
}: {
  businessId: string | null;
  type: SimpleSectionType;
  content: Record<string, unknown>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveWebsiteSection(businessId);
  const specs = SIMPLE_SECTION_SPECS[type];

  const { control, handleSubmit } = useForm<Record<string, string>>({
    resolver: zodResolver(simpleSectionSchema(type)),
    defaultValues: textDefaults(specs, content),
  });

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      { type, content: textContent(values) },
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
      {type === 'testimonials' ? (
        <Text variant="small" color="textSecondary">
          {t('websiteEditor.sections.testimonialsNote')}
        </Text>
      ) : null}
      {specs.map((spec) => (
        <FormField
          key={spec.key}
          control={control}
          name={spec.key}
          label={t(`websiteEditor.fields.${type}.${spec.key}` as never)}
          placeholder={t(`websiteEditor.fields.${type}.${spec.key}Placeholder` as never)}
          multiline={'multiline' in spec ? spec.multiline : false}
          numberOfLines={'multiline' in spec && spec.multiline ? 4 : 1}
          maxLength={spec.max}
        />
      ))}
      <Button fullWidth loading={save.isPending} onPress={() => void onSubmit()}>
        {t('actions.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: theme.spacing[16] } });
