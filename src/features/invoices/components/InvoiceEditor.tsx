import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, MoneyInput } from '@/components/shared';
import { Button, Card, NumberStepper, Select, Text, useToast } from '@/components/ui';
import { useProductOptions } from '@/features/inventory/api/useInventory';
import { usePackageOptions } from '@/features/packages/api/usePackages';
import { useServices } from '@/features/services/api/useServices';
import { useCurrentScope, useFeatureFlag, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useBranchTax } from '../api/useBranchTax';
import {
  useCreateInvoiceDraft,
  useUpdateInvoiceDraft,
  type DraftLineInput,
} from '../api/useInvoices';
import { formatMinor } from '../format';
import { computeDraftTotals, lineNetMinor } from '../invoiceLogic';
import {
  emptyInvoiceEditor,
  emptyLine,
  invoiceEditorSchema,
  type InvoiceEditorValues,
} from '../schemas/invoice.schemas';
import { InvoiceRpcError, type InvoiceDetail } from '../types';
import { ClientPickerField } from './ClientPickerField';
import { invoiceErrorKey } from '../invoiceErrorKey';

export type InvoiceEditorProps = {
  /** Set to edit an existing DRAFT; omit to create a blank one. */
  draft?: InvoiceDetail;
  businessId: string | null;
  branchId: string | null;
  onDone: (invoiceId: string) => void;
  onCancel: () => void;
};

function initialValues(draft?: InvoiceDetail): InvoiceEditorValues {
  if (!draft) return emptyInvoiceEditor;
  return {
    clientId: draft.client?.id ?? null,
    clientName: draft.client?.name ?? null,
    notes: draft.notes ?? '',
    lines: draft.items.map((item) => ({
      serviceId: item.serviceId,
      packageId: item.packageId,
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      discountMinor: item.discountMinor,
      discountReason: item.discountReason ?? '',
    })),
  };
}

/** Create or edit a DRAFT: client, service/free-text lines, discounts (permission-gated), notes, a totals preview. */
export function InvoiceEditor({
  draft,
  businessId,
  branchId,
  onDone,
  onCancel,
}: InvoiceEditorProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { business } = useCurrentScope();
  const canDiscount = usePermission('invoices.discount').allowed;
  // Add-on lines: hidden entirely when the add-on is off or the permission is missing.
  const canSellPackages = usePermission('packages.sell').allowed;
  const inventoryOn = useFeatureFlag('inventory').enabled;

  const [chosenBranch, setChosenBranch] = useState<string | null>(branchId);
  const effectiveBranch = draft ? (branchId ?? chosenBranch) : chosenBranch;
  const currency =
    business?.branches.find((b) => b.id === effectiveBranch)?.currency ?? draft?.currency ?? '';
  const tax = useBranchTax(businessId, effectiveBranch);
  const services = useServices(businessId, effectiveBranch, { includeInactive: false });
  const packages = usePackageOptions(businessId, effectiveBranch, canSellPackages);
  const products = useProductOptions(businessId, effectiveBranch, inventoryOn);
  const createDraft = useCreateInvoiceDraft(businessId);
  const updateDraft = useUpdateInvoiceDraft(businessId);
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, setValue } = useForm<InvoiceEditorValues>({
    resolver: zodResolver(invoiceEditorSchema),
    defaultValues: initialValues(draft),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });
  const clientName = useWatch({ control, name: 'clientName' });

  const rate = tax.data?.taxRateBp ?? draft?.taxRateBp ?? 0;
  const totals = computeDraftTotals(
    (lines ?? []).map((l) => ({
      quantity: l.quantity || 0,
      unitPriceMinor: l.unitPriceMinor || 0,
      discountMinor: l.discountMinor || 0,
    })),
    rate,
  );
  const hasDiscount = (lines ?? []).some((l) => (l.discountMinor || 0) > 0);
  const blockedByDiscount = hasDiscount && !canDiscount;

  const serviceOptions = useMemo(
    () => (services.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [services.data],
  );
  const packageOptions = useMemo(
    () => (packages.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    [packages.data],
  );
  const productOptions = useMemo(
    () => (products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    [products.data],
  );
  const hasPackageLine = (lines ?? []).some((l) => l.packageId);
  const branchOptions = (business?.branches ?? []).map((b) => ({ value: b.id, label: b.name }));
  const pending = createDraft.isPending || updateDraft.isPending;

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    const items: DraftLineInput[] = values.lines.map((line) => ({
      serviceId: line.serviceId,
      packageId: line.packageId,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      discountReason: line.discountMinor > 0 ? line.discountReason : null,
    }));
    const fail = (error: Error) => {
      if (error instanceof InvoiceRpcError) setServerError(t(invoiceErrorKey(error)));
      else toast.show({ message: t(invoiceErrorKey(error)), tone: 'error' });
    };

    if (draft) {
      updateDraft.mutate(
        {
          invoiceId: draft.id,
          items,
          clientId: values.clientId,
          clearClient: values.clientId === null && draft.client !== null,
          notes: values.notes,
          clearNotes: values.notes === '' && Boolean(draft.notes),
        },
        {
          onSuccess: () => {
            toast.show({ message: t('invoices.form.saved'), tone: 'success' });
            onDone(draft.id);
          },
          onError: fail,
        },
      );
      return;
    }
    createDraft.mutate(
      {
        branchId: effectiveBranch,
        clientId: values.clientId,
        items,
        notes: values.notes || null,
      },
      {
        onSuccess: (invoiceId) => {
          toast.show({ message: t('invoices.form.created'), tone: 'success' });
          onDone(invoiceId);
        },
        onError: fail,
      },
    );
  });

  return (
    <View style={styles.container}>
      {!draft && (business?.branches.length ?? 0) > 1 ? (
        <Select
          label={t('invoices.form.branch')}
          options={branchOptions}
          value={chosenBranch}
          onChange={setChosenBranch}
          required
        />
      ) : null}

      {currency ? (
        <Text variant="helper" color="textSecondary">
          {t('invoices.form.currencyFixed', { currency })}
        </Text>
      ) : null}

      <ClientPickerField
        businessId={businessId}
        clientName={clientName}
        disabled={Boolean(draft?.appointmentId)}
        onPick={(client) => {
          setValue('clientId', client?.id ?? null, { shouldDirty: true });
          setValue('clientName', client?.name ?? null, { shouldDirty: true });
        }}
      />

      <Text variant="sectionTitle">{t('invoices.form.lines')}</Text>
      {fields.map((field, index) => (
        <Card key={field.id}>
          <View style={styles.line}>
            <FormField
              control={control}
              name={`lines.${index}.description`}
              label={t('invoices.form.description')}
            />
            <View style={styles.lineRow}>
              {lines?.[index]?.packageId ? null : (
                <Controller
                  control={control}
                  name={`lines.${index}.quantity`}
                  render={({ field: f }) => (
                    <NumberStepper
                      label={t('invoices.form.quantity')}
                      value={f.value}
                      onChange={f.onChange}
                      min={1}
                      max={9999}
                    />
                  )}
                />
              )}
              <View style={styles.price}>
                <Controller
                  control={control}
                  name={`lines.${index}.unitPriceMinor`}
                  render={({ field: f, fieldState }) => (
                    <MoneyInput
                      label={t('invoices.form.unitPrice')}
                      value={f.value}
                      onChange={(v) => f.onChange(v ?? 0)}
                      currency={currency}
                      locale={i18n.language}
                      error={
                        fieldState.error?.message ? t(fieldState.error.message as never) : undefined
                      }
                    />
                  )}
                />
              </View>
            </View>
            {canDiscount || (lines?.[index]?.discountMinor ?? 0) > 0 ? (
              <View style={styles.lineRow}>
                <View style={styles.price}>
                  <Controller
                    control={control}
                    name={`lines.${index}.discountMinor`}
                    render={({ field: f, fieldState }) => (
                      <MoneyInput
                        label={t('invoices.form.discount')}
                        value={f.value || null}
                        onChange={(v) => f.onChange(v ?? 0)}
                        currency={currency}
                        locale={i18n.language}
                        editable={canDiscount}
                        error={
                          fieldState.error?.message
                            ? t(fieldState.error.message as never)
                            : undefined
                        }
                      />
                    )}
                  />
                </View>
                <View style={styles.price}>
                  <FormField
                    control={control}
                    name={`lines.${index}.discountReason`}
                    label={t('invoices.form.discountReason')}
                    editable={canDiscount}
                  />
                </View>
              </View>
            ) : null}
            {lines?.[index]?.packageId ? (
              <Text variant="caption" color="textMuted">
                {t('invoices.form.packageLine')}
              </Text>
            ) : null}
            {lines?.[index]?.productId ? (
              <Text variant="caption" color="textMuted">
                {t('invoices.form.productLine')}
              </Text>
            ) : null}
            <View style={styles.lineFooter}>
              <Text variant="bodyStrong">
                {formatMinor(lineNetMinor(lines?.[index] ?? emptyLine), currency, i18n.language)}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                startIcon={Trash2}
                onPress={() => remove(index)}
                accessibilityLabel={t('invoices.form.removeLine')}
              >
                {t('invoices.form.removeLine')}
              </Button>
            </View>
          </View>
        </Card>
      ))}

      <View style={styles.addRow}>
        <View style={styles.addService}>
          <Select
            placeholder={t('invoices.form.addService')}
            title={t('invoices.form.pickService')}
            options={serviceOptions}
            value={null}
            onChange={(serviceId) => {
              const service = services.data?.find((s) => s.id === serviceId);
              if (!service) return;
              append({
                ...emptyLine,
                serviceId: service.id,
                description: service.name,
                unitPriceMinor: service.priceMinor ?? 0,
              });
            }}
          />
        </View>
        {canSellPackages && packageOptions.length > 0 ? (
          <View style={styles.addService}>
            <Select
              placeholder={t('invoices.form.addPackage')}
              title={t('invoices.form.pickPackage')}
              options={packageOptions}
              value={null}
              onChange={(packageId) => {
                const pkg = packages.data?.find((p) => p.id === packageId);
                if (!pkg) return;
                append({
                  ...emptyLine,
                  packageId: pkg.id,
                  description: pkg.name,
                  unitPriceMinor: pkg.priceMinor,
                });
              }}
            />
          </View>
        ) : null}
        {inventoryOn && productOptions.length > 0 ? (
          <View style={styles.addService}>
            <Select
              placeholder={t('invoices.form.addProduct')}
              title={t('invoices.form.pickProduct')}
              options={productOptions}
              value={null}
              onChange={(productId) => {
                const product = products.data?.find((p) => p.id === productId);
                if (!product) return;
                append({
                  ...emptyLine,
                  productId: product.id,
                  description: product.name,
                  unitPriceMinor: product.priceMinor,
                });
              }}
            />
          </View>
        ) : null}
        <Button variant="secondary" startIcon={Plus} onPress={() => append({ ...emptyLine })}>
          {t('invoices.form.addFreeLine')}
        </Button>
      </View>

      <FormField control={control} name="notes" label={t('invoices.form.notes')} multiline />

      <Card>
        <Text variant="label" color="textSecondary">
          {t('invoices.form.preview')}
        </Text>
        <TotalRow
          label={t('invoices.detail.subtotal')}
          value={formatMinor(totals.subtotalMinor, currency, i18n.language)}
        />
        {totals.discountMinor > 0 ? (
          <TotalRow
            label={t('invoices.detail.discount')}
            value={'−' + formatMinor(totals.discountMinor, currency, i18n.language)}
          />
        ) : null}
        <TotalRow
          label={t('invoices.detail.tax', { rate: rate / 100 })}
          value={formatMinor(totals.taxMinor, currency, i18n.language)}
        />
        <TotalRow
          strong
          label={t('invoices.detail.total')}
          value={formatMinor(totals.totalMinor, currency, i18n.language)}
        />
        <Text variant="caption" color="textMuted">
          {t('invoices.form.taxFromBranch', { rate: rate / 100 })} {t('invoices.form.previewHint')}
        </Text>
      </Card>

      {hasPackageLine && !clientName ? (
        <Text variant="helper" color="warning">
          {t('invoices.form.packageNeedsClient')}
        </Text>
      ) : null}
      {blockedByDiscount ? (
        <Text variant="helper" color="error">
          {t('invoices.form.discountNeedsPermission')}
        </Text>
      ) : null}
      {serverError ? (
        <Text variant="helper" color="error">
          {serverError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button variant="ghost" onPress={onCancel} disabled={pending}>
          {t('actions.cancel')}
        </Button>
        <Button
          onPress={() => void onSubmit()}
          loading={pending}
          disabled={blockedByDiscount || !effectiveBranch}
        >
          {draft ? t('invoices.form.save') : t('invoices.form.create')}
        </Button>
      </View>
    </View>
  );
}

export function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text
        variant={strong ? 'bodyStrong' : 'body'}
        color={strong ? 'textPrimary' : 'textSecondary'}
      >
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'body'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[16] },
  line: { gap: theme.spacing[12] },
  lineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[12],
    alignItems: 'flex-end',
  },
  price: { flexGrow: 1, flexBasis: 140, minWidth: 120 },
  lineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[12],
    alignItems: 'flex-end',
  },
  addService: { flexGrow: 1, flexBasis: 200 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[4],
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing[8] },
});
