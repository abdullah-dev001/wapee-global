import { Redirect } from 'expo-router';

import { launch } from '@/config/launch';
import { RouteGuard } from '@/features/auth';
import { SmsCreditsScreen, RequirePermission } from '@/features/notifications/components';

export default function SmsCreditsScreenRoute() {
  // SMS is off at launch: a deep link goes back to Settings.
  if (!launch.sms) return <Redirect href="/settings" />;
  return (
    <RouteGuard>
      <RequirePermission permission="sms.send">
        <SmsCreditsScreen />
      </RequirePermission>
    </RouteGuard>
  );
}
