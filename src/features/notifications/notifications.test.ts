import { describe, expect, it } from 'vitest';

import {
  channelKey,
  codeKey,
  encodingKey,
  ledgerKindKey,
  eventKey,
  formatCredits,
  formatCreditsSigned,
  isMessageStatus,
  quietHoursOff,
  smsReadiness,
  statusKey,
  statusTone,
} from './messageLogic';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  notificationSettingsSchema,
  sameSettings,
} from './schemas/notificationSettings.schema';

describe('message status and codes', () => {
  it('maps each status to a tone and an i18n key', () => {
    expect(statusTone('sent')).toBe('success');
    expect(statusTone('failed')).toBe('error');
    expect(statusTone('skipped')).toBe('warning');
    expect(statusTone('queued')).toBe('info');
    expect(statusKey('skipped')).toBe('notifications.status.skipped');
  });

  it('recognises statuses and rejects anything else', () => {
    expect(isMessageStatus('sent')).toBe(true);
    expect(isMessageStatus('weird')).toBe(false);
    expect(isMessageStatus(null)).toBe(false);
  });

  it('known codes get their own key, unknown ones fall back to "other", none is null', () => {
    expect(codeKey('skipped_no_credits')).toBe('notifications.code.skipped_no_credits');
    expect(codeKey('no_rate')).toBe('notifications.code.no_rate');
    expect(codeKey('something_new')).toBe('notifications.code.other');
    expect(codeKey(null)).toBeNull();
    expect(codeKey('')).toBeNull();
  });

  it('channels, ledger kinds and encodings map to keys', () => {
    expect(channelKey('sms')).toBe('notifications.log.channel.sms');
    expect(ledgerKindKey('refund')).toBe('notifications.credits.kind.refund');
    expect(encodingKey('ucs2')).toBe('notifications.preview.ucs2');
    expect(encodingKey('weird')).toBeNull();
  });

  it('events map to keys; unknown events fall back', () => {
    expect(eventKey('reminder')).toBe('notifications.event.reminder');
    expect(eventKey('staff_cancelled')).toBe('notifications.event.staff_cancelled');
    expect(eventKey('nope')).toBe('notifications.event.other');
  });
});

describe('credits formatting and SMS readiness', () => {
  it('formats signed credit amounts', () => {
    expect(formatCreditsSigned(56, 'en')).toBe('+56');
    expect(formatCreditsSigned(-1056, 'en')).toBe('-1,056');
    expect(formatCreditsSigned(0, 'en')).toBe('0');
    expect(formatCredits(1234567, 'en')).toBe('1,234,567');
  });

  it('SMS readiness: off, no rate, not enough credits, ready', () => {
    const base = { smsEnabled: true, balance: 500, rateAvailable: true, creditsPerMessage: 56 };
    expect(smsReadiness({ ...base, smsEnabled: false })).toBe('off');
    expect(smsReadiness({ ...base, rateAvailable: false })).toBe('no_rate');
    expect(smsReadiness({ ...base, balance: 10 })).toBe('no_credits');
    expect(smsReadiness(base)).toBe('ready');
    expect(smsReadiness({ ...base, balance: null })).toBe('ready');
  });

  it('quiet hours are off when start equals end', () => {
    expect(quietHoursOff(480, 480)).toBe(true);
    expect(quietHoursOff(1260, 480)).toBe(false);
  });
});

describe('notification settings schema', () => {
  it('accepts the defaults', () => {
    expect(notificationSettingsSchema.safeParse(DEFAULT_NOTIFICATION_SETTINGS).success).toBe(true);
  });

  it('refuses reminder hours outside 1-72 and quiet minutes outside a day', () => {
    const bad = (patch: object) =>
      notificationSettingsSchema.safeParse({ ...DEFAULT_NOTIFICATION_SETTINGS, ...patch }).success;
    expect(bad({ reminderHoursBefore: 0 })).toBe(false);
    expect(bad({ reminderHoursBefore: 73 })).toBe(false);
    expect(bad({ reminderHoursBefore: 1.5 })).toBe(false);
    expect(bad({ reminderHoursBefore: 72 })).toBe(true);
    expect(bad({ quietStartMinute: 1440 })).toBe(false);
    expect(bad({ quietEndMinute: -1 })).toBe(false);
  });

  it('compares settings field by field', () => {
    expect(sameSettings(DEFAULT_NOTIFICATION_SETTINGS, { ...DEFAULT_NOTIFICATION_SETTINGS })).toBe(
      true,
    );
    expect(
      sameSettings(DEFAULT_NOTIFICATION_SETTINGS, {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        smsEnabled: true,
      }),
    ).toBe(false);
  });
});
