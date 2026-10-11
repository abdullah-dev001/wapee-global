import { AccountScreen } from '@/features/account';
import { RouteGuard } from '@/features/auth';

export default function AccountRoute() {
  return (
    <RouteGuard>
      <AccountScreen />
    </RouteGuard>
  );
}
