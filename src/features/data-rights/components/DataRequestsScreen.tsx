import { Download, Inbox, ShieldOff } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDateTime, type UtcIso } from '@/lib/time';

import {
  DataRightsError,
  useDataRequests,
  useExportClient,
  useResolveDataRequest,
  type DataRequest,
} from '../api/useClientData';
import {
  dataRightsErrorKey,
  requestAbilities,
  statusTone,
  type RequestStatus,
} from '../dataRightsLogic';
import { deliverExport } from '../deliverExport';
import { EraseClientDialog } from './EraseClientDialog';

/**
 * Customer requests for their data (made in the client portal). A person with `clients.export` sees them; running an
 * export downloads the JSON and closes the request; running an erase opens the same typed confirmation as the client
 * profile (and needs `clients.erase`). A request can also be declined without acting.
 */
export function DataRequestsScreen() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useCurrentScope();
  const canExport = usePermission('clients.export').allowed;
  const canErase = usePermission('clients.erase').allowed;
  const toast = useToast();
  const [status, setStatus] = useState<RequestStatus>('open');
  const list = useDataRequests(businessId, status);
  const exportClient = useExportClient();
  const resolve = useResolveDataRequest(businessId);
  const [declining, setDeclining] = useState<DataRequest | null>(null);
  const [erasing, setErasing] = useState<{ id: string; name: string } | null>(null);
  const zone = business?.branches[0]?.timezone ?? 'UTC';

  const failure = (error: Error) =>
    toast.show({
      message: t(dataRightsErrorKey(error instanceof DataRightsError ? error.code : null)),
      tone: 'error',
    });

  const runExport = (request: DataRequest, clientId: string) =>
    exportClient.mutate(clientId, {
      onSuccess: (json) => {
        void deliverExport(json, `client-${clientId}.json`).then(() => {
          resolve.mutate(
            { id: request.id, outcome: 'done' },
            {
              onSuccess: () =>
                toast.show({ message: t('dataRights.requests.exported'), tone: 'success' }),
              onError: failure,
            },
          );
        });
      },
      onError: failure,
    });

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('dataRights.requests.title')}
        subtitle={t('dataRights.requests.subtitle')}
      >
        <View style={styles.stack}>
          <SegmentedControl
            label={t('dataRights.requests.statusLabel')}
            value={status}
            onChange={setStatus}
            options={[
              { value: 'open', label: t('dataRights.requests.status.open') },
              { value: 'done', label: t('dataRights.requests.status.done') },
              { value: 'declined', label: t('dataRights.requests.status.declined') },
            ]}
          />
          {list.isPending ? (
            <View style={styles.stack}>
              <Skeleton height={96} radius="md" />
              <Skeleton height={96} radius="md" />
            </View>
          ) : list.isError ? (
            <ErrorState
              title={t('dataRights.requests.loadError')}
              description={t('dataRights.requests.loadErrorBody')}
              onRetry={() => void list.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : list.data.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t(`dataRights.requests.empty.${status}.title`)}
              description={t(`dataRights.requests.empty.${status}.body`)}
            />
          ) : (
            list.data.map((request) => {
              const ability = requestAbilities(request.kind, { canExport, canErase });
              return (
                <Card key={request.id}>
                  <View style={styles.stack}>
                    <View style={styles.head}>
                      <View style={styles.grow}>
                        <Text variant="cardTitle">
                          {request.kind === 'export'
                            ? t('dataRights.requests.kind.export')
                            : t('dataRights.requests.kind.erase')}
                        </Text>
                        <Text variant="helper" color="textSecondary">
                          {request.email ?? t('dataRights.requests.emailForgotten')}
                          {' · '}
                          {formatDateTime(
                            request.createdAt as UtcIso,
                            zone,
                            i18n.language,
                            'medium',
                          )}
                        </Text>
                      </View>
                      <Badge tone={statusTone(request.status)}>
                        {t(`dataRights.requests.status.${request.status}`)}
                      </Badge>
                    </View>
                    {request.status === 'open' ? (
                      <>
                        {request.clients.length === 0 ? (
                          <Text variant="helper" color="textSecondary">
                            {t('dataRights.requests.noMatch')}
                          </Text>
                        ) : (
                          <Text variant="helper" color="textSecondary">
                            {t('dataRights.requests.matches', { count: request.clients.length })}
                          </Text>
                        )}
                        {!ability.canRun && request.kind === 'erase' ? (
                          <Text variant="helper" color="textSecondary">
                            {t('dataRights.requests.ownerOnly')}
                          </Text>
                        ) : null}
                        <View style={styles.actions}>
                          {ability.canRun
                            ? request.clients.map((client) =>
                                request.kind === 'export' ? (
                                  <Button
                                    key={client.id}
                                    size="sm"
                                    variant="secondary"
                                    startIcon={Download}
                                    loading={exportClient.isPending || resolve.isPending}
                                    onPress={() => runExport(request, client.id)}
                                    accessibilityLabel={t('dataRights.requests.runExportFor', {
                                      name: client.fullName,
                                    })}
                                  >
                                    {t('dataRights.requests.runExport', { name: client.fullName })}
                                  </Button>
                                ) : (
                                  <Button
                                    key={client.id}
                                    size="sm"
                                    variant="danger"
                                    startIcon={ShieldOff}
                                    onPress={() =>
                                      setErasing({ id: client.id, name: client.fullName })
                                    }
                                    accessibilityLabel={t('dataRights.requests.runEraseFor', {
                                      name: client.fullName,
                                    })}
                                  >
                                    {t('dataRights.requests.runErase', { name: client.fullName })}
                                  </Button>
                                ),
                              )
                            : null}
                          {ability.canDecline ? (
                            <Button size="sm" variant="ghost" onPress={() => setDeclining(request)}>
                              {t('dataRights.requests.decline')}
                            </Button>
                          ) : null}
                        </View>
                      </>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}
        </View>
      </PageContainer>

      <Dialog
        open={declining !== null}
        onClose={() => setDeclining(null)}
        busy={resolve.isPending}
        title={t('dataRights.requests.declineTitle')}
        message={t('dataRights.requests.declineBody')}
        confirm={{
          label: t('dataRights.requests.decline'),
          variant: 'danger',
          loading: resolve.isPending,
          onPress: () => {
            if (!declining) return;
            resolve.mutate(
              { id: declining.id, outcome: 'declined' },
              {
                onSuccess: () => {
                  setDeclining(null);
                  toast.show({ message: t('dataRights.requests.declined'), tone: 'success' });
                },
                onError: (error) => {
                  setDeclining(null);
                  failure(error);
                },
              },
            );
          },
        }}
      />
      {erasing ? (
        <EraseClientDialog
          open
          onClose={() => setErasing(null)}
          clientId={erasing.id}
          clientName={erasing.name}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  grow: { flex: 1, gap: theme.spacing[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
});
