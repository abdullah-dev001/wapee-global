import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/shared/PlaceholderScreen';

export default function PublicBusinessScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <PlaceholderScreen title={t('routes.public', { slug })} />;
}
