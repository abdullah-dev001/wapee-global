import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const widgetKeys = createQueryKeys('widget-key');

export type WidgetKeyData = { publicKey: string; allowedDomains: string[]; isActive: boolean };

export type WidgetErrorCode =
  'forbidden' | 'feature_unavailable' | 'no_key' | 'invalid_domains' | 'unknown';

export class WidgetRpcError extends Error {
  readonly code: WidgetErrorCode;
  constructor(code: string) {
    super(code);
    this.name = 'WidgetRpcError';
    this.code = (
      ['forbidden', 'feature_unavailable', 'no_key', 'invalid_domains'] as const
    ).includes(code as 'forbidden')
      ? (code as WidgetErrorCode)
      : 'unknown';
  }
}

function unwrap(data: unknown, error: { message: string } | null): Record<string, unknown> {
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === false) throw new WidgetRpcError(String(result.code ?? 'unknown'));
  return result;
}

/** The business's widget key row (null = none yet). RLS: `website.edit` holders only. */
export function useWidgetKey(
  businessId: string | null,
): UseQueryResult<WidgetKeyData | null, Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: widgetKeys.detail({ businessId: businessId ?? 'none' }, 'key'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('widget_keys')
        .select('public_key, allowed_domains, is_active')
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        publicKey: data.public_key,
        allowedDomains: data.allowed_domains,
        isActive: data.is_active,
      };
    },
  });
}

function useInvalidate(businessId: string | null) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: widgetKeys.business(businessId ?? 'none'),
    });
}

export function useEnsureWidgetKey(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, undefined>({
    mutationFn: async () => {
      const { data, error } = await getSupabase().rpc('ensure_widget_key', {
        p_business_id: businessId ?? '',
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export function useSaveWidgetDomains(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { domains: string[] }>({
    mutationFn: async ({ domains }) => {
      const { data, error } = await getSupabase().rpc('save_widget_domains', {
        p_business_id: businessId ?? '',
        p_domains: domains,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export function useSetWidgetActive(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { active: boolean }>({
    mutationFn: async ({ active }) => {
      const { data, error } = await getSupabase().rpc('set_widget_active', {
        p_business_id: businessId ?? '',
        p_active: active,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export function useRotateWidgetKey(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, undefined>({
    mutationFn: async () => {
      const { data, error } = await getSupabase().rpc('rotate_widget_key', {
        p_business_id: businessId ?? '',
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}
