import { DeleteAccountScreen } from '@/features/account';
import { RouteGuard } from '@/features/auth';

export default function DeleteAccountRoute() {
  return (
    <RouteGuard>
      <DeleteAccountScreen />
    </RouteGuard>
  );
}
