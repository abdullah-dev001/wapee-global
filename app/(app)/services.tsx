import { Scissors } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';
import { RouteGuard } from '@/features/auth';

export default function ServicesScreen() {
  const { t } = useTranslation();
  return (
    <RouteGuard>
      <ComingSoonScreen title={t(navLabelKey('services'))} icon={Scissors} phase={2} />
    </RouteGuard>
  );
}
