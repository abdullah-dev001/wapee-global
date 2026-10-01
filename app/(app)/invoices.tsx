import { Receipt } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonScreen } from '@/components/shared/ComingSoonScreen';
import { navLabelKey } from '@/config/navigation';

export default function InvoicesScreen() {
  const { t } = useTranslation();
  return <ComingSoonScreen title={t(navLabelKey('invoices'))} icon={Receipt} phase={5} />;
}
