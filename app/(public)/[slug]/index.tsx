import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { BookingFlow } from '@/features/booking-public';

/**
 * The public booking page: `wapee.site/<slug>`. No account, no RLS-backed
 * client — every byte comes from the `get_booking_page` / `get_slots` /
 * `create_booking` Edge Functions (CLAUDE.md §6, booking-public-api.md).
 *
 * `noindex` on every booking-flow page for now (doc §7.1 leaves full SEO for
 * the Phase 7 website; booking steps themselves are not landing pages).
 */
export default function PublicBookingScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{`Book online — ${slug}`}</title>
          <meta name="description" content="Book an appointment online." />
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      ) : null}
      <BookingFlow slug={slug} />
    </>
  );
}
