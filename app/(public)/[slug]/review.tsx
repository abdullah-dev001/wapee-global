import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { PublicReviewPage } from '@/features/reviews/components/PublicReviewPage';

/**
 * The customer's review page: `wapee.online/<slug>/review#token=...`. The token in
 * the FRAGMENT is the only thing that identifies the visit; it is read once and
 * stripped from the address bar. `no-referrer` and `noindex`, like the manage page.
 */
export default function ReviewRoute() {
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>Leave a review</title>
          <meta name="robots" content="noindex, nofollow" />
          <meta name="referrer" content="no-referrer" />
        </Head>
      ) : null}
      <PublicReviewPage />
    </>
  );
}
