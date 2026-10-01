import { CalendarDays } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';

export default function CalendarScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t(navLabelKey('calendar'))} icon={CalendarDays} phase={4} />;
}
