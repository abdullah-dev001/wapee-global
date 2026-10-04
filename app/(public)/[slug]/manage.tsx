import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { BookingManage } from '@/features/booking-manage';

/**
 * The guest manage link: `wapee.site/<slug>/manage#token=...`. The slug in
 * the path is cosmetic — the token in the FRAGMENT is the only thing that
 * identifies the booking, and it is read once and stripped from the address
 * bar (`useTokenFromUrl`). `referrer: no-referrer` so the fragment-bearing
 * URL is never sent as a Referer header by an outgoing link on this page, and
 * `noindex` for the same reason as the booking flow itself.
 */
export default function ManageBookingScreen() {
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>Manage your booking</title>
          <meta name="description" content="View, reschedule or cancel your appointment." />
          <meta name="robots" content="noindex, nofollow" />
          <meta name="referrer" content="no-referrer" />
        </Head>
      ) : null}
      <BookingManage />
    </>
  );
}
