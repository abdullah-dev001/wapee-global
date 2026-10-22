import { AdminGuard } from '@/features/admin/components';
import { ReauthScreen } from '@/features/admin/components/ReauthScreen';

export default function AdminSignInAgainRoute() {
  return (
    <AdminGuard>
      <ReauthScreen />
    </AdminGuard>
  );
}
