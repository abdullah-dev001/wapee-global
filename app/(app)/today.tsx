import { TodayScreen } from '@/features/appointments/components/TodayScreen';
import { RouteGuard } from '@/features/auth';

export default function Today() {
  // RouteGuard even though Today needs no permission: it also applies the
  // trial lock, and Today is where the app lands.
  return (
    <RouteGuard>
      <TodayScreen />
    </RouteGuard>
  );
}
