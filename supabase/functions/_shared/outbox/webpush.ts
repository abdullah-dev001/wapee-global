/**
 * Web Push (VAPID) sender. The library is INJECTED so this file has no Deno-only
 * import and can be unit-tested in Node with a fake push service.
 *
 * Status mapping (RFC 8030 push services): 404 / 410 = the subscription is gone
 * (forget it); 408 / 429 / 5xx = try again later; any other 4xx = this payload or
 * subscription is refused (not retried, not removed).
 */
import type { PushMessage, PushOutcome } from './types.ts';

export type WebPushLib = {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: {
      TTL: number;
      urgency: 'very-low' | 'low' | 'normal' | 'high';
      timeout: number;
      vapidDetails: { subject: string; publicKey: string; privateKey: string };
    },
  ): Promise<unknown>;
};

export type WebPushConfig = { subject: string; publicKey: string; privateKey: string };

const TTL_SECONDS = 60 * 60; // a stale "new booking" is useless after an hour
const TIMEOUT_MS = 10_000;

function statusOf(err: unknown): number | null {
  const s = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof s === 'number' ? s : null;
}

/** Only same-origin paths may be opened by a tap. */
function safePath(url: string | undefined): string {
  return url && /^\/[^/\\]/.test(url) ? url : '/today';
}

export async function sendWebPush(
  lib: WebPushLib,
  config: WebPushConfig,
  messages: PushMessage[],
): Promise<PushOutcome> {
  const dead: string[] = [];
  let delivered = false;
  let retryable = false;
  let last = 'no_web_tokens';

  for (const m of messages) {
    if (!m.webKeys) {
      dead.push(m.id); // a web row without keys can never be sent to
      continue;
    }
    try {
      await lib.sendNotification(
        { endpoint: m.token, keys: m.webKeys },
        JSON.stringify({ title: m.title, body: m.body, url: safePath(m.url) }),
        {
          TTL: TTL_SECONDS,
          urgency: 'high',
          timeout: TIMEOUT_MS,
          vapidDetails: config,
        },
      );
      delivered = true;
    } catch (err) {
      const status = statusOf(err);
      if (status === 404 || status === 410) {
        dead.push(m.id);
        last = `webpush ${status}`;
      } else if (status === null || status === 408 || status === 429 || status >= 500) {
        retryable = true; // network error, timeout or a push-service hiccup
        last = status === null ? 'webpush network' : `webpush ${status}`;
      } else {
        last = `webpush ${status}`;
      }
    }
  }
  return {
    delivered,
    deadTokenIds: dead,
    retryable: !delivered && retryable,
    message: delivered ? 'ok' : last,
  };
}
