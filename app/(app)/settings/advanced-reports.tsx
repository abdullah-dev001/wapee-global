import { AdvancedReportsScreen } from '@/features/advanced-reports/components';
import { RouteGuard } from '@/features/auth';
import { RequirePermission } from '@/features/notifications/components';
import { RequireFeature } from '@/features/plans/components';

export default function AdvancedReportsRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="reports.view_advanced">
        <RequireFeature feature="advanced_reports">
          <AdvancedReportsScreen />
        </RequireFeature>
      </RequirePermission>
    </RouteGuard>
  );
}
