import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatBp } from '../../reportLogic';
import { type ClientsData } from '../../reportTypes';
import { CompareStat, reportStyles } from '../ReportParts';

/** New vs returning clients and how many of last period's clients came back. */
export function ClientsView({
  current,
  previous,
}: {
  current: ClientsData;
  previous: ClientsData;
}) {
  const { t } = useTranslation();
  return (
    <View style={reportStyles.grid}>
      <CompareStat
        label={t('advReports.clients.active')}
        hint={t('advReports.clients.activeHint')}
        value={String(current.active)}
        current={current.active}
        previous={previous.active}
      />
      <CompareStat
        label={t('advReports.clients.new')}
        hint={t('advReports.clients.newHint')}
        value={String(current.new)}
        current={current.new}
        previous={previous.new}
      />
      <CompareStat
        label={t('advReports.clients.returning')}
        value={String(current.returning)}
        current={current.returning}
        previous={previous.returning}
      />
      <CompareStat
        label={t('advReports.clients.retention')}
        hint={
          current.retentionBp === null
            ? t('advReports.clients.noRetention')
            : t('advReports.clients.retentionHint')
        }
        value={formatBp(current.retentionBp)}
        current={current.retentionBp ?? 0}
        previous={0}
      />
    </View>
  );
}
