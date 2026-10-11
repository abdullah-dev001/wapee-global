import { CheckCircle2, LinkIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { SignaturePad } from '@/components/shared';
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { useTokenFromUrl } from '@/features/booking-manage/useTokenFromUrl';
import { HoneypotField } from '@/features/booking-public/components/HoneypotField';
import { PublicApiError } from '@/features/booking-public/types';
import { theme, useBreakpoint } from '@/lib/theme';

import { usePublicForm, useSubmitPublicForm } from '../api/useForms';
import {
  answerProblem,
  cleanAnswers,
  hasInk,
  type AnswerValue,
  type Answers,
  type Signature,
} from '../formsLogic';
import { FormRenderer } from './FormRenderer';

const MAX_WIDTH = 520;

/**
 * The client's signing page (`(public)/[slug]/sign#token=...`). The token in the URL FRAGMENT is the
 * only thing that identifies the request. One generic page for every dead link (unknown, expired,
 * already signed, withdrawn): no hints. Nothing about the client beyond a first name is shown.
 */
export function PublicSignPage() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const token = useTokenFromUrl();
  const form = usePublicForm(token ?? null);
  const submit = useSubmitPublicForm();

  const [answers, setAnswers] = useState<Answers>({});
  const [name, setName] = useState('');
  const [signature, setSignature] = useState<Signature>([]);
  const [honeypot, setHoneypot] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dead, setDead] = useState(false);

  const wrap = (children: React.ReactNode) => (
    <Screen>
      <PageContainer maxWidth={isDesktop ? MAX_WIDTH : undefined}>
        {children}
        <LegalLinks />
      </PageContainer>
    </Screen>
  );

  if (token === undefined || (token && form.isPending)) {
    return wrap(
      <View style={styles.stack} accessibilityElementsHidden>
        <Skeleton height={28} width="60%" />
        <Skeleton height={200} radius="lg" />
      </View>,
    );
  }
  const code = (form.error as { code?: string } | null)?.code;
  if (!token || dead || code === 'invalid_token' || code === 'bad_request') {
    return wrap(
      <EmptyState
        icon={LinkIcon}
        title={t('forms.public.invalidTitle')}
        description={t('forms.public.invalidMessage')}
      />,
    );
  }
  if (form.isError || !form.data) {
    return wrap(
      <ErrorState
        title={t('forms.public.loadErrorTitle')}
        description={t('forms.public.loadErrorMessage')}
        onRetry={() => void form.refetch()}
        retryLabel={t('actions.retry')}
      />,
    );
  }
  if (done) {
    return wrap(
      <Card>
        <View style={styles.thanks}>
          <CheckCircle2
            size={theme.iconSize.xl * 2}
            strokeWidth={theme.iconStroke}
            color={theme.colors.success}
          />
          <Text variant="pageTitleMobile" align="center">
            {t('forms.public.thanksTitle')}
          </Text>
          <Text variant="paragraph" color="textSecondary" align="center">
            {t('forms.public.thanksMessage')}
          </Text>
        </View>
      </Card>,
    );
  }

  const f = form.data;
  const onSubmit = () => {
    setProblem(null);
    const bad = answerProblem(f.fields, answers);
    if (bad) {
      setInvalid(bad.fieldId);
      setProblem('forms.errors.' + bad.code);
      return;
    }
    if (name.trim().length < 2) return setProblem('forms.errors.invalid_name');
    if (f.requiresSignature && !hasInk(signature))
      return setProblem('forms.errors.signature_required');
    submit.mutate(
      {
        token,
        answers: cleanAnswers(answers),
        signerName: name.trim(),
        signature: hasInk(signature) ? signature : null,
        honeypot,
      },
      {
        onSuccess: () => setDone(true),
        onError: (error) => {
          const c = error instanceof PublicApiError ? error.code : null;
          if (c === 'invalid_token') return setDead(true);
          if (error instanceof PublicApiError && error.fieldId) setInvalid(error.fieldId);
          setProblem(
            c === 'missing_answer'
              ? 'forms.errors.missing_answer'
              : c === 'invalid_answer'
                ? 'forms.errors.invalid_answer'
                : c === 'invalid_name'
                  ? 'forms.errors.invalid_name'
                  : c === 'signature_required' || c === 'invalid_signature'
                    ? 'forms.errors.signature_required'
                    : c === 'rate_limited'
                      ? 'forms.errors.rate_limited'
                      : 'forms.errors.unknown',
          );
        },
      },
    );
  };

  return wrap(
    <Card>
      <View style={styles.stack}>
        <View style={styles.stack}>
          <Text variant="pageTitleMobile">{f.title}</Text>
          <Text variant="small" color="textSecondary">
            {t('forms.public.subtitle', { business: f.businessName, name: f.clientFirstName })}
          </Text>
        </View>
        <FormRenderer
          body={f.body}
          fields={f.fields}
          answers={answers}
          invalidFieldId={invalid}
          disabled={submit.isPending}
          onChange={(id: string, value: AnswerValue) => {
            setInvalid(null);
            setAnswers((a) => ({ ...a, [id]: value }));
          }}
        />
        <Input
          label={t('forms.sign.signerName')}
          value={name}
          onChangeText={setName}
          required
          editable={!submit.isPending}
        />
        {f.requiresSignature ? (
          <View style={styles.stack}>
            <Text variant="label">{t('forms.sign.signature')}</Text>
            <SignaturePad
              value={signature}
              onChange={setSignature}
              clearLabel={t('forms.sign.clear')}
              hint={t('forms.sign.padHint')}
              accessibilityLabel={t('forms.sign.padLabel')}
              disabled={submit.isPending}
            />
          </View>
        ) : null}
        <HoneypotField value={honeypot} onChange={setHoneypot} />
        {problem ? (
          <Text variant="helper" color="error">
            {t(problem as never)}
          </Text>
        ) : null}
        <Button fullWidth loading={submit.isPending} onPress={onSubmit}>
          {t('forms.public.submit')}
        </Button>
      </View>
    </Card>,
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  thanks: { alignItems: 'center', gap: theme.spacing[12], paddingVertical: theme.spacing[16] },
});
