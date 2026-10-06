import { usePathname, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen, usePagePadding } from '@/components/layout';
import { Button, Text } from '@/components/ui';
import { useSignOut } from '@/features/auth';
import { useMyBusinesses } from '@/features/onboarding/api/useBusiness';
import { theme } from '@/lib/theme';

export type AdminScreenProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** `false` for screens that manage their own list. */
  scroll?: boolean;
  children: ReactNode;
};

/**
 * Frame for every admin screen: safe areas, the admin nav (Businesses / Platform /
 * back to the app / sign out) and the page title. Tokens only; the nav wraps on a
 * narrow phone.
 */
export function AdminScreen({
  title,
  subtitle,
  actions,
  scroll = true,
  children,
}: AdminScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const signOut = useSignOut();
  const businesses = useMyBusinesses();
  const padding = usePagePadding();
  const onPlatform = pathname.startsWith('/admin/platform');
  const hasBusiness = (businesses.data?.length ?? 0) > 0;

  return (
    <Screen scroll={scroll}>
      <View style={[styles.nav, { paddingHorizontal: padding, paddingTop: padding }]}>
        <Text variant="cardTitle" color="primary">
          {t('admin.nav.brand')}
        </Text>
        <View style={styles.links}>
          <Button
            size="sm"
            variant={onPlatform ? 'ghost' : 'secondary'}
            onPress={() => router.replace('/admin')}
          >
            {t('admin.nav.businesses')}
          </Button>
          <Button
            size="sm"
            variant={onPlatform ? 'secondary' : 'ghost'}
            onPress={() => router.replace('/admin/platform')}
          >
            {t('admin.nav.platform')}
          </Button>
          {hasBusiness ? (
            <Button size="sm" variant="ghost" onPress={() => router.replace('/today')}>
              {t('admin.nav.backToApp')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            loading={signOut.isPending}
            onPress={() => signOut.mutate()}
          >
            {t('nav.logout')}
          </Button>
        </View>
      </View>
      <PageContainer title={title} subtitle={subtitle} actions={actions} fill={!scroll}>
        {children}
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[6] },
});
