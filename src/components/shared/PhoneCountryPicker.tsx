import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { dialCodes, flagEmoji, searchDialCodes, type DialCode } from '@/config/dialCodes';
import { shadow, theme } from '@/lib/theme';

export type PhoneCountryPickerProps = {
  open: boolean;
  selected: DialCode;
  onSelect: (country: DialCode) => void;
  onClose: () => void;
};

/** Full, searchable country list (name, flag, dial code) used by `PhoneInput`. */
export function PhoneCountryPicker({ open, selected, onSelect, onClose }: PhoneCountryPickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchDialCodes(dialCodes, query), [query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel={t('actions.close')}
        />
        <View style={[styles.sheet, shadow('lg'), { paddingBottom: insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <Text variant="dialogTitle">{t('phoneInput.countryCode')}</Text>
            <View style={styles.search}>
              <Search size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('phoneInput.search')}
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel={t('phoneInput.search')}
                style={[styles.searchInput, theme.text.body, { color: theme.colors.textPrimary }]}
              />
            </View>
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="body" color="textSecondary">
                  {t('phoneInput.noResults')}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Option
                option={item}
                selected={item.code === selected.code}
                onPress={() => {
                  onSelect(item);
                  close();
                }}
              />
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function Option({
  option,
  selected,
  onPress,
}: {
  option: DialCode;
  selected: boolean;
  onPress: () => void;
}) {
  const { handlers, showHover } = useInteractionState(false);
  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.option, showHover ? { backgroundColor: theme.colors.surfaceHover } : null]}
    >
      <Text variant="body" accessibilityElementsHidden>
        {flagEmoji(option.code)}
      </Text>
      <Text variant={selected ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.optionText}>
        {option.name}
      </Text>
      <Text variant="helper" color="textSecondary">
        +{option.dialCode}
      </Text>
      {selected ? (
        <Check size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.primary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    height: '70%',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  sheetHeader: {
    gap: theme.spacing[10],
    padding: theme.spacing[16],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    minHeight: theme.controlHeight.input,
    paddingHorizontal: theme.spacing[12],
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  searchInput: {
    flex: 1,
    outlineWidth: 0,
  },
  empty: {
    padding: theme.spacing[24],
    alignItems: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    minHeight: theme.layout.minTouchTarget,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[10],
  },
  optionText: {
    flex: 1,
  },
});
