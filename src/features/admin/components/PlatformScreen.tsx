import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/ui';
import { theme } from '@/lib/theme';

import { AdminScreen } from './AdminScreen';
import { PresetsEditor } from './PresetsEditor';
import { PricesEditor } from './PricesEditor';
import { SmsRatesEditor } from './SmsRatesEditor';

type Section = 'prices' | 'rates' | 'presets';

/** Platform settings: plan and add-on prices, SMS country rates, industry presets. */
export function PlatformScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('prices');
  return (
    <AdminScreen title={t('admin.platform.title')} subtitle={t('admin.platform.subtitle')}>
      <View style={styles.stack}>
        <SegmentedControl<Section>
          value={section}
          onChange={setSection}
          options={[
            { value: 'prices', label: t('admin.platform.prices') },
            { value: 'rates', label: t('admin.platform.rates') },
            { value: 'presets', label: t('admin.platform.presets') },
          ]}
        />
        {section === 'prices' ? <PricesEditor /> : null}
        {section === 'rates' ? <SmsRatesEditor /> : null}
        {section === 'presets' ? <PresetsEditor /> : null}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({ stack: { gap: theme.spacing[16] } });
