import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Tabs } from '@/components/ui';
import { RouteGuard } from '@/features/auth';
import { BranchHoursEditor } from '@/features/schedule/components/BranchHoursEditor';
import { ClosuresList, ResourcesList } from '@/features/schedule/components/ClosuresList';
import { TimeOffList } from '@/features/schedule/components/TimeOffList';
import { theme } from '@/lib/theme';

type Tab = 'hours' | 'timeOff' | 'closures' | 'resources';

/**
 * Branch opening hours, time off, holidays and resources.
 *
 * Per-person working hours live on the Staff screen, next to the person they
 * belong to; this screen is about the branch as a whole.
 */
export default function ScheduleScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('hours');

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer title={t('schedule.title')}>
          <View style={{ gap: theme.spacing[16] }}>
            <Tabs
              items={[
                { value: 'hours', label: t('schedule.branchHours') },
                { value: 'timeOff', label: t('schedule.timeOff') },
                { value: 'closures', label: t('schedule.holidays') },
                { value: 'resources', label: t('schedule.resources') },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === 'hours' ? <BranchHoursEditor /> : null}
            {tab === 'timeOff' ? <TimeOffList /> : null}
            {tab === 'closures' ? <ClosuresList /> : null}
            {tab === 'resources' ? <ResourcesList /> : null}
          </View>
        </PageContainer>
      </Screen>
    </RouteGuard>
  );
}
