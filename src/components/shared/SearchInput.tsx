import { Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { Input, type InputProps } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { theme } from '@/lib/theme';

/** Server-side search needs at least this many characters (CLAUDE.md §6). */
export const SEARCH_MIN_LENGTH = 2;

export type SearchInputProps = Omit<InputProps, 'value' | 'onChangeText' | 'endAdornment'> & {
  /** Debounced term, 300ms, empty until `SEARCH_MIN_LENGTH` characters. */
  onSearch: (term: string) => void;
  /** Starting text, e.g. restored from a URL search param. */
  initialValue?: string;
};

/**
 * Debounced search box for a server-side query (CLAUDE.md §6: 300ms, minimum 2
 * characters, never filter a full table in JS).
 *
 * It owns the text and reports only the debounced term, so a list hook can put
 * that straight in its query key without re-fetching on every keystroke.
 */
export function SearchInput({ onSearch, initialValue = '', ...inputProps }: SearchInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialValue);
  const debounced = useDebounce(text, 300);

  // One search term below the minimum is an empty term, not a one-letter query.
  const term = debounced.trim().length >= SEARCH_MIN_LENGTH ? debounced.trim() : '';
  // Reported from an effect, never during render: onSearch sets the PARENT's state, and React warns when one
  // component updates another while rendering.
  const lastReported = useRef(term);
  useEffect(() => {
    if (lastReported.current === term) return;
    lastReported.current = term;
    onSearch(term);
  }, [term, onSearch]);

  return (
    <Input
      {...inputProps}
      value={text}
      onChangeText={setText}
      placeholder={inputProps.placeholder ?? t('actions.search')}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      // Native clear buttons differ per platform, so we draw our own.
      clearButtonMode="never"
      prefix={undefined}
      endAdornment={
        text.length > 0 ? (
          <Pressable
            onPress={() => setText('')}
            accessibilityRole="button"
            accessibilityLabel={t('actions.clear')}
            hitSlop={8}
            style={styles.clear}
          >
            <X size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
          </Pressable>
        ) : (
          <Search
            size={theme.iconSize.sm}
            strokeWidth={theme.iconStroke}
            color={theme.colors.textMuted}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  clear: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
