import { Platform } from 'react-native';

import { brand } from '@/config/brand';

/** The route that handles an invite link. */
export const INVITE_PATH = '/accept-invite';

/**
 * The link the inviter copies and sends.
 *
 * Always an https URL, never a `wapee://` deep link: the recipient opens it in
 * whatever browser they have, often on another device, and a custom scheme would
 * only work if they already had the app. On web we use the current origin so a
 * link made on localhost stays usable in development; on native there is no
 * origin, so the configured app URL is used.
 */
export function buildInviteUrl(token: string): string {
  const path = `${INVITE_PATH}?token=${encodeURIComponent(token)}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new URL(path, window.location.origin).toString();
  }
  return new URL(path, brand.urls.app).toString();
}
