import { Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';
import { RouteGuard } from '@/features/auth';

export default function ReviewsScreen() {
  const { t } = useTranslation();
  return (
    <RouteGuard>
      <ComingSoonScreen title={t(navLabelKey('reviews'))} icon={Star} phase={7} />
    </RouteGuard>
  );
}
