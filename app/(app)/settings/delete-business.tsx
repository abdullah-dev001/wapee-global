import { RouteGuard } from '@/features/auth';
import { BusinessEraseScreen } from '@/features/data-rights/components/BusinessEraseScreen';
import { RequirePermission } from '@/features/notifications/components';

/** Owner-only in practice: `clients.erase` is held by the Owner role, and the database re-checks the role itself. */
export default function DeleteBusinessRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="clients.erase">
        <BusinessEraseScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
