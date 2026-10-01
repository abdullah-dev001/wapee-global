import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/shared/PlaceholderScreen';

export default function PortalHomeScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('routes.portal')} />;
}
