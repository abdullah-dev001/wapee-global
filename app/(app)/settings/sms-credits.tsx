import { RouteGuard } from '@/features/auth';
import { SmsCreditsScreen, RequirePermission } from '@/features/notifications/components';

export default function SmsCreditsScreenRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="sms.send">
        <SmsCreditsScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
