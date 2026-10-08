import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { PublicSignPage } from '@/features/forms/components/PublicSignPage';

/**
 * The client's form signing page: `wapee.online/<slug>/sign#token=...`. The token in the FRAGMENT is the
 * only thing that identifies the request; it is read once and stripped from the address bar.
 * `no-referrer` and `noindex`, like the manage and review pages.
 */
export default function SignRoute() {
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>Sign form</title>
          <meta name="robots" content="noindex, nofollow" />
          <meta name="referrer" content="no-referrer" />
        </Head>
      ) : null}
      <PublicSignPage />
    </>
  );
}
