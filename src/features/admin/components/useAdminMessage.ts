import { useTranslation } from 'react-i18next';

import { AdminRpcError, adminErrorKey } from '../adminLogic';
import { planErrorKey } from '@/features/plans/planErrors';

/**
 * Turns anything an admin call throws into a sentence. An `over_limit` refusal
 * also names the locations / branches that are over, so the admin knows what to fix.
 */
export function useAdminMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error) => {
    if (error instanceof AdminRpcError) {
      const base = t(adminErrorKey(error.code));
      const over = error.overLimit;
      if (error.code !== 'over_limit' || !over) return base;
      const parts = over.staffOverCap.map((row) =>
        t('admin.errors.overLimitStaff', {
          branch: row.branch,
          count: row.activeStaff,
          cap: row.cap,
        }),
      );
      if (over.branchesOver) {
        parts.push(
          t('admin.errors.overLimitBranches', {
            current: over.branchesOver.current,
            max: over.branchesOver.max,
          }),
        );
      }
      return [base, ...parts].join(' ');
    }
    const plan = planErrorKey(error);
    return plan ? t(plan) : t(adminErrorKey('unknown'));
  };
}
