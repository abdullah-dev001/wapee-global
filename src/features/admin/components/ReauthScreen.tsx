import { KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Card, Skeleton, Text } from '@/components/ui';
import { useSignOut } from '@/features/auth';
import { theme } from '@/lib/theme';

import { useAdminAccess } from '../api/useAdminAccess';

/**
 * A flagged super admin whose session is not a password sign-in from the last 12
 * hours (too old, or Google / a recovery link). The only way on is to sign out and
 * sign in again with email and password; the RPCs refuse until then.
 */
export function ReauthScreen() {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const access = useAdminAccess();

  // Already fresh: the guard sends us on; show nothing meanwhile.
  if (access === 'granted') {
    return (
      <Screen>
        <PageContainer>
          <Skeleton height={120} radius="lg" />
        </PageContainer>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageContainer maxWidth={theme.layout.dialogMaxWidth}>
        <Card>
          <View style={styles.stack}>
            <View style={styles.iconCircle}>
              <KeyRound
                size={theme.iconSize.xl}
                strokeWidth={theme.iconStroke}
                color={theme.colors.primary}
              />
            </View>
            <Text variant="dialogTitle" align="center">
              {t('admin.reauth.title')}
            </Text>
            <Text variant="paragraph" color="textSecondary" align="center">
              {t('admin.reauth.body')}
            </Text>
            <Button fullWidth loading={signOut.isPending} onPress={() => signOut.mutate()}>
              {t('admin.reauth.action')}
            </Button>
          </View>
        </Card>
      </PageContainer>
    </Screen>
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
});
