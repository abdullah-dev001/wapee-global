import { useMemo } from 'react';

import { useSession } from '@/features/auth';
import { useMyProfile } from '@/lib/permissions';

import {
  aalFromAccessToken,
  adminAccess,
  type AdminAccess,
  type AssuranceLevel,
} from '../adminLogic';

/** Assurance level of the CURRENT session, read from its access token. */
export function useAssuranceLevel(): AssuranceLevel {
  const { session } = useSession();
  return useMemo(() => aalFromAccessToken(session?.access_token), [session?.access_token]);
}

/**
 * Flag + assurance level -> what the admin UI may show. The platform flag comes
 * from the user's own profile row; nothing here authorises (the RPCs refuse).
 */
export function useAdminAccess(): AdminAccess {
  const profile = useMyProfile();
  const aal = useAssuranceLevel();
  return adminAccess({
    profilePending: profile.isPending,
    isSuperAdmin: profile.data?.is_super_admin === true,
    aal,
  });
}

/** True only when the admin queries may run (flag AND aal2). */
export function useAdminEnabled(): boolean {
  return useAdminAccess() === 'granted';
}
