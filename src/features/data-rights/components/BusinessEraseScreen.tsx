import { useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Card, Input, Spinner, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { DataRightsError, useEraseBusiness, type BusinessEraseCounts } from '../api/useClientData';
import { dataRightsErrorKey, namesMatch } from '../dataRightsLogic';

/**
 * Settings > Delete this business (Owner only; the database refuses anyone else). Strong warning, the business name
 * typed to confirm, a progress state while the files and then the data are removed, and a result with the counts.
 * Nothing on this screen can be undone, so Back is not offered while it runs.
 */
export function BusinessEraseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId, business } = useCurrentScope();
  const erase = useEraseBusiness();
  const [typed, setTyped] = useState('');
  const [counts, setCounts] = useState<BusinessEraseCounts | null>(null);
  const name = business?.name ?? '';
  const matches = namesMatch(typed, name);
  const errorKey = erase.error
    ? dataRightsErrorKey(erase.error instanceof DataRightsError ? erase.error.code : null)
    : null;

  // Nothing can be undone once it runs: hardware Back is swallowed while the erase is in flight.
  const running = erase.isPending;
  useEffect(() => {
    if (!running) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [running]);

  if (counts) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('dataRights.business.doneTitle')}>
          <Card>
            <View style={styles.stack}>
              <Text variant="paragraph" color="textSecondary">
                {t('dataRights.business.doneBody')}
              </Text>
              <Text variant="helper" color="textSecondary">
                {t('dataRights.business.doneCounts', {
                  clients: counts.clients ?? 0,
                  appointments: counts.appointments ?? 0,
                  invoices: counts.invoices ?? 0,
                  files: counts.files ?? 0,
                })}
              </Text>
              <Button
                onPress={() => {
                  queryClient.clear();
                  router.replace('/');
                }}
              >
                {t('dataRights.business.continue')}
              </Button>
            </View>
          </Card>
        </PageContainer>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('dataRights.business.title')}
        subtitle={t('dataRights.business.subtitle')}
      >
        <Card>
          <View style={styles.stack}>
            <View style={styles.warning}>
              <TriangleAlert
                size={theme.iconSize.lg}
                strokeWidth={theme.iconStroke}
                color={theme.colors.errorText}
              />
              <Text variant="cardTitle" color="error">
                {t('dataRights.business.warningTitle')}
              </Text>
            </View>
            <Text variant="paragraph" color="textSecondary">
              {t('dataRights.business.warningBody')}
            </Text>
            <Text variant="label">{t('dataRights.business.removedTitle')}</Text>
            <Text variant="helper" color="textSecondary">
              {t('dataRights.business.removedBody')}
            </Text>
            <Text variant="label">{t('dataRights.business.keptTitle')}</Text>
            <Text variant="helper" color="textSecondary">
              {t('dataRights.business.keptBody')}
            </Text>
            {erase.isPending ? (
              <View
                style={styles.progress}
                accessibilityRole="progressbar"
                accessibilityLiveRegion="polite"
              >
                <Spinner size={theme.iconSize.md} color="primary" />
                <Text variant="helper" color="textSecondary">
                  {t('dataRights.business.progress')}
                </Text>
              </View>
            ) : (
              <>
                <Input
                  label={t('dataRights.business.typeName', { name })}
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errorKey ? t(errorKey) : undefined}
                />
                <Button
                  variant="danger"
                  disabled={!matches || !businessId}
                  onPress={() =>
                    businessId
                      ? erase.mutate(
                          { businessId, confirmName: name },
                          { onSuccess: (result) => setCounts(result) },
                        )
                      : undefined
                  }
                >
                  {t('dataRights.business.confirm')}
                </Button>
              </>
            )}
          </View>
        </Card>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  warning: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  progress: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
});
