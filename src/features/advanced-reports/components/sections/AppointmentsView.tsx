import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatBp } from '../../reportLogic';
import { type AppointmentsData } from '../../reportTypes';
import { CompareStat, reportStyles } from '../ReportParts';

/** Totals and completed / cancelled / no-show rates, each against the previous period. */
export function AppointmentsView({
  current,
  previous,
}: {
  current: AppointmentsData;
  previous: AppointmentsData;
}) {
  const { t } = useTranslation();
  const rate = (bp: number | null) =>
    bp === null ? undefined : t('advReports.appointmentsSection.rate', { value: formatBp(bp) });
  return (
    <View style={reportStyles.grid}>
      <CompareStat
        label={t('advReports.appointmentsSection.total')}
        value={String(current.total)}
        current={current.total}
        previous={previous.total}
      />
      <CompareStat
        label={t('advReports.appointmentsSection.completed')}
        hint={rate(current.completedBp)}
        value={String(current.completed)}
        current={current.completedBp ?? 0}
        previous={previous.completedBp ?? 0}
      />
      <CompareStat
        label={t('advReports.appointmentsSection.cancelled')}
        hint={rate(current.cancelledBp)}
        value={String(current.cancelled)}
        current={current.cancelledBp ?? 0}
        previous={previous.cancelledBp ?? 0}
        good="down"
      />
      <CompareStat
        label={t('advReports.appointmentsSection.noShow')}
        hint={rate(current.noShowBp)}
        value={String(current.noShow)}
        current={current.noShowBp ?? 0}
        previous={previous.noShowBp ?? 0}
        good="down"
      />
    </View>
  );
}
