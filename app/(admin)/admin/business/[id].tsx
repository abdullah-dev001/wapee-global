import { AdminGuard } from '@/features/admin/components';
import { BusinessDetailScreen } from '@/features/admin/components/BusinessDetailScreen';

export default function AdminBusinessRoute() {
  return (
    <AdminGuard>
      <BusinessDetailScreen />
    </AdminGuard>
  );
}
