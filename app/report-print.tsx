import { useLocalSearchParams } from 'expo-router';

import { ReportPrintScreen, type PrintParams } from '@/features/advanced-reports/components';

/** Print view for one advanced-report section. Outside `(app)` on purpose: no sidebar/header, so `window.print()` prints only the report. The RPC still enforces the permissions. */
export default function ReportPrintRoute() {
  const params = useLocalSearchParams<PrintParams>();
  return <ReportPrintScreen params={params} />;
}
