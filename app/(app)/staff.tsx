import { Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';
import { RouteGuard } from '@/features/auth';

export default function StaffScreen() {
  const { t } = useTranslation();
  return (
    <RouteGuard>
      <ComingSoonScreen title={t(navLabelKey('staff'))} icon={Users} phase={2} />
    </RouteGuard>
  );
}
