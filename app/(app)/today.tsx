import { LayoutDashboard } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';
import { RouteGuard } from '@/features/auth';

export default function TodayScreen() {
  const { t } = useTranslation();
  // RouteGuard even though Today needs no permission: it also applies the
  // trial lock, and Today is where the app lands.
  return (
    <RouteGuard>
      <ComingSoonScreen title={t(navLabelKey('today'))} icon={LayoutDashboard} phase={4} />
    </RouteGuard>
  );
}
