import Head from 'expo-router/head';
import { useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { PortalPage } from '@/features/portal';

/**
 * The client portal: `wapee.site/<slug>/portal`. A sign-in link arrives as `#token=...` in the FRAGMENT and
 * is stripped from the address bar on load. `noindex` and `no-referrer` for the same reason as the manage page.
 */
export default function PortalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>Your account</title>
          <meta name="robots" content="noindex, nofollow" />
          <meta name="referrer" content="no-referrer" />
        </Head>
      ) : null}
      <PortalPage slug={String(slug ?? '')} />
    </>
  );
}
