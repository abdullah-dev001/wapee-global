import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

import { ServiceList } from '../ServiceList';
import type { PublicService } from '../../types';

export type ServiceStepProps = {
  services: readonly PublicService[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPrices: boolean;
  locale: string;
};

/** Step 1: thin wrapper over the shared `ServiceList` with real data. */
export function ServiceStep({
  services,
  selectedId,
  onSelect,
  showPrices,
  locale,
}: ServiceStepProps) {
  return (
    <View style={styles.wrapper}>
      <ServiceList
        services={[...services]}
        selectedId={selectedId}
        onSelect={onSelect}
        showPrices={showPrices}
        locale={locale}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[12],
  },
});
