import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SearchInput } from '@/components/shared';
import { Button, Text } from '@/components/ui';
import { useClientSearch } from '@/features/appointments/api/useClientSearch';
import { theme } from '@/lib/theme';

export type ClientPickerFieldProps = {
  businessId: string | null;
  clientName: string | null;
  onPick: (client: { id: string; name: string } | null) => void;
  disabled?: boolean;
};

/** Optional client for an invoice: shows the chosen client with Change/Clear, or a server-side search (name/phone, ≥2 chars). */
export function ClientPickerField({
  businessId,
  clientName,
  onPick,
  disabled,
}: ClientPickerFieldProps) {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const results = useClientSearch(businessId, term);

  if (clientName && !searching) {
    return (
      <View style={styles.selected}>
        <View style={styles.name}>
          <Text variant="label" color="textSecondary">
            {t('invoices.form.client')}
          </Text>
          <Text variant="bodyStrong" numberOfLines={1}>
            {clientName}
          </Text>
        </View>
        {disabled ? null : (
          <View style={styles.buttons}>
            <Button size="sm" variant="ghost" onPress={() => setSearching(true)}>
              {t('invoices.form.changeClient')}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => onPick(null)}>
              {t('actions.clear')}
            </Button>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.search}>
      <Text variant="label" color="textSecondary">
        {t('invoices.form.client')}
      </Text>
      <SearchInput onSearch={setTerm} placeholder={t('invoices.form.clientSearch')} />
      {(results.data ?? []).map((client) => (
        <Pressable
          key={client.id}
          accessibilityRole="button"
          onPress={() => {
            onPick({ id: client.id, name: client.fullName });
            setSearching(false);
            setTerm('');
          }}
          style={styles.result}
        >
          <Text variant="bodyStrong" numberOfLines={1}>
            {client.fullName}
          </Text>
          <Text variant="helper" color="textSecondary">
            {client.phoneE164}
          </Text>
        </Pressable>
      ))}
      {clientName ? (
        <Button size="sm" variant="ghost" onPress={() => setSearching(false)}>
          {t('actions.cancel')}
        </Button>
      ) : (
        <Text variant="helper" color="textMuted">
          {t('invoices.form.noClient')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
    flexWrap: 'wrap',
  },
  name: { flexShrink: 1, gap: theme.spacing[2] },
  buttons: { flexDirection: 'row' },
  search: { gap: theme.spacing[8] },
  result: {
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
    paddingVertical: theme.spacing[6],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
});
