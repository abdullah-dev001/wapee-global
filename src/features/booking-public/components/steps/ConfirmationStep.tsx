import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react-native';

import { Badge, Button, Card, Text, useToast } from '@/components/ui';
import { formatMoney, money } from '@/lib/money';
import { formatMinuteOfDay } from '@/lib/time';
import { theme } from '@/lib/theme';

import type { CreateBookingResult } from '../../types';

export type ConfirmationStepProps = {
  result: CreateBookingResult;
  /** Full manage-page URL, token in the fragment (never sent to a server). */
  manageUrl: string;
  locale: string;
  /** The booked location's address, from the booking page (the booking result carries the name). */
  branchAddress?: string | null;
};

/**
 * Step 5: the confirmation screen.
 *
 * Shows the status (confirmed vs. awaiting approval), a summary, and the guest
 * manage link — the ONE place the raw token is ever shown, since the server
 * stores only its hash. The token lives in the URL FRAGMENT, not the query
 * string, so it is never sent to a server or written to an access log; a copy
 * button and a clear note cover the fact that this is the only chance to save it.
 */
export function ConfirmationStep({
  result,
  manageUrl,
  locale,
  branchAddress = null,
}: ConfirmationStepProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const isPending = result.status === 'pending';

  // UTC timeZone: `result.localDate` is a calendar date, not an instant. A
  // locale-time formatter on a negative-offset device would render the
  // previous day (context/_handoff.md's "Intl.DateTimeFormat needs
  // timeZone: 'UTC'" trap). `lib/time`'s formatDate is still a skeleton, so
  // this is formatted directly, the same way Calendar.tsx does.
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${result.localDate}T00:00:00.000Z`));

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(manageUrl);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show({ message: t('bookingPublic.confirmation.copyFailed'), tone: 'error' });
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.statusRow}>
        <Badge tone={isPending ? 'warning' : 'success'}>
          {isPending
            ? t('bookingPublic.confirmation.pendingBadge')
            : t('bookingPublic.confirmation.confirmedBadge')}
        </Badge>
      </View>

      <Text variant="headline" align="center">
        {isPending
          ? t('bookingPublic.confirmation.pendingTitle')
          : t('bookingPublic.confirmation.confirmedTitle')}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {isPending
          ? t('bookingPublic.confirmation.pendingBody')
          : t('bookingPublic.confirmation.confirmedBody')}
      </Text>

      <Card>
        <View style={styles.summaryRow}>
          <Text variant="label" color="textSecondary">
            {t('bookingPublic.form.service')}
          </Text>
          <Text
            variant="bodyStrong"
            style={[styles.summaryValue, styles.summaryText]}
            numberOfLines={2}
          >
            {result.serviceName}
          </Text>
        </View>
        {result.staffName ? (
          <View style={styles.summaryRow}>
            <Text variant="label" color="textSecondary">
              {t('bookingPublic.form.staff')}
            </Text>
            <Text
              variant="bodyStrong"
              style={[styles.summaryValue, styles.summaryText]}
              numberOfLines={2}
            >
              {result.staffName}
            </Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text variant="label" color="textSecondary">
            {t('bookingPublic.form.time')}
          </Text>
          <View style={styles.summaryValue}>
            <Text variant="bodyStrong" style={styles.summaryText} numberOfLines={2}>
              {dateLabel} · {formatMinuteOfDay(result.localMinute)}
            </Text>
            <Text variant="helper" color="textMuted" style={styles.summaryText}>
              {t('bookingPublic.timezoneNote', { timezone: result.timezone })}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Text variant="label" color="textSecondary">
            {t('bookingPublic.confirmation.location')}
          </Text>
          <View style={styles.summaryValue}>
            <Text variant="bodyStrong" style={styles.summaryText} numberOfLines={2}>
              {result.branchName}
            </Text>
            {branchAddress ? (
              <Text variant="helper" color="textSecondary" style={styles.summaryText}>
                {branchAddress}
              </Text>
            ) : null}
          </View>
        </View>
        {result.priceMinor !== null && result.currency ? (
          <View style={styles.summaryRow}>
            <Text variant="label" color="textSecondary">
              {t('bookingPublic.confirmation.price')}
            </Text>
            <Text
              variant="bodyStrong"
              style={[styles.summaryValue, styles.summaryText]}
              numberOfLines={1}
            >
              {formatMoney(money(result.priceMinor, result.currency), locale)}
            </Text>
          </View>
        ) : null}
      </Card>

      <View style={styles.manageSection}>
        <Text variant="bodyStrong">{t('bookingPublic.confirmation.manageTitle')}</Text>
        <Text variant="helper" color="textSecondary">
          {t('bookingPublic.confirmation.manageHint')}
        </Text>
        <Button variant="secondary" onPress={copyLink} startIcon={copied ? Check : Copy} fullWidth>
          {copied
            ? t('bookingPublic.confirmation.linkCopied')
            : t('bookingPublic.confirmation.copyLink')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
    alignItems: 'stretch',
  },
  statusRow: {
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[6],
  },
  summaryValue: {
    flex: 1,
    flexShrink: 1,
  },
  summaryText: {
    textAlign: 'right',
  },
  manageSection: {
    gap: theme.spacing[8],
  },
});
