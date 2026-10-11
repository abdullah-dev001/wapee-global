import { useLocalSearchParams } from 'expo-router';

import { InvoicePrintScreen } from '@/features/invoices/components/InvoicePrintScreen';

/** Print/share view for one invoice. Outside `(app)` on purpose: no sidebar/header, so `window.print()` prints only the invoice. The RPC still enforces `invoices.view`. */
export default function InvoicePrintRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InvoicePrintScreen invoiceId={id} />;
}
