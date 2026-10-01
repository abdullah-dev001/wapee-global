import { Scissors } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';

export default function ServicesScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t(navLabelKey('services'))} icon={Scissors} phase={2} />;
}
