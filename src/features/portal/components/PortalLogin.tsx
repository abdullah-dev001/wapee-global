import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react-native';

import { Button, EmptyState, Input, Text } from '@/components/ui';
import { HoneypotField } from '@/features/booking-public/components';
import { theme } from '@/lib/theme';

import { useRequestLogin } from '../api/usePortal';
import { cleanEmail } from '../portalLogic';

/** The sign-in form: an email in, "if registered, a link is on its way" out. Same reply for every address. */
export function PortalLogin({ slug, business }: { slug: string; business: string }) {
  const { t } = useTranslation();
  const request = useRequestLogin(slug);
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [invalid, setInvalid] = useState(false);

  if (request.isSuccess) {
    return (
      <EmptyState
        icon={MailCheck}
        title={t('portal.login.sentTitle')}
        description={t('portal.login.sentBody')}
        action={{
          variant: 'ghost',
          onPress: () => request.reset(),
          children: t('portal.login.again'),
        }}
      />
    );
  }

  const submit = () => {
    const clean = cleanEmail(email);
    setInvalid(clean === null);
    if (clean) request.mutate({ email: clean, honeypot });
  };

  return (
    <View style={styles.form}>
      <Text variant="sectionTitle">{t('portal.login.title', { business })}</Text>
      <Text variant="body" color="textSecondary">
        {t('portal.login.body')}
      </Text>
      <Input
        label={t('portal.login.email')}
        placeholder={t('portal.login.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        onSubmitEditing={submit}
        error={invalid ? t('portal.login.emailInvalid') : undefined}
      />
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      {request.isError ? (
        <Text variant="helper" color="error">
          {t('portal.login.rateLimited')}
        </Text>
      ) : null}
      <Button onPress={submit} loading={request.isPending} disabled={request.isPending}>
        {t('portal.login.send')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
});
