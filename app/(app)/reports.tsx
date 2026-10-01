import { Package } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';

export default function ReportsScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t(navLabelKey('reports'))} icon={Package} phase={5} />;
}
