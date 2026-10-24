import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Select, Text } from '@/components/ui';
import { intentPlanKey } from '@/features/billing/planIntent';
import { readPlanIntent, savePlanIntent } from '@/features/billing/planIntentStore';
import { usePublicPricing } from '@/features/plans/api/usePublicPricing';
import { theme } from '@/lib/theme';

import { pickBelowTeamSize, teamSizeOptions, type TeamSizeOption } from '../suggestPlan';

/**
 * Optional "How many people work here?" on onboarding. The answer suggests a plan
 * (saved as the plan intent the Billing screen preselects) unless a plan was already
 * picked on the landing page: that pick wins, with a soft note when it is too small.
 * It changes nothing about the trial and is not sent to the server. Hidden while the
 * public pricing is loading or unavailable (the answers come from the plans' staff caps).
 */
export function TeamSizeQuestion() {
  const { t } = useTranslation();
  const pricing = usePublicPricing();
  const [answerKey, setAnswerKey] = useState<string | null>(null);
  // Read once: answering below rewrites it when the source is the team size itself.
  const [initialIntent] = useState(readPlanIntent);

  const plans = useMemo(() => pricing.data?.plans ?? [], [pricing.data]);
  const options = useMemo(() => teamSizeOptions(plans), [plans]);
  const linkPick =
    initialIntent?.source === 'link' ? intentPlanKey(initialIntent, plans) : null;

  if (options.length < 2) return null;

  const answer: TeamSizeOption | null = options.find((o) => o.planKey === answerKey) ?? null;
  const suggested = answer ? plans.find((p) => p.key === answer.planKey) : undefined;
  const tooSmall = pickBelowTeamSize(plans, linkPick, answer);
  const pickedName = linkPick ? plans.find((p) => p.key === linkPick)?.name : undefined;

  const label = (o: TeamSizeOption): string =>
    o.max === null
      ? t('onboarding.teamSize.atLeast', { count: o.min })
      : o.max === 1
        ? t('onboarding.teamSize.justMe')
        : o.min === o.max
          ? t('onboarding.teamSize.exactly', { count: o.max })
          : t('onboarding.teamSize.range', { min: o.min, max: o.max });

  const onChange = (planKey: string) => {
    setAnswerKey(planKey);
    if (!linkPick) savePlanIntent({ plan: planKey, interval: 'month', source: 'team_size' });
  };

  return (
    <View style={styles.wrap}>
      <Select
        label={t('onboarding.teamSize.label')}
        placeholder={t('onboarding.teamSize.placeholder')}
        value={answerKey}
        onChange={onChange}
        options={options.map((o) => ({ value: o.planKey, label: label(o) }))}
      />
      {tooSmall && pickedName ? (
        <Text variant="helper" color="warning">
          {t('onboarding.teamSize.pickTooSmall', {
            plan: pickedName,
            count: tooSmall.staffCap ?? 0,
          })}
        </Text>
      ) : linkPick && pickedName ? (
        <Text variant="helper" color="textSecondary">
          {t('onboarding.teamSize.picked', { plan: pickedName })}
        </Text>
      ) : suggested ? (
        <Text variant="helper" color="textSecondary">
          {t('onboarding.teamSize.suggested', { plan: suggested.name })}
        </Text>
      ) : (
        <Text variant="helper" color="textMuted">
          {t('onboarding.teamSize.hint')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[4] },
});
