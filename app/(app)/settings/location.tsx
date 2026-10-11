import { LocationScreen } from '@/features/branches/components';
import { RouteGuard } from '@/features/auth';
import { RequirePermission } from '@/features/notifications/components';

/** Edit the one location of a Solo / Team business (multi-location plans use /settings/branches). */
export default function LocationRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="settings.business">
        <LocationScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
