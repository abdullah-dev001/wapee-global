import { Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';
import { RouteGuard } from '@/features/auth';

export default function ClientsScreen() {
  const { t } = useTranslation();
  return (
    <RouteGuard>
      <ComingSoonScreen title={t(navLabelKey('clients'))} icon={Users} phase={4} />
    </RouteGuard>
  );
}
