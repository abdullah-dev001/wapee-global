import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { formatMinor } from '../format';
import { type InvoiceDetail } from '../types';

/**
 * The printable invoice: business, branch (address, tax number), client, items,
 * discounts, tax, totals, payments, credit notes. Pure presentation of
 * `get_invoice_print_data`; the same component is what native shares as text
 * and what the browser prints. White page, theme tokens only.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const { t, i18n } = useTranslation();
  const money = (minor: number) => formatMinor(minor, invoice.currency, i18n.language);
  const date = (iso: string) =>
    formatDate(iso as UtcIso, invoice.branch.timezone, i18n.language, 'medium');

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <View style={styles.party}>
          <Text variant="sectionTitle">{invoice.businessName}</Text>
          <Text variant="helper" color="textSecondary">
            {invoice.branch.name}
          </Text>
          {invoice.branch.address ? (
            <Text variant="helper" color="textSecondary">
              {invoice.branch.address}
            </Text>
          ) : null}
          {invoice.branch.phone ? (
            <Text variant="helper" color="textSecondary">
              {invoice.branch.phone}
            </Text>
          ) : null}
          {invoice.taxNumber ? (
            <Text variant="helper" color="textSecondary">
              {t('invoices.print.taxNumber', { number: invoice.taxNumber })}
            </Text>
          ) : null}
        </View>
        <View style={styles.meta}>
          <Text variant="pageTitleMobile">{t('invoices.print.title')}</Text>
          <Text variant="bodyStrong">{invoice.number ?? t('invoices.print.draftWatermark')}</Text>
          {invoice.issuedAt ? (
            <Text variant="helper" color="textSecondary">
              {t('invoices.print.issuedOn', { date: date(invoice.issuedAt) })}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          {t('invoices.print.billTo')}
        </Text>
        <Text variant="bodyStrong">
          {invoice.client?.name ?? invoice.billToName ?? t('invoices.detail.noClient')}
        </Text>
        {invoice.client?.phone ? <Text variant="helper">{invoice.client.phone}</Text> : null}
        {invoice.client?.email ? <Text variant="helper">{invoice.client.email}</Text> : null}
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.head]}>
          <Text variant="caption" color="textMuted" style={styles.colMain}>
            {t('invoices.form.description')}
          </Text>
          <Text variant="caption" color="textMuted" style={styles.colNum}>
            {t('invoices.print.qty')}
          </Text>
          <Text variant="caption" color="textMuted" style={styles.colAmt}>
            {t('invoices.detail.total')}
          </Text>
        </View>
        {invoice.items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.colMain}>
              <Text variant="body">{item.description}</Text>
              <Text variant="caption" color="textSecondary">
                {money(item.unitPriceMinor)}
              </Text>
              {item.discountMinor > 0 ? (
                <Text variant="caption" color="textSecondary">
                  {t('invoices.detail.discountReason', { reason: item.discountReason ?? '' })} (−
                  {money(item.discountMinor)})
                </Text>
              ) : null}
            </View>
            <Text variant="body" style={styles.colNum}>
              {item.quantity}
            </Text>
            <Text variant="body" style={styles.colAmt}>
              {money(item.lineNetMinor)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.totals}>
        <Line label={t('invoices.detail.subtotal')} value={money(invoice.subtotalMinor)} />
        {invoice.discountMinor > 0 ? (
          <Line label={t('invoices.detail.discount')} value={'−' + money(invoice.discountMinor)} />
        ) : null}
        <Line
          label={t('invoices.detail.tax', { rate: invoice.taxRateBp / 100 })}
          value={money(invoice.taxMinor)}
        />
        <Line strong label={t('invoices.detail.total')} value={money(invoice.totalMinor)} />
        {invoice.status === 'issued' ? (
          <>
            {invoice.creditedMinor > 0 ? (
              <Line
                label={t('invoices.detail.credited')}
                value={'−' + money(invoice.creditedMinor)}
              />
            ) : null}
            <Line label={t('invoices.detail.paid')} value={money(invoice.paidMinor)} />
            <Line strong label={t('invoices.detail.balance')} value={money(invoice.balanceMinor)} />
          </>
        ) : null}
      </View>

      {invoice.payments.length > 0 ? (
        <View style={styles.block}>
          <Text variant="label" color="textSecondary">
            {t('invoices.print.paymentsTitle')}
          </Text>
          {invoice.payments.map((p) => (
            <Text key={p.id} variant="helper">
              {date(p.paidAt)} · {t(`invoices.method.${p.method}`)} ·{' '}
              {(p.kind === 'reversal' ? '−' : '') + money(p.amountMinor)}
            </Text>
          ))}
        </View>
      ) : null}

      {invoice.creditNotes.length > 0 ? (
        <View style={styles.block}>
          <Text variant="label" color="textSecondary">
            {t('invoices.print.creditNoteTitle')}
          </Text>
          {invoice.creditNotes.map((c) => (
            <Text key={c.id} variant="helper">
              {c.number} · {date(c.issuedAt)} · −{money(c.totalMinor)} · {c.reason}
            </Text>
          ))}
        </View>
      ) : null}

      {invoice.notes ? (
        <View style={styles.block}>
          <Text variant="helper" color="textSecondary">
            {invoice.notes}
          </Text>
        </View>
      ) : null}
      <Text variant="caption" color="textMuted" align="center">
        {t('invoices.print.thanks')}
      </Text>
    </View>
  );
}

function Line({
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
  page: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[24],
    gap: theme.spacing[20],
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing[16],
  },
  party: { gap: theme.spacing[2], flexShrink: 1 },
  meta: { gap: theme.spacing[2], alignItems: 'flex-end' },
  block: { gap: theme.spacing[4] },
  table: { gap: theme.spacing[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[8],
    paddingBottom: theme.spacing[8],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  head: { paddingBottom: theme.spacing[4] },
  colMain: { flex: 1 },
  colNum: { width: 48, textAlign: 'right' },
  colAmt: { width: 96, textAlign: 'right' },
  totals: { alignSelf: 'flex-end', minWidth: 240, gap: theme.spacing[2] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing[16] },
});
