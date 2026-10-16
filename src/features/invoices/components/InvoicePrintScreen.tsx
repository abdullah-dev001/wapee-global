import { useRouter } from 'expo-router';
import { ArrowLeft, Printer, Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Screen, usePagePadding } from '@/components/layout';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { useInvoiceDetail } from '../api/useInvoices';
import { formatMinor } from '../format';
import { type InvoiceDetail } from '../types';
import { InvoiceDocument } from './InvoiceDocument';
import { invoiceErrorKey } from '../invoiceErrorKey';

/** Marks the toolbar so the print stylesheet (app/+html.tsx) hides it. */
const NO_PRINT = { dataSet: { noPrint: 'true' } } as object;

/**
 * Plain-text version of the invoice for the native share sheet. No new
 * dependency: React Native's built-in `Share` shares text, not a PDF (a real
 * PDF would need expo-print + expo-sharing, a separate decision).
 */
function shareText(
  invoice: InvoiceDetail,
  t: (key: never, options?: never) => string,
  locale: string,
): string {
  const money = (minor: number) => formatMinor(minor, invoice.currency, locale);
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const lines = [
    `${invoice.businessName} · ${invoice.branch.name}`,
    `${tt('invoices.print.title')} ${invoice.number ?? tt('invoices.print.draftWatermark')}`,
    invoice.issuedAt
      ? tt('invoices.print.issuedOn', {
          date: formatDate(invoice.issuedAt as UtcIso, invoice.branch.timezone, locale, 'medium'),
        })
      : '',
    invoice.client ? `${tt('invoices.print.billTo')}: ${invoice.client.name}` : '',
    '',
    ...invoice.items.map((item) =>
      tt('invoices.print.shareLine', {
        description: item.description,
        quantity: item.quantity,
        amount: money(item.lineNetMinor),
      }),
    ),
    '',
    `${tt('invoices.detail.tax', { rate: invoice.taxRateBp / 100 })}: ${money(invoice.taxMinor)}`,
    `${tt('invoices.detail.total')}: ${money(invoice.totalMinor)}`,
    invoice.status === 'issued'
      ? `${tt('invoices.detail.balance')}: ${money(invoice.balanceMinor)}`
      : '',
    invoice.taxNumber ? tt('invoices.print.taxNumber', { number: invoice.taxNumber }) : '',
  ];
  return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n');
}

/** Standalone print view at `/invoice-print/<id>`: no app chrome, so printing the page prints only the invoice. */
export function InvoicePrintScreen({ invoiceId }: { invoiceId: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { businessId } = useCurrentScope();
  const pagePadding = usePagePadding();
  const detail = useInvoiceDetail(businessId, invoiceId);

  const onPrint = () => {
    if (!detail.data) return;
    if (Platform.OS === 'web') {
      window.print();
      return;
    }
    void Share.share({
      title: t('invoices.print.shareTitle', { number: detail.data.number ?? '' }),
      message: shareText(detail.data, t as never, i18n.language),
    });
  };
  const onBack = () => (router.canGoBack() ? router.back() : router.replace('/invoices'));

  return (
    <Screen>
      <View style={[styles.container, { padding: pagePadding }]}>
        <View style={styles.toolbar} {...NO_PRINT}>
          <Button variant="ghost" startIcon={ArrowLeft} onPress={onBack}>
            {t('invoices.print.back')}
          </Button>
          <Button
            startIcon={Platform.OS === 'web' ? Printer : Share2}
            onPress={onPrint}
            disabled={!detail.data}
          >
            {Platform.OS === 'web' ? t('invoices.print.print') : t('invoices.print.share')}
          </Button>
        </View>
        {detail.isError ? (
          <ErrorState
            title={t('invoices.print.loadError')}
            description={t(invoiceErrorKey(detail.error))}
            onRetry={() => void detail.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : detail.data ? (
          <InvoiceDocument invoice={detail.data} />
        ) : (
          <View style={styles.skeleton}>
            <Skeleton height={32} width="40%" />
            <Skeleton height={160} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[16] },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skeleton: { gap: theme.spacing[12] },
});
