import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { redirectTo, useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase, verifyPassword } from '@/lib/supabase';

import { authErrorCode } from '../accountLogic';
import { type ChangeEmailValues, type ChangePasswordValues } from '../schemas/account.schemas';

/**
 * A refusal from an account flow; `code` is mapped to a message by the caller. `businesses` is set for
 * `sole_owner` (the businesses the person must delete or hand over first).
 */
export class AccountError extends Error {
  readonly code: string;
  readonly businesses: { id: string; name: string }[];
  constructor(code: string, businesses: { id: string; name: string }[] = []) {
    super(code);
    this.name = 'AccountError';
    this.code = code;
    this.businesses = businesses;
  }
}

/**
 * Account data belongs to the PERSON, not to a business, so these keys are not business-scoped. The whole cache is
 * cleared on sign-out (SessionProvider), which is what removes them.
 */
export const accountKeys = {
  me: ['account', 'me'] as const,
  blockers: ['account', 'delete-blockers'] as const,
};

async function readCode(
  error: unknown,
): Promise<{ code: string; businesses: { id: string; name: string }[] }> {
  const context = (error as { context?: Response }).context;
  if (!context) return { code: 'unknown', businesses: [] };
  try {
    const parsed = (await context.clone().json()) as {
      code?: string;
      businesses?: { id: string; name: string }[];
    };
    return { code: parsed.code ?? 'unknown', businesses: parsed.businesses ?? [] };
  } catch {
    return { code: 'unknown', businesses: [] };
  }
}

/** Best effort: a failed audit write must never undo or hide a change that already succeeded. */
async function logEvent(event: 'password_changed' | 'email_change_requested'): Promise<void> {
  await getSupabase()
    .rpc('log_account_event', { p_event: event })
    .then(
      () => undefined,
      () => undefined,
    );
}

export type AccountMe = { email: string; pendingEmail: string | null };

/** The signed-in person from the auth server (not the cached token), so a pending email change is current. */
export function useAccountMe() {
  const { isAuthenticated } = useSession();
  return useQuery<AccountMe, Error>({
    queryKey: accountKeys.me,
    enabled: isAuthenticated,
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.getUser();
      if (error || !data.user) throw new Error(error?.message ?? 'No user');
      return { email: data.user.email ?? '', pendingEmail: data.user.new_email ?? null };
    },
  });
}

/**
 * Current password first (checked on a throw-away client so the live session is untouched), then the new one.
 * Other devices are signed out; this one keeps its session.
 */
export function useChangePassword() {
  return useMutation<null, AccountError, { email: string; values: ChangePasswordValues }>({
    mutationFn: async ({ email, values }) => {
      let ok: boolean;
      try {
        ok = await verifyPassword(email, values.currentPassword);
      } catch {
        throw new AccountError('unknown');
      }
      if (!ok) throw new AccountError('wrong_password');
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({ password: values.newPassword });
      if (error) throw new AccountError(authErrorCode(error));
      // Every other session is now untrusted; the current one stays. Best effort.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
      await logEvent('password_changed');
      return null;
    },
  });
}

/**
 * Starts an email change. Supabase mails a confirmation link; until it is opened the OLD address still signs in
 * and `pendingEmail` shows the new one.
 */
export function useChangeEmail() {
  const queryClient = useQueryClient();
  return useMutation<null, AccountError, { email: string; values: ChangeEmailValues }>({
    mutationFn: async ({ email, values }) => {
      if (values.newEmail.toLowerCase() === email.toLowerCase())
        throw new AccountError('same_email');
      let ok: boolean;
      try {
        ok = await verifyPassword(email, values.currentPassword);
      } catch {
        throw new AccountError('unknown');
      }
      if (!ok) throw new AccountError('wrong_password');
      const { error } = await getSupabase().auth.updateUser(
        { email: values.newEmail },
        { emailRedirectTo: redirectTo('/verify') },
      );
      if (error) throw new AccountError(authErrorCode(error));
      await logEvent('email_change_requested');
      return null;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}

/** Sends the confirmation mail for a pending email change again. */
export function useResendEmailChange() {
  return useMutation<null, AccountError, { pendingEmail: string }>({
    mutationFn: async ({ pendingEmail }) => {
      const { error } = await getSupabase().auth.resend({
        type: 'email_change',
        email: pendingEmail,
        options: { emailRedirectTo: redirectTo('/verify') },
      });
      if (error) throw new AccountError(authErrorCode(error));
      return null;
    },
  });
}

export type DeleteBlockers = { superAdmin: boolean; businesses: { id: string; name: string }[] };

/** Whether this person may delete their account yet, and if not, why (shown before the password is asked). */
export function useDeleteBlockers() {
  const { isAuthenticated } = useSession();
  return useQuery<DeleteBlockers, Error>({
    queryKey: accountKeys.blockers,
    enabled: isAuthenticated,
    staleTime: staleTimes.live,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('account_delete_blockers');
      if (error) throw new Error(error.message);
      const r = data as {
        ok?: boolean;
        super_admin?: boolean;
        businesses?: { id: string; name: string }[];
      } | null;
      if (!r || r.ok !== true) throw new Error('forbidden');
      return { superAdmin: r.super_admin === true, businesses: r.businesses ?? [] };
    },
  });
}

/** Deletes the signed-in person's own account through the `account` Edge Function. Irreversible. */
export function useDeleteAccount() {
  return useMutation<null, AccountError, { password: string; confirmEmail: string }>({
    mutationFn: async ({ password, confirmEmail }) => {
      const response = await getSupabase().functions.invoke('account', {
        body: { action: 'delete', password, confirm_email: confirmEmail },
      });
      if (response.error) {
        const { code, businesses } = await readCode(response.error);
        throw new AccountError(code, businesses);
      }
      const result = response.data as { ok?: boolean; code?: string } | null;
      if (!result || result.ok !== true) throw new AccountError(result?.code ?? 'unknown');
      return null;
    },
  });
}
