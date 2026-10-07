import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SignatureView } from '@/components/shared';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Drawer,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { formatDate, type IanaTimeZone, type LocaleTag, type UtcIso } from '@/lib/time';

import {
  useCreateFormRequest,
  useFormTemplates,
  useSignedConsent,
  useSignedConsents,
  useVoidSignedConsent,
  type SignedConsentRow,
} from '../api/useForms';
import { formErrorKey } from '../formsLogic';
import { RequestLinkDialog } from './RequestLinkDialog';
import { SignFormDrawer } from './SignFormDrawer';

/**
 * Forms on a client's profile: the signed copies (immutable; a void is a new record), "sign on this
 * device" and "send a link". Hidden entirely while the add-on is off or the member may not view files.
 */
export function ClientFormsSection({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const consents = useSignedConsents(businessId, clientId, true);
  const canSign = usePermission('appointments.edit');
  const canVoid = usePermission('forms.manage');
  const templates = useFormTemplates(businessId, canSign.allowed);
  const request = useCreateFormRequest(businessId);
  const voidMutation = useVoidSignedConsent(businessId);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [link, setLink] = useState<{ token: string; queued: boolean } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<SignedConsentRow | null>(null);
  const [reason, setReason] = useState('');

  const timeZone = (business?.branches.find((b) => b.id === branchId)?.timezone ??
    'UTC') as IanaTimeZone;
  const locale = i18n.language as LocaleTag;
  if (consents.isPending) return <Skeleton height={64} />;
  if (!consents.data) return null; // add-on off / not allowed

  const active = (templates.data ?? []).filter((x) => x.isActive);
  const chosen = templateId ?? active[0]?.id ?? null;
  const fail = (error: unknown) =>
    toast.show({ message: t(formErrorKey(rpcCode(error))), tone: 'error' });

  return (
    <View style={styles.stack}>
      <Text variant="sectionTitle">{t('forms.client.title')}</Text>

      {canSign.allowed && active.length > 0 ? (
        <View style={styles.stack}>
          <Select
            label={t('forms.client.choose')}
            options={active.map((x) => ({ value: x.id, label: x.title }))}
            value={chosen}
            onChange={setTemplateId}
          />
          <View style={styles.row}>
            <Button variant="secondary" disabled={!chosen} onPress={() => setSigning(true)}>
              {t('forms.client.signHere')}
            </Button>
            <Button
              variant="secondary"
              disabled={!chosen}
              loading={request.isPending}
              onPress={() =>
                chosen &&
                request.mutate(
                  { clientId, appointmentId: null, templateId: chosen, send: true },
                  {
                    onSuccess: (r) => setLink({ token: r.token, queued: r.queued }),
                    onError: fail,
                  },
                )
              }
            >
              {t('forms.client.sendLink')}
            </Button>
          </View>
        </View>
      ) : null}

      {consents.isError ? (
        <ErrorState
          title={t('forms.client.error')}
          onRetry={() => void consents.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : consents.data.length === 0 ? (
        <Text variant="body" color="textMuted">
          {t('forms.client.empty')}
        </Text>
      ) : (
        consents.data.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            onPress={() => setViewing(row.id)}
          >
            <Card>
              <View style={styles.head}>
                <View style={styles.grow}>
                  <Text variant="cardTitle" numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text variant="helper" color="textSecondary">
                    {t('forms.client.signedBy', {
                      name: row.signerName,
                      date: formatDate(row.signedAt as UtcIso, timeZone, locale, 'medium'),
                    })}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {t(
                      row.signedVia === 'link' ? 'forms.client.viaLink' : 'forms.client.viaDevice',
                    )}{' '}
                    · {t('forms.card.version', { version: row.version })}
                  </Text>
                </View>
                {row.voidedAt ? (
                  <Badge tone="error">{t('forms.client.voided')}</Badge>
                ) : (
                  <Badge tone="success">{t('forms.client.valid')}</Badge>
                )}
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <SignFormDrawer
        open={signing}
        onClose={() => setSigning(false)}
        businessId={businessId}
        clientId={clientId}
        clientName={clientName}
        appointmentId={null}
        templateId={chosen}
      />
      <RequestLinkDialog link={link} onClose={() => setLink(null)} />

      <ConsentDrawer
        id={viewing}
        businessId={businessId}
        onClose={() => setViewing(null)}
        timeZone={timeZone}
        locale={locale}
        canVoid={canVoid.allowed}
        onVoid={(id) => {
          const row = consents.data?.find((r) => r.id === id) ?? null;
          setViewing(null);
          setReason('');
          setVoiding(row);
        }}
      />

      <Dialog
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        title={t('forms.void.title')}
        message={t('forms.void.message')}
        busy={voidMutation.isPending}
        confirm={{
          label: t('forms.void.confirm'),
          variant: 'danger',
          loading: voidMutation.isPending,
          onPress: () => {
            if (!voiding) return;
            voidMutation.mutate(
              { id: voiding.id, reason },
              {
                onSuccess: () => {
                  setVoiding(null);
                  toast.show({ message: t('forms.void.done'), tone: 'success' });
                },
                onError: fail,
              },
            );
          },
        }}
        cancelLabel={t('actions.cancel')}
      >
        <Input
          label={t('forms.void.reason')}
          value={reason}
          onChangeText={setReason}
          maxLength={500}
        />
      </Dialog>
    </View>
  );
}

function ConsentDrawer({
  id,
  businessId,
  onClose,
  timeZone,
  locale,
  canVoid,
  onVoid,
}: {
  id: string | null;
  businessId: string | null;
  onClose: () => void;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  canVoid: boolean;
  onVoid: (id: string) => void;
}) {
  const { t } = useTranslation();
  const detail = useSignedConsent(businessId, id);
  const d = detail.data;
  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      title={d?.title ?? t('forms.client.title')}
      footer={
        d && !d.voidedAt && canVoid && id ? (
          <Button variant="danger" fullWidth onPress={() => onVoid(id)}>
            {t('forms.void.action')}
          </Button>
        ) : undefined
      }
    >
      {detail.isError ? (
        <ErrorState
          title={t('forms.client.error')}
          onRetry={() => void detail.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : !d ? (
        <Skeleton height={120} />
      ) : (
        <View style={styles.stack}>
          {d.voidedAt ? (
            <Card>
              <Text variant="bodyStrong" color="error">
                {t('forms.client.voided')}
              </Text>
              <Text variant="helper" color="textSecondary">
                {d.voidReason}
              </Text>
            </Card>
          ) : null}
          <Text variant="helper" color="textSecondary">
            {t('forms.client.signedBy', {
              name: d.signerName,
              date: formatDate(d.signedAt as UtcIso, timeZone, locale, 'medium'),
            })}{' '}
            · {t(d.signedVia === 'link' ? 'forms.client.viaLink' : 'forms.client.viaDevice')} ·{' '}
            {t('forms.card.version', { version: d.version })}
          </Text>
          {d.body.map((b, i) => (
            <Text key={i} variant={b.type === 'heading' ? 'sectionTitle' : 'paragraph'}>
              {b.type === 'bullet' ? `• ${b.text}` : b.text}
            </Text>
          ))}
          {d.answers.map((a) => (
            <View key={a.fieldId} style={styles.answer}>
              <Text variant="label" color="textSecondary">
                {a.label}
              </Text>
              <Text variant="body" color={a.redacted ? 'textMuted' : 'textPrimary'}>
                {a.redacted
                  ? t('forms.client.redacted')
                  : a.value === null || a.value === undefined
                    ? '—'
                    : typeof a.value === 'boolean'
                      ? t(a.value ? 'forms.fill.yes' : 'forms.fill.no')
                      : String(a.value)}
              </Text>
            </View>
          ))}
          {d.signature && d.signature.length > 0 ? (
            <View style={styles.stack}>
              <Text variant="label" color="textSecondary">
                {t('forms.sign.signature')}
              </Text>
              <SignatureView
                signature={d.signature}
                accessibilityLabel={t('forms.sign.padLabel')}
              />
            </View>
          ) : null}
        </View>
      )}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  grow: { flex: 1, gap: theme.spacing[4] },
  answer: { gap: theme.spacing[4] },
});
