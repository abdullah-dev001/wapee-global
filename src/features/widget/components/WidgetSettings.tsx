import * as Clipboard from 'expo-clipboard';
import { Code2, Copy, Plus, RefreshCw, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { brand } from '@/config/brand';
import { env } from '@/config/env';
import { theme } from '@/lib/theme';

import {
  WidgetRpcError,
  useEnsureWidgetKey,
  useRotateWidgetKey,
  useSaveWidgetDomains,
  useSetWidgetActive,
  useWidgetKey,
} from '../api/useWidgetKey';
import { useWidgetFeatureEnabled } from '../api/useWidgetFeature';
import {
  MAX_WIDGET_DOMAINS,
  addDomain,
  buildWidgetSnippet,
  domainListProblem,
  functionsBaseUrl,
  normaliseDomainInput,
} from '../widgetLogic';

/** Widget settings: public key, allowed sites, copyable snippet, on/off. */
export function WidgetSettings({ businessId }: { businessId: string | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const enabled = useWidgetFeatureEnabled();
  const key = useWidgetKey(businessId);
  const ensure = useEnsureWidgetKey(businessId);
  const saveDomains = useSaveWidgetDomains(businessId);
  const setActive = useSetWidgetActive(businessId);
  const rotate = useRotateWidgetKey(businessId);

  const [domainText, setDomainText] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const fail = (error: Error) =>
    toast.show({
      message:
        error instanceof WidgetRpcError
          ? t(`widget.errors.${error.code}`)
          : t('widget.errors.unknown'),
      tone: 'error',
    });

  if (!enabled) {
    return (
      <EmptyState
        icon={Code2}
        title={t('widget.unavailableTitle')}
        description={t('widget.unavailableMessage')}
      />
    );
  }
  if (key.isPending) return <Skeleton height={160} radius="lg" />;
  if (key.isError) {
    return (
      <ErrorState
        title={t('widget.loadErrorTitle')}
        onRetry={() => void key.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }

  if (!key.data) {
    return (
      <EmptyState
        icon={Code2}
        title={t('widget.emptyTitle')}
        description={t('widget.emptyMessage')}
        action={{
          children: t('widget.create'),
          onPress: () => ensure.mutate(undefined, { onError: fail }),
        }}
      />
    );
  }

  const widget = key.data;
  const snippet = env.supabaseUrl
    ? buildWidgetSnippet({
        publicSiteUrl: brand.urls.publicSite,
        functionsUrl: functionsBaseUrl(env.supabaseUrl),
        key: widget.publicKey,
      })
    : '';

  const copy = async (text: string, messageKey: 'widget.keyCopied' | 'widget.snippetCopied') => {
    await Clipboard.setStringAsync(text);
    toast.show({ message: t(messageKey), tone: 'success' });
  };

  const addNew = () => {
    const host = normaliseDomainInput(domainText);
    if (!host) return;
    const next = addDomain(widget.allowedDomains, domainText);
    const problem = domainListProblem(next);
    if (problem) {
      setDomainError(t(`widget.domains.errors.${problem}`));
      return;
    }
    setDomainError(null);
    saveDomains.mutate({ domains: next }, { onSuccess: () => setDomainText(''), onError: fail });
  };

  return (
    <View style={styles.stack}>
      <Text variant="small" color="textSecondary">
        {t('widget.intro')}
      </Text>

      <Card>
        <View style={styles.block}>
          <View style={styles.rowBetween}>
            <Text variant="cardTitle">{t('widget.status')}</Text>
            <Badge tone={widget.isActive ? 'success' : 'neutral'} dot>
              {widget.isActive ? t('widget.active') : t('widget.inactive')}
            </Badge>
          </View>
          <Toggle
            label={t('widget.activeToggle')}
            value={widget.isActive}
            disabled={setActive.isPending}
            onValueChange={(active) => setActive.mutate({ active }, { onError: fail })}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.block}>
          <Text variant="cardTitle">{t('widget.key')}</Text>
          <Text variant="body" selectable>
            {widget.publicKey}
          </Text>
          <View style={styles.actions}>
            <Button
              size="sm"
              variant="secondary"
              startIcon={Copy}
              onPress={() => void copy(widget.publicKey, 'widget.keyCopied')}
            >
              {t('widget.copyKey')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              startIcon={RefreshCw}
              onPress={() => setConfirmRotate(true)}
            >
              {t('widget.rotate')}
            </Button>
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.block}>
          <Text variant="cardTitle">{t('widget.domains.title')}</Text>
          <Text variant="helper" color="textSecondary">
            {t('widget.domains.hint', { max: MAX_WIDGET_DOMAINS })}
          </Text>
          {widget.allowedDomains.length === 0 ? (
            <Text variant="small" color="textSecondary">
              {t('widget.domains.empty')}
            </Text>
          ) : (
            widget.allowedDomains.map((domain) => (
              <View key={domain} style={styles.domainRow}>
                <Text variant="body" style={styles.domainText}>
                  {domain}
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={X}
                  accessibilityLabel={t('widget.domains.remove', { domain })}
                  disabled={saveDomains.isPending}
                  onPress={() =>
                    saveDomains.mutate(
                      { domains: widget.allowedDomains.filter((d) => d !== domain) },
                      { onError: fail },
                    )
                  }
                >
                  {t('actions.delete')}
                </Button>
              </View>
            ))
          )}
          <Input
            label={t('widget.domains.add')}
            placeholder="www.example.com"
            value={domainText}
            onChangeText={(text) => {
              setDomainText(text);
              setDomainError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            error={domainError ?? undefined}
            onSubmitEditing={addNew}
          />
          <Button
            size="sm"
            variant="secondary"
            startIcon={Plus}
            loading={saveDomains.isPending}
            disabled={domainText.trim() === ''}
            onPress={addNew}
          >
            {t('widget.domains.addButton')}
          </Button>
        </View>
      </Card>

      <Card>
        <View style={styles.block}>
          <Text variant="cardTitle">{t('widget.snippet.title')}</Text>
          <Text variant="helper" color="textSecondary">
            {t('widget.snippet.hint')}
          </Text>
          <View style={styles.code}>
            <Text variant="small" selectable>
              {snippet}
            </Text>
          </View>
          <Button
            size="sm"
            variant="secondary"
            startIcon={Copy}
            disabled={!snippet}
            onPress={() => void copy(snippet, 'widget.snippetCopied')}
          >
            {t('widget.snippet.copy')}
          </Button>
        </View>
      </Card>

      <Dialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title={t('widget.rotateTitle')}
        message={t('widget.rotateMessage')}
        busy={rotate.isPending}
        confirm={{
          label: t('widget.rotateConfirm'),
          variant: 'danger',
          onPress: () =>
            rotate.mutate(undefined, {
              onSuccess: () => setConfirmRotate(false),
              onError: (error) => {
                setConfirmRotate(false);
                fail(error);
              },
            }),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  block: { gap: theme.spacing[12] },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  domainText: { flexShrink: 1 },
  code: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceHover,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
  },
});
