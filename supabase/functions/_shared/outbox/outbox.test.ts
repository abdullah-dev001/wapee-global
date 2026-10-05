import { describe, expect, it } from 'vitest';

import { processJob } from './process.ts';
import { escapeHtml, formatWhen, renderEmail, renderPush, renderSms } from './templates.ts';
import type {
  Deps,
  EmailMessage,
  Job,
  ProviderResult,
  PushOutcome,
  ReserveResult,
} from './types.ts';
import { signUnsubscribe, verifyUnsubscribe } from './unsubscribe.ts';

const RAW = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const HASH = 'f'.repeat(64);
const KEY = 'test-signing-key';
const NOW = Date.UTC(2027, 5, 1);

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    channel: 'email',
    event: 'booking_confirmed',
    attempt: 1,
    idempotency_key: 'booking_confirmed:appt-1',
    business_id: 'biz-1',
    branch_id: 'br-1',
    business_name: 'Nova Hair Studio',
    language: 'en',
    slug: 'nova-hair',
    branch_name: 'Main',
    branch_address: '1 High Street',
    branch_phone: null,
    timezone: 'Europe/London',
    starts_at: '2027-06-15T09:00:00Z',
    appointment_status: 'confirmed',
    service_name: 'Cut',
    staff_name: 'Sam',
    client_first_name: 'Mia',
    client_name: 'Mia Mail',
    payload: {},
    token: null,
    to: 'mia@example.com',
    recipient_hash: HASH,
    tokens: [],
    ...over,
  };
}

type Calls = {
  complete: unknown[][];
  fail: unknown[][];
  suppress: unknown[][];
  reserve: unknown[][];
  removeDead: unknown[][];
  emails: EmailMessage[];
  sms: { to: string; body: string }[];
  push: unknown[][];
};

function deps(
  opts: {
    email?: ProviderResult;
    sms?: ProviderResult;
    reserve?: ReserveResult;
    push?: PushOutcome;
    throwEmail?: boolean;
  } = {},
): { d: Deps; calls: Calls } {
  const calls: Calls = {
    complete: [],
    fail: [],
    suppress: [],
    reserve: [],
    removeDead: [],
    emails: [],
    sms: [],
    push: [],
  };
  const d: Deps = {
    db: {
      reserveSms: async (id, body) => {
        calls.reserve.push([id, body]);
        return (
          opts.reserve ?? {
            ok: true,
            to: '+447700900222',
            segments: 1,
            encoding: 'gsm7',
            credits: 56,
          }
        );
      },
      complete: async (...a) => void calls.complete.push(a),
      fail: async (...a) => void calls.fail.push(a),
      suppress: async (...a) => void calls.suppress.push(a),
      removeDeadTokens: async (...a) => void calls.removeDead.push(a),
    },
    providers: {
      sendEmail: async (m) => {
        if (opts.throwEmail) throw new TypeError('network down for mia@example.com');
        calls.emails.push(m);
        return opts.email ?? { ok: true, id: 're_1' };
      },
      sendSms: async (m) => {
        calls.sms.push(m);
        return opts.sms ?? { ok: true, id: 'SM1' };
      },
      sendPush: async (m) => {
        calls.push.push([m]);
        return opts.push ?? { delivered: true, deadTokenIds: [], retryable: false, message: 'ok' };
      },
    },
    config: {
      publicSiteUrl: 'https://wapee.site',
      unsubscribeUrl: 'https://x.supabase.co/functions/v1/unsubscribe',
      signingKey: KEY,
      now: () => NOW,
    },
  };
  return { d, calls };
}

describe('templates', () => {
  it('renders a short plain English confirmation from the business, not the product', () => {
    const m = renderEmail(job({ token: RAW }), {
      manageUrl: 'https://wapee.site/nova-hair/manage#token=abc',
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(m?.subject).toBe('Your booking at Nova Hair Studio is confirmed');
    expect(m?.text).toContain('Hi Mia,');
    expect(m?.text).toContain('Your Cut at Nova Hair Studio is confirmed for');
    expect(m?.text).toContain('1 High Street');
    expect(m?.text).toContain('Need to change it? https://wapee.site/nova-hair/manage#token=abc');
    expect(`${m?.subject}${m?.text}${m?.html}`.toLowerCase()).not.toContain('wapee global');
  });

  it('formats the time in the BRANCH timezone (BST vs GMT)', () => {
    expect(formatWhen('2027-06-15T09:00:00Z', 'Europe/London', 'en')).toContain('10:00');
    expect(formatWhen('2027-01-15T09:00:00Z', 'Europe/London', 'en')).toContain('9:00');
    expect(formatWhen('2027-06-15T09:00:00Z', 'Asia/Karachi', 'en')).toContain('2:00');
  });

  it('falls back to English for an unknown language and a bad timezone does not throw', () => {
    expect(
      renderEmail(job({ language: 'ur' }), {
        manageUrl: null,
        reviewUrl: null,
        unsubscribeUrl: null,
      })?.subject,
    ).toContain('confirmed');
    expect(
      renderEmail(job({ language: 'en-GB' }), {
        manageUrl: null,
        reviewUrl: null,
        unsubscribeUrl: null,
      })?.subject,
    ).toContain('confirmed');
    expect(() => formatWhen('2027-06-15T09:00:00Z', 'Not/AZone', 'en')).not.toThrow();
  });

  it('pending and rescheduled-to-pending use the request wording', () => {
    const pending = renderEmail(job({ event: 'pending_received' }), {
      manageUrl: 'https://x/y',
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(pending?.text).toContain('will confirm it soon');
    expect(pending?.text).toContain('View or change your request: https://x/y');
    const moved = renderEmail(job({ event: 'rescheduled', appointment_status: 'pending' }), {
      manageUrl: 'https://x/y',
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(moved?.text).toContain('View or change your request');
  });

  it('a cancellation never carries a manage link', () => {
    const m = renderEmail(job({ event: 'cancelled' }), {
      manageUrl: 'https://x/y',
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(m?.text).not.toContain('https://x/y');
  });

  it('escapes HTML in names and links the URLs', () => {
    const m = renderEmail(job({ client_first_name: '<b>Mia</b>', business_name: 'A & B' }), {
      manageUrl: 'https://wapee.site/a/manage#token=z',
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(m?.html).toContain('&lt;b&gt;Mia&lt;/b&gt;');
    expect(m?.html).toContain('A &amp; B');
    expect(m?.html).toContain('<a href="https://wapee.site/a/manage#token=z">');
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });

  it('an empty first name does not leave "Hi ,"', () => {
    const m = renderEmail(job({ client_first_name: '' }), {
      manageUrl: null,
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(m?.text).not.toContain('Hi ,');
  });

  it('SMS is one short line with the link last; cancelled has none', () => {
    const body = renderSms(job({ channel: 'sms', event: 'manage_link' }), {
      manageUrl: 'https://wapee.site/n/manage#token=z',
      reviewUrl: null,
      unsubscribeUrl: null,
    });
    expect(body?.startsWith('Nova Hair Studio: manage your booking:')).toBe(true);
    expect(body?.endsWith('https://wapee.site/n/manage#token=z')).toBe(true);
    expect(
      renderSms(job({ channel: 'sms', event: 'cancelled' }), {
        manageUrl: 'https://x/y',
        reviewUrl: null,
        unsubscribeUrl: null,
      }),
    ).not.toContain('https://x/y');
  });

  it('push templates exist only for staff events', () => {
    expect(renderPush(job({ channel: 'push', event: 'staff_new_booking' }))?.title).toBe(
      'New booking',
    );
    expect(renderPush(job({ channel: 'push', event: 'staff_new_booking' }))?.body).toContain(
      'Mia Mail',
    );
    expect(renderPush(job({ channel: 'push', event: 'reminder' }))).toBeNull();
  });
});

describe('unsubscribe links', () => {
  const payload = { b: 'biz-1', c: 'email' as const, h: HASH, e: NOW + 1000 };

  it('round-trips and carries no address', async () => {
    const t = await signUnsubscribe(KEY, payload);
    expect(await verifyUnsubscribe(KEY, t, NOW)).toEqual(payload);
    expect(atob(t.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('@');
  });

  it('a forged signature, edited payload, wrong key or other business does nothing', async () => {
    const t = await signUnsubscribe(KEY, payload);
    const [body, sig] = t.split('.') as [string, string];
    expect(await verifyUnsubscribe(KEY, `${body}.${'0'.repeat(sig.length)}`, NOW)).toBeNull();
    expect(await verifyUnsubscribe('other-key', t, NOW)).toBeNull();
    const edited = btoa(JSON.stringify({ ...payload, b: 'biz-2' })).replace(/=+$/, '');
    expect(await verifyUnsubscribe(KEY, `${edited}.${sig}`, NOW)).toBeNull();
    expect(await verifyUnsubscribe(KEY, `${body}.${sig}x`, NOW)).toBeNull();
  });

  it('an expired link does nothing', async () => {
    const t = await signUnsubscribe(KEY, { ...payload, e: NOW - 1 });
    expect(await verifyUnsubscribe(KEY, t, NOW)).toBeNull();
  });

  it('garbage, empty, missing key and oversized tokens do nothing', async () => {
    for (const bad of ['', 'abc', 'a.b.c', '....', null, undefined, 'x'.repeat(5000)]) {
      expect(await verifyUnsubscribe(KEY, bad as string, NOW)).toBeNull();
    }
    const t = await signUnsubscribe(KEY, payload);
    expect(await verifyUnsubscribe('', t, NOW)).toBeNull();
  });

  it('a correctly signed token with a malformed hash or channel is refused', async () => {
    expect(
      await verifyUnsubscribe(KEY, await signUnsubscribe(KEY, { ...payload, h: 'short' }), NOW),
    ).toBeNull();
    expect(
      await verifyUnsubscribe(
        KEY,
        await signUnsubscribe(KEY, { ...payload, c: 'push' as unknown as 'email' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('refuses to sign without a key', async () => {
    await expect(signUnsubscribe('', payload)).rejects.toThrow();
  });
});

describe('processJob: email', () => {
  it('sends, completes, forwards the idempotency key, and builds the manage link from the token', async () => {
    const { d, calls } = deps();
    const out = await processJob(job({ token: RAW }), d);
    expect(out).toBe('sent');
    expect(calls.emails[0]?.idempotencyKey).toBe('booking_confirmed:appt-1');
    expect(calls.emails[0]?.text).toContain(`https://wapee.site/nova-hair/manage#token=${RAW}`);
    expect(calls.complete[0]).toEqual(['job-1', 'resend', 're_1', []]);
    expect(calls.fail).toHaveLength(0);
  });

  it('the raw token reaches ONLY the message, never any database call', async () => {
    const { d, calls } = deps();
    await processJob(job({ token: RAW }), d);
    expect(
      JSON.stringify([calls.complete, calls.fail, calls.suppress, calls.reserve, calls.removeDead]),
    ).not.toContain(RAW);
  });

  it('a review request links the review page and carries a signed unsubscribe link', async () => {
    const { d, calls } = deps();
    await processJob(job({ event: 'review_request', token: RAW }), d);
    const m = calls.emails[0]!;
    expect(m.text).toContain(`https://wapee.site/nova-hair/review#token=${RAW}`);
    // The email links the confirm PAGE (token in the fragment); the one-click header POSTs to the function.
    expect(m.unsubscribeUrl).toMatch(/^https:\/\/wapee\.site\/unsubscribe#token=/);
    expect(m.oneClickUrl).toMatch(/^https:\/\/x\.supabase\.co\/functions\/v1\/unsubscribe\?t=/);
    const t = decodeURIComponent(m.unsubscribeUrl!.split('#token=')[1]!);
    expect(await verifyUnsubscribe(KEY, t, NOW)).toMatchObject({ b: 'biz-1', c: 'email', h: HASH });
  });

  it('transactional emails have NO unsubscribe link; reminders do', async () => {
    const a = deps();
    await processJob(job(), a.d);
    expect(a.calls.emails[0]?.unsubscribeUrl).toBeNull();
    expect(a.calls.emails[0]?.oneClickUrl).toBeNull();
    const b = deps();
    await processJob(job({ event: 'reminder' }), b.d);
    expect(b.calls.emails[0]?.unsubscribeUrl).not.toBeNull();
  });

  it('a retryable provider error is reported as retryable, a permanent one is not', async () => {
    const r = deps({ email: { ok: false, retryable: true, code: 'resend_503', message: 'down' } });
    expect(await processJob(job(), r.d)).toBe('retry');
    expect(r.calls.fail[0]).toEqual(['job-1', 'resend_503: down', true, false]);
    const p = deps({
      email: { ok: false, retryable: false, code: 'resend_422', message: 'validation_error' },
    });
    expect(await processJob(job(), p.d)).toBe('dead');
    expect(p.calls.fail[0]?.[2]).toBe(false);
  });

  it('a definite provider refusal is passed on so the retry can use a fresh key; an ambiguous one is not', async () => {
    const a = deps({
      email: {
        ok: false,
        retryable: true,
        code: 'resend_429',
        message: 'rate_limit_exceeded',
        definite: true,
      },
    });
    await processJob(job(), a.d);
    expect(a.calls.fail[0]).toEqual(['job-1', 'resend_429: rate_limit_exceeded', true, true]);
    const b = deps({
      email: { ok: false, retryable: true, code: 'resend_503', message: 'x', definite: false },
    });
    await processJob(job(), b.d);
    expect(b.calls.fail[0]?.[3]).toBe(false);
  });

  it('a provider that throws becomes a retryable failure with no payload in the message', async () => {
    const { d, calls } = deps({ throwEmail: true });
    expect(await processJob(job(), d)).toBe('retry');
    expect(calls.fail[0]).toEqual(['job-1', 'exception: TypeError', true, false]);
    expect(JSON.stringify(calls.fail)).not.toContain('mia@example.com');
  });

  it('a link event without a token is refused, nothing is sent', async () => {
    const { d, calls } = deps();
    expect(await processJob(job({ event: 'manage_link', token: null }), d)).toBe('dead');
    expect(calls.emails).toHaveLength(0);
    expect(calls.fail[0]).toEqual(['job-1', 'missing_token', false, false]);
  });

  it('a staff event on the email channel is refused', async () => {
    const { d, calls } = deps();
    expect(await processJob(job({ event: 'staff_new_booking' }), d)).toBe('dead');
    expect(calls.emails).toHaveLength(0);
  });
});

describe('processJob: sms', () => {
  const sms = (over: Partial<Job> = {}) =>
    job({ channel: 'sms', to: '+447700900222', event: 'manage_link', token: RAW, ...over });

  it('reserves credit BEFORE calling the provider, sends to the reserved number, then completes', async () => {
    const { d, calls } = deps();
    expect(await processJob(sms(), d)).toBe('sent');
    expect(calls.reserve).toHaveLength(1);
    expect(calls.sms[0]?.to).toBe('+447700900222');
    expect(calls.sms[0]?.body).toContain(`manage#token=${RAW}`);
    expect(calls.complete[0]).toEqual(['job-1', 'twilio', 'SM1', []]);
  });

  it('no rate / no credits: the provider is never called', async () => {
    for (const code of ['no_rate', 'skipped_no_credits']) {
      const { d, calls } = deps({ reserve: { ok: false, code } });
      expect(await processJob(sms(), d)).toBe('skipped');
      expect(calls.sms).toHaveLength(0);
      expect(calls.complete).toHaveLength(0);
      expect(calls.fail).toHaveLength(0);
    }
  });

  it('a provider failure calls fail (the database refunds the debit)', async () => {
    const { d, calls } = deps({
      sms: { ok: false, retryable: true, code: 'twilio_503', message: 'twilio 503' },
    });
    expect(await processJob(sms(), d)).toBe('retry');
    expect(calls.fail[0]).toEqual(['job-1', 'twilio_503: twilio 503', true, false]);
  });

  it('Twilio 21610 (recipient replied STOP) suppresses the number and is not retried', async () => {
    const { d, calls } = deps({
      sms: { ok: false, retryable: false, code: '21610', message: 'twilio 400' },
    });
    expect(await processJob(sms(), d)).toBe('dead');
    expect(calls.suppress[0]).toEqual(['biz-1', 'sms', HASH, 'provider_stop']);
    expect(calls.fail[0]).toEqual(['job-1', 'recipient_opted_out', false, false]);
  });

  it('never sends to a number the database did not hand back', async () => {
    const { d, calls } = deps({
      reserve: { ok: true, to: '+12025550123', segments: 1, encoding: 'gsm7', credits: 12 },
    });
    await processJob(sms({ to: '+447700900222' }), d);
    expect(calls.sms[0]?.to).toBe('+12025550123');
  });
});

describe('processJob: push', () => {
  const push = (over: Partial<Job> = {}) =>
    job({
      channel: 'push',
      event: 'staff_cancelled',
      to: null,
      recipient_hash: null,
      tokens: [
        { id: 't1', token: 'ExponentPushToken[a]' },
        { id: 't2', token: 'ExponentPushToken[b]' },
      ],
      ...over,
    });

  it('sends one message per device and removes dead tokens on success', async () => {
    const { d, calls } = deps({
      push: { delivered: true, deadTokenIds: ['t2'], retryable: false, message: 'ok' },
    });
    expect(await processJob(push(), d)).toBe('sent');
    expect((calls.push[0]?.[0] as unknown[]).length).toBe(2);
    expect(calls.complete[0]).toEqual(['job-1', 'expo', null, ['t2']]);
  });

  it('all devices dead: tokens removed, not retried', async () => {
    const { d, calls } = deps({
      push: {
        delivered: false,
        deadTokenIds: ['t1', 't2'],
        retryable: true,
        message: 'expo rejected',
      },
    });
    expect(await processJob(push(), d)).toBe('dead');
    expect(calls.removeDead[0]).toEqual(['job-1', ['t1', 't2']]);
    expect(calls.fail[0]?.[2]).toBe(false);
  });

  it('an Expo outage is retryable and removes nothing', async () => {
    const { d, calls } = deps({
      push: { delivered: false, deadTokenIds: [], retryable: true, message: 'expo 503' },
    });
    expect(await processJob(push(), d)).toBe('retry');
    expect(calls.removeDead).toHaveLength(0);
  });
});
