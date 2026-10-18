import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { formatMinuteOfDay } from '@/lib/time';
import { focusRing, theme } from '@/lib/theme';
import { useInteractionState } from '@/components/ui/useInteractionState';

import { uniqueSlotsByStart } from '../slotList';
import type { PublicSlot } from '../types';

export type SlotGridProps = {
  slots: PublicSlot[];
  selectedStartsAt: string | null;
  onSelect: (startsAt: string) => void;
  /**
   * doc §6.2 slot_display. `all_greyed` renders unavailable slots as disabled
   * instead of hiding them, so the customer can see the shape of the day.
   */
  slotDisplay: 'only_available' | 'all_greyed';
  readOnly?: boolean;
};

/**
 * The time picker: a wrapped grid of slot chips.
 *
 * Used by BOTH the settings live preview and (step 5) the real public page.
 *
 * A wrapped grid rather than a vertical list because a day has up to ~32 slots at
 * a 15-minute interval, and a list of 32 rows is a lot of scrolling to find
 * "around 2pm". The grid lets the eye jump.
 *
 * **An unavailable slot is rendered but never pressable**, and carries nothing
 * about why it is taken — the engine deliberately does not tell us, and a customer
 * must not learn who booked it.
 */
export function SlotGrid({
  slots,
  selectedStartsAt,
  onSelect,
  slotDisplay,
  readOnly = false,
}: SlotGridProps) {
  const { t } = useTranslation();

  // With `only_available` the engine already omits taken slots; this filter is a
  // second line of defence so a mismatched config cannot leak them.
  // One chip per start: "Any staff" returns a row per free person (QA F24).
  const unique = uniqueSlotsByStart(slots);
  const visible = slotDisplay === 'all_greyed' ? unique : unique.filter((s) => s.available);

  if (visible.length === 0) {
    return (
      <Text variant="helper" color="textMuted">
        {t('bookingPublic.noSlots')}
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
      {visible.map((slot) => (
        <SlotChip
          key={slot.startsAt}
          slot={slot}
          selected={slot.startsAt === selectedStartsAt}
          readOnly={readOnly}
          onPress={() => onSelect(slot.startsAt)}
        />
      ))}
    </View>
  );
}

function SlotChip({
  slot,
  selected,
  readOnly,
  onPress,
}: {
  slot: PublicSlot;
  selected: boolean;
  readOnly: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const disabled = !slot.available || readOnly;
  const { handlers, showHover, showFocusRing } = useInteractionState(disabled);

  const label = formatMinuteOfDay(slot.localMinute);

  return (
    <Pressable
      {...handlers}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole={readOnly ? 'text' : 'button'}
      accessibilityState={{ disabled, selected }}
      // A greyed chip must say WHY it cannot be tapped, or a screen reader user
      // just hears a time that does nothing.
      accessibilityLabel={slot.available ? label : t('bookingPublic.slotTaken', { time: label })}
      style={[
        styles.chip,
        !slot.available && styles.chipUnavailable,
        selected && styles.chipSelected,
        slot.available && !selected && showHover && styles.chipHovered,
        showFocusRing && focusRing(),
      ]}
    >
      <Text
        variant="buttonSm"
        color={selected ? 'textOnPrimary' : slot.available ? 'textPrimary' : 'textMuted'}
        // A chip is tight UI: cap the scale so a large system font cannot make
        // "09:30" wrap inside its own chip.
        maxFontSizeMultiplier={1.3}
        style={!slot.available ? styles.chipTextUnavailable : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
  chip: {
    // 44px tall and wide enough for "09:30" at a large font: the whole chip is
    // the touch target (CLAUDE.md §4).
    minHeight: theme.layout.minTouchTarget,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[12],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipHovered: {
    borderColor: theme.colors.primary,
  },
  chipUnavailable: {
    backgroundColor: theme.colors.surfaceHover,
    borderColor: theme.colors.borderSubtle,
  },
  chipTextUnavailable: {
    // The one place a strike-through earns its keep: it reads as "taken" without
    // needing a word, which matters in a grid of 30 chips.
    textDecorationLine: 'line-through',
  },
});
