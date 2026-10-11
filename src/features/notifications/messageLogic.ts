import type { ParseKeys } from 'i18next';

import type { BadgeTone } from '@/components/ui';

/**
 * Pure helpers for the notification screens: how a message status, a skip/fail
 * code, an event and a credit amount are shown. No React, no I/O (tested).
 */

export type MessageStatus = 'sent' | 'failed' | 'skipped' | 'queued';
export type MessageChannel = 'email' | 'sms' | 'push';

/** Client-facing events (the ones the customer receives). */
export const CLIENT_EVENTS = [
  'booking_confirmed',
  'pending_received',
  'reminder',
  'rescheduled',
  'cancelled',
  'manage_link',
  'review_request',
] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/** Every event that can appear in the log (client + staff push). */
export const LOG_EVENTS = [
  ...CLIENT_EVENTS,
  'staff_new_booking',
  'staff_pending_approval',
  'staff_cancelled',
  'staff_reminder',
] as const;

const _KNOWN_CODES = [
  'skipped_no_credits',
  'no_rate',
  'suppressed',
  'stale',
  'daily_cap',
  'recipient_cap',
  'sms_disabled',
  'no_recipient',
  'business_inactive',
  'rejected',
  'max_attempts',
  'expired',
  'ambiguous_send',
  'bad_body',
  'no_token',
  'missing_token',
] as const;

export function isMessageStatus(value: unknown): value is MessageStatus {
  return value === 'sent' || value === 'failed' || value === 'skipped' || value === 'queued';
}

export function statusTone(status: MessageStatus): BadgeTone {
  switch (status) {
    case 'sent':
      return 'success';
    case 'failed':
      return 'error';
    case 'skipped':
      return 'warning';
    case 'queued':
      return 'info';
  }
}

const STATUS_KEYS: Record<MessageStatus, ParseKeys> = {
  sent: 'notifications.status.sent',
  failed: 'notifications.status.failed',
  skipped: 'notifications.status.skipped',
  queued: 'notifications.status.queued',
};

/** i18n key for a status (`notifications.status.<status>`). */
export function statusKey(status: MessageStatus): ParseKeys {
  return STATUS_KEYS[status];
}

const CODE_KEYS: Record<(typeof _KNOWN_CODES)[number], ParseKeys> = {
  skipped_no_credits: 'notifications.code.skipped_no_credits',
  no_rate: 'notifications.code.no_rate',
  suppressed: 'notifications.code.suppressed',
  stale: 'notifications.code.stale',
  daily_cap: 'notifications.code.daily_cap',
  recipient_cap: 'notifications.code.recipient_cap',
  sms_disabled: 'notifications.code.sms_disabled',
  no_recipient: 'notifications.code.no_recipient',
  business_inactive: 'notifications.code.business_inactive',
  rejected: 'notifications.code.rejected',
  max_attempts: 'notifications.code.max_attempts',
  expired: 'notifications.code.expired',
  ambiguous_send: 'notifications.code.ambiguous_send',
  bad_body: 'notifications.code.bad_body',
  no_token: 'notifications.code.no_token',
  missing_token: 'notifications.code.missing_token',
};

/** i18n key for a skip / failure code; anything unknown maps to `other`; no code is null. */
export function codeKey(code: string | null): ParseKeys | null {
  if (!code) return null;
  return (CODE_KEYS as Record<string, ParseKeys | undefined>)[code] ?? 'notifications.code.other';
}

/**
 * A short, human reason for a provider refusal, from the scrubbed error stored on the
 * log row (e.g. "resend_403: validation_error"). Null when there is nothing useful to add.
 */
export function failureHintKey(error: string | null): ParseKeys | null {
  if (!error) return null;
  const status = /^resend_(\d{3})/.exec(error)?.[1];
  switch (status) {
    case '401':
      return 'notifications.hint.badKey';
    case '403':
      return 'notifications.hint.senderNotVerified';
    case '422':
      return 'notifications.hint.badRecipient';
    case '429':
      return 'notifications.hint.rateLimited';
    default:
      return null;
  }
}

const EVENT_KEYS: Record<(typeof LOG_EVENTS)[number], ParseKeys> = {
  booking_confirmed: 'notifications.event.booking_confirmed',
  pending_received: 'notifications.event.pending_received',
  reminder: 'notifications.event.reminder',
  rescheduled: 'notifications.event.rescheduled',
  cancelled: 'notifications.event.cancelled',
  manage_link: 'notifications.event.manage_link',
  review_request: 'notifications.event.review_request',
  staff_new_booking: 'notifications.event.staff_new_booking',
  staff_pending_approval: 'notifications.event.staff_pending_approval',
  staff_cancelled: 'notifications.event.staff_cancelled',
  staff_reminder: 'notifications.event.staff_reminder',
};

export function eventKey(event: string): ParseKeys {
  return (
    (EVENT_KEYS as Record<string, ParseKeys | undefined>)[event] ?? 'notifications.event.other'
  );
}

const CHANNEL_KEYS: Record<MessageChannel, ParseKeys> = {
  email: 'notifications.log.channel.email',
  sms: 'notifications.log.channel.sms',
  push: 'notifications.log.channel.push',
};

export function channelKey(channel: string): ParseKeys {
  return (
    (CHANNEL_KEYS as Record<string, ParseKeys | undefined>)[channel] ??
    'notifications.log.channel.push'
  );
}

const LEDGER_KEYS: Record<'purchase' | 'adjustment' | 'debit' | 'refund', ParseKeys> = {
  purchase: 'notifications.credits.kind.purchase',
  adjustment: 'notifications.credits.kind.adjustment',
  debit: 'notifications.credits.kind.debit',
  refund: 'notifications.credits.kind.refund',
};

export function ledgerKindKey(kind: keyof typeof LEDGER_KEYS): ParseKeys {
  return LEDGER_KEYS[kind];
}

export function encodingKey(encoding: string | null): ParseKeys | null {
  if (encoding === 'gsm7') return 'notifications.preview.gsm7';
  if (encoding === 'ucs2') return 'notifications.preview.ucs2';
  return null;
}

/** "+56" / "-56" / "0": credits with an explicit sign, grouped for the locale. */
export function formatCreditsSigned(amount: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCredits(amount: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
}

/** Quiet hours are off when start and end are the same minute (the database rule). */
export function quietHoursOff(startMinute: number, endMinute: number): boolean {
  return startMinute === endMinute;
}

/** Why an SMS may not go out, from what the screen knows. */
export type SmsReadiness = 'ready' | 'off' | 'no_credits' | 'no_rate';

export function smsReadiness(input: {
  smsEnabled: boolean;
  balance: number | null;
  rateAvailable: boolean | null;
  creditsPerMessage: number | null;
}): SmsReadiness {
  if (!input.smsEnabled) return 'off';
  if (input.rateAvailable === false) return 'no_rate';
  if (
    input.balance !== null &&
    input.creditsPerMessage !== null &&
    input.balance < input.creditsPerMessage
  ) {
    return 'no_credits';
  }
  return 'ready';
}

/** Keyset cursor for the message log and the credit ledger: the row id (monotonic, newest first). */
export type IdCursor = number;
