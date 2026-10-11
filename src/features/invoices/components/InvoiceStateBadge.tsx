import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';

import { invoiceStateKey, invoiceStateTone } from '../invoiceLogic';
import { type InvoiceStatus, type PaymentStatus } from '../types';

/** The one state shown for an invoice: Draft, or its payment state. Mapping lives in `invoiceLogic`. */
export function InvoiceStateBadge({
  status,
  paymentStatus,
}: {
  status: InvoiceStatus;
  paymentStatus: PaymentStatus | null;
}) {
  const { t } = useTranslation();
  return (
    <Badge tone={invoiceStateTone(status, paymentStatus)} dot>
      {t(`invoices.state.${invoiceStateKey(status, paymentStatus)}`)}
    </Badge>
  );
}
