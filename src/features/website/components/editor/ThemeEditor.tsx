import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Input, SegmentedControl, Select, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import {
  removeWebsiteAssets,
  useSaveWebsiteSettings,
  type WebsiteSettingsPatch,
} from '../../api/useWebsiteAdmin';
import { TEMPLATE_KEYS, type AdminWebsite } from '../../adminTypes';
import {
  BRAND_PRESETS,
  WEBSITE_FONT_KEYS,
  WEBSITE_RADIUS_KEYS,
  parseHexColor,
  resolveFontKey,
  resolveRadiusKey,
  type WebsiteFontKey,
  type WebsiteRadiusKey,
} from '../../websiteTheme';
import { ImageUploadField } from './ImageUploadField';
import { websiteErrorMessage } from './websiteErrors';

export type ThemeDraft = {
  brandColor: string | null;
  fontKey: WebsiteFontKey;
  radiusKey: WebsiteRadiusKey;
};

/**
 * Theme: brand colour, font, corner radius, logo, hero image, template key and
 * the page title / description. Colour, font and radius update the live preview
 * as they change (before saving); images save as soon as they are uploaded.
 */
export function ThemeEditor({
  website,
  businessId,
  onDraftChange,
}: {
  website: AdminWebsite;
  businessId: string | null;
  onDraftChange: (draft: ThemeDraft) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveWebsiteSettings(businessId);

  const [colorText, setColorText] = useState(website.brandColor ?? '');
  const [fontKey, setFontKey] = useState<WebsiteFontKey>(resolveFontKey(website.fontKey));
  const [radiusKey, setRadiusKey] = useState<WebsiteRadiusKey>(resolveRadiusKey(website.radiusKey));
  const [template, setTemplate] = useState(website.templateKey);
  const [seoTitle, setSeoTitle] = useState(website.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(website.seoDescription ?? '');

  const parsedColor = colorText.trim() === '' ? null : parseHexColor(colorText.trim());
  const colorInvalid = colorText.trim() !== '' && parsedColor === null;

  const publish = (next: Partial<ThemeDraft>) =>
    onDraftChange({
      brandColor: parsedColor,
      fontKey,
      radiusKey,
      ...next,
    });

  const patch: WebsiteSettingsPatch = {};
  if (!colorInvalid && parsedColor !== website.brandColor) patch.brand_color = parsedColor;
  if (
    fontKey !== resolveFontKey(website.fontKey) ||
    (website.fontKey === null && fontKey !== 'dm_sans')
  ) {
    patch.font_key = fontKey;
  }
  if (
    radiusKey !== resolveRadiusKey(website.radiusKey) ||
    (website.radiusKey === null && radiusKey !== 'md')
  ) {
    patch.radius_key = radiusKey;
  }
  if (template !== website.templateKey) patch.template_key = template;
  if ((seoTitle.trim() || null) !== website.seoTitle) patch.seo_title = seoTitle.trim() || null;
  if ((seoDescription.trim() || null) !== website.seoDescription) {
    patch.seo_description = seoDescription.trim() || null;
  }
  const dirty = Object.keys(patch).length > 0;

  const onSave = () =>
    save.mutate(patch, {
      onSuccess: () => toast.show({ message: t('websiteEditor.saved'), tone: 'success' }),
      onError: (error) => toast.show({ message: websiteErrorMessage(t, error), tone: 'error' }),
    });

  /** Save an image path at once, then delete the file it replaced. */
  const saveImage = (
    key: 'logo_path' | 'hero_image_path',
    next: string | null,
    previous: string | null,
  ) =>
    save.mutate(
      { [key]: next },
      {
        onSuccess: () => {
          if (previous) void removeWebsiteAssets([previous]);
          toast.show({ message: t('websiteEditor.saved'), tone: 'success' });
        },
        onError: (error) => toast.show({ message: websiteErrorMessage(t, error), tone: 'error' }),
      },
    );

  return (
    <View style={styles.form}>
      <View style={styles.block}>
        <Text variant="label">{t('websiteEditor.theme.color')}</Text>
        <View style={styles.swatches}>
          {BRAND_PRESETS.map((hex) => {
            const selected = parsedColor === hex;
            return (
              <Pressable
                key={hex}
                accessibilityRole="button"
                accessibilityLabel={hex}
                accessibilityState={{ selected }}
                onPress={() => {
                  setColorText(hex);
                  publish({ brandColor: hex });
                }}
                style={[
                  styles.swatch,
                  { backgroundColor: hex },
                  selected ? styles.swatchSelected : null,
                ]}
              >
                {selected ? (
                  <Check
                    size={theme.iconSize.md}
                    strokeWidth={theme.iconStroke * 1.5}
                    color={theme.colors.textOnPrimary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Input
          value={colorText}
          onChangeText={(text) => {
            setColorText(text);
            const hex = text.trim() === '' ? null : parseHexColor(text.trim());
            if (text.trim() === '' || hex) publish({ brandColor: hex });
          }}
          placeholder="#024751"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          hint={t('websiteEditor.theme.colorHint')}
          error={colorInvalid ? t('websiteEditor.theme.colorInvalid') : undefined}
        />
      </View>

      <SegmentedControl
        label={t('websiteEditor.theme.font')}
        options={WEBSITE_FONT_KEYS.map((key) => ({
          value: key,
          label: t(`websiteEditor.theme.fonts.${key}`),
        }))}
        value={fontKey}
        onChange={(key) => {
          setFontKey(key);
          publish({ fontKey: key });
        }}
      />

      <SegmentedControl
        label={t('websiteEditor.theme.radius')}
        options={WEBSITE_RADIUS_KEYS.map((key) => ({
          value: key,
          label: t(`websiteEditor.theme.radii.${key}`),
        }))}
        value={radiusKey}
        onChange={(key) => {
          setRadiusKey(key);
          publish({ radiusKey: key });
        }}
      />

      <ImageUploadField
        label={t('websiteEditor.theme.logo')}
        businessId={businessId}
        path={website.logoPath}
        disabled={save.isPending}
        onUploaded={(path) => saveImage('logo_path', path, website.logoPath)}
        onRemove={() => saveImage('logo_path', null, website.logoPath)}
      />

      <ImageUploadField
        label={t('websiteEditor.theme.hero')}
        businessId={businessId}
        path={website.heroImagePath}
        disabled={save.isPending}
        onUploaded={(path) => saveImage('hero_image_path', path, website.heroImagePath)}
        onRemove={() => saveImage('hero_image_path', null, website.heroImagePath)}
      />

      <Select
        label={t('websiteEditor.theme.template')}
        hint={t('websiteEditor.theme.templateHint')}
        options={TEMPLATE_KEYS.map((key) => ({
          value: key,
          label: t(`websiteEditor.theme.templates.${key}`),
        }))}
        value={template}
        onChange={setTemplate}
      />

      <Input
        label={t('websiteEditor.theme.seoTitle')}
        hint={t('websiteEditor.theme.seoTitleHint')}
        value={seoTitle}
        maxLength={70}
        onChangeText={setSeoTitle}
      />
      <Input
        label={t('websiteEditor.theme.seoDescription')}
        hint={t('websiteEditor.theme.seoDescriptionHint')}
        value={seoDescription}
        maxLength={200}
        multiline
        numberOfLines={3}
        onChangeText={setSeoDescription}
      />

      <Button fullWidth disabled={!dirty || colorInvalid} loading={save.isPending} onPress={onSave}>
        {t('actions.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[20] },
  block: { gap: theme.spacing[8] },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  swatch: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
  },
  swatchSelected: { borderWidth: theme.borderWidth.thick, borderColor: theme.colors.textPrimary },
});
