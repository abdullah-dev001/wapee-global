import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Screen, PageContainer } from '@/components/layout';
import { Button, Card, ErrorState, Input, Skeleton, Text, useToast } from '@/components/ui';
import { useSignOut } from '@/features/auth';
import { theme } from '@/lib/theme';

import {
  ADMIN_HOME,
  formatTotpSecret,
  isTotpCodeComplete,
  normaliseTotpCode,
  qrSvgFromDataUri,
} from '../adminLogic';
import { useAdminAccess } from '../api/useAdminAccess';
import { useEnrolTotp, useTotpFactors, useVerifyTotp, type Enrolment } from '../api/useTwoFactor';

const QR_SIZE = 192;

/**
 * Two-factor gate for the super admin (Supabase MFA, TOTP): set up an
 * authenticator app the first time, enter the 6-digit code on every sign-in. No
 * recovery flow (see context/plans-super-admin.md).
 */
export function TwoFactorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const signOut = useSignOut();
  const access = useAdminAccess();
  const factors = useTotpFactors();
  const enrol = useEnrolTotp();
  const verify = useVerifyTotp();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);

  const verified = factors.data?.find((f) => f.verified) ?? null;
  const factorId = enrolment?.factorId ?? verified?.id ?? null;
  const svg = useMemo(() => (enrolment ? qrSvgFromDataUri(enrolment.qrCode) : null), [enrolment]);

  // Already aal2 (e.g. just verified): the guard sends us on; show nothing meanwhile.
  if (access === 'granted') {
    return (
      <Screen>
        <PageContainer>
          <Skeleton height={120} radius="lg" />
        </PageContainer>
      </Screen>
    );
  }

  const submit = () => {
    if (!factorId || !isTotpCodeComplete(code)) return;
    setWrong(false);
    verify.mutate(
      { factorId, code },
      {
        onSuccess: () => router.replace(ADMIN_HOME),
        onError: () => {
          setWrong(true);
          setCode('');
          toast.show({ message: t('admin.twoFactor.wrongCode'), tone: 'error' });
        },
      },
    );
  };

  const startSetup = () =>
    enrol.mutate(factors.data ?? [], {
      onSuccess: (value) => {
        setEnrolment(value);
        setCode('');
      },
      onError: () => toast.show({ message: t('admin.twoFactor.setupFailed'), tone: 'error' }),
    });

  return (
    <Screen>
      <PageContainer maxWidth={theme.layout.dialogMaxWidth}>
        <Card>
          <View style={styles.stack}>
            <View style={styles.iconCircle}>
              <ShieldCheck
                size={theme.iconSize.xl}
                strokeWidth={theme.iconStroke}
                color={theme.colors.primary}
              />
            </View>
            <Text variant="dialogTitle" align="center">
              {t('admin.twoFactor.title')}
            </Text>

            {factors.isPending ? (
              <Skeleton height={96} radius="lg" />
            ) : factors.isError ? (
              <ErrorState
                compact
                title={t('admin.twoFactor.loadError')}
                onRetry={() => void factors.refetch()}
                retryLabel={t('actions.retry')}
              />
            ) : enrolment ? (
              <View style={styles.stack}>
                <Text variant="paragraph" color="textSecondary" align="center">
                  {t('admin.twoFactor.scan')}
                </Text>
                <View style={styles.qr} accessibilityLabel={t('admin.twoFactor.qrLabel')}>
                  {svg ? <SvgXml xml={svg} width={QR_SIZE} height={QR_SIZE} /> : null}
                </View>
                <Text variant="helper" color="textSecondary" align="center">
                  {t('admin.twoFactor.secretHint')}
                </Text>
                <Text variant="bodyStrong" align="center" selectable>
                  {formatTotpSecret(enrolment.secret)}
                </Text>
                <CodeEntry code={code} setCode={setCode} wrong={wrong} onSubmit={submit} />
                <Button
                  fullWidth
                  loading={verify.isPending}
                  disabled={!isTotpCodeComplete(code)}
                  onPress={submit}
                >
                  {t('admin.twoFactor.verifySetup')}
                </Button>
              </View>
            ) : verified ? (
              <View style={styles.stack}>
                <Text variant="paragraph" color="textSecondary" align="center">
                  {t('admin.twoFactor.enter')}
                </Text>
                <CodeEntry code={code} setCode={setCode} wrong={wrong} onSubmit={submit} />
                <Button
                  fullWidth
                  loading={verify.isPending}
                  disabled={!isTotpCodeComplete(code)}
                  onPress={submit}
                >
                  {t('admin.twoFactor.verify')}
                </Button>
              </View>
            ) : (
              <View style={styles.stack}>
                <Text variant="paragraph" color="textSecondary" align="center">
                  {t('admin.twoFactor.setupIntro')}
                </Text>
                <Button fullWidth loading={enrol.isPending} onPress={startSetup}>
                  {t('admin.twoFactor.startSetup')}
                </Button>
              </View>
            )}

            <Button
              variant="ghost"
              fullWidth
              loading={signOut.isPending}
              onPress={() => signOut.mutate()}
            >
              {t('nav.logout')}
            </Button>
          </View>
        </Card>
      </PageContainer>
    </Screen>
  );
}

function CodeEntry({
  code,
  setCode,
  wrong,
  onSubmit,
}: {
  code: string;
  setCode: (value: string) => void;
  wrong: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Input
      label={t('admin.twoFactor.codeLabel')}
      value={code}
      onChangeText={(text) => setCode(normaliseTotpCode(text))}
      keyboardType="number-pad"
      inputMode="numeric"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={7}
      placeholder="123456"
      error={wrong ? t('admin.twoFactor.wrongCode') : undefined}
      returnKeyType="done"
      onSubmitEditing={onSubmit}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  iconCircle: {
    alignSelf: 'center',
    width: theme.controlHeight.lg,
    height: theme.controlHeight.lg,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    alignSelf: 'center',
    padding: theme.spacing[8],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
