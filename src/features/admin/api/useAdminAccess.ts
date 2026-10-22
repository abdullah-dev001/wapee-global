import { useEffect, useMemo, useState } from 'react';

import { useSession } from '@/features/auth';
import { useMyProfile } from '@/lib/permissions';

import {
  ADMIN_SESSION_MAX_AGE_MS,
  adminAccess,
  isAdminSessionFresh,
  passwordSignInAt,
  type AdminAccess,
} from '../adminLogic';

/**
 * Whether the CURRENT session is a password sign-in from the last 12 hours (JWT amr).
 * Re-renders by itself the moment it expires, so an open admin screen flips to
 * "sign in again" instead of waiting for the next token refresh.
 */
export function useAdminSessionFresh(): boolean {
  const { session } = useSession();
  const signedInAt = useMemo(
    () => passwordSignInAt(session?.access_token),
    [session?.access_token],
  );
  const [now, setNow] = useState(() => Date.now());
  const fresh = isAdminSessionFresh(signedInAt, now);

  useEffect(() => {
    if (!fresh || signedInAt === null) return;
    const ms = signedInAt + ADMIN_SESSION_MAX_AGE_MS - Date.now();
    // setTimeout caps near 24.8 days; 12 hours is far below it.
    const id = setTimeout(() => setNow(Date.now()), Math.max(ms, 0) + 1000);
    return () => clearTimeout(id);
  }, [fresh, signedInAt]);

  return fresh;
}

/**
 * Flag + password session -> what the admin UI may show. The platform flag comes
 * from the user's own profile row; nothing here authorises (the RPCs refuse).
 */
export function useAdminAccess(): AdminAccess {
  const profile = useMyProfile();
  const sessionFresh = useAdminSessionFresh();
  return adminAccess({
    profilePending: profile.isPending,
    isSuperAdmin: profile.data?.is_super_admin === true,
    sessionFresh,
  });
}

/** True only when the admin queries may run (flag AND a fresh password session). */
export function useAdminEnabled(): boolean {
  return useAdminAccess() === 'granted';
}
