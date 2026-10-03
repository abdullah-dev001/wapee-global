import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { focusRing, theme } from '@/lib/theme';
import { useInteractionState } from '@/components/ui/useInteractionState';

import type { PublicStaff } from '../types';

export type StaffChoiceProps = {
  staff: PublicStaff[];
  /** null = "Any staff". */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * doc §6.2:
   *   hidden   — render nothing; the engine picks (least-loaded that day)
   *   optional — offer "Any staff" plus each person
   *   required — each person, no "Any staff"
   */
  mode: 'hidden' | 'optional' | 'required';
  readOnly?: boolean;
};

/**
 * Step 2 of the public booking flow: pick a person, or let the business decide.
 *
 * Used by BOTH the settings live preview and (step 5) the real public page.
 *
 * Renders nothing at all in `hidden` mode. That is not just cosmetic: with the
 * choice hidden, `create_booking` deliberately IGNORES any staff_id in the
 * request, so showing a picker would offer a choice the server discards.
 */
export function StaffChoice({
  staff,
  selectedId,
  onSelect,
  mode,
  readOnly = false,
}: StaffChoiceProps) {
  const { t } = useTranslation();

  if (mode === 'hidden') return null;

  if (staff.length === 0) {
    return (
      <Text variant="helper" color="textMuted">
        {t('bookingPublic.noStaff')}
      </Text>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* "Any staff" exists only in `optional` mode (doc §6.2). */}
      {mode === 'optional' ? (
        <StaffOption
          label={t('bookingPublic.anyStaff')}
          hint={t('bookingPublic.anyStaffHint')}
          selected={selectedId === null}
          readOnly={readOnly}
          onPress={() => onSelect(null)}
        />
      ) : null}

      {staff.map((person) => (
        <StaffOption
          key={person.id}
          label={person.displayName}
          selected={selectedId === person.id}
          readOnly={readOnly}
          onPress={() => onSelect(person.id)}
        />
      ))}
    </View>
  );
}

function StaffOption({
  label,
  hint,
  selected,
  readOnly,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  readOnly: boolean;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(readOnly);

  return (
    <Pressable
      {...handlers}
      onPress={readOnly ? undefined : onPress}
      accessibilityRole={readOnly ? 'text' : 'radio'}
      accessibilityState={readOnly ? undefined : { selected }}
      style={[
        styles.option,
        selected && styles.optionSelected,
        showHover && !selected && styles.optionHovered,
        showFocusRing && focusRing(),
      ]}
    >
      <View style={styles.optionText}>
        <Text variant="body" color="textPrimary" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="helper" color="textSecondary">
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[8],
  },
  option: {
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[14],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  optionHovered: {
    borderColor: theme.colors.textMuted,
  },
  optionText: {
    gap: theme.spacing[2],
  },
});
