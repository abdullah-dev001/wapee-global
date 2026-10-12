import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { brand } from '@/config/brand';
import { BookingFlow, useBookingPage } from '@/features/booking-public';
import { EmbedGate } from '@/features/widget/components/EmbedGate';

/**
 * The public booking page: `wapee.online/<slug>/book` — the shareable booking
 * link. No account, no RLS-backed client; every byte comes from the
 * `get_booking_page` / `get_slots` / `create_booking` Edge Functions.
 *
 * `?embed=<token>` is present when the widget framed this page; `EmbedGate`
 * asks the server to confirm the embedding site (best effort).
 *
 * `noindex`: booking steps are not landing pages (the website at `/<slug>` is, see
 * `WebsiteHead`/`PublicWebsitePage` — canonical, Open Graph and LocalBusiness JSON-LD live
 * there). The title/description here are only for link-preview cards (chat apps, social
 * shares of the direct booking link), not for search — reusing the same `useBookingPage`
 * query `BookingFlow` already loads (TanStack Query dedupes by key: no extra request).
 */
export default function PublicBookingScreen() {
  const { slug, embed, branch } = useLocalSearchParams<{
    slug: string;
    embed?: string;
    branch?: string;
  }>();
  const branchRef = typeof branch === 'string' && branch ? branch : null;
  const page = useBookingPage(slug, branchRef);
  const branchName = page.data && !page.data.needsBranch ? page.data.branch.name : null;
  const title = branchName
    ? `Book online — ${branchName} | ${brand.name}`
    : `Book online — ${slug}`;
  const description = branchName
    ? `Book an appointment online at ${branchName} in seconds.`
    : 'Book an appointment online.';
  const canonicalUrl = `${brand.urls.site}/${slug}/book`;

  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{title}</title>
          <meta name="description" content={description} />
          <link rel="canonical" href={canonicalUrl} />
          <meta name="robots" content="noindex, nofollow" />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:url" content={canonicalUrl} />
        </Head>
      ) : null}
      <EmbedGate slug={slug} embedParam={typeof embed === 'string' ? embed : null}>
        <BookingFlow slug={slug} initialBranch={branchRef} />
      </EmbedGate>
    </>
  );
}
