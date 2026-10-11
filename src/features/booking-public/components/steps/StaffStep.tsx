import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

import { StaffChoice } from '../StaffChoice';
import { staffIdsForService } from '../../flowState';
import type { PublicStaff } from '../../types';

export type StaffStepProps = {
  serviceId: string;
  staff: readonly PublicStaff[];
  serviceStaff: readonly { serviceId: string; staffId: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  mode: 'hidden' | 'optional' | 'required';
};

/**
 * Step 2: who performs the chosen service. Filters the branch's full staff
 * list down to the people who actually perform THIS service — offering
 * everyone regardless of service would let a customer pick someone who cannot
 * do what they are booking.
 */
export function StaffStep({
  serviceId,
  staff,
  serviceStaff,
  selectedId,
  onSelect,
  mode,
}: StaffStepProps) {
  const eligibleIds = useMemo(
    () => new Set(staffIdsForService(serviceId, serviceStaff)),
    [serviceId, serviceStaff],
  );
  const eligibleStaff = useMemo(
    () => staff.filter((person) => eligibleIds.has(person.id)),
    [staff, eligibleIds],
  );

  return (
    <View style={styles.wrapper}>
      <StaffChoice
        staff={[...eligibleStaff]}
        selectedId={selectedId}
        onSelect={onSelect}
        mode={mode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[12],
  },
});
