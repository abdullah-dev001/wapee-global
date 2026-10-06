import { AdminGuard } from '@/features/admin/components';
import { TwoFactorScreen } from '@/features/admin/components/TwoFactorScreen';

export default function AdminTwoFactorRoute() {
  return (
    <AdminGuard>
      <TwoFactorScreen />
    </AdminGuard>
  );
}
