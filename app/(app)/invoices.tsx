import { RouteGuard } from '@/features/auth';
import { InvoicesScreen } from '@/features/invoices/components/InvoicesScreen';

export default function InvoicesRoute() {
  return (
    <RouteGuard>
      <InvoicesScreen />
    </RouteGuard>
  );
}
