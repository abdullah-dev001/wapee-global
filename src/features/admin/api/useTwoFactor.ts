import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const mfaKeys = createQueryKeys('mfa');
const SCOPE = { businessId: 'self' } as const;

export type TotpFactor = { id: string; verified: boolean };

/**
 * The signed-in user's authenticator factors (Supabase MFA). Verified ones mean
 * "enter your code"; none means "set it up". Unverified leftovers from an
 * abandoned set-up are listed too so they can be removed before a new enrolment.
 */
export function useTotpFactors() {
  const { user } = useSession();
  return useQuery({
    queryKey: mfaKeys.detail(SCOPE, user?.id ?? 'none'),
    enabled: Boolean(user),
    staleTime: staleTimes.live,
    queryFn: async (): Promise<TotpFactor[]> => {
      const { data, error } = await getSupabase().auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      const all = [...(data.totp ?? []), ...data.all.filter((f) => f.factor_type === 'totp')];
      const seen = new Set<string>();
      return all.flatMap((f) => {
        if (seen.has(f.id)) return [];
        seen.add(f.id);
        return [{ id: f.id, verified: f.status === 'verified' }];
      });
    },
  });
}

export type Enrolment = { factorId: string; qrCode: string; secret: string };

/** Starts a set-up: removes abandoned (unverified) factors first, then enrols a new one. */
export function useEnrolTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stale: TotpFactor[]): Promise<Enrolment> => {
      const mfa = getSupabase().auth.mfa;
      for (const factor of stale.filter((f) => !f.verified)) {
        await mfa.unenroll({ factorId: factor.id });
      }
      const { data, error } = await mfa.enroll({ factorType: 'totp' });
      if (error) throw new Error(error.message);
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}

/**
 * Challenge + verify in one step. On success Supabase upgrades the session to
 * aal2 and the auth listener hands the new token to the app.
 */
export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { factorId: string; code: string }) => {
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({
        factorId: v.factorId,
        code: v.code,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: mfaKeys.all }),
  });
}
