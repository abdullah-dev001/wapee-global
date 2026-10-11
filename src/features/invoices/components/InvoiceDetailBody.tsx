import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { theme } from '@/lib/theme';
import { formatDateTime, type UtcIso } from '@/lib/time';

import { formatMinor } from '../format';
import { canReversePayment, type InvoicePermissions } from '../invoiceLogic';
import { type InvoiceDetail, type InvoicePayment } from '../types';
import { TotalRow } from './InvoiceEditor';
import { InvoiceStateBadge } from './InvoiceStateBadge';

export type InvoiceDetailBodyProps = {
  invoice: InvoiceDetail;
  permissions: InvoicePermissions;
  onReverse: (payment: InvoicePayment) => void;
  onShowClientInvoices?: (clientId: string) => void;
};

/** Read-only invoice content: header, client, items (with discount reasons), totals, payments, credit notes, balance. */
export function InvoiceDetailBody({
  invoice,
  permissions,
  onReverse,
  onShowClientInvoices,
}: InvoiceDetailBodyProps) {
  const { t, i18n } = useTranslation();
  const money = (minor: number) => formatMinor(minor, invoice.currency, i18n.language);
  const when = (iso: string | null) =>
    iso ? formatDateTime(iso as UtcIso, invoice.branch.timezone, i18n.language, 'medium') : '—';

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="pageTitleMobile">{invoice.number ?? t('invoices.detail.draftTitle')}</Text>
          <Text variant="helper" color="textSecondary">
            {invoice.branch.name} ·{' '}
            {invoice.status === 'issued'
              ? t('invoices.detail.issuedOn') + ' ' + when(invoice.issuedAt)
              : t('invoices.detail.createdOn') + ' ' + when(invoice.createdAt)}
          </Text>
        </View>
        <InvoiceStateBadge status={invoice.status} paymentStatus={invoice.paymentStatus} />
      </View>

      {invoice.status === 'draft' ? (
        <Text variant="helper" color="textSecondary">
          {t('invoices.detail.draftNotice')}
        </Text>
      ) : null}

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          {t('invoices.detail.client')}
        </Text>
        {invoice.client ? (
          <Pressable
            accessibilityRole="button"
            disabled={!onShowClientInvoices}
            onPress={() => invoice.client && onShowClientInvoices?.(invoice.client.id)}
            style={styles.clientRow}
          >
            <Text variant="bodyStrong">{invoice.client.name}</Text>
            {onShowClientInvoices ? (
              <Text variant="caption" color="primary">
                {t('invoices.detail.viewClient')}
              </Text>
            ) : null}
          </Pressable>
        ) : (
          <Text variant="body" color="textMuted">
            {invoice.billToName ?? t('invoices.detail.noClient')}
          </Text>
        )}
        {invoice.taxNumber ? (
          <Text variant="helper" color="textSecondary">
            {t('invoices.detail.taxNumber')}: {invoice.taxNumber}
          </Text>
        ) : null}
      </View>

      <Text variant="sectionTitle">{t('invoices.detail.items')}</Text>
      <Card noPadding>
        {invoice.items.map((item, index) => (
          <View key={item.id} style={[styles.item, index > 0 ? styles.itemBorder : null]}>
            <View style={styles.itemMain}>
              <Text variant="bodyStrong">{item.description}</Text>
              <Text variant="helper" color="textSecondary">
                {t('invoices.detail.quantityPrice', {
                  quantity: item.quantity,
                  price: money(item.unitPriceMinor),
                })}
              </Text>
              {item.discountMinor > 0 ? (
                <Text variant="helper" color="warning">
                  {t('invoices.detail.discountReason', { reason: item.discountReason ?? '' })} (−
                  {money(item.discountMinor)})
                </Text>
              ) : null}
            </View>
            <Text variant="bodyStrong">{money(item.lineNetMinor)}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <TotalRow label={t('invoices.detail.subtotal')} value={money(invoice.subtotalMinor)} />
        {invoice.discountMinor > 0 ? (
          <TotalRow
            label={t('invoices.detail.discount')}
            value={'−' + money(invoice.discountMinor)}
          />
        ) : null}
        <TotalRow
          label={t('invoices.detail.tax', { rate: invoice.taxRateBp / 100 })}
          value={money(invoice.taxMinor)}
        />
        <TotalRow strong label={t('invoices.detail.total')} value={money(invoice.totalMinor)} />
        {invoice.status === 'issued' ? (
          <>
            {invoice.creditedMinor > 0 ? (
              <TotalRow
                label={t('invoices.detail.credited')}
                value={'−' + money(invoice.creditedMinor)}
              />
            ) : null}
            <TotalRow label={t('invoices.detail.paid')} value={money(invoice.paidMinor)} />
            <TotalRow
              strong
              label={t('invoices.detail.balance')}
              value={money(invoice.balanceMinor)}
            />
            {invoice.refundDueMinor > 0 ? (
              <TotalRow
                label={t('invoices.detail.refundDue')}
                value={money(invoice.refundDueMinor)}
              />
            ) : null}
          </>
        ) : null}
      </Card>

      {invoice.status === 'issued' ? (
        <>
          <Text variant="sectionTitle">{t('invoices.detail.payments')}</Text>
          {invoice.payments.length === 0 ? (
            <Text variant="helper" color="textMuted">
              {t('invoices.detail.noPayments')}
            </Text>
          ) : (
            <Card noPadding>
              {invoice.payments.map((payment, index) => (
                <View key={payment.id} style={[styles.item, index > 0 ? styles.itemBorder : null]}>
                  <View style={styles.itemMain}>
                    <View style={styles.paymentTitle}>
                      <Text variant="bodyStrong">
                        {(payment.kind === 'reversal' ? '−' : '') + money(payment.amountMinor)}
                      </Text>
                      {payment.kind === 'reversal' ? (
                        <Badge tone="warning">{t('invoices.detail.reversalOf')}</Badge>
                      ) : null}
                    </View>
                    <Text variant="helper" color="textSecondary">
                      {t(`invoices.method.${payment.method}`)} · {when(payment.paidAt)}
                    </Text>
                    {payment.reason ? (
                      <Text variant="helper" color="textMuted">
                        {payment.reason}
                      </Text>
                    ) : null}
                  </View>
                  {canReversePayment(payment, invoice.payments, permissions) ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onReverse(payment)}
                      style={styles.reverse}
                    >
                      <Text variant="label" color="primary">
                        {t('invoices.actions.reverse')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </Card>
          )}

          <Text variant="sectionTitle">{t('invoices.detail.creditNotes')}</Text>
          {invoice.creditNotes.length === 0 ? (
            <Text variant="helper" color="textMuted">
              {t('invoices.detail.noCreditNotes')}
            </Text>
          ) : (
            <Card noPadding>
              {invoice.creditNotes.map((note, index) => (
                <View key={note.id} style={[styles.item, index > 0 ? styles.itemBorder : null]}>
                  <View style={styles.itemMain}>
                    <Text variant="bodyStrong">{note.number}</Text>
                    <Text variant="helper" color="textSecondary">
                      {when(note.issuedAt)} · {note.reason}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">−{money(note.totalMinor)}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}

      {invoice.notes ? (
        <View style={styles.block}>
          <Text variant="label" color="textSecondary">
            {t('invoices.detail.notes')}
          </Text>
          <Text variant="body">{invoice.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[16] },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  headText: { flexShrink: 1, gap: theme.spacing[2] },
  block: { gap: theme.spacing[4] },
  clientRow: {
    gap: theme.spacing[2],
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
    padding: theme.spacing[16],
  },
  itemBorder: {
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.borderSubtle,
  },
  itemMain: { flex: 1, gap: theme.spacing[2] },
  paymentTitle: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[6] },
  reverse: {
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
  },
});
