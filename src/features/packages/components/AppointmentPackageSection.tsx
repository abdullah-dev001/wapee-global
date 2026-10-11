import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Dialog, Input, Select, Skeleton, Text, useToast } from '@/components/ui';
import { useSession } from '@/features/auth';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import {
  useAppointmentUsages,
  useClientPackages,
  useDeductSession,
  useReverseSession,
} from '../api/usePackages';
import { activeDeductions, canUndoNow, packageErrorKey, type SessionUsage } from '../packageLogic';

/**
 * Package balance + "use a session" inside the appointment drawer. Shown only when the add-on
 * is on and the member may deduct sessions (`usePermission` includes the add-on gate); the
 * RPC checks the same rules again (status, client, service, expiry, balance, own scope).
 *
 * Undo: the creator can undo for 10 minutes; a holder of `packages.reverse_session` can
 * reverse any time, with a reason. Both create a NEW row, nothing is deleted.
 */
export function AppointmentPackageSection({
  appointmentId,
  branchId,
  clientId,
  serviceId,
  status,
}: {
  appointmentId: string;
  branchId: string;
  clientId: string;
  serviceId: string;
  status: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useSession();
  const { businessId } = useCurrentScope();
  const canDeduct = usePermission('packages.deduct_session', branchId);
  const canReverse = usePermission('packages.reverse_session', branchId);
  const eligible = status === 'confirmed' || status === 'completed';

  const usages = useAppointmentUsages(businessId, appointmentId, canDeduct.allowed);
  const usable = useClientPackages(businessId, clientId, {
    serviceId,
    usableOnly: true,
    enabled: canDeduct.allowed && eligible,
  });
  const deduct = useDeductSession(businessId);
  const reverse = useReverseSession(businessId);

  const [chosen, setChosen] = useState<string | null>(null);
  const [confirmPackage, setConfirmPackage] = useState<{ id: string; name: string } | null>(null);
  const [reversing, setReversing] = useState<SessionUsage | null>(null);
  const [reason, setReason] = useState('');
  // A ticking clock keeps the Undo button honest while the drawer stays open (the server enforces the window).
  const [tickMs, setTickMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTickMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // The last fetch time is never behind a deduction that was just written, so Undo shows at once.
  const nowMs = Math.max(tickMs, usages.dataUpdatedAt);

  if (!canDeduct.allowed) return null;
  if (usages.isPending) return <Skeleton height={64} />;

  const rows = usages.data ?? [];
  const active = activeDeductions(rows);
  const packages = usable.data ?? [];
  const reversedCount = rows.filter((r) => r.kind === 'reversal').length;
  const selected = packages.find((p) => p.id === (chosen ?? packages[0]?.id));

  const fail = (error: Error) =>
    toast.show({ message: t(packageErrorKey(rpcCode(error))), tone: 'error' });

  // Undo in the window needs no reason; later (reverse permission) needs one.
  const startReverse = (usage: SessionUsage) => {
    if (canUndoNow(usage, user?.id ?? null, nowMs)) {
      reverse.mutate(
        { usageId: usage.id },
        {
          onSuccess: () =>
            toast.show({ message: t('packages.appointment.undone'), tone: 'success' }),
          onError: fail,
        },
      );
      return;
    }
    setReason('');
    setReversing(usage);
  };

  return (
    <View style={styles.stack}>
      <Text variant="sectionTitle">{t('packages.appointment.title')}</Text>

      {active.map((usage) => {
        const undoable = canUndoNow(usage, user?.id ?? null, nowMs);
        return (
          <Card key={usage.id}>
            <View style={styles.row}>
              <Text variant="body" style={styles.grow}>
                {t('packages.appointment.usedFrom', { name: usage.packageName })}
              </Text>
              {undoable || canReverse.allowed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={reverse.isPending}
                  onPress={() => startReverse(usage)}
                >
                  {t(undoable ? 'packages.appointment.undo' : 'packages.appointment.reverse')}
                </Button>
              ) : null}
            </View>
          </Card>
        );
      })}
      {reversedCount > 0 ? (
        <Text variant="helper" color="textMuted">
          {t('packages.appointment.history')}: {reversedCount} {t('packages.appointment.reversed')}
        </Text>
      ) : null}

      {!eligible ? (
        <Text variant="helper" color="textMuted">
          {t('packages.appointment.notEligible')}
        </Text>
      ) : active.length === 0 ? (
        usable.isPending ? (
          <Skeleton height={44} />
        ) : packages.length === 0 ? (
          <Text variant="helper" color="textMuted">
            {t('packages.appointment.noPackage')}
          </Text>
        ) : (
          <View style={styles.stack}>
            {packages.length > 1 ? (
              <Select
                label={t('packages.appointment.choose')}
                options={packages.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${t('packages.client.remaining', { remaining: p.remaining, total: p.sessionsPurchased + p.sessionsBonus })})`,
                }))}
                value={selected?.id ?? null}
                onChange={setChosen}
              />
            ) : selected ? (
              <Text variant="helper" color="textSecondary">
                {selected.name} ·{' '}
                {t('packages.client.remaining', {
                  remaining: selected.remaining,
                  total: selected.sessionsPurchased + selected.sessionsBonus,
                })}
              </Text>
            ) : null}
            <Button
              variant="secondary"
              disabled={!selected}
              onPress={() =>
                selected && setConfirmPackage({ id: selected.id, name: selected.name })
              }
            >
              {t('packages.appointment.useSession')}
            </Button>
          </View>
        )
      ) : null}

      <Dialog
        open={confirmPackage !== null}
        onClose={() => setConfirmPackage(null)}
        title={t('packages.appointment.confirmTitle')}
        message={t('packages.appointment.confirmMessage', { name: confirmPackage?.name ?? '' })}
        busy={deduct.isPending}
        confirm={{
          label: t('packages.appointment.confirm'),
          variant: 'primary',
          loading: deduct.isPending,
          onPress: () => {
            if (!confirmPackage) return;
            deduct.mutate(
              { appointmentId, clientPackageId: confirmPackage.id },
              {
                onSuccess: (result) => {
                  setConfirmPackage(null);
                  toast.show({
                    message: t('packages.appointment.deductedToast', {
                      remaining: result.remaining,
                    }),
                    tone: 'success',
                  });
                },
                onError: (error) => {
                  setConfirmPackage(null);
                  fail(error);
                },
              },
            );
          },
        }}
        cancelLabel={t('actions.cancel')}
      />

      <Dialog
        open={reversing !== null}
        onClose={() => setReversing(null)}
        title={t('packages.appointment.reverseTitle')}
        message={t('packages.appointment.reverseMessage')}
        busy={reverse.isPending}
        confirm={{
          label: t('packages.appointment.reverseConfirm'),
          variant: 'primary',
          loading: reverse.isPending,
          onPress: () => {
            if (!reversing) return;
            reverse.mutate(
              { usageId: reversing.id, reason },
              {
                onSuccess: () => {
                  setReversing(null);
                  toast.show({ message: t('packages.appointment.undone'), tone: 'success' });
                },
                onError: (error) => {
                  setReversing(null);
                  fail(error);
                },
              },
            );
          },
        }}
        cancelLabel={t('actions.cancel')}
      >
        <Input
          label={t('packages.appointment.reasonLabel')}
          hint={t('packages.appointment.reasonHint')}
          value={reason}
          onChangeText={setReason}
          maxLength={500}
        />
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[8] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
});
