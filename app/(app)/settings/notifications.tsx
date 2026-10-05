import { RouteGuard } from '@/features/auth';
import { NotificationSettingsScreen, RequirePermission } from '@/features/notifications/components';

export default function NotificationSettingsScreenRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="settings.booking">
        <NotificationSettingsScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
