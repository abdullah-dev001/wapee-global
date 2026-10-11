import { RouteGuard } from '@/features/auth';
import { CommissionScreen } from '@/features/commission/components';
import { RequireFeature } from '@/features/plans/components';

/** Any of view_own / view_all / manage_rules opens it (the tabs show only what each may use). */
export default function CommissionRoute() {
  return (
    <RouteGuard>
      <RequireFeature feature="commission">
        <CommissionScreen />
      </RequireFeature>
    </RouteGuard>
  );
}
