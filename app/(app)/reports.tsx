import { RouteGuard } from '@/features/auth';
import { ReportsScreen } from '@/features/invoices/components/ReportsScreen';

export default function ReportsRoute() {
  return (
    <RouteGuard>
      <ReportsScreen />
    </RouteGuard>
  );
}
