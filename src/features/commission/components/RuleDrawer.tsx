import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MoneyInput } from '@/components/shared';
import { Button, Drawer, Input, Select, SegmentedControl, Text, useToast } from '@/components/ui';
import { bpToPercentText, parsePercentToBp } from '@/features/branches/branchLogic';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { parseLocalDate, todayInZone, toLocalDate } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useSetCommissionRule } from '../api/useCommission';
import {
  commissionErrorKey,
  isValidEffectiveFrom,
  ruleInputProblem,
  type CommissionRule,
  type RuleKind,
  type SetRuleInput,
} from '../commissionLogic';

type Start = 'today' | 'nextMonth' | 'custom';

/** Set (insert a new version of) one commission rule. Earned commission is never changed. */
export function RuleDrawer({
  staffId,
  serviceId,
  targetName,
  current,
  onClose,
}: {
  staffId: string;
  serviceId: string | null;
  targetName: string;
  current: CommissionRule | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, business } = useCurrentScope();
  const save = useSetCommissionRule(businessId);

  const zone = business?.branches.find((b) => b.is_primary)?.timezone ?? 'UTC';
  const today = todayInZone(zone);
  const currencies = useMemo(
    () => [...new Set((business?.branches ?? []).map((b) => b.currency))].sort(),
    [business],
  );

  const [kind, setKind] = useState<RuleKind>(current?.kind ?? 'percent');
  const [percent, setPercent] = useState(
    current?.percentBp ? bpToPercentText(current.percentBp) : '',
  );
  const [flat, setFlat] = useState<number | null>(current?.flatMinor ?? null);
  const [currency, setCurrency] = useState<string>(current?.currency ?? currencies[0] ?? 'GBP');
  const [start, setStart] = useState<Start>('today');
  const [customDate, setCustomDate] = useState(today);
  const [touched, setTouched] = useState(false);

  const effectiveFrom = (() => {
    if (start === 'today') return today;
    if (start === 'nextMonth') {
      const p = parseLocalDate(today);
      if (!p) return today;
      const next =
        p.month === 12 ? toLocalDate(p.year + 1, 1, 1) : toLocalDate(p.year, p.month + 1, 1);
      return next;
    }
    return customDate;
  })();

  const input: SetRuleInput | null =
    kind === 'percent'
      ? (() => {
          const bp = parsePercentToBp(percent);
          return bp === null || percent.trim() === '' ? null : { kind, percentBp: bp };
        })()
      : kind === 'flat'
        ? flat === null
          ? null
          : { kind, flatMinor: flat, currency }
        : { kind };
  const dateOk = isValidEffectiveFrom(effectiveFrom, today);
  const problem =
    input === null ? (kind === 'percent' ? 'percent' : 'flat') : ruleInputProblem(input);

  const onSave = () => {
    setTouched(true);
    if (!input || problem || !dateOk) return;
    save.mutate(
      { staffId, serviceId, input, effectiveFrom },
      {
        onSuccess: () => {
          toast.show({ message: t('commission.rules.saved'), tone: 'success' });
          onClose();
        },
        onError: (error) =>
          toast.show({ message: t(commissionErrorKey(rpcCode(error))), tone: 'error' }),
      },
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={t('commission.rules.formTitle')}
      subtitle={t('commission.rules.formFor', { target: targetName })}
      footer={
        <Button onPress={onSave} loading={save.isPending} fullWidth>
          {t('commission.rules.save')}
        </Button>
      }
    >
      <View style={styles.form}>
        <SegmentedControl<RuleKind>
          label={t('commission.rules.kind')}
          options={[
            { value: 'percent', label: t('commission.rules.kindPercent') },
            { value: 'flat', label: t('commission.rules.kindFlat') },
            { value: 'none', label: t('commission.rules.kindNone') },
          ]}
          value={kind}
          onChange={setKind}
        />
        {kind === 'percent' ? (
          <Input
            label={t('commission.rules.percentLabel')}
            value={percent}
            onChangeText={setPercent}
            keyboardType="decimal-pad"
            endAdornment={
              <Text variant="body" color="textMuted">
                %
              </Text>
            }
            error={touched && problem ? t('commission.errors.invalid_percent') : undefined}
          />
        ) : null}
        {kind === 'flat' ? (
          <>
            <Select
              label={t('commission.rules.currency')}
              options={currencies.map((c) => ({ value: c, label: c }))}
              value={currency}
              onChange={setCurrency}
            />
            <MoneyInput
              label={t('commission.rules.flatLabel')}
              value={flat}
              onChange={setFlat}
              currency={currency}
              locale={i18n.language}
              hint={t('commission.rules.flatHint')}
              error={touched && problem ? t('commission.errors.invalid_flat') : undefined}
            />
          </>
        ) : null}
        <SegmentedControl<Start>
          label={t('commission.rules.from')}
          hint={t('commission.rules.fromHint')}
          options={[
            { value: 'today', label: t('commission.rules.fromToday') },
            { value: 'nextMonth', label: t('commission.rules.fromNextMonth') },
            { value: 'custom', label: t('commission.rules.fromCustom') },
          ]}
          value={start}
          onChange={setStart}
        />
        {start === 'custom' ? (
          <Input
            label={t('commission.rules.dateLabel')}
            value={customDate}
            onChangeText={setCustomDate}
            autoCapitalize="none"
            error={touched && !dateOk ? t('commission.errors.invalid_date') : undefined}
          />
        ) : null}
        <Text variant="helper" color="textSecondary">
          {t('commission.rules.onlyNew')}
        </Text>
      </View>
    </Drawer>
  );
}

const styles = StyleSheet.create({ form: { gap: theme.spacing[16] } });
