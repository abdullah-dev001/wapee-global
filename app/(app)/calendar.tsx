import { CalendarScreen } from '@/features/appointments/components/CalendarScreen';
import { RouteGuard } from '@/features/auth';

export default function Calendar() {
  return (
    <RouteGuard>
      <CalendarScreen />
    </RouteGuard>
  );
}
