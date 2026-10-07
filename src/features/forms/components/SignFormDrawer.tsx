import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SignaturePad } from '@/components/shared';
import { Button, Drawer, Input, Text, useToast } from '@/components/ui';
import { rpcCode, RpcError } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useFormTemplates, useRecordSignedConsent } from '../api/useForms';
import {
  answerProblem,
  cleanAnswers,
  formErrorKey,
  hasInk,
  type AnswerValue,
  type Answers,
  type Signature,
} from '../formsLogic';
import { FormRenderer } from './FormRenderer';

/**
 * Capture a signature on THIS device (the client signs on the salon's tablet or phone). Everything is
 * validated here for a quick message and again by the RPC. The signed copy is immutable.
 */
export function SignFormDrawer({
  open,
  onClose,
  businessId,
  clientId,
  clientName,
  appointmentId,
  templateId,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string | null;
  clientId: string;
  clientName: string;
  appointmentId: string | null;
  templateId: string | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const templates = useFormTemplates(businessId, open);
  const template = templates.data?.find((x) => x.id === templateId) ?? null;
  const record = useRecordSignedConsent(businessId);
  const [answers, setAnswers] = useState<Answers>({});
  const [name, setName] = useState(clientName);
  const [signature, setSignature] = useState<Signature>([]);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setAnswers({});
    setSignature([]);
    setInvalid(null);
    setProblem(null);
    onClose();
  };

  const submit = () => {
    if (!template) return;
    setProblem(null);
    const bad = answerProblem(template.fields, answers);
    if (bad) {
      setInvalid(bad.fieldId);
      setProblem(formErrorKey(bad.code));
      return;
    }
    if (name.trim().length < 2) return setProblem(formErrorKey('invalid_name'));
    if (template.requiresSignature && !hasInk(signature))
      return setProblem(formErrorKey('signature_required'));
    record.mutate(
      {
        clientId,
        appointmentId,
        templateId: template.id,
        answers: cleanAnswers(answers),
        signerName: name.trim(),
        signature: hasInk(signature) ? signature : null,
      },
      {
        onSuccess: () => {
          toast.show({ message: t('forms.sign.saved'), tone: 'success' });
          close();
        },
        onError: (error) => {
          const code = rpcCode(error);
          if (error instanceof RpcError && typeof error.extra.field_id === 'string')
            setInvalid(error.extra.field_id);
          setProblem(formErrorKey(code));
        },
      },
    );
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title={template?.title ?? t('forms.sign.title')}
      subtitle={t('forms.sign.for', { name: clientName })}
      footer={
        <Button fullWidth loading={record.isPending} disabled={!template} onPress={submit}>
          {t('forms.sign.submit')}
        </Button>
      }
    >
      {template ? (
        <View style={styles.stack}>
          <Text variant="helper" color="textSecondary">
            {t('forms.sign.handOver')}
          </Text>
          <FormRenderer
            body={template.body}
            fields={template.fields}
            answers={answers}
            invalidFieldId={invalid}
            onChange={(id: string, value: AnswerValue) => {
              setInvalid(null);
              setAnswers((a) => ({ ...a, [id]: value }));
            }}
          />
          <Input label={t('forms.sign.signerName')} value={name} onChangeText={setName} required />
          {template.requiresSignature ? (
            <View style={styles.stack}>
              <Text variant="label">{t('forms.sign.signature')}</Text>
              <SignaturePad
                value={signature}
                onChange={setSignature}
                clearLabel={t('forms.sign.clear')}
                hint={t('forms.sign.padHint')}
                accessibilityLabel={t('forms.sign.padLabel')}
              />
            </View>
          ) : null}
          {problem ? (
            <Text variant="helper" color="error">
              {t(problem as never)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Drawer>
  );
}

const styles = StyleSheet.create({ stack: { gap: theme.spacing[12] } });
