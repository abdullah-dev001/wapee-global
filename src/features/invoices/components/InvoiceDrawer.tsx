import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Dialog, Drawer, ErrorState, Skeleton, Text, useToast } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import {
  useCreateCreditNote,
  useDiscardInvoiceDraft,
  useInvoiceDetail,
  useIssueInvoice,
  useReversePayment,
} from '../api/useInvoices';
import { formatMinor } from '../format';
import { actionsForInvoice, creditableNetMinor, reversibleMinor } from '../invoiceLogic';
import { InvoiceRpcError, type InvoicePayment } from '../types';
import { InvoiceDetailBody } from './InvoiceDetailBody';
import { InvoiceEditor } from './InvoiceEditor';
import { PaymentForm } from './PaymentForm';
import { ReasonAmountForm } from './ReasonAmountForm';
import { invoiceErrorKey } from '../invoiceErrorKey';

/** `invoiceId === 'new'` opens the blank editor; a uuid opens that invoice; null closes. */
export const NEW_INVOICE = 'new';

type Mode =
  | { kind: 'view' }
  | { kind: 'edit' }
  | { kind: 'payment' }
  | { kind: 'credit' }
  | { kind: 'reverse'; payment: InvoicePayment };

export type InvoiceDrawerProps = {
  invoiceId: string | null;
  onChangeInvoice: (invoiceId: string | null) => void;
  onShowClientInvoices?: (clientId: string) => void;
};

/**
 * One drawer for the whole invoice life: view -> edit draft / issue / discard,
 * add payment, reverse payment, credit note. Sub-forms REPLACE the content
 * instead of stacking a second overlay, so Escape/Android back step back one
 * level (view) before closing. Buttons are status AND permission aware
 * (`actionsForInvoice`); the RPCs are the real boundary.
 */
export function InvoiceDrawer({
  invoiceId,
  onChangeInvoice,
  onShowClientInvoices,
}: InvoiceDrawerProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const canView = usePermission('invoices.view').allowed;
  const canCreate = usePermission('invoices.create').allowed;
  const canCreditNote = usePermission('invoices.credit_note').allowed;
  const permissions = { canView, canCreate, canCreditNote };

  const isNew = invoiceId === NEW_INVOICE;
  const detail = useInvoiceDetail(businessId, isNew ? null : invoiceId);
  const issue = useIssueInvoice(businessId);
  const discard = useDiscardInvoiceDraft(businessId);
  const reverse = useReversePayment(businessId);
  const creditNote = useCreateCreditNote(businessId);

  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [confirm, setConfirm] = useState<'issue' | 'discard' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const close = () => {
    setMode({ kind: 'view' });
    setActionError(null);
    onChangeInvoice(null);
  };
  // Escape / Android back / the X: one level back first, then close.
  const back = () => (mode.kind === 'view' || isNew ? close() : setMode({ kind: 'view' }));

  const invoice = detail.data;
  const actions = invoice ? actionsForInvoice(invoice, permissions) : [];
  const fail = (error: Error) => {
    setConfirm(null);
    if (error instanceof InvoiceRpcError) setActionError(t(invoiceErrorKey(error)));
    else toast.show({ message: t(invoiceErrorKey(error)), tone: 'error' });
  };

  const title = isNew
    ? t('invoices.form.newTitle')
    : mode.kind === 'edit'
      ? t('invoices.form.editTitle')
      : mode.kind === 'payment'
        ? t('invoices.payment.title')
        : mode.kind === 'credit'
          ? t('invoices.credit.title')
          : mode.kind === 'reverse'
            ? t('invoices.reverse.title')
            : invoice?.status === 'draft'
              ? t('invoices.detail.draftTitle')
              : t('invoices.detail.title');

  const money = (minor: number) => formatMinor(minor, invoice?.currency ?? '', i18n.language);

  return (
    <>
      <Drawer open={invoiceId !== null} onClose={back} title={title}>
        {isNew ? (
          <InvoiceEditor
            businessId={businessId}
            branchId={branchId}
            onDone={(id) => onChangeInvoice(id)}
            onCancel={close}
          />
        ) : detail.isError ? (
          <ErrorState
            title={t('invoices.detail.loadError')}
            description={t(invoiceErrorKey(detail.error))}
            onRetry={() => void detail.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : !invoice ? (
          <View style={styles.skeleton}>
            <Skeleton height={28} width="50%" />
            <Skeleton height={80} />
            <Skeleton height={120} />
          </View>
        ) : mode.kind === 'edit' ? (
          <InvoiceEditor
            draft={invoice}
            businessId={businessId}
            branchId={null}
            onDone={() => setMode({ kind: 'view' })}
            onCancel={() => setMode({ kind: 'view' })}
          />
        ) : mode.kind === 'payment' ? (
          <PaymentForm
            businessId={businessId}
            invoice={invoice}
            onDone={() => setMode({ kind: 'view' })}
            onCancel={() => setMode({ kind: 'view' })}
          />
        ) : mode.kind === 'credit' ? (
          <ReasonAmountForm
            currency={invoice.currency}
            amountLabel={t('invoices.credit.net')}
            maxMinor={creditableNetMinor(invoice.netMinor, invoice.creditNotes)}
            hint={t('invoices.credit.creditable', {
              amount: money(creditableNetMinor(invoice.netMinor, invoice.creditNotes)),
            })}
            note={t('invoices.credit.hint')}
            submitLabel={t('invoices.credit.submit')}
            pending={creditNote.isPending}
            onCancel={() => setMode({ kind: 'view' })}
            onSubmit={async (values) => {
              const max = creditableNetMinor(invoice.netMinor, invoice.creditNotes);
              await creditNote.mutateAsync({
                invoiceId: invoice.id,
                reason: values.reason,
                // Everything left is sent as "full" so the last credit takes the exact remaining tax.
                netMinor: values.amountMinor === max ? null : values.amountMinor,
              });
              toast.show({ message: t('invoices.credit.done'), tone: 'success' });
              setMode({ kind: 'view' });
            }}
          />
        ) : mode.kind === 'reverse' ? (
          <ReasonAmountForm
            currency={invoice.currency}
            amountLabel={t('invoices.reverse.amount')}
            maxMinor={reversibleMinor(mode.payment, invoice.payments)}
            hint={
              t('invoices.reverse.message', {
                amount: money(mode.payment.amountMinor),
                method: t(`invoices.method.${mode.payment.method}`),
              }) +
              ' ' +
              t('invoices.reverse.reversible', {
                amount: money(reversibleMinor(mode.payment, invoice.payments)),
              })
            }
            submitLabel={t('invoices.reverse.submit')}
            pending={reverse.isPending}
            onCancel={() => setMode({ kind: 'view' })}
            onSubmit={async (values) => {
              await reverse.mutateAsync({
                paymentId: mode.payment.id,
                reason: values.reason,
                amountMinor: values.amountMinor,
              });
              toast.show({ message: t('invoices.reverse.done'), tone: 'success' });
              setMode({ kind: 'view' });
            }}
          />
        ) : (
          <View style={styles.view}>
            <InvoiceDetailBody
              invoice={invoice}
              permissions={permissions}
              onReverse={(payment) => setMode({ kind: 'reverse', payment })}
              onShowClientInvoices={
                onShowClientInvoices
                  ? (clientId) => {
                      close();
                      onShowClientInvoices(clientId);
                    }
                  : undefined
              }
            />
            {actionError ? (
              <Text variant="helper" color="error">
                {actionError}
              </Text>
            ) : null}
            {actions.length > 0 ? (
              <View style={styles.actions}>
                {actions.includes('issue') ? (
                  <Button onPress={() => setConfirm('issue')} loading={issue.isPending}>
                    {t('invoices.actions.issue')}
                  </Button>
                ) : null}
                {actions.includes('addPayment') ? (
                  <Button onPress={() => setMode({ kind: 'payment' })}>
                    {t('invoices.actions.addPayment')}
                  </Button>
                ) : null}
                {actions.includes('edit') ? (
                  <Button variant="secondary" onPress={() => setMode({ kind: 'edit' })}>
                    {t('invoices.actions.edit')}
                  </Button>
                ) : null}
                {actions.includes('creditNote') ? (
                  <Button variant="secondary" onPress={() => setMode({ kind: 'credit' })}>
                    {t('invoices.actions.creditNote')}
                  </Button>
                ) : null}
                {actions.includes('print') ? (
                  <Button
                    variant="secondary"
                    onPress={() => router.push(`/invoice-print/${invoice.id}`)}
                  >
                    {t('invoices.actions.print')}
                  </Button>
                ) : null}
                {actions.includes('discard') ? (
                  <Button
                    variant="danger"
                    onPress={() => setConfirm('discard')}
                    loading={discard.isPending}
                  >
                    {t('invoices.actions.discard')}
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </Drawer>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === 'issue'
            ? t('invoices.confirm.issueTitle')
            : t('invoices.confirm.discardTitle')
        }
        message={
          confirm === 'issue'
            ? t('invoices.confirm.issueMessage')
            : t('invoices.confirm.discardMessage')
        }
        busy={issue.isPending || discard.isPending}
        confirm={{
          label:
            confirm === 'issue'
              ? t('invoices.confirm.issueConfirm')
              : t('invoices.confirm.discardConfirm'),
          variant: confirm === 'issue' ? 'primary' : 'danger',
          loading: issue.isPending || discard.isPending,
          onPress: () => {
            if (!invoice) return;
            setActionError(null);
            if (confirm === 'issue') {
              issue.mutate(
                { invoiceId: invoice.id },
                {
                  onSuccess: ({ number }) => {
                    setConfirm(null);
                    toast.show({
                      message: t('invoices.toast.issued', { number }),
                      tone: 'success',
                    });
                  },
                  onError: fail,
                },
              );
            } else {
              discard.mutate(
                { invoiceId: invoice.id },
                {
                  onSuccess: () => {
                    setConfirm(null);
                    toast.show({ message: t('invoices.toast.discarded'), tone: 'success' });
                    close();
                  },
                  onError: fail,
                },
              );
            }
          },
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  view: { gap: theme.spacing[16] },
  skeleton: { gap: theme.spacing[12] },
  actions: { gap: theme.spacing[8] },
});
