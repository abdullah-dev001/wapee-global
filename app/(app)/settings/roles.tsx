import { RouteGuard } from '@/features/auth';
import { RequirePermission } from '@/features/notifications/components';
import { RequireFeature } from '@/features/plans/components';
import { RolesScreen } from '@/features/roles/components';

export default function RolesRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="roles.manage">
        <RequireFeature feature="custom_roles">
          <RolesScreen />
        </RequireFeature>
      </RequirePermission>
    </RouteGuard>
  );
}
