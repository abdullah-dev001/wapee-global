import { describe, expect, it } from 'vitest';

import {
  formatAlertTime,
  renderAdminAlertEmail,
  sendAdminAlerts,
  type AdminAlert,
} from './adminAlert.ts';
import type { EmailMessage, ProviderResult } from './types.ts';

const SITE = 'https://app.example.com';

function alert(over: Partial<AdminAlert> = {}): AdminAlert {
  return {
    id: 'a1',
    to: 'admin@example.com',
    method: 'password',
    outcome: 'allowed',
    at: '2026-10-23T14:05:09Z',
    ...over,
  };
}

describe('renderAdminAlertEmail', () => {
  it('describes an allowed sign-in in UTC with a reset link', () => {
    const m = renderAdminAlertEmail(alert(), SITE);
    expect(m.subject).toBe('New sign-in to your super admin account');
    expect(m.text).toContain('signed in (password) at 2026-10-23 14:05 UTC');
    expect(m.text).toContain(`${SITE}/forgot-password`);
    expect(m.html).toContain(`<a href="${SITE}/forgot-password">`);
  });

  it('describes a refused Google attempt', () => {
    const m = renderAdminAlertEmail(alert({ method: 'oauth', outcome: 'refused' }), SITE);
    expect(m.subject).toBe('Refused sign-in attempt on your super admin account');
    expect(m.text).toContain('It was refused');
  });

  it('escapes the method in HTML', () => {
    const m = renderAdminAlertEmail(alert({ method: '<b>x</b>' }), SITE);
    expect(m.html).not.toContain('<b>x</b>');
  });

  it('keeps an unreadable time as given', () => {
    expect(formatAlertTime('not a date')).toBe('not a date');
  });
});

describe('sendAdminAlerts', () => {
  it('sends each alert once and records the outcome', async () => {
    const sent: EmailMessage[] = [];
    const finished: [string, boolean, string | null][] = [];
    const results: Record<string, ProviderResult> = {
      a1: { ok: true, id: 'r1' },
      a2: { ok: false, retryable: true, code: 'resend_500', message: 'down' },
    };
    const n = await sendAdminAlerts({
      claim: async () => [alert(), alert({ id: 'a2' }), alert({ id: 'a3', to: null })],
      finish: async (id, ok, err) => {
        finished.push([id, ok, err]);
      },
      sendEmail: async (m) => {
        sent.push(m);
        return results[m.idempotencyKey.replace('admin_alert:', '')]!;
      },
      siteUrl: SITE,
    });
    expect(n).toBe(1);
    expect(sent.map((m) => m.idempotencyKey)).toEqual(['admin_alert:a1', 'admin_alert:a2']);
    expect(sent[0]!.unsubscribeUrl).toBeNull();
    expect(finished).toEqual([
      ['a1', true, null],
      ['a2', false, 'resend_500: down'],
      ['a3', false, 'no_address'],
    ]);
  });

  it('a thrown send is recorded as a failure, not lost', async () => {
    const finished: [string, boolean, string | null][] = [];
    await sendAdminAlerts({
      claim: async () => [alert()],
      finish: async (id, ok, err) => {
        finished.push([id, ok, err]);
      },
      sendEmail: async () => {
        throw new Error('timeout');
      },
      siteUrl: SITE,
    });
    expect(finished).toEqual([['a1', false, 'exception: timeout']]);
  });
});
