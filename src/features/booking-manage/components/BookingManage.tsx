import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon } from 'lucide-react-native';

import { Screen, PageContainer } from '@/components/layout';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useOverlayDismiss } from '@/components/ui/useOverlayDismiss';
import { theme, useBreakpoint } from '@/lib/theme';

import { useManageBooking } from '../api';
import { cancelledView } from '../manageState';
import type { ManageBookingView } from '../types';
import { useTokenFromUrl } from '../useTokenFromUrl';
import { actionFor } from '@/features/booking-public/errorHandling';
import { PublicApiError } from '@/features/booking-public/types';
import { ManageView } from './ManageView';
import { RescheduleView } from './RescheduleView';

const DESKTOP_MAX_WIDTH = 480;

/**
 * The guest manage page (`(public)/[slug]/manage`): view, cancel or
 * reschedule one booking by a token carried in the URL FRAGMENT. No account,
 * no slug-derived lookup — the token alone identifies the booking
 * (booking-public-api.md: "the slug is the only business identifier a caller
 * may send" does not even apply here, since this page never sends a slug).
 */
export function BookingManage() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const token = useTokenFromUrl();
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  // Set once the guest cancels. Shown instead of re-fetching: the cancel
  // revoked the token, so a refetch would say "link not valid" (QA F13).
  const [afterCancel, setAfterCancel] = useState<ManageBookingView | null>(null);

  const booking = useManageBooking(token ?? null);

  const handleRescheduled = useCallback(() => {
    setMode('view');
    void booking.refetch();
  }, [booking]);

  // Android hardware back (and web Escape) must step from the reschedule
  // screen back to the view screen rather than falling through to the
  // Stack's default pop and leaving the manage page entirely — the same
  // class of bug CLAUDE.md flags for any multi-step flow without a real
  // route per step (see the public booking flow's own goBack trap).
  useOverlayDismiss(mode === 'reschedule', () => setMode('view'));

  let body: React.ReactNode;

  if (afterCancel && token) {
    body = (
      <ManageView
        token={token}
        booking={afterCancel}
        onReschedule={() => undefined}
        onCancelled={() => undefined}
      />
    );
  } else if (token === undefined) {
    // Still resolving (native's getInitialURL is async). A skeleton, not an
    // error — this is milliseconds, not a real wait.
    body = <ManageSkeleton />;
  } else if (token === null) {
    body = (
      <EmptyState
        icon={LinkIcon}
        title={t('bookingManage.invalidLinkTitle')}
        description={t('bookingManage.invalidLinkBody')}
      />
    );
  } else if (booking.isPending) {
    body = <ManageSkeleton />;
  } else if (booking.isError) {
    const code = booking.error instanceof PublicApiError ? booking.error.code : 'server_error';
    const action = actionFor(code, {
      retryAfterSeconds:
        booking.error instanceof PublicApiError ? booking.error.retryAfterSeconds : undefined,
    });

    if (action.kind === 'invalid_link' || action.kind === 'not_available') {
      // Invalid, expired, revoked or replayed tokens all land here — the SAME
      // generic page, no hints (CLAUDE.md §13: a public failure must not be
      // distinguishable).
      body = (
        <EmptyState
          icon={LinkIcon}
          title={t('bookingManage.invalidLinkTitle')}
          description={t('bookingManage.invalidLinkBody')}
        />
      );
    } else if (action.kind === 'rate_limited') {
      body = (
        <EmptyState
          title={t('bookingManage.rateLimitedTitle')}
          description={t('bookingManage.rateLimitedBody')}
        />
      );
    } else {
      body = (
        <ErrorState
          title={t('bookingManage.loadErrorTitle')}
          description={t('bookingManage.loadErrorBody')}
          onRetry={() => booking.refetch()}
          retryLabel={t('actions.retry')}
        />
      );
    }
  } else if (booking.data) {
    body =
      mode === 'reschedule' ? (
        <RescheduleView
          token={token}
          booking={booking.data}
          onCancel={() => setMode('view')}
          onRescheduled={handleRescheduled}
        />
      ) : (
        <ManageView
          token={token}
          booking={booking.data}
          onReschedule={() => setMode('reschedule')}
          onCancelled={() => booking.data && setAfterCancel(cancelledView(booking.data))}
        />
      );
  }

  return (
    <Screen>
      <PageContainer maxWidth={isDesktop ? DESKTOP_MAX_WIDTH : undefined}>
        <View style={styles.wrapper}>{body}</View>
        <LegalLinks />
      </PageContainer>
    </Screen>
  );
}

function ManageSkeleton() {
  return (
    <View style={styles.skeletons}>
      <Skeleton height={24} width="50%" />
      <Skeleton height={120} radius="md" />
      <Skeleton height={40} radius="md" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  skeletons: {
    gap: theme.spacing[16],
  },
});
