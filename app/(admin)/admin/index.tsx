import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/shared/PlaceholderScreen';

export default function AdminHomeScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('routes.admin')} />;
}
