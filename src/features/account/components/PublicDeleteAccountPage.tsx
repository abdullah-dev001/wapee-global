import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Card, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { useSession } from '@/features/auth';
import { theme, useBreakpoint } from '@/lib/theme';

const MAX_WIDTH = 640;

/**
 * `/delete-account` — the public page store policies ask for: how to delete your account, what happens to your
 * data, who to write to. Static text; the deletion itself happens signed in, in Settings > Account.
 */
export function PublicDeleteAccountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const { isDesktop } = useBreakpoint();
  const steps = [
    t('account.public.step1', { appName: brand.name }),
    t('account.public.step2'),
    t('account.public.step3'),
  ];

  return (
    <Screen>
      <PageContainer
        title={t('account.public.title', { appName: brand.name })}
        subtitle={t('account.public.subtitle')}
        maxWidth={isDesktop ? MAX_WIDTH : undefined}
      >
        <View style={styles.stack}>
          <Card>
            <View style={styles.stack}>
              <Text variant="cardTitle">{t('account.public.howTitle')}</Text>
              {steps.map((step, index) => (
                <Text key={step} variant="paragraph" color="textSecondary">
                  {t('account.public.stepLine', { n: index + 1, text: step })}
                </Text>
              ))}
              <Button
                onPress={() => router.push(isAuthenticated ? '/settings/delete-account' : '/login')}
              >
                {isAuthenticated ? t('account.public.goDelete') : t('account.public.signIn')}
              </Button>
            </View>
          </Card>
          <Card>
            <View style={styles.stack}>
              <Text variant="cardTitle">{t('account.public.removedTitle')}</Text>
              <Text variant="paragraph" color="textSecondary">
                {t('account.public.removedBody')}
              </Text>
              <Text variant="cardTitle">{t('account.public.keptTitle')}</Text>
              <Text variant="paragraph" color="textSecondary">
                {t('account.public.keptBody')}
              </Text>
              <Text variant="cardTitle">{t('account.public.ownerTitle')}</Text>
              <Text variant="paragraph" color="textSecondary">
                {t('account.public.ownerBody')}
              </Text>
              <Text variant="cardTitle">{t('account.public.customerTitle')}</Text>
              <Text variant="paragraph" color="textSecondary">
                {t('account.public.customerBody')}
              </Text>
            </View>
          </Card>
          <Text variant="helper" color="textSecondary">
            {t('account.public.contact', { email: brand.supportEmail })}
          </Text>
        </View>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
});
