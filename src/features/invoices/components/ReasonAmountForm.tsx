import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, MoneyInput } from '@/components/shared';
import { Button, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { reasonAmountSchema, type ReasonAmountValues } from '../schemas/invoice.schemas';
import { InvoiceRpcError } from '../types';

export type ReasonAmountFormProps = {
  currency: string;
  amountLabel: string;
  /** Pre-filled and the upper bound shown in the hint. */
  maxMinor: number;
  hint: string;
  submitLabel: string;
  pending: boolean;
  /** Runs the mutation; rejects with the RPC error so the form can show its message. */
  onSubmit: (values: ReasonAmountValues) => Promise<void>;
  onCancel: () => void;
  /** An extra line under the hint (the credit-note tax note). */
  note?: string;
};

/** Shared by "reverse payment" and "create credit note": an amount (default = everything left) and a required reason. */
export function ReasonAmountForm({
  currency,
  amountLabel,
  maxMinor,
  hint,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  note,
}: ReasonAmountFormProps) {
  const { t, i18n } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<ReasonAmountValues>({
    resolver: zodResolver(reasonAmountSchema),
    defaultValues: { amountMinor: maxMinor, reason: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    if (values.amountMinor > maxMinor) {
      setError('amountMinor', { message: 'invoices.errors.invalid_amount' });
      return;
    }
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof InvoiceRpcError) setServerError(t(`invoices.errors.${error.code}`));
      else setServerError(error instanceof Error ? error.message : t('invoices.errors.unknown'));
    }
  });

  return (
    <View style={styles.container}>
      <Text variant="body" color="textSecondary">
        {hint}
      </Text>
      {note ? (
        <Text variant="helper" color="textMuted">
          {note}
        </Text>
      ) : null}
      <Controller
        control={control}
        name="amountMinor"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={amountLabel}
            value={field.value}
            onChange={(v) => field.onChange(v ?? 0)}
            currency={currency}
            locale={i18n.language}
            error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
          />
        )}
      />
      <FormField control={control} name="reason" label={t('invoices.reverse.reason')} multiline />
      {serverError ? (
        <Text variant="helper" color="error">
          {serverError}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button variant="ghost" onPress={onCancel} disabled={pending}>
          {t('actions.cancel')}
        </Button>
        <Button variant="danger" onPress={() => void submit()} loading={pending}>
          {submitLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[16] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing[8] },
});
