import { RouteGuard } from '@/features/auth';
import { MessagesLogScreen, RequirePermission } from '@/features/notifications/components';

export default function MessagesLogScreenRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="settings.booking">
        <MessagesLogScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
