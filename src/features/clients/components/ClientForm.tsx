import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField, PhoneInput } from '@/components/shared';
import { Button, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useFindClientByPhone, useSaveClient, type ClientListItem } from '../api/useClients';
import { clientSchema, emptyClient, type ClientValues } from '../schemas/client.schemas';

export type ClientFormProps = {
  client?: ClientListItem & { notes: string | null };
  businessId: string | null;
  onDone: () => void;
  /** Opens the existing client's profile when a duplicate phone is found. */
  onOpenExisting: (clientId: string) => void;
};

/** Create/edit a client. Phone is unique per business — a collision shows a clear message with a link to the existing record, never a raw DB error. */
export function ClientForm({ client, businessId, onDone, onOpenExisting }: ClientFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveClient(businessId);
  const [duplicateOf, setDuplicateOf] = useState<{ id: string; name: string } | null>(null);

  const { control, handleSubmit, setError } = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: client
      ? {
          fullName: client.fullName,
          // Editing requires clients.edit, which (per doc §9) only Owner/
          // Manager/Receptionist hold — the same roles that hold
          // clients.view_contact, so phoneE164 is never actually null here
          // in practice. The fallback is defensive, not a real case.
          phoneE164: client.phoneE164 ?? '',
          email: client.email,
          notes: client.notes,
        }
      : emptyClient,
  });

  const phoneField = useController({ control, name: 'phoneE164' }).field;
  const duplicateCheck = useFindClientByPhone(
    businessId,
    phoneField.value.length > 4 ? phoneField.value : null,
  );

  const onSubmit = handleSubmit((values) => {
    setDuplicateOf(null);
    save.mutate(
      { ...values, id: client?.id },
      {
        onSuccess: () => {
          toast.show({ message: t('clients.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => {
          if (error.code === '23505') {
            const existing = duplicateCheck.data;
            if (existing) setDuplicateOf({ id: existing.id, name: existing.full_name });
            else setError('phoneE164', { message: 'clients.errors.duplicatePhone' });
          } else {
            toast.show({ message: error.message, tone: 'error' });
          }
        },
      },
    );
  });

  return (
    <View style={styles.form}>
      <FormField
        control={control}
        name="fullName"
        label={t('clients.fullName')}
        required
        autoComplete="name"
        returnKeyType="next"
      />

      <PhoneInput
        label={t('clients.phone')}
        value={phoneField.value}
        onChange={phoneField.onChange}
      />

      {duplicateOf ? (
        <View style={styles.duplicateBanner}>
          <Text variant="helper" color="error">
            {t('clients.duplicatePhone', { name: duplicateOf.name })}
          </Text>
          <Pressable onPress={() => onOpenExisting(duplicateOf.id)}>
            <Text variant="helper" color="primary">
              {t('clients.viewExisting')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FormField
        control={control}
        name="email"
        label={t('clients.emailFieldLabel')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />

      <FormField control={control} name="notes" label={t('clients.notes')} multiline />

      <Button onPress={onSubmit} loading={save.isPending}>
        {t('clients.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing[16],
  },
  duplicateBanner: {
    gap: theme.spacing[4],
  },
});
