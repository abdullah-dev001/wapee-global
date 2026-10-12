import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { disablePush } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';

import {
  type ForgotPasswordValues,
  type LoginValues,
  type ResetPasswordValues,
  type SignupValues,
} from '../schemas/auth.schemas';

export type SignupInput = SignupValues & {
  /**
   * Where the confirmation email sends them back, as an app path (e.g.
   * `/accept-invite?token=…`). Defaults to `/verify`. Used by the invite screen
   * so a pending invite survives email confirmation instead of being lost.
   */
  confirmRedirectPath?: string;
};

/**
 * Where Supabase sends the user back after an email link.
 * Native uses the `wapee://` scheme; web uses the current origin so a preview
 * deployment redirects to itself rather than production.
 *
 * Every URL used here must also be listed in the Supabase dashboard under
 * Authentication -> URL Configuration -> Redirect URLs.
 */
export function redirectTo(path: string): string {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return path;
    return new URL(path, window.location.origin).toString();
  }
  return Linking.createURL(path);
}

/** Supabase auth errors are already human-readable; pass the message through. */
function toError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function useLogin(): UseMutationResult<void, Error, LoginValues> {
  return useMutation({
    mutationFn: async ({ email, password }) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      toError(error);
    },
  });
}

export type SignupResult = {
  /** False when Supabase is waiting for the user to confirm their email. */
  sessionCreated: boolean;
};

export function useSignup(): UseMutationResult<SignupResult, Error, SignupInput> {
  return useMutation({
    mutationFn: async ({ email, password, fullName, confirmRedirectPath }) => {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          // Copied into profiles by the handle_new_user trigger.
          data: { full_name: fullName },
          emailRedirectTo: redirectTo(confirmRedirectPath ?? '/verify'),
        },
      });
      toError(error);
      return { sessionCreated: Boolean(data.session) };
    },
  });
}

export function useForgotPassword(): UseMutationResult<void, Error, ForgotPasswordValues> {
  return useMutation({
    mutationFn: async ({ email }) => {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo('/reset-password'),
      });
      toError(error);
    },
  });
}

export function useResetPassword(): UseMutationResult<void, Error, ResetPasswordValues> {
  return useMutation({
    mutationFn: async ({ password }) => {
      // Works because the recovery link already signed the user in.
      const { error } = await getSupabase().auth.updateUser({ password });
      toError(error);
    },
  });
}

export function useResendVerification(): UseMutationResult<void, Error, { email: string }> {
  return useMutation({
    mutationFn: async ({ email }) => {
      const { error } = await getSupabase().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectTo('/verify') },
      });
      toError(error);
    },
  });
}

export function useSignOut(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: async () => {
      // Stop pushes to this device for the user who is leaving. Best effort: a
      // device without push (web, no permission) has nothing to forget, and a
      // failure here must never trap someone in a signed-in session.
      await disablePush().catch(() => undefined);
      // The SessionProvider clears the query cache on the SIGNED_OUT event.
      const { error } = await getSupabase().auth.signOut();
      toError(error);
    },
  });
}
