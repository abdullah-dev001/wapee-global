import { AlertTriangle, ExternalLink, Globe } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  Text,
  useToast,
} from '@/components/ui';
import { brand } from '@/config/brand';
import { WidgetSettings } from '@/features/widget/components/WidgetSettings';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme, useBreakpoint } from '@/lib/theme';

import { type AdminSection } from '../../adminTypes';
import {
  useEnsureWebsite,
  useSetWebsitePublished,
  useWebsiteAdmin,
} from '../../api/useWebsiteAdmin';
import { websiteUrl } from '../../links';
import { SectionEditorDrawer } from './SectionEditorDrawer';
import { SectionList } from './SectionList';
import { ThemeEditor, type ThemeDraft } from './ThemeEditor';
import { WebsitePreview } from './WebsitePreview';
import { useWebsitePreview } from './useWebsitePreview';
import { websiteErrorMessage } from './websiteErrors';

type Tab = 'sections' | 'theme' | 'widget' | 'preview';

/**
 * The website editor: sections (show/hide, order, content), theme, widget, a live
 * preview built from the same components as the public page, and Publish /
 * Unpublish. Needs `website.edit` to be here at all and `website.publish` to
 * publish. Desktop shows the preview beside the editor; smaller screens get a
 * Preview tab.
 */
export function WebsiteEditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { isDesktop } = useBreakpoint();
  const { businessId, business } = useCurrentScope();
  const canPublish = usePermission('website.publish');

  const site = useWebsiteAdmin(businessId);
  const ensure = useEnsureWebsite(businessId);
  const publish = useSetWebsitePublished(businessId);

  const [tab, setTab] = useState<Tab>('sections');
  const [editing, setEditing] = useState<AdminSection | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [themeDraft, setThemeDraft] = useState<ThemeDraft | null>(null);

  const website = site.data?.website ?? null;
  const sections = site.data?.sections ?? [];
  const draftWebsite = website
    ? {
        ...website,
        ...(themeDraft
          ? {
              brandColor: themeDraft.brandColor,
              fontKey: themeDraft.fontKey,
              radiusKey: themeDraft.radiusKey,
            }
          : {}),
      }
    : null;

  const preview = useWebsitePreview({
    businessId,
    businessName: business?.name ?? '',
    slug: business?.slug ?? '',
    website: draftWebsite,
    sections,
  });

  const tabs: { value: Tab; label: string }[] = [
    { value: 'sections', label: t('websiteEditor.tabs.sections') },
    { value: 'theme', label: t('websiteEditor.tabs.theme') },
    { value: 'widget', label: t('websiteEditor.tabs.widget') },
    ...(isDesktop ? [] : [{ value: 'preview' as Tab, label: t('websiteEditor.tabs.preview') }]),
  ];
  const activeTab: Tab = tab === 'preview' && isDesktop ? 'sections' : tab;

  if (site.isPending || !business) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('websiteEditor.title')}>
          <Skeleton height={44} radius="lg" />
          <Skeleton height={200} radius="lg" />
        </PageContainer>
      </Screen>
    );
  }

  if (site.isError) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('websiteEditor.title')} fill>
          <ErrorState
            title={t('websiteEditor.loadErrorTitle')}
            description={t('websiteEditor.loadErrorMessage')}
            onRetry={() => void site.refetch()}
            retryLabel={t('actions.retry')}
          />
        </PageContainer>
      </Screen>
    );
  }

  if (!website) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('websiteEditor.title')} fill>
          <EmptyState
            icon={Globe}
            title={t('websiteEditor.emptyTitle')}
            description={t('websiteEditor.emptyMessage')}
            action={{
              children: t('websiteEditor.create'),
              onPress: () =>
                ensure.mutate(undefined, {
                  onError: (error) =>
                    toast.show({ message: websiteErrorMessage(t, error), tone: 'error' }),
                }),
            }}
          />
        </PageContainer>
      </Screen>
    );
  }

  const url = websiteUrl(brand.urls.publicSite, business.slug);
  const defaultCountry = business.branches.find((b) => b.id === website.branchId)?.country_code;

  const body = (
    <>
      {activeTab === 'sections' ? (
        <SectionList
          businessId={businessId}
          sections={sections}
          counts={preview.counts}
          onEdit={setEditing}
        />
      ) : null}
      {activeTab === 'theme' ? (
        <ThemeEditor
          key={website.id}
          website={website}
          businessId={businessId}
          onDraftChange={setThemeDraft}
        />
      ) : null}
      {activeTab === 'widget' ? <WidgetSettings businessId={businessId} /> : null}
      {activeTab === 'preview' ? (
        <WebsitePreview model={preview.model} isLoading={preview.isLoading} />
      ) : null}
    </>
  );

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('websiteEditor.title')}
        subtitle={t('websiteEditor.subtitle')}
        actions={
          <View style={styles.actions}>
            {website.isPublished ? (
              <Button
                size="sm"
                variant="secondary"
                startIcon={ExternalLink}
                onPress={() => void Linking.openURL(url)}
              >
                {t('websiteEditor.viewSite')}
              </Button>
            ) : null}
            {canPublish.allowed ? (
              <Button
                size="sm"
                variant={website.isPublished ? 'secondary' : 'primary'}
                onPress={() => setConfirmPublish(true)}
              >
                {website.isPublished ? t('websiteEditor.unpublish') : t('websiteEditor.publish')}
              </Button>
            ) : null}
          </View>
        }
      >
        <View style={styles.stack}>
          <View style={styles.statusRow}>
            <Badge tone={website.isPublished ? 'success' : 'neutral'} dot>
              {website.isPublished
                ? t('websiteEditor.statusPublished')
                : t('websiteEditor.statusDraft')}
            </Badge>
            <Text variant="helper" color="textSecondary" selectable>
              {url}
            </Text>
          </View>

          {preview.bookable === false ? (
            <Card>
              <View style={styles.warning}>
                <AlertTriangle
                  size={theme.iconSize.lg}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.warning}
                />
                <View style={styles.warningText}>
                  <Text variant="bodyStrong">{t('websiteEditor.notBookableTitle')}</Text>
                  <Text variant="small" color="textSecondary">
                    {t('websiteEditor.notBookableMessage')}
                  </Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => router.push('/settings/booking')}
                  >
                    {t('websiteEditor.openBookingSettings')}
                  </Button>
                </View>
              </View>
            </Card>
          ) : null}

          <Tabs items={tabs} value={activeTab} onChange={setTab} />

          {isDesktop ? (
            <View style={styles.columns}>
              <View style={styles.editorColumn}>{body}</View>
              <View style={styles.previewColumn}>
                <WebsitePreview model={preview.model} isLoading={preview.isLoading} />
              </View>
            </View>
          ) : (
            body
          )}
        </View>
      </PageContainer>

      <SectionEditorDrawer
        businessId={businessId}
        section={editing}
        defaultCountry={defaultCountry}
        onClose={() => setEditing(null)}
      />

      <Dialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={
          website.isPublished ? t('websiteEditor.unpublishTitle') : t('websiteEditor.publishTitle')
        }
        message={
          website.isPublished
            ? t('websiteEditor.unpublishMessage')
            : t('websiteEditor.publishMessage')
        }
        busy={publish.isPending}
        confirm={{
          label: website.isPublished ? t('websiteEditor.unpublish') : t('websiteEditor.publish'),
          variant: website.isPublished ? 'danger' : 'primary',
          onPress: () =>
            publish.mutate(
              { published: !website.isPublished },
              {
                onSuccess: () => {
                  setConfirmPublish(false);
                  toast.show({
                    message: website.isPublished
                      ? t('websiteEditor.unpublished')
                      : t('websiteEditor.published'),
                    tone: 'success',
                  });
                },
                onError: (error) => {
                  setConfirmPublish(false);
                  toast.show({ message: websiteErrorMessage(t, error), tone: 'error' });
                },
              },
            ),
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  stack: { gap: theme.spacing[16], marginTop: theme.spacing[8] },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  warning: { flexDirection: 'row', gap: theme.spacing[12] },
  warningText: { flex: 1, gap: theme.spacing[8], alignItems: 'flex-start' },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[24] },
  editorColumn: { flex: 1, minWidth: 0, gap: theme.spacing[16] },
  previewColumn: { flex: 1, minWidth: 0 },
});
