import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, Input, Text, useToast } from '@/components/ui';
import { env } from '@/config/env';
import { theme } from '@/lib/theme';

import { removeWebsiteAssets, useSaveWebsiteSection } from '../../api/useWebsiteAdmin';
import { assetPublicUrl } from '../../imageUpload';
import {
  MAX_GALLERY_IMAGES,
  altTooLong,
  galleryContent,
  galleryDefaults,
  moveItem,
  type GalleryFormValues,
} from '../../schemas/sectionForms.schema';
import { IconAction } from './IconAction';
import { ImageUploadField } from './ImageUploadField';
import { websiteErrorMessage } from './websiteErrors';

/**
 * Gallery: up to 12 images. A new image is uploaded straight away (it just sits
 * in the bucket); the section only changes when the owner presses Save, and files
 * the owner removed are deleted from the bucket after a successful save so the
 * per-business file cap is not eaten by orphans.
 */
export function GalleryForm({
  businessId,
  content,
  onDone,
}: {
  businessId: string | null;
  content: Record<string, unknown>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveWebsiteSection(businessId);

  const original = galleryDefaults(content);
  const [values, setValues] = useState<GalleryFormValues>(original);
  const [pickerKey, setPickerKey] = useState(0);
  const tooLong = values.images.some((i) => altTooLong(i.alt)) || values.title.length > 120;

  const onSave = () => {
    save.mutate(
      { type: 'gallery', content: galleryContent(values) },
      {
        onSuccess: () => {
          // Files that were in the saved section before and are gone now.
          const kept = new Set(values.images.map((i) => i.path));
          void removeWebsiteAssets(original.images.map((i) => i.path).filter((p) => !kept.has(p)));
          toast.show({ message: t('websiteEditor.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) => toast.show({ message: websiteErrorMessage(t, error), tone: 'error' }),
      },
    );
  };

  return (
    <View style={styles.form}>
      <Input
        label={t('websiteEditor.fields.gallery.title')}
        placeholder={t('websiteEditor.fields.gallery.titlePlaceholder')}
        value={values.title}
        maxLength={120}
        onChangeText={(title) => setValues((v) => ({ ...v, title }))}
      />

      {values.images.map((image, index) => (
        <Card key={image.path}>
          <View style={styles.item}>
            <View style={styles.row}>
              {env.supabaseUrl ? (
                <Image
                  source={{ uri: assetPublicUrl(env.supabaseUrl, image.path) }}
                  accessibilityLabel={
                    image.alt || t('websiteEditor.fields.gallery.imageN', { n: index + 1 })
                  }
                  style={styles.thumb}
                />
              ) : null}
              <View style={styles.actions}>
                <IconAction
                  label={t('websiteEditor.moveUp')}
                  icon={ArrowUp}
                  disabled={index === 0}
                  onPress={() =>
                    setValues((v) => ({ ...v, images: moveItem(v.images, index, -1) }))
                  }
                />
                <IconAction
                  label={t('websiteEditor.moveDown')}
                  icon={ArrowDown}
                  disabled={index === values.images.length - 1}
                  onPress={() => setValues((v) => ({ ...v, images: moveItem(v.images, index, 1) }))}
                />
                <IconAction
                  label={t('actions.delete')}
                  icon={Trash2}
                  onPress={() =>
                    setValues((v) => ({ ...v, images: v.images.filter((_, i) => i !== index) }))
                  }
                />
              </View>
            </View>
            <Input
              label={t('websiteEditor.fields.gallery.alt')}
              hint={t('websiteEditor.fields.gallery.altHint')}
              value={image.alt}
              maxLength={150}
              onChangeText={(alt) =>
                setValues((v) => ({
                  ...v,
                  images: v.images.map((img, i) => (i === index ? { ...img, alt } : img)),
                }))
              }
            />
          </View>
        </Card>
      ))}

      {values.images.length < MAX_GALLERY_IMAGES ? (
        <ImageUploadField
          key={pickerKey}
          label={t('websiteEditor.fields.gallery.add')}
          businessId={businessId}
          path={null}
          onUploaded={(path) => {
            setValues((v) => ({ ...v, images: [...v.images, { path, alt: '' }] }));
            setPickerKey((k) => k + 1);
          }}
        />
      ) : (
        <Text variant="helper" color="textSecondary">
          {t('websiteEditor.fields.gallery.max', { max: MAX_GALLERY_IMAGES })}
        </Text>
      )}

      <Button fullWidth loading={save.isPending} disabled={tooLong} onPress={onSave}>
        {t('actions.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  item: { gap: theme.spacing[12] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
  },
  actions: { flexDirection: 'row' },
  thumb: {
    width: 96,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceHover,
  },
});
