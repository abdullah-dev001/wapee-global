import Head from 'expo-router/head';
import { Platform } from 'react-native';

/**
 * Keeps a private area out of search results: `<meta name="robots" content="noindex, nofollow">`
 * on web only (native has no crawler). `vercel.json` sends the same signal as an `X-Robots-Tag`
 * header for crawlers that read a page before its JS runs — this covers the rest (client-side
 * route changes inside an already-loaded app, and any crawler that does execute JS).
 *
 * Mount once per route GROUP layout ((app), (admin), (auth)): the Tabs/Stack navigator underneath
 * must stay mounted for Expo Router's own routing to work, so this is a sibling, not a wrapper.
 */
export function NoIndexHead() {
  if (Platform.OS !== 'web') return null;
  return (
    <Head>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  );
}
