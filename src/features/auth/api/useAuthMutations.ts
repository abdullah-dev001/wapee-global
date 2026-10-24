import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { planIntentQuery } from '@/features/billing/planIntent';
import { readPlanIntent } from '@/features/billing/planIntentStore';
import { disablePush } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';

import { OAUTH_CALLBACK_PATH } from '../oauth';
import {
  type ForgotPasswordValues,
  type LoginValues,
  type ResetPasswordValues,
  type SignupValues,
} from '../schemas/auth.schemas';

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

/**
 * Supabase auth errors carry a stable `code`/`status` that screens map to an
 * i18n key via `authErrorKey()`; re-throwing a plain `Error` would discard both,
 * so they are copied onto the thrown error.
 */
function toError(error: { message: string; code?: string; status?: number } | null): void {
  if (!error) return;
  const wrapped = new Error(error.message) as Error & { code?: string; status?: number };
  wrapped.code = error.code;
  wrapped.status = error.status;
  throw wrapped;
}

/**
 * Where the email confirmation link lands. It carries the visitor's plan choice
 * (`?plan=…&interval=…`) so it survives a link opened on another device, where this
 * browser's localStorage is not available; the root layout saves it again on arrival.
 * Accepted by the redirect allow-list as long as the path's entry matches the query too
 * (dev: checked live 2026-10-24; prod: `https://wapee.online/**`).
 */
function verifyRedirect(): string {
  return redirectTo(`/verify${planIntentQuery(readPlanIntent())}`);
}

export function useLogin(): UseMutationResult<void, Error, LoginValues> {
  return useMutation({
    mutationFn: async ({ email, password }) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      toError(error);
    },
  });
}

/**
 * "Continue with Google" (web / PWA only; the button is not rendered elsewhere). Supabase sends
 * the browser to Google and back to `/auth/callback`, where supabase-js reads the session from the
 * URL fragment (`detectSessionInUrl`) and `AuthGate` routes the user: home, onboarding, or home in
 * a business they were added to (the claim runs first). `prompt=select_account` lets someone with
 * several Google accounts pick the right one instead of being signed in silently.
 *
 * The redirect URL must be listed in the dashboard (Authentication -> URL Configuration).
 */
export function useGoogleSignIn(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo(OAUTH_CALLBACK_PATH),
          queryParams: { prompt: 'select_account' },
        },
      });
      toError(error);
    },
  });
}

export type SignupResult = {
  /** False when Supabase is waiting for the user to confirm their email. */
  sessionCreated: boolean;
};

export function useSignup(): UseMutationResult<SignupResult, Error, SignupValues> {
  return useMutation({
    mutationFn: async ({ email, password, fullName }) => {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          // Copied into profiles by the handle_new_user trigger.
          data: { full_name: fullName },
          emailRedirectTo: verifyRedirect(),
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
        options: { emailRedirectTo: verifyRedirect() },
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
