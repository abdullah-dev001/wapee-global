import { Redirect, usePathname, type Href } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spinner } from '@/components/ui';
import { useSession } from '@/features/auth';
import { useGateSpinner } from '@/features/auth/gateSettled';
import { useMyBusinesses } from '@/features/onboarding/api/useBusiness';
import { isSupabaseConfigured } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { adminRedirect } from '../adminLogic';
import { useAdminAccess } from '../api/useAdminAccess';

/**
 * Sits OUTSIDE `AuthGate`. For an ordinary user it renders straight through. A
 * flagged super admin is forced through the 2FA screen at sign-in (aal1 -> aal2),
 * and a business-less admin is sent to /admin instead of onboarding.
 *
 * Convenience only: every admin RPC checks the flag and aal2 itself.
 *
 * `children` is always rendered, even while `waiting` (a spinner overlays it
 * instead) — see AuthGate's own comment for why: unmounting the route tree
 * for a loading spinner loses React Navigation's state and can silently
 * rewrite the URL out from under whatever screen was actually requested.
 */
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isEmailVerified, isPasswordRecovery, loading, user } = useSession();
  const access = useAdminAccess();
  const businesses = useMyBusinesses();
  const pathname = usePathname();
  const pending = access === 'loading' || (access === 'granted' && businesses.isPending);
  const waiting = useGateSpinner(pending, user?.id ?? null);

  if (!isSupabaseConfigured || loading || !isAuthenticated || !isEmailVerified) {
    return <>{children}</>;
  }

  if (waiting) {
    return (
      <>
        {children}
        <View style={styles.overlay}>
          <Spinner size={24} />
        </View>
      </>
    );
  }

  const target = adminRedirect({
    access,
    pathname,
    hasBusiness: (businesses.data?.length ?? 0) > 0,
    isPasswordRecovery,
  });

  return (
    <>
      {children}
      {target && target !== pathname ? <Redirect href={target as Href} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
