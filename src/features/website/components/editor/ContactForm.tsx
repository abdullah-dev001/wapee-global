import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, PhoneInput } from '@/components/shared';
import { Button, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useSaveWebsiteSection } from '../../api/useWebsiteAdmin';
import {
  contactContent,
  contactDefaults,
  contactSchema,
  type ContactFormValues,
} from '../../schemas/sectionForms.schema';
import { SOCIAL_NETWORKS } from '../../types';
import { websiteErrorMessage } from './websiteErrors';

/** Contact: WhatsApp, map link, social links. Address, phone and hours come from the branch. */
export function ContactForm({
  businessId,
  content,
  defaultCountry,
  onDone,
}: {
  businessId: string | null;
  content: Record<string, unknown>;
  defaultCountry?: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveWebsiteSection(businessId);

  const { control, handleSubmit, formState } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: contactDefaults(content),
  });

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      { type: 'contact', content: contactContent(values) },
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
      <Text variant="small" color="textSecondary">
        {t('websiteEditor.fields.contact.branchNote')}
      </Text>
      <FormField
        control={control}
        name="title"
        label={t('websiteEditor.fields.contact.title')}
        placeholder={t('websiteEditor.fields.contact.titlePlaceholder')}
        maxLength={120}
      />
      <Controller
        control={control}
        name="whatsapp"
        render={({ field }) => (
          <PhoneInput
            label={t('websiteEditor.fields.contact.whatsapp')}
            hint={t('websiteEditor.fields.contact.whatsappHint')}
            value={field.value}
            onChange={field.onChange}
            defaultCountry={defaultCountry}
            error={formState.errors.whatsapp ? t('websiteEditor.errors.whatsapp') : undefined}
          />
        )}
      />
      <FormField
        control={control}
        name="map_url"
        label={t('websiteEditor.fields.contact.mapUrl')}
        hint={t('websiteEditor.fields.contact.mapUrlHint')}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
      />
      {SOCIAL_NETWORKS.map((network) => (
        <FormField
          key={network}
          control={control}
          name={`social.${network}`}
          label={t(`website.social.${network}`)}
          placeholder="https://"
          autoCapitalize="none"
          keyboardType="url"
        />
      ))}
      <Button fullWidth loading={save.isPending} onPress={() => void onSubmit()}>
        {t('actions.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: theme.spacing[16] } });
