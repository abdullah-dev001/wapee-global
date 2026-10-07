import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Skeleton, Text, useToast } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useAppointmentForms, useCreateFormRequest } from '../api/useForms';
import { formErrorKey } from '../formsLogic';
import { RequestLinkDialog } from './RequestLinkDialog';
import { SignFormDrawer } from './SignFormDrawer';

/**
 * In the appointment drawer: the forms attached to the service, each "pending" or "signed", with
 * "sign here" and "send link". Never blocks the visit. Hidden while the add-on is off.
 */
export function AppointmentFormsSection({
  appointmentId,
  clientId,
  clientName,
}: {
  appointmentId: string;
  clientId: string;
  clientName: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const forms = useAppointmentForms(businessId, appointmentId, true);
  const canSign = usePermission('appointments.edit');
  const request = useCreateFormRequest(businessId);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [link, setLink] = useState<{ token: string; queued: boolean } | null>(null);

  if (forms.isPending) return <Skeleton height={48} />;
  if (!forms.data || forms.data.length === 0) return null;

  return (
    <View style={styles.stack}>
      <Text variant="sectionTitle">{t('forms.appointment.title')}</Text>
      {forms.data.map((f) => (
        <Card key={f.templateId}>
          <View style={styles.head}>
            <View style={styles.grow}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {f.title}
              </Text>
              <Text variant="helper" color="textSecondary">
                {t(f.kind === 'consent' ? 'forms.kind.consent' : 'forms.kind.intake')}
              </Text>
            </View>
            <Badge tone={f.status === 'signed' ? 'success' : 'warning'}>
              {t(`forms.appointment.${f.status}`)}
            </Badge>
          </View>
          {f.status === 'pending' && canSign.allowed ? (
            <View style={styles.row}>
              <Button size="sm" variant="secondary" onPress={() => setSigningId(f.templateId)}>
                {t('forms.client.signHere')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={request.isPending}
                onPress={() =>
                  request.mutate(
                    { clientId, appointmentId, templateId: f.templateId, send: true },
                    {
                      onSuccess: (r) => setLink({ token: r.token, queued: r.queued }),
                      onError: (error) =>
                        toast.show({ message: t(formErrorKey(rpcCode(error))), tone: 'error' }),
                    },
                  )
                }
              >
                {t('forms.client.sendLink')}
              </Button>
            </View>
          ) : null}
        </Card>
      ))}
      <SignFormDrawer
        open={signingId !== null}
        onClose={() => setSigningId(null)}
        businessId={businessId}
        clientId={clientId}
        clientName={clientName}
        appointmentId={appointmentId}
        templateId={signingId}
      />
      <RequestLinkDialog link={link} onClose={() => setLink(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[8] },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  grow: { flex: 1, gap: theme.spacing[4] },
});
