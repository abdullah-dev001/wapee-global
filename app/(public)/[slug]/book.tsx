import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { BookingFlow } from '@/features/booking-public';
import { EmbedGate } from '@/features/widget/components/EmbedGate';

/**
 * The public booking page: `wapee.site/<slug>/book` — the shareable booking
 * link. No account, no RLS-backed client; every byte comes from the
 * `get_booking_page` / `get_slots` / `create_booking` Edge Functions.
 *
 * `?embed=<token>` is present when the widget framed this page; `EmbedGate`
 * asks the server to confirm the embedding site (best effort).
 *
 * `noindex`: booking steps are not landing pages (the website at `/<slug>` is).
 */
export default function PublicBookingScreen() {
  const { slug, embed } = useLocalSearchParams<{ slug: string; embed?: string }>();

  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{`Book online — ${slug}`}</title>
          <meta name="description" content="Book an appointment online." />
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      ) : null}
      <EmbedGate slug={slug} embedParam={typeof embed === 'string' ? embed : null}>
        <BookingFlow slug={slug} />
      </EmbedGate>
    </>
  );
}
