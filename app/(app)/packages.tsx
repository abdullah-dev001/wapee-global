import { RouteGuard } from '@/features/auth';
import { PackagesScreen } from '@/features/packages/components';
import { RequireFeature } from '@/features/plans/components';

/** Add-on "Packages & Sessions": hidden and refused while the add-on is off. */
export default function PackagesRoute() {
  return (
    <RouteGuard>
      <RequireFeature feature="packages">
        <PackagesScreen />
      </RequireFeature>
    </RouteGuard>
  );
}
