import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import { Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useSaveSmsRate, useSmsRates, type SmsRateRow } from '../api/useAdmin';
import { smsRateSchema, type SmsRateValues } from '../schemas/admin.schemas';
import { AdminFormDialog } from './AdminFormDialog';
import { useAdminMessage } from './useAdminMessage';

/** SMS country rates: credits per segment by dial code (1 credit = USD 0.001). */
export function SmsRatesEditor() {
  const { t } = useTranslation();
  const messageOf = useAdminMessage();
  const rates = useSmsRates();
  const save = useSaveSmsRate();
  const [editing, setEditing] = useState<SmsRateRow | 'new' | null>(null);
  const current = editing && editing !== 'new' ? editing : null;

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Text variant="helper" color="textSecondary" style={styles.grow}>
          {t('admin.rates.hint')}
        </Text>
        <Button size="sm" onPress={() => setEditing('new')}>
          {t('admin.rates.add')}
        </Button>
      </View>
      {rates.isError ? (
        <ErrorState
          title={messageOf(rates.error)}
          onRetry={() => void rates.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : rates.isPending ? (
        <Skeleton height={160} radius="lg" />
      ) : rates.data.length === 0 ? (
        <EmptyState compact title={t('admin.rates.empty')} />
      ) : (
        rates.data.map((r) => (
          <Card key={r.dialCode}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text variant="cardTitle">{`+${r.dialCode} · ${r.countryCode}`}</Text>
                <Text variant="helper" color="textSecondary">
                  {t('admin.rates.line', { credits: r.creditsPerSegment })}
                  {r.note ? ` · ${r.note}` : ''}
                </Text>
              </View>
              <Button size="sm" variant="secondary" onPress={() => setEditing(r)}>
                {t('actions.edit')}
              </Button>
            </View>
          </Card>
        ))
      )}

      <AdminFormDialog<SmsRateValues>
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t('admin.rates.edit', { dial: current.dialCode }) : t('admin.rates.add')}
        auditNote={t('admin.audited')}
        confirmLabel={t('actions.save')}
        schema={smsRateSchema}
        defaultValues={{
          dial: current?.dialCode ?? '',
          country: current?.countryCode ?? '',
          credits: current ? String(current.creditsPerSegment) : '',
          note: current?.note ?? '',
        }}
        successMessage={t('admin.rates.saved')}
        onSubmit={(v) =>
          save.mutateAsync({
            dial: v.dial,
            country: v.country,
            credits: Number(v.credits),
            note: v.note,
          })
        }
      >
        {(control) => (
          <>
            <FormField
              control={control}
              name="dial"
              label={t('admin.rates.dial')}
              hint={t('admin.rates.dialHint')}
              keyboardType="number-pad"
              editable={current === null}
            />
            <FormField
              control={control}
              name="country"
              label={t('admin.rates.country')}
              autoCapitalize="characters"
              maxLength={2}
            />
            <FormField
              control={control}
              name="credits"
              label={t('admin.rates.credits')}
              keyboardType="number-pad"
            />
            <FormField control={control} name="note" label={t('admin.actions.notes')} />
          </>
        )}
      </AdminFormDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  grow: { flex: 1, gap: theme.spacing[2] },
});
