import { RouteGuard } from '@/features/auth';
import { RequirePermission } from '@/features/notifications/components';
import { BillingScreen } from '@/features/plans/components/BillingScreen';

export default function BillingScreenRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="settings.billing">
        <BillingScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
