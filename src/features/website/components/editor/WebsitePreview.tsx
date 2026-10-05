import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Skeleton, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { type WebsiteModel } from '../../types';
import { WebsiteView } from '../public/WebsiteView';

const noop = () => undefined;

/**
 * The live preview: the SAME `WebsiteView` the public page renders, fed from the
 * draft. Inert on purpose (no links or Book buttons fire), and labelled, because
 * it is not the published site.
 */
export function WebsitePreview({
  model,
  isLoading,
}: {
  model: WebsiteModel | null;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <Text variant="label" color="textSecondary">
        {t('websiteEditor.preview.title')}
      </Text>
      <View style={styles.frame}>
        {model ? (
          <View pointerEvents="none">
            <WebsiteView model={model} onBook={noop} />
          </View>
        ) : isLoading ? (
          <View style={styles.skeleton}>
            <Skeleton height={64} radius="lg" />
            <Skeleton height={180} radius="lg" />
            <Skeleton height={80} radius="lg" />
          </View>
        ) : null}
      </View>
      <Text variant="helper" color="textSecondary">
        {t('websiteEditor.preview.note')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.spacing[8] },
  frame: {
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.background,
  },
  skeleton: { padding: theme.spacing[16], gap: theme.spacing[12] },
});
