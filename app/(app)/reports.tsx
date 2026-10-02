import { Package } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';
import { RouteGuard } from '@/features/auth';

export default function ReportsScreen() {
  const { t } = useTranslation();
  return (
    <RouteGuard>
      <ComingSoonScreen title={t(navLabelKey('reports'))} icon={Package} phase={5} />
    </RouteGuard>
  );
}
