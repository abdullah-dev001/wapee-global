import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';

import { getSupabase } from '@/lib/supabase';

import { myBillingKeys, type BillingInterval } from './useMyBilling';

/** A worded failure from `billing_prepare` / Polar; the screen maps `.code` to a message. */
export class BillingActionError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'BillingActionError';
  }
}

type BillingAction =
  | 'checkout'
  | 'portal'
  | 'change_plan'
  | 'change_seats'
  | 'cancel'
  | 'uncancel'
  | 'remove_addon'
  | 'keep_addon';

type BillingData = { url?: string; action?: string };

async function callBilling(
  action: BillingAction,
  businessId: string,
  args?: Record<string, unknown>,
): Promise<BillingData> {
  let response: { data: unknown; error: unknown };
  try {
    response = await getSupabase().functions.invoke('billing', {
      body: { action, business_id: businessId, ...(args ? { args } : {}) },
    });
  } catch {
    throw new BillingActionError('network_error');
  }
  if (response.error) {
    const context = (response.error as { context?: Response }).context;
    let code = 'server_error';
    if (context) {
      try {
        const body = (await context.clone().json()) as { code?: string };
        if (typeof body?.code === 'string') code = body.code;
      } catch {
        // keep the generic code
      }
    }
    throw new BillingActionError(code);
  }
  const data = response.data as { ok?: boolean; code?: string; data?: BillingData } | null;
  if (!data || data.ok !== true) {
    throw new BillingActionError(data?.code ?? 'server_error');
  }
  return data.data ?? {};
}

/**
 * Every Owner billing action, each a mutation. `checkout` and `portal` send the owner to a Polar
 * URL (web only — the screen is gated to web); the apply-now actions (plan / seats / cancel /
 * add-on) refetch `get_my_billing` on success so the screen reflects the new state at once.
 */
export function useBillingActions(businessId: string | null) {
  const queryClient = useQueryClient();
  const bid = businessId ?? '';

  const invalidate = () => {
    if (businessId) {
      void queryClient.invalidateQueries({
        queryKey: myBillingKeys.detail({ businessId }, 'state'),
      });
    }
  };

  const openUrl = async (action: BillingAction, args?: Record<string, unknown>) => {
    const data = await callBilling(action, bid, args);
    if (typeof data.url === 'string') await Linking.openURL(data.url);
  };

  return {
    checkout: useMutation({
      mutationFn: (v: { kind: 'plan' | 'addon'; key: string; interval: BillingInterval }) =>
        openUrl('checkout', v),
    }),
    portal: useMutation({ mutationFn: () => openUrl('portal') }),
    changePlan: useMutation({
      mutationFn: (v: { key: string; interval: BillingInterval }) =>
        callBilling('change_plan', bid, v).then(() => undefined),
      onSuccess: invalidate,
    }),
    changeSeats: useMutation({
      mutationFn: (v: { seats: number }) =>
        callBilling('change_seats', bid, v).then(() => undefined),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: () => callBilling('cancel', bid).then(() => undefined),
      onSuccess: invalidate,
    }),
    uncancel: useMutation({
      mutationFn: () => callBilling('uncancel', bid).then(() => undefined),
      onSuccess: invalidate,
    }),
    removeAddon: useMutation({
      mutationFn: (v: { key: string }) =>
        callBilling('remove_addon', bid, v).then(() => undefined),
      onSuccess: invalidate,
    }),
    keepAddon: useMutation({
      mutationFn: (v: { key: string }) =>
        callBilling('keep_addon', bid, v).then(() => undefined),
      onSuccess: invalidate,
    }),
  };
}
