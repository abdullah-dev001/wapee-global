import { AdminGuard } from '@/features/admin/components';
import { BusinessesScreen } from '@/features/admin/components/BusinessesScreen';

export default function AdminHomeScreen() {
  return (
    <AdminGuard>
      <BusinessesScreen />
    </AdminGuard>
  );
}
