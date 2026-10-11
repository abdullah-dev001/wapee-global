import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { Button, Card, Text } from '@/components/ui';
import { useTokenFromUrl } from '@/features/booking-manage/useTokenFromUrl';
import { getSupabase } from '@/lib/supabase';
import { theme, useBreakpoint } from '@/lib/theme';

const MAX_WIDTH = 480;

/**
 * The confirm page of the unsubscribe link (`/unsubscribe#token=<signed token>`).
 * Opening the link changes nothing; only the button POSTs to the `unsubscribe`
 * Edge Function. After the POST EVERY visitor sees the same sentence, so the page
 * can never reveal whether a recipient exists or whether the link was valid.
 */
export function UnsubscribePage() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const token = useTokenFromUrl();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');

  const confirm = async () => {
    if (!token) return;
    setState('sending');
    const { error } = await getSupabase().functions.invoke('unsubscribe', { body: { t: token } });
    setState(error ? 'failed' : 'done');
  };

  return (
    <Screen>
      <PageContainer maxWidth={isDesktop ? MAX_WIDTH : undefined}>
        <Card>
          <View style={styles.stack}>
            <Text variant="sectionTitle">{t('unsubscribe.title')}</Text>
            {state === 'done' ? (
              <Text variant="body">{t('unsubscribe.done')}</Text>
            ) : (
              <>
                <Text variant="body" color="textSecondary">
                  {t('unsubscribe.explain')}
                </Text>
                {state === 'failed' ? (
                  <Text variant="helper" color="error">
                    {t('unsubscribe.failed')}
                  </Text>
                ) : null}
                {token ? (
                  <Button loading={state === 'sending'} onPress={() => void confirm()}>
                    {t('unsubscribe.confirm')}
                  </Button>
                ) : token === null ? (
                  <Text variant="helper" color="textSecondary">
                    {t('unsubscribe.noLink')}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </Card>
        <LegalLinks />
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: theme.spacing[16] } });
