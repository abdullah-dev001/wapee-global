import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon } from 'lucide-react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Button, EmptyState, ErrorState, Skeleton, Tabs, Text } from '@/components/ui';
import { useOverlayDismiss } from '@/components/ui/useOverlayDismiss';
import { useTokenFromUrl } from '@/features/booking-manage/useTokenFromUrl';
import { PublicApiError } from '@/features/booking-public/types';
import { theme } from '@/lib/theme';

import {
  useExchangeLink,
  usePortalInfo,
  usePortalOverview,
  usePortalSession,
  usePortalSignOut,
  type PortalBooking,
} from '../api/usePortal';
import { visibleTabs, type PortalTab } from '../portalLogic';
import { PortalBook } from './PortalBook';
import { PortalBookings } from './PortalBookings';
import { PortalForms } from './PortalForms';
import { PortalInvoices } from './PortalInvoices';
import { PortalLogin } from './PortalLogin';
import { PortalPackages } from './PortalPackages';
import { PortalPhotos } from './PortalPhotos';
import { PortalReschedule } from './PortalReschedule';

const MAX_WIDTH = 720;

/**
 * The client portal page (`(public)/[slug]/portal`). Signed out: an email form. A one-time link in the
 * URL fragment (`#token=`) is read once, stripped from the address bar, traded for a session and never
 * kept in the URL. Signed in: bookings, and the add-on tabs the business has turned on.
 */
export function PortalPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const token = useTokenFromUrl();
  const sessionQuery = usePortalSession(slug);
  const session = sessionQuery.data ?? null;
  const exchange = useExchangeLink(slug, session ? null : token);
  const info = usePortalInfo(slug);

  let body: React.ReactNode;
  if (info.isError) {
    const unavailable = info.error instanceof PublicApiError && info.error.code === 'not_found';
    body = unavailable ? (
      <EmptyState
        icon={LinkIcon}
        title={t('portal.notAvailableTitle')}
        description={t('portal.notAvailableBody')}
      />
    ) : (
      <ErrorState
        title={t('portal.loadErrorTitle')}
        description={t('portal.loadErrorBody')}
        onRetry={() => info.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  } else if (
    sessionQuery.isPending ||
    token === undefined ||
    info.isPending ||
    (exchange.isFetching && !session)
  ) {
    body = <Skeleton height={160} radius="md" />;
  } else if (session) {
    body = <PortalSignedIn slug={slug} session={session} />;
  } else {
    body = (
      <View style={styles.stack}>
        {token && exchange.isError ? (
          <EmptyState
            icon={LinkIcon}
            title={t('portal.invalidTitle')}
            description={t('portal.invalidBody')}
          />
        ) : null}
        <PortalLogin slug={slug} business={info.data.business_name} />
      </View>
    );
  }

  return (
    <Screen>
      <PageContainer maxWidth={MAX_WIDTH}>{body}</PageContainer>
    </Screen>
  );
}

type View_ = { kind: 'main' } | { kind: 'book' } | { kind: 'reschedule'; booking: PortalBooking };

function PortalSignedIn({ slug, session }: { slug: string; session: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PortalTab>('bookings');
  const [view, setView] = useState<View_>({ kind: 'main' });
  const overview = usePortalOverview(slug, session);
  const signOut = usePortalSignOut(slug, session);

  useOverlayDismiss(view.kind !== 'main', () => setView({ kind: 'main' }));

  if (overview.isPending) return <Skeleton height={160} radius="md" />;
  if (overview.isError) {
    // An expired or revoked session was already cleared by the query; the page falls back to the sign-in form.
    return (
      <ErrorState
        title={t('portal.loadErrorTitle')}
        description={t('portal.loadErrorBody')}
        onRetry={() => overview.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }
  const { clients, features, business_name: business } = overview.data;
  const tabs = visibleTabs(features);
  const close = () => setView({ kind: 'main' });

  if (view.kind === 'book') {
    return <PortalBook slug={slug} session={session} clients={clients} onClose={close} />;
  }
  if (view.kind === 'reschedule') {
    return (
      <PortalReschedule slug={slug} session={session} booking={view.booking} onClose={close} />
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="pageTitle">{business}</Text>
          <Text variant="helper" color="textSecondary">
            {t('portal.welcome', { name: clients[0]?.first_name ?? '' })}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="sm"
          loading={signOut.isPending}
          onPress={() => signOut.mutate(false)}
        >
          {t('portal.signOut')}
        </Button>
      </View>
      <Tabs
        items={tabs.map((v) => ({ value: v, label: t(`portal.tabs.${v}`) }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'bookings' ? (
        <PortalBookings
          slug={slug}
          session={session}
          onBook={() => setView({ kind: 'book' })}
          onReschedule={(booking) => setView({ kind: 'reschedule', booking })}
        />
      ) : null}
      {tab === 'packages' ? <PortalPackages slug={slug} session={session} /> : null}
      {tab === 'invoices' ? <PortalInvoices slug={slug} session={session} /> : null}
      {tab === 'photos' ? <PortalPhotos slug={slug} session={session} /> : null}
      {tab === 'forms' ? <PortalForms slug={slug} session={session} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
});
