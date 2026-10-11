import { type ReactNode } from 'react';
import { Frame } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { EmptyState, Skeleton } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useEmbedGuard } from '../api/useEmbedGuard';

/**
 * Wraps the public booking page. When the page is framed by the widget it waits
 * for the server to confirm the embedding site; if that fails it shows a plain
 * "not available here" message. Outside a frame it renders its children at once.
 */
export function EmbedGate({
  slug,
  embedParam,
  children,
}: {
  slug: string | undefined;
  embedParam: string | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const guard = useEmbedGuard(slug, embedParam);

  if (guard.status === 'open') return <>{children}</>;

  if (guard.status === 'checking') {
    return (
      <Screen>
        <View style={{ padding: theme.layout.pagePaddingMobile, gap: theme.spacing[12] }}>
          <Skeleton height={24} width="50%" />
          <Skeleton height={120} radius="lg" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageContainer fill>
        <EmptyState
          icon={Frame}
          title={t('widget.embed.blockedTitle')}
          description={t('widget.embed.blockedMessage')}
        />
      </PageContainer>
    </Screen>
  );
}
