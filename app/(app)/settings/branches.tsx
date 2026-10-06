import { BranchesScreen } from '@/features/branches/components';
import { RouteGuard } from '@/features/auth';
import { RequirePermission } from '@/features/notifications/components';
import { RequireFeature } from '@/features/plans/components';

export default function BranchesRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="settings.business">
        <RequireFeature feature="multi_branch">
          <BranchesScreen />
        </RequireFeature>
      </RequirePermission>
    </RouteGuard>
  );
}
