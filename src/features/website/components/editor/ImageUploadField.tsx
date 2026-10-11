import { ImagePlus, Trash2 } from 'lucide-react-native';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Text, useToast } from '@/components/ui';
import { env } from '@/config/env';
import { theme } from '@/lib/theme';

import { useUploadWebsiteImage } from '../../api/useWebsiteAdmin';
import { assetPublicUrl } from '../../imageUpload';
import { websiteErrorMessage } from './websiteErrors';

const loadImagePicker = () => import('expo-image-picker');

export type ImageUploadFieldProps = {
  label: string;
  businessId: string | null;
  /** Current stored path, or null. */
  path: string | null;
  /** Called with the NEW path after a successful upload. The caller saves it and removes the old file. */
  onUploaded: (path: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
};

/**
 * Pick, check and upload one image to the website-assets bucket. Type and size
 * are checked on the client first for a quick refusal (the server limits still
 * apply). The hint says plainly that location data inside photos is NOT removed.
 */
export function ImageUploadField({
  label,
  businessId,
  path,
  onUploaded,
  onRemove,
  disabled = false,
}: ImageUploadFieldProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const upload = useUploadWebsiteImage(businessId);

  const pick = async () => {
    // Loaded on use, not at import: the picker is a native module, and an app build
    // made before it was added must still start (only choosing an image needs the rebuild).
    let ImagePicker: Awaited<ReturnType<typeof loadImagePicker>>;
    try {
      ImagePicker = await loadImagePicker();
    } catch {
      toast.show({ message: t('websiteEditor.image.errors.picker_unavailable'), tone: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    upload.mutate(
      { uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize },
      {
        onSuccess: onUploaded,
        onError: (error) => toast.show({ message: websiteErrorMessage(t, error), tone: 'error' }),
      },
    );
  };

  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      {path && env.supabaseUrl ? (
        <Image
          source={{ uri: assetPublicUrl(env.supabaseUrl, path) }}
          accessibilityLabel={label}
          resizeMode="cover"
          style={styles.preview}
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          startIcon={ImagePlus}
          loading={upload.isPending}
          disabled={disabled || !businessId}
          onPress={() => void pick()}
        >
          {path ? t('websiteEditor.image.replace') : t('websiteEditor.image.choose')}
        </Button>
        {path && onRemove ? (
          <Button
            size="sm"
            variant="ghost"
            startIcon={Trash2}
            disabled={disabled}
            onPress={onRemove}
          >
            {t('websiteEditor.image.remove')}
          </Button>
        ) : null}
      </View>
      <Text variant="helper" color="textSecondary">
        {t('websiteEditor.image.hint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[8] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  preview: {
    width: '100%',
    maxWidth: 240,
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceHover,
  },
});
