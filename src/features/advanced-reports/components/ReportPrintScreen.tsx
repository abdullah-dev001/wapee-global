import { useRouter } from 'expo-router';
import { ArrowLeft, Printer } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Screen, usePagePadding } from '@/components/layout';
import { Button, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { type PeriodKind } from '../periodLogic';
import { SECTION_KEYS, type SectionKey } from '../reportTypes';
import { SectionPanel } from './SectionPanel';

/** Marks the toolbar so the print stylesheet (app/+html.tsx) hides it. */
const NO_PRINT = { dataSet: { noPrint: 'true' } } as object;

export type PrintParams = {
  section?: string;
  kind?: string;
  anchor?: string;
  from?: string;
  to?: string;
  branch?: string;
};

/**
 * Printable view of ONE section at `/report-print`: no app chrome, so the browser's
 * print dialog (or "Save as PDF") prints only the report. The same RPC (and so the
 * same permissions) as the screen. Native has the CSV share instead of a print.
 */
export function ReportPrintScreen({ params }: { params: PrintParams }) {
  const { t } = useTranslation();
  const router = useRouter();
  const padding = usePagePadding();
  const { businessId, business } = useCurrentScope();

  const section = SECTION_KEYS.find((key) => key === params.section) ?? 'appointments';
  const kind: PeriodKind =
    params.kind === 'weekly' || params.kind === 'custom' ? params.kind : 'monthly';
  const anchor = params.anchor ?? '';
  const query = {
    kind,
    anchor,
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ padding }}>
        <View style={styles.toolbar} {...NO_PRINT}>
          <Button variant="ghost" size="sm" startIcon={ArrowLeft} onPress={() => router.back()}>
            {t('advReports.print.back')}
          </Button>
          {Platform.OS === 'web' ? (
            <Button size="sm" startIcon={Printer} onPress={() => window.print()}>
              {t('advReports.export.print')}
            </Button>
          ) : null}
        </View>
        <Text variant="pageTitle">
          {t('advReports.print.generated', { business: business?.name ?? '' })}
        </Text>
        <Text variant="sectionTitle">{t(`advReports.sections.${section}`)}</Text>
        <SectionPanel
          businessId={businessId}
          branchId={params.branch ?? null}
          section={section satisfies SectionKey}
          query={query}
          forPrint
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[16],
  },
});
