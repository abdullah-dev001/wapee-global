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
 */
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isEmailVerified, loading, user } = useSession();
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
      <View style={styles.loading}>
        <Spinner size={24} />
      </View>
    );
  }

  const target = adminRedirect({
    access,
    pathname,
    hasBusiness: (businesses.data?.length ?? 0) > 0,
  });
  if (target && target !== pathname) return <Redirect href={target as Href} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
