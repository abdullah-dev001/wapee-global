import { RouteGuard } from '@/features/auth';
import { MyNotificationsScreen } from '@/features/notifications/components';

export default function MyNotificationsRoute() {
  return (
    <RouteGuard>
      <MyNotificationsScreen />
    </RouteGuard>
  );
}
