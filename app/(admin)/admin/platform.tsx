import { AdminGuard } from '@/features/admin/components';
import { PlatformScreen } from '@/features/admin/components/PlatformScreen';

export default function AdminPlatformScreen() {
  return (
    <AdminGuard>
      <PlatformScreen />
    </AdminGuard>
  );
}
