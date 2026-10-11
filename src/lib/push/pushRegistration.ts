import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

import { disableWebPush, enableWebPush, readWebPushState, WebPushError } from './webPush';

/**
 * Expo push registration for THIS device (business users: new booking,
 * cancellation, pending approval, reminder).
 *
 * Nothing here runs on load and nothing prompts by itself: `enablePush()` is the
 * one function that asks for permission, and the UI calls it from a button.
 * `expo-notifications` is imported lazily, so an app build without the native
 * module (or the web bundle) still starts; only enabling push needs it.
 *
 * On the web the same three calls delegate to `webPush.ts` (VAPID Web Push).
 */

export type PushStatus =
  /** A simulator without push, the native module is missing, or the browser has no Web Push. */
  | 'unsupported'
  /** iPhone / iPad Safari tab: Web Push works only once installed to the Home Screen. */
  | 'needs_install'
  /** No EAS project id in the app config, so Expo cannot issue a token. */
  | 'not_configured'
  /** The user refused (or later turned off) the system permission. */
  | 'blocked'
  /** Permission not asked yet, or asked and granted but this device is not registered. */
  | 'off'
  /** This device holds a registered token. */
  | 'on';

export type PushState = { status: PushStatus; token: string | null };

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

async function notifications() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    // The native module is not in this build: treated as "unsupported".
    return null;
  }
}

/** Reads the current state WITHOUT prompting. */
export async function readPushState(registeredTokens: readonly string[]): Promise<PushState> {
  if (Platform.OS === 'web') return readWebPushState(registeredTokens);
  const N = await notifications();
  if (!N) return { status: 'unsupported', token: null };
  if (!projectId()) return { status: 'not_configured', token: null };
  const perm = await N.getPermissionsAsync();
  if (perm.status === 'denied') return { status: 'blocked', token: null };
  if (perm.status !== 'granted') return { status: 'off', token: null };
  const { data } = await N.getExpoPushTokenAsync({ projectId: projectId() ?? undefined });
  return { status: registeredTokens.includes(data) ? 'on' : 'off', token: data };
}

export class PushError extends Error {
  constructor(
    public readonly reason:
      'unsupported' | 'not_configured' | 'needs_install' | 'blocked' | 'rejected',
  ) {
    super(reason);
  }
}

/** Asks for permission (system prompt), gets the token and registers it. Call from a tap. */
export async function enablePush(): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      return await enableWebPush();
    } catch (error) {
      if (error instanceof WebPushError) throw new PushError(error.reason);
      throw error;
    }
  }
  const N = await notifications();
  if (!N) throw new PushError('unsupported');
  const id = projectId();
  if (!id) throw new PushError('not_configured');

  if (Platform.OS === 'android') {
    // Android 8+ needs a channel before any notification can show.
    await N.setNotificationChannelAsync('default', {
      name: 'default',
      importance: N.AndroidImportance.DEFAULT,
    });
  }

  let perm = await N.getPermissionsAsync();
  if (perm.status !== 'granted') perm = await N.requestPermissionsAsync();
  if (perm.status !== 'granted') throw new PushError('blocked');

  const { data: token } = await N.getExpoPushTokenAsync({ projectId: id });
  const { data, error } = await getSupabase().rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw new Error(error.message);
  if ((data as { ok?: boolean } | null)?.ok !== true) throw new PushError('rejected');
  return token;
}

/** Forgets this device (turn off, or sign out). Safe to call when nothing is registered. */
export async function disablePush(): Promise<void> {
  if (Platform.OS === 'web') return disableWebPush();
  const N = await notifications();
  if (!N || !projectId()) return;
  const perm = await N.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  const { data: token } = await N.getExpoPushTokenAsync({ projectId: projectId() ?? undefined });
  const { error } = await getSupabase().rpc('unregister_push_token', { p_token: token });
  if (error) throw new Error(error.message);
}
