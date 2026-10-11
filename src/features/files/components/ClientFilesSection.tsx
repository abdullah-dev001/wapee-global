import { FileText, ImagePlus, Paperclip, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { formatDate, type IanaTimeZone, type LocaleTag, type UtcIso } from '@/lib/time';

import {
  useClientFiles,
  useClientFilesState,
  useDeleteClientFile,
  useFileUrls,
  useSetPhotoConsent,
  useUploadClientFile,
  type ClientFile,
} from '../api/useFiles';
import {
  FilesApiError,
  fileErrorKey,
  formatBytes,
  PHOTO_CATEGORIES,
  type PhotoCategory,
} from '../filesLogic';
import { canPickPdf, pickPdf } from '../pickDocument';

const loadImagePicker = () => import('expo-image-picker');
const TILE = 112;

/**
 * Files tab for a client (and, with `appointmentId`, for one visit): photo consent, upload (photo from
 * the library, PDF on web), a gallery with signed-URL thumbnails and a delete confirm. The add-on gate,
 * the permission and the client scope are decided by the RPCs; when they refuse, nothing renders.
 */
export function ClientFilesSection({
  clientId,
  appointmentId = null,
}: {
  clientId: string;
  appointmentId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const state = useClientFilesState(businessId, clientId, true);
  const files = useClientFiles(businessId, clientId, appointmentId, Boolean(state.data?.canView));
  const rows = files.data?.pages.flatMap((p) => p.rows) ?? [];
  const urls = useFileUrls(
    businessId,
    rows.map((r) => r.id),
  );
  const upload = useUploadClientFile(businessId);
  const remove = useDeleteClientFile(businessId);
  const consent = useSetPhotoConsent(businessId);
  const [category, setCategory] = useState<PhotoCategory>('before');
  const [deleting, setDeleting] = useState<ClientFile | null>(null);

  const timeZone = (business?.branches.find((b) => b.id === branchId)?.timezone ??
    'UTC') as IanaTimeZone;
  const locale = i18n.language as LocaleTag;

  // Add-on off / not allowed: the RPC says so and the whole section disappears.
  if (state.isPending) return <Skeleton height={64} />;
  if (!state.data) return null;
  const s = state.data;

  const fail = (error: unknown) => {
    const code = error instanceof FilesApiError ? error.code : rpcCode(error);
    toast.show({ message: t(fileErrorKey(code)), tone: 'error' });
  };

  const choosePhoto = async () => {
    let ImagePicker: Awaited<ReturnType<typeof loadImagePicker>>;
    try {
      ImagePicker = await loadImagePicker();
    } catch {
      toast.show({ message: t('files.errors.picker_unavailable'), tone: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    upload.mutate(
      {
        clientId,
        appointmentId,
        category,
        uri: a.uri,
        mime: (a.mimeType ?? 'image/jpeg').toLowerCase(),
        name: a.fileName ?? 'photo.jpg',
        size: a.fileSize,
      },
      {
        onSuccess: () => toast.show({ message: t('files.uploaded'), tone: 'success' }),
        onError: fail,
      },
    );
  };

  const choosePdf = async () => {
    let doc: Awaited<ReturnType<typeof pickPdf>>;
    try {
      doc = await pickPdf();
    } catch {
      toast.show({ message: t('files.errors.picker_unavailable'), tone: 'error' });
      return;
    }
    if (!doc) return;
    upload.mutate(
      {
        clientId,
        appointmentId,
        category: 'document',
        uri: doc.uri,
        mime: doc.mime,
        name: doc.name,
        size: doc.size,
      },
      {
        onSuccess: () => toast.show({ message: t('files.uploaded'), tone: 'success' }),
        onError: fail,
      },
    );
  };

  return (
    <View style={styles.stack}>
      <Text variant="sectionTitle">{t('files.title')}</Text>

      {!appointmentId ? (
        <Card>
          <View style={styles.stack}>
            <Toggle
              label={t('files.consent.label')}
              value={s.photoConsent}
              disabled={!s.canEditConsent || consent.isPending}
              onValueChange={(value) =>
                consent.mutate(
                  { clientId, value },
                  {
                    onSuccess: () =>
                      toast.show({ message: t('files.consent.saved'), tone: 'success' }),
                    onError: fail,
                  },
                )
              }
            />
            <Text variant="helper" color="textSecondary">
              {s.recordedAt
                ? t('files.consent.recorded', {
                    date: formatDate(s.recordedAt as UtcIso, timeZone, locale, 'medium'),
                    name: s.recordedByName ?? t('files.consent.unknownPerson'),
                  })
                : t('files.consent.none')}
            </Text>
          </View>
        </Card>
      ) : null}

      {s.canUpload ? (
        <View style={styles.stack}>
          {s.photoConsent ? (
            <Select
              label={t('files.category.label')}
              options={PHOTO_CATEGORIES.map((c) => ({ value: c, label: t(`files.category.${c}`) }))}
              value={category}
              onChange={(v) => setCategory(v as PhotoCategory)}
            />
          ) : (
            <Text variant="helper" color="warning">
              {t('files.consent.needed')}
            </Text>
          )}
          <View style={styles.row}>
            <Button
              variant="secondary"
              startIcon={ImagePlus}
              disabled={!s.photoConsent}
              loading={upload.isPending}
              onPress={() => void choosePhoto()}
            >
              {t('files.addPhoto')}
            </Button>
            {canPickPdf ? (
              <Button
                variant="secondary"
                startIcon={Paperclip}
                loading={upload.isPending}
                onPress={() => void choosePdf()}
              >
                {t('files.addPdf')}
              </Button>
            ) : null}
          </View>
          <Text variant="helper" color="textMuted">
            {t('files.limits')} {t('files.exifHint')}
          </Text>
        </View>
      ) : null}

      {files.isError ? (
        <ErrorState
          title={t('files.error')}
          description={files.error.message}
          onRetry={() => void files.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : files.isPending ? (
        <View style={styles.row}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={TILE} width={TILE} />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          title={t('files.empty.title')}
          description={t('files.empty.description')}
        />
      ) : (
        <View style={styles.row}>
          {rows.map((file) => {
            const url = urls.data?.[file.id] ?? null;
            return (
              <View key={file.id} style={styles.tileWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={file.name}
                  disabled={!url}
                  onPress={() => url && void Linking.openURL(url)}
                  style={styles.tile}
                >
                  {file.kind === 'photo' && url ? (
                    <Image
                      source={{ uri: url }}
                      resizeMode="cover"
                      style={styles.image}
                      accessibilityLabel={file.name}
                    />
                  ) : (
                    <View style={styles.docTile}>
                      <FileText
                        size={theme.iconSize.xl}
                        strokeWidth={theme.iconStroke}
                        color={theme.colors.textSecondary}
                      />
                    </View>
                  )}
                </Pressable>
                <Text variant="helper" numberOfLines={1} style={styles.caption}>
                  {file.kind === 'photo'
                    ? t(`files.category.${file.category as PhotoCategory}`)
                    : file.name}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {formatBytes(file.size)} ·{' '}
                  {formatDate(file.createdAt as UtcIso, timeZone, locale, 'medium')}
                </Text>
                {s.canUpload ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    startIcon={Trash2}
                    accessibilityLabel={t('files.delete.action')}
                    onPress={() => setDeleting(file)}
                  >
                    {t('actions.delete')}
                  </Button>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {files.hasNextPage ? (
        <Button
          variant="secondary"
          onPress={() => void files.fetchNextPage()}
          loading={files.isFetchingNextPage}
        >
          {t('files.loadMore')}
        </Button>
      ) : null}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('files.delete.title')}
        message={t('files.delete.message')}
        busy={remove.isPending}
        confirm={{
          label: t('files.delete.confirm'),
          variant: 'danger',
          onPress: () => {
            if (!deleting) return;
            remove.mutate(
              { fileId: deleting.id },
              {
                onSuccess: () => {
                  setDeleting(null);
                  toast.show({ message: t('files.deleted'), tone: 'success' });
                },
                onError: (error) => {
                  setDeleting(null);
                  fail(error);
                },
              },
            );
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
  tileWrap: { width: TILE, gap: theme.spacing[4] },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceHover,
  },
  image: { width: TILE, height: TILE },
  docTile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: theme.spacing[4] },
});
