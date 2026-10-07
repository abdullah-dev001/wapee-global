import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react-native';

import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { formatMoney, money } from '@/lib/money';
import { formatDate, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { usePortalInvoice, usePortalInvoices } from '../api/usePortal';
import { paymentLabelKey } from '../portalLogic';

const TONE = {
  paid: 'success',
  partial: 'warning',
  credited: 'neutral',
  pending: 'warning',
} as const;

export function PortalInvoices({ slug, session }: { slug: string; session: string }) {
  const { t, i18n } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = usePortalInvoices(slug, session);
  const detail = usePortalInvoice(slug, session, openId);
  const fmt = (minor: number, currency: string) =>
    formatMoney(money(minor, currency), i18n.language);

  if (openId) {
    const d = detail.data;
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Button variant="ghost" size="sm" onPress={() => setOpenId(null)}>
            {t('portal.invoices.back')}
          </Button>
          {Platform.OS === 'web' && d ? (
            <Button variant="secondary" size="sm" onPress={() => window.print()}>
              {t('portal.invoices.print')}
            </Button>
          ) : null}
        </View>
        {detail.isPending ? (
          <Skeleton height={160} radius="md" />
        ) : detail.isError || !d ? (
          <ErrorState
            title={t('portal.loadErrorTitle')}
            description={t('portal.loadErrorBody')}
            onRetry={() => detail.refetch()}
            retryLabel={t('actions.retry')}
            compact
          />
        ) : (
          <Card>
            <Text variant="sectionTitle">
              {t('portal.invoices.number', { number: d.invoice.number })}
            </Text>
            <Text variant="helper" color="textSecondary">
              {`${d.business.name} · ${d.branch.name}${d.branch.address ? ` · ${d.branch.address}` : ''}`}
            </Text>
            <Text variant="helper" color="textSecondary">
              {formatDate(d.invoice.issued_at as UtcIso, d.branch.timezone, i18n.language)}
            </Text>
            {d.invoice.bill_to_name ? (
              <Text variant="helper">
                {t('portal.invoices.billTo')}: {String(d.invoice.bill_to_name)}
              </Text>
            ) : null}
            <View style={styles.lines}>
              {d.items.map((it, i) => (
                <View key={i} style={styles.row}>
                  <Text
                    variant="body"
                    style={styles.grow}
                  >{`${it.quantity} × ${it.description}`}</Text>
                  <Text variant="body">{fmt(it.line_net_minor, d.invoice.currency)}</Text>
                </View>
              ))}
              {d.invoice.discount_minor ? (
                <Line
                  label={t('portal.invoices.discount')}
                  value={fmt(-Number(d.invoice.discount_minor), d.invoice.currency)}
                />
              ) : null}
              {d.invoice.tax_minor ? (
                <Line
                  label={t('portal.invoices.tax')}
                  value={fmt(Number(d.invoice.tax_minor), d.invoice.currency)}
                />
              ) : null}
              <Line
                strong
                label={t('portal.invoices.total')}
                value={fmt(d.invoice.total_minor, d.invoice.currency)}
              />
              <Line
                label={t('portal.invoices.balance')}
                value={fmt(Number(d.invoice.balance_minor ?? 0), d.invoice.currency)}
              />
            </View>
            {d.payments.length > 0 ? (
              <View style={styles.lines}>
                <Text variant="label">{t('portal.invoices.payments')}</Text>
                {d.payments.map((p, i) => (
                  <Line
                    key={i}
                    label={`${formatDate(p.paid_at as UtcIso, d.branch.timezone, i18n.language)}${p.kind === 'reversal' ? ` · ${t('portal.invoices.reversal')}` : ''}`}
                    value={fmt(
                      p.kind === 'reversal' ? -p.amount_minor : p.amount_minor,
                      d.invoice.currency,
                    )}
                  />
                ))}
              </View>
            ) : null}
            {d.credit_notes.length > 0 ? (
              <View style={styles.lines}>
                <Text variant="label">{t('portal.invoices.creditNotes')}</Text>
                {d.credit_notes.map((c) => (
                  <Line
                    key={c.number}
                    label={c.number}
                    value={fmt(-c.total_minor, d.invoice.currency)}
                  />
                ))}
              </View>
            ) : null}
          </Card>
        )}
      </View>
    );
  }

  if (list.isPending) return <Skeleton height={96} radius="md" />;
  if (list.isError) {
    return (
      <ErrorState
        title={t('portal.loadErrorTitle')}
        description={t('portal.loadErrorBody')}
        onRetry={() => list.refetch()}
        retryLabel={t('actions.retry')}
        compact
      />
    );
  }
  if (list.data.rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('portal.invoices.empty')}
        description={t('portal.invoices.emptyBody')}
      />
    );
  }
  return (
    <View style={styles.wrap}>
      {list.data.rows.map((r) => {
        const key = paymentLabelKey(r.payment_status);
        return (
          <Card key={r.id} onPress={() => setOpenId(r.id)}>
            <View style={styles.row}>
              <Text variant="cardTitle" style={styles.grow}>
                {r.number}
              </Text>
              <Badge tone={TONE[key.split('.')[2] as keyof typeof TONE]} dot>
                {t(key)}
              </Badge>
            </View>
            <Text variant="helper" color="textSecondary">
              {formatDate(r.issued_at as UtcIso, 'UTC', i18n.language)} ·{' '}
              {fmt(r.total_minor, r.currency)}
            </Text>
          </Card>
        );
      })}
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
    <View style={styles.row}>
      <Text variant={strong ? 'bodyStrong' : 'body'} style={styles.grow}>
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'body'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
  lines: { marginTop: theme.spacing[12], gap: theme.spacing[8] },
});
