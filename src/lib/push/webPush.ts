import { getSupabase } from '@/lib/supabase';

import type { PushState } from './pushRegistration';

/**
 * Web Push (VAPID) for the PWA / browser. Web only: callers check `Platform.OS`.
 *
 * Nothing here runs on load. `enableWebPush()` is the one function that asks for
 * permission and it is called from a button. The subscription (endpoint + keys)
 * is stored in `push_tokens` with platform = 'web'. The service worker
 * (`public/sw.js`) shows the notification and opens the right screen on tap.
 *
 * iPhone / iPad Safari only supports Web Push for an app INSTALLED to the Home
 * Screen (iOS 16.4+): in a normal tab the state is `needs_install`.
 */

export type WebPushFailure =
  'unsupported' | 'not_configured' | 'needs_install' | 'blocked' | 'rejected';

export class WebPushError extends Error {
  constructor(public readonly reason: WebPushFailure) {
    super(reason);
  }
}

function vapidPublicKey(): string | null {
  return process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || null;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ reports a Mac user agent but has touch points.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  );
}

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

export type WebSupport = 'ok' | 'unsupported' | 'not_configured' | 'needs_install';

/** What this browser can do, without prompting. */
export function webPushSupport(): WebSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (isIos() && !isInstalled()) return 'needs_install';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!vapidPublicKey()) return 'not_configured';
  return 'ok';
}

function toKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** The registration, or null when no service worker is active (the SW is registered in production builds only). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

export async function readWebPushState(registeredTokens: readonly string[]): Promise<PushState> {
  const support = webPushSupport();
  if (support !== 'ok') return { status: support, token: null };
  if (Notification.permission === 'denied') return { status: 'blocked', token: null };
  const reg = await registration();
  if (!reg) return { status: 'unsupported', token: null };
  const sub = await reg.pushManager.getSubscription();
  if (Notification.permission !== 'granted' || !sub) return { status: 'off', token: null };
  return { status: registeredTokens.includes(sub.endpoint) ? 'on' : 'off', token: sub.endpoint };
}

/** Asks for permission (browser prompt), subscribes and registers. Call from a tap. */
export async function enableWebPush(): Promise<string> {
  const support = webPushSupport();
  if (support !== 'ok') throw new WebPushError(support);
  const key = vapidPublicKey();
  const reg = await registration();
  if (!key || !reg) throw new WebPushError('unsupported');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new WebPushError('blocked');

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  const keys = sub.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) throw new WebPushError('rejected');

  const { data, error } = await getSupabase().rpc('register_web_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) throw new Error(error.message);
  if ((data as { ok?: boolean } | null)?.ok !== true) throw new WebPushError('rejected');
  return sub.endpoint;
}

/** Forgets this browser (turn off, or sign out). Safe to call when nothing is registered. */
export async function disableWebPush(): Promise<void> {
  if (webPushSupport() !== 'ok') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await getSupabase().rpc('unregister_push_token', { p_token: sub.endpoint });
  await sub.unsubscribe();
  if (error) throw new Error(error.message);
}
