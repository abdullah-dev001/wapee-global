import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Spinner, Text, useToast } from '@/components/ui';
import { AuthLayout, PasswordField, useSession, useSignOut, useSignup } from '@/features/auth';
import { inviteAcceptPath } from '@/features/members/inviteAcceptPath';
import { useAcceptInvite, useInvitePreview } from '@/features/members/api/useMembers';
import {
  acceptInviteSchema,
  type AcceptInviteValues,
} from '@/features/members/schemas/invite.schemas';
import { theme } from '@/lib/theme';

/**
 * Opens an invite link (`/accept-invite?token=…`).
 *
 * Three cases, decided by who is signed in:
 * - **Signed out:** the form creates the account for the invited address, then
 *   accepts. The address is fixed by the token and cannot be edited. Email
 *   confirmation sends them back to THIS screen with the token still attached
 *   (`confirmRedirectPath`), not to the generic `/verify` screen, so the join
 *   finishes automatically once they confirm and return.
 * - **Signed in with the invited address:** joins automatically, no button —
 *   the account already exists (or just confirmed), so only the membership is
 *   added.
 * - **Signed in as somebody else:** refused with a way to switch account. A link
 *   must never attach a membership to whatever account happens to be open.
 *
 * Every failure the server reports is deliberately the same generic message, so
 * this screen cannot be used to discover which emails or tokens exist.
 */
export default function AcceptInviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' && params.token.length > 0 ? params.token : null;

  const { isAuthenticated, user, loading } = useSession();
  const preview = useInvitePreview(token);
  const signup = useSignup();
  const signOut = useSignOut();
  const accept = useAcceptInvite();
  const [joined, setJoined] = useState(false);

  const { control, handleSubmit } = useForm<AcceptInviteValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { fullName: '', password: '' },
  });

  const invitedEmail = preview.data?.invitedEmail ?? null;
  const signedInEmail = user?.email?.toLowerCase() ?? null;
  const sameAccount =
    invitedEmail !== null && signedInEmail !== null && signedInEmail === invitedEmail.toLowerCase();

  const acceptNow = () => {
    if (!token) return;
    accept.mutate(token, {
      onSuccess: () => {
        toast.show({ message: t('members.accept.joined'), tone: 'success' });
        setJoined(true);
      },
      onError: () => toast.show({ message: t('members.accept.invalid'), tone: 'error' }),
    });
  };

  // Once the membership exists, the gate sends them into the business.
  useEffect(() => {
    if (joined) router.replace('/');
  }, [joined, router]);

  // Signed in as the invited person (including just back from email
  // confirmation) with nothing joined yet: accept right away, no tap needed.
  useEffect(() => {
    if (sameAccount && !joined && !accept.isPending && !accept.isError) acceptNow();
    // acceptNow closes over token/accept, which are stable for this purpose;
    // re-running on every render of accept would retry a failed attempt in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAccount, joined]);

  if (!token) return <InviteProblem message={t('members.accept.invalid')} />;
  if (loading || preview.isPending) {
    return (
      <AuthLayout title={t('members.accept.title')}>
        <View style={styles.centre}>
          <Spinner size={24} />
        </View>
      </AuthLayout>
    );
  }

  // No row = unknown, used or expired token. One message for all three.
  if (!preview.data) return <InviteProblem message={t('members.accept.invalid')} />;
  const invite = preview.data;

  // Signed in as the wrong person.
  if (isAuthenticated && !sameAccount) {
    return (
      <AuthLayout title={t('members.accept.title')}>
        <View style={styles.block}>
          <Text variant="paragraph" color="textSecondary">
            {t('members.accept.wrongAccount', { invited: invite.invitedEmail })}
          </Text>
          <Button
            variant="ghost"
            fullWidth
            loading={signOut.isPending}
            onPress={() => signOut.mutate()}
          >
            {t('members.accept.switchAccount')}
          </Button>
        </View>
      </AuthLayout>
    );
  }

  // Signed in as the invited person: the effect above is already joining. On
  // failure (the token was used/expired in the meantime), fall back to the
  // single generic message rather than retrying silently forever.
  if (isAuthenticated && sameAccount) {
    if (accept.isError) return <InviteProblem message={t('members.accept.invalid')} />;
    return (
      <AuthLayout title={t('members.accept.title')}>
        <View style={styles.centre}>
          <Spinner size={24} />
        </View>
      </AuthLayout>
    );
  }

  // Signed out: create the account for the invited address, then accept.
  const onSubmit = handleSubmit((values) => {
    signup.mutate(
      {
        fullName: values.fullName,
        email: invite.invitedEmail,
        password: values.password,
        // Keep the token through email confirmation: return here, not /verify.
        confirmRedirectPath: inviteAcceptPath(token),
      },
      {
        onSuccess: ({ sessionCreated }) => {
          // Email confirmation is on, so a session may not exist yet. The invite
          // stays valid for 7 days; confirming the email returns them to this
          // same screen (confirmRedirectPath above), which then joins automatically.
          if (!sessionCreated) {
            toast.show({ message: t('members.accept.confirmEmail'), tone: 'info', duration: 0 });
            return;
          }
          acceptNow();
        },
        onError: (error) => toast.show({ message: error.message, tone: 'error' }),
      },
    );
  });

  return (
    <AuthLayout title={t('members.accept.title')}>
      <View style={styles.block}>
        <Text variant="paragraph" color="textSecondary">
          {t('members.accept.createFor', {
            business: invite.businessName,
            email: invite.invitedEmail,
          })}
        </Text>

        <FormField
          control={control}
          name="fullName"
          label={t('auth.fields.fullName')}
          required
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />

        <PasswordField
          control={control}
          name="password"
          label={t('auth.fields.password')}
          required
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <Button fullWidth loading={signup.isPending || accept.isPending} onPress={onSubmit}>
          {t('members.accept.createAndJoin')}
        </Button>
      </View>
    </AuthLayout>
  );
}

/** One generic screen for every bad-token case. */
function InviteProblem({ message }: { message: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <AuthLayout title={t('members.accept.title')}>
      <View style={styles.block}>
        <Text variant="paragraph" color="textSecondary">
          {message}
        </Text>
        <Button variant="ghost" fullWidth onPress={() => router.replace('/login')}>
          {t('members.accept.backToLogin')}
        </Button>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: theme.spacing[16],
  },
  centre: {
    alignItems: 'center',
    paddingVertical: theme.spacing[24],
  },
});
