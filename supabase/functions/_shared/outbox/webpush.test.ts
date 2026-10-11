import { execFileSync } from 'node:child_process';
import { createPublicKey, createVerify, generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PushMessage } from './types.ts';
import { sendWebPush, type WebPushLib } from './webpush.ts';

const vapid = webpush.generateVAPIDKeys();
const config = {
  subject: 'mailto:test@example.com',
  publicKey: vapid.publicKey,
  privateKey: vapid.privateKey,
};

function browserKeys() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const p256dh = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x ?? '', 'base64url'),
    Buffer.from(jwk.y ?? '', 'base64url'),
  ]).toString('base64url');
  return { p256dh, auth: randomBytes(16).toString('base64url') };
}

const msg = (over: Partial<PushMessage> = {}): PushMessage => ({
  id: 'tok-1',
  token: 'https://push.example/sub/1',
  title: 'New booking',
  body: 'Ana · Cut · 10:00',
  platform: 'web',
  webKeys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
  url: '/calendar',
  ...over,
});

function failing(statusCode?: number): WebPushLib {
  return {
    sendNotification: async () => {
      throw Object.assign(new Error('x'), statusCode === undefined ? {} : { statusCode });
    },
  };
}

describe('sendWebPush status mapping (fake library)', () => {
  it('201 = delivered, payload carries title/body/url only', async () => {
    let seen = '';
    const lib: WebPushLib = {
      sendNotification: async (sub, payload) => {
        expect(sub.endpoint).toBe('https://push.example/sub/1');
        seen = payload;
        return {};
      },
    };
    const out = await sendWebPush(lib, config, [msg()]);
    expect(out).toMatchObject({ delivered: true, deadTokenIds: [], retryable: false });
    expect(JSON.parse(seen)).toEqual({
      title: 'New booking',
      body: 'Ana · Cut · 10:00',
      url: '/calendar',
    });
  });

  it.each([404, 410])('%i removes the subscription and is not retried', async (code) => {
    const out = await sendWebPush(failing(code), config, [msg()]);
    expect(out).toMatchObject({ delivered: false, deadTokenIds: ['tok-1'], retryable: false });
  });

  it.each([429, 500, 503, 408])('%i is retried and the subscription kept', async (code) => {
    const out = await sendWebPush(failing(code), config, [msg()]);
    expect(out).toMatchObject({ delivered: false, deadTokenIds: [], retryable: true });
  });

  it('a network error is retried', async () => {
    const out = await sendWebPush(failing(), config, [msg()]);
    expect(out).toMatchObject({ delivered: false, deadTokenIds: [], retryable: true });
  });

  it('400 / 401 / 403 / 413 are neither retried nor removed', async () => {
    for (const code of [400, 401, 403, 413]) {
      const out = await sendWebPush(failing(code), config, [msg()]);
      expect(out).toMatchObject({ delivered: false, deadTokenIds: [], retryable: false });
    }
  });

  it('one dead + one live device: delivered, the dead one is reported', async () => {
    const lib: WebPushLib = {
      sendNotification: async (sub) => {
        if (sub.endpoint.endsWith('/dead'))
          throw Object.assign(new Error('gone'), { statusCode: 410 });
        return {};
      },
    };
    const out = await sendWebPush(lib, config, [
      msg({ id: 'a', token: 'https://push.example/dead' }),
      msg({ id: 'b', token: 'https://push.example/live' }),
    ]);
    expect(out).toMatchObject({ delivered: true, deadTokenIds: ['a'] });
  });

  it('a row without keys is dead; an external url is replaced by /today', async () => {
    let seen = '';
    const lib: WebPushLib = { sendNotification: async (_s, p) => ((seen = p), {}) };
    const out = await sendWebPush(lib, config, [
      msg({ id: 'nokeys', webKeys: null }),
      msg({ id: 'ok', url: '//evil.example/x' }),
    ]);
    expect(out.deadTokenIds).toEqual(['nokeys']);
    expect(JSON.parse(seen).url).toBe('/today');
  });
});

describe('sendWebPush over real HTTPS to a fake push service (real web-push library)', () => {
  let server: Server;
  let port = 0;
  let canRun = true;
  const hits: {
    url: string;
    headers: Record<string, string | string[] | undefined>;
    bytes: number;
  }[] = [];
  let respond = 201;
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  beforeAll(async () => {
    try {
      const dir = mkdtempSync(join(tmpdir(), 'wp-'));
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'ec',
          '-pkeyopt',
          'ec_paramgen_curve:prime256v1',
          '-nodes',
          '-keyout',
          join(dir, 'k.pem'),
          '-out',
          join(dir, 'c.pem'),
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
        ],
        { stdio: 'ignore' },
      );
      server = createServer(
        { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) },
        (req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => {
            hits.push({
              url: req.url ?? '',
              headers: req.headers,
              bytes: Buffer.concat(chunks).length,
            });
            res.statusCode = respond;
            res.end();
          });
        },
      );
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      port = (server.address() as AddressInfo).port;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the fake service uses a self-signed cert
    } catch {
      canRun = false;
    }
  });
  afterAll(() => {
    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    server?.close();
  });

  it('sends an encrypted, VAPID-signed request; 201 delivered, then 410 removes it', async () => {
    if (!canRun) return;
    const m = msg({ token: `https://127.0.0.1:${port}/push/abc`, webKeys: browserKeys() });
    respond = 201;
    const ok = await sendWebPush(webpush as unknown as WebPushLib, config, [m]);
    expect(ok).toMatchObject({ delivered: true, deadTokenIds: [] });

    const h = hits[0];
    expect(h.url).toBe('/push/abc');
    expect(h.headers['content-encoding']).toBe('aes128gcm');
    expect(h.headers.ttl).toBe('3600');
    expect(h.headers.urgency).toBe('high');
    expect(h.bytes).toBeGreaterThan(80); // encrypted: header block + ciphertext, never the plain JSON

    // VAPID: "vapid t=<jwt>, k=<public key>"; verify the JWT signature with our public key.
    const auth = String(h.headers.authorization);
    const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth) ?? [];
    expect(k).toBe(config.publicKey);
    const [head, body, sig] = t.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(claims.aud).toBe(`https://127.0.0.1:${port}`);
    expect(claims.sub).toBe(config.subject);
    expect(claims.exp * 1000).toBeGreaterThan(Date.now());
    const raw = Buffer.from(config.publicKey, 'base64url');
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: raw.subarray(1, 33).toString('base64url'),
        y: raw.subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    const v = createVerify('SHA256').update(`${head}.${body}`);
    expect(v.verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);

    respond = 410;
    const gone = await sendWebPush(webpush as unknown as WebPushLib, config, [m]);
    expect(gone).toMatchObject({ delivered: false, deadTokenIds: ['tok-1'], retryable: false });

    respond = 503;
    const down = await sendWebPush(webpush as unknown as WebPushLib, config, [m]);
    expect(down).toMatchObject({ delivered: false, deadTokenIds: [], retryable: true });
  });
});
