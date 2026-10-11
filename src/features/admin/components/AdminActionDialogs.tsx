import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormField } from '@/components/shared';
import { SegmentedControl } from '@/components/ui';

import {
  assignPlanSchema,
  creditsSchema,
  extendTrialSchema,
  PLAN_KEYS,
  removeReviewSchema,
  setStatusSchema,
  periodEndToIso,
  ADMIN_STATUSES,
  type AssignPlanValues,
  type CreditsValues,
  type ExtendTrialValues,
  type RemoveReviewValues,
  type SetStatusValues,
} from '../schemas/admin.schemas';
import {
  useAddSmsCredits,
  useAssignPlan,
  useExtendTrial,
  useRemoveReview,
  useSetStatus,
} from '../api/useAdmin';
import { AdminFormDialog } from './AdminFormDialog';

type CommonProps = { open: boolean; onClose: () => void };

/** Each dialog tells the admin the action is logged (CLAUDE.md: every admin action is audited). */

export function AssignPlanDialog({
  businessId,
  currentPlan,
  ...p
}: CommonProps & { businessId: string; currentPlan: string | null }) {
  const { t } = useTranslation();
  const assign = useAssignPlan(businessId);
  const initial: AssignPlanValues['plan'] =
    currentPlan === 'team' || currentPlan === 'business' ? currentPlan : 'solo';
  return (
    <AdminFormDialog<AssignPlanValues>
      {...p}
      title={t('admin.actions.assignPlan.title')}
      message={t('admin.actions.assignPlan.message')}
      auditNote={t('admin.audited')}
      confirmLabel={t('admin.actions.assignPlan.confirm')}
      schema={assignPlanSchema}
      defaultValues={{ plan: initial, periodEnd: '', notes: '' }}
      successMessage={t('admin.actions.assignPlan.done')}
      onSubmit={(v) =>
        assign.mutateAsync({ plan: v.plan, periodEnd: periodEndToIso(v.periodEnd), notes: v.notes })
      }
    >
      {(control) => (
        <>
          <Controller
            control={control}
            name="plan"
            render={({ field }) => (
              <SegmentedControl
                label={t('admin.actions.assignPlan.plan')}
                value={field.value}
                onChange={field.onChange}
                options={PLAN_KEYS.map((value) => ({ value, label: t(`plans.names.${value}`) }))}
              />
            )}
          />
          <FormField
            control={control}
            name="periodEnd"
            label={t('admin.actions.assignPlan.periodEnd')}
            hint={t('admin.actions.assignPlan.periodEndHint')}
            placeholder="2027-01-31"
            autoCapitalize="none"
          />
          <FormField
            control={control}
            name="notes"
            label={t('admin.actions.notes')}
            hint={t('admin.actions.notesHint')}
            multiline
          />
        </>
      )}
    </AdminFormDialog>
  );
}

export function SetStatusDialog({ businessId, ...p }: CommonProps & { businessId: string }) {
  const { t } = useTranslation();
  const setStatus = useSetStatus(businessId);
  return (
    <AdminFormDialog<SetStatusValues>
      {...p}
      title={t('admin.actions.setStatus.title')}
      message={t('admin.actions.setStatus.message')}
      auditNote={t('admin.audited')}
      confirmLabel={t('admin.actions.setStatus.confirm')}
      confirmVariant="danger"
      schema={setStatusSchema}
      defaultValues={{ status: 'active', note: '' }}
      successMessage={t('admin.actions.setStatus.done')}
      onSubmit={(v) => setStatus.mutateAsync({ status: v.status, note: v.note })}
    >
      {(control) => (
        <>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <SegmentedControl
                label={t('admin.actions.setStatus.status')}
                value={field.value}
                onChange={field.onChange}
                options={ADMIN_STATUSES.map((value) => ({
                  value,
                  label: t(`plans.status.${value}`),
                }))}
              />
            )}
          />
          <FormField
            control={control}
            name="note"
            label={t('admin.actions.notes')}
            hint={t('admin.actions.notesHint')}
            multiline
          />
        </>
      )}
    </AdminFormDialog>
  );
}

export function ExtendTrialDialog({ businessId, ...p }: CommonProps & { businessId: string }) {
  const { t } = useTranslation();
  const extend = useExtendTrial(businessId);
  return (
    <AdminFormDialog<ExtendTrialValues>
      {...p}
      title={t('admin.actions.extendTrial.title')}
      message={t('admin.actions.extendTrial.message')}
      auditNote={t('admin.audited')}
      confirmLabel={t('admin.actions.extendTrial.confirm')}
      schema={extendTrialSchema}
      defaultValues={{ days: '14' }}
      successMessage={t('admin.actions.extendTrial.done')}
      onSubmit={(v) => extend.mutateAsync(Number(v.days))}
    >
      {(control) => (
        <FormField
          control={control}
          name="days"
          label={t('admin.actions.extendTrial.days')}
          hint={t('admin.actions.extendTrial.daysHint')}
          keyboardType="number-pad"
        />
      )}
    </AdminFormDialog>
  );
}

export function AddCreditsDialog({ businessId, ...p }: CommonProps & { businessId: string }) {
  const { t } = useTranslation();
  const add = useAddSmsCredits(businessId);
  return (
    <AdminFormDialog<CreditsValues>
      {...p}
      title={t('admin.actions.credits.title')}
      message={t('admin.actions.credits.message')}
      auditNote={t('admin.audited')}
      confirmLabel={t('admin.actions.credits.confirm')}
      schema={creditsSchema}
      defaultValues={{ amount: '', note: '' }}
      successMessage={t('admin.actions.credits.done')}
      onSubmit={(v) => add.mutateAsync({ amount: Number(v.amount), note: v.note })}
    >
      {(control) => (
        <>
          <FormField
            control={control}
            name="amount"
            label={t('admin.actions.credits.amount')}
            hint={t('admin.actions.credits.amountHint')}
            keyboardType="numbers-and-punctuation"
          />
          <FormField
            control={control}
            name="note"
            label={t('admin.actions.notes')}
            hint={t('admin.actions.credits.noteHint')}
          />
        </>
      )}
    </AdminFormDialog>
  );
}

export function RemoveReviewDialog({
  businessId,
  reviewId,
  ...p
}: CommonProps & { businessId: string; reviewId: string | null }) {
  const { t } = useTranslation();
  const remove = useRemoveReview(businessId);
  return (
    <AdminFormDialog<RemoveReviewValues>
      {...p}
      title={t('admin.actions.removeReview.title')}
      message={t('admin.actions.removeReview.message')}
      auditNote={t('admin.actions.removeReview.audited')}
      confirmLabel={t('admin.actions.removeReview.confirm')}
      confirmVariant="danger"
      schema={removeReviewSchema}
      defaultValues={{ reason: '' }}
      successMessage={t('admin.actions.removeReview.done')}
      onSubmit={(v) => {
        if (!reviewId) return Promise.reject(new Error('no review'));
        return remove.mutateAsync({ reviewId, reason: v.reason });
      }}
    >
      {(control) => (
        <FormField
          control={control}
          name="reason"
          label={t('admin.actions.removeReview.reason')}
          required
          multiline
        />
      )}
    </AdminFormDialog>
  );
}
