import { useLocalSearchParams } from 'expo-router';

import { PublicWebsitePage } from '@/features/website/components/public';

/**
 * The business website: `wapee.online/<slug>`. Data only from the `get_website`
 * Edge Function. A slug with no published website shows the one generic
 * not-found page. The booking flow lives at `/<slug>/book`.
 */
export default function PublicWebsiteRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <PublicWebsitePage slug={slug} />;
}
