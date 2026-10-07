import { RouteGuard } from '@/features/auth';
import { DataRequestsScreen } from '@/features/data-rights/components/DataRequestsScreen';
import { RequirePermission } from '@/features/notifications/components';

export default function DataRequestsRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="clients.export">
        <DataRequestsScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
