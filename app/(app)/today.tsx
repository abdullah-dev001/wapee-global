import { LayoutDashboard } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';

export default function TodayScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t(navLabelKey('today'))} icon={LayoutDashboard} phase={4} />;
}
