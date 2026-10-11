import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Calendar, FormField, MoneyInput } from '@/components/shared';
import { Button, Collapsible, Input, SegmentedControl, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';
import { addMinutesUtc, dateInZone, todayInZone, zonedToUtc, type UtcIso } from '@/lib/time';

import { useAddPayment } from '../api/useInvoices';
import { formatMinor } from '../format';
import { paymentSchema, type PaymentValues } from '../schemas/invoice.schemas';
import { InvoiceRpcError, PAYMENT_METHODS, type InvoiceDetail, type PaymentMethod } from '../types';

export type PaymentFormProps = {
  businessId: string | null;
  invoice: InvoiceDetail;
  onDone: () => void;
  onCancel: () => void;
};

/** Manual payment (cash/card/bank transfer). Partial allowed, never above the balance (the RPC enforces it). */
export function PaymentForm({ businessId, invoice, onDone, onCancel }: PaymentFormProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const addPayment = useAddPayment(businessId);
  const zone = invoice.branch.timezone;
  const today = todayInZone(zone);
  const issuedDate = invoice.issuedAt ? dateInZone(new Date(invoice.issuedAt), zone) : today;
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, setValue, setError } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'cash', amountMinor: invoice.balanceMinor, paidDate: today, note: '' },
  });
  const paidDate = useWatch({ control, name: 'paidDate' });

  const submit = handleSubmit((values) => {
    setServerError(null);
    if (values.paidDate < issuedDate || values.paidDate > today) {
      setError('paidDate', { message: 'invoices.errors.invalid_paid_at' });
      return;
    }
    let paidAt: string | undefined;
    if (values.paidDate !== today) {
      paidAt = zonedToUtc(values.paidDate, '12:00', zone);
      // Same day as the issue: never before the invoice existed.
      if (invoice.issuedAt && paidAt < invoice.issuedAt) {
        paidAt = addMinutesUtc(invoice.issuedAt as UtcIso, 1);
      }
    }
    addPayment.mutate(
      {
        invoiceId: invoice.id,
        method: values.method as PaymentMethod,
        amountMinor: values.amountMinor,
        paidAt,
        note: values.note || null,
      },
      {
        onSuccess: () => {
          toast.show({ message: t('invoices.payment.added'), tone: 'success' });
          onDone();
        },
        onError: (error) => {
          if (error instanceof InvoiceRpcError) setServerError(t(`invoices.errors.${error.code}`));
          else toast.show({ message: error.message, tone: 'error' });
        },
      },
    );
  });

  return (
    <View style={styles.container}>
      <Text variant="body" color="textSecondary">
        {t('invoices.payment.balance', {
          amount: formatMinor(invoice.balanceMinor, invoice.currency, i18n.language),
        })}
      </Text>

      <Controller
        control={control}
        name="method"
        render={({ field }) => (
          <SegmentedControl
            label={t('invoices.payment.method')}
            options={PAYMENT_METHODS.map((method) => ({
              value: method,
              label: t(`invoices.method.${method}`),
            }))}
            value={field.value as PaymentMethod}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="amountMinor"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={t('invoices.payment.amount')}
            value={field.value}
            onChange={(v) => field.onChange(v ?? 0)}
            currency={invoice.currency}
            locale={i18n.language}
            error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
          />
        )}
      />
      <Button
        size="sm"
        variant="ghost"
        onPress={() => setValue('amountMinor', invoice.balanceMinor, { shouldDirty: true })}
      >
        {t('invoices.payment.payRest')}
      </Button>

      <Collapsible title={t('invoices.payment.date') + ': ' + paidDate}>
        {Platform.OS === 'web' ? (
          <Input
            {...({ type: 'date', min: issuedDate, max: today } as object)}
            label={t('invoices.payment.date')}
            value={paidDate}
            onChangeText={(next) => setValue('paidDate', next, { shouldDirty: true })}
            error={undefined}
          />
        ) : (
          <Calendar
            value={paidDate}
            onChange={(date) => setValue('paidDate', date, { shouldDirty: true })}
            minDate={issuedDate}
            maxDate={today}
            timeZone={zone}
          />
        )}
      </Collapsible>

      <FormField control={control} name="note" label={t('invoices.payment.note')} />

      {serverError ? (
        <Text variant="helper" color="error">
          {serverError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button variant="ghost" onPress={onCancel} disabled={addPayment.isPending}>
          {t('actions.cancel')}
        </Button>
        <Button onPress={() => void submit()} loading={addPayment.isPending}>
          {t('invoices.payment.submit')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[16] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing[8] },
});
