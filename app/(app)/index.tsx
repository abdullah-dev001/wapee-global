import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/shared/PlaceholderScreen';

export default function DashboardHomeScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('routes.app')} />;
}
