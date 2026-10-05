import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { UnsubscribePage } from '@/features/unsubscribe/UnsubscribePage';

/**
 * `wapee.site/unsubscribe#token=...` — the confirm page of the unsubscribe link in
 * reminder and review emails. The token stays in the fragment (never sent to a
 * server by the browser), `noindex`, `no-referrer`.
 */
export default function UnsubscribeRoute() {
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>Unsubscribe</title>
          <meta name="robots" content="noindex, nofollow" />
          <meta name="referrer" content="no-referrer" />
        </Head>
      ) : null}
      <UnsubscribePage />
    </>
  );
}
