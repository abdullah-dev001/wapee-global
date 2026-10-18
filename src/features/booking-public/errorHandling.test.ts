import { describe, expect, it } from 'vitest';

import { EMAIL_FIELD_ID, actionFor } from './errorHandling';

describe('actionFor', () => {
  it('rate_limited carries the retry time and no automatic retry', () => {
    expect(actionFor('rate_limited', { retryAfterSeconds: 42 })).toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: 42,
    });
  });

  it('defaults retryAfterSeconds to 60 when not given', () => {
    expect(actionFor('rate_limited')).toEqual({ kind: 'rate_limited', retryAfterSeconds: 60 });
  });

  it('too_fast retries once automatically', () => {
    expect(actionFor('too_fast')).toEqual({ kind: 'retry_once' });
  });

  it('slot_unavailable refreshes the slot grid', () => {
    expect(actionFor('slot_unavailable')).toEqual({ kind: 'refresh_slots' });
  });

  it('missing_answer highlights the named field as missing', () => {
    expect(actionFor('missing_answer', { fieldId: 'f1' })).toEqual({
      kind: 'highlight_field',
      fieldId: 'f1',
      message: 'missing',
    });
  });

  it('email_required highlights the built-in email field as missing', () => {
    expect(actionFor('email_required', { fieldId: 'ignored' })).toEqual({
      kind: 'highlight_field',
      fieldId: EMAIL_FIELD_ID,
      message: 'missing',
    });
  });

  it.each(['invalid_answer', 'invalid_phone', 'invalid_name'] as const)(
    '%s highlights the field as invalid',
    (code) => {
      expect(actionFor(code, { fieldId: 'f2' })).toEqual({
        kind: 'highlight_field',
        fieldId: 'f2',
        message: 'invalid',
      });
    },
  );

  it('not_found (website, widget) is the same generic not-available page', () => {
    expect(actionFor('not_found')).toEqual({ kind: 'not_available' });
  });

  it('not_bookable shows the generic not-available page', () => {
    expect(actionFor('not_bookable')).toEqual({ kind: 'not_available' });
  });

  it.each(['bad_request', 'server_error', 'network_error'] as const)(
    '%s shows a retry button',
    (code) => {
      expect(actionFor(code)).toEqual({ kind: 'retry_button' });
    },
  );

  it('invalid_token shows the generic invalid-link page', () => {
    expect(actionFor('invalid_token')).toEqual({ kind: 'invalid_link' });
  });

  it.each(['cancel_window_passed', 'not_cancellable'] as const)('%s is not allowed', (code) => {
    expect(actionFor(code)).toEqual({ kind: 'not_allowed' });
  });
});
