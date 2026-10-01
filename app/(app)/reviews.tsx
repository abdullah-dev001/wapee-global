import { Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';

export default function ReviewsScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t(navLabelKey('reviews'))} icon={Star} phase={7} />;
}
