import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { type RequestKind, type RequestStatus } from '../dataRightsLogic';

/** A refusal from the data-rights RPCs / Edge Function; `code` is mapped to a message by the caller. */
export class DataRightsError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'DataRightsError';
    this.code = code;
  }
}

export const dataRequestKeys = createQueryKeys('data-requests');

async function readCode(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (!context) return 'unknown';
  try {
    const parsed = (await context.clone().json()) as { code?: string };
    return parsed.code ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Calls the `gdpr` Edge Function as the signed-in user (their JWT is attached by supabase-js). */
async function callGdpr<T>(body: Record<string, unknown>): Promise<T> {
  const response = await getSupabase().functions.invoke('gdpr', { body });
  if (response.error) throw new DataRightsError(await readCode(response.error));
  const result = response.data as { ok?: boolean; code?: string; data?: T } | null;
  if (!result || result.ok !== true) throw new DataRightsError(result?.code ?? 'unknown');
  return result.data as T;
}

export type EraseResult = { alreadyErased: boolean; storagePending: number };

/** Everything held about ONE client as a JSON document (permission `clients.export`, audited server-side). */
export function useExportClient() {
  return useMutation<string, DataRightsError, string>({
    mutationFn: async (clientId) => {
      const { data, error } = await getSupabase().rpc('gdpr_export_client', {
        p_client_id: clientId,
      });
      if (error) throw new DataRightsError(error.code === '42501' ? 'not_found' : 'unknown');
      const result = data as { ok?: boolean; code?: string } | null;
      if (!result || result.ok !== true) throw new DataRightsError(result?.code ?? 'unknown');
      return JSON.stringify(result, null, 2);
    },
  });
}

/**
 * Anonymises a client and removes their stored files (permission `clients.erase`). Goes through the `gdpr`
 * Edge Function because only the Storage API can remove bucket objects. Calling it again is safe: it finishes
 * a cleanup that failed half way.
 */
export function useEraseClient() {
  const queryClient = useQueryClient();
  return useMutation<EraseResult, DataRightsError, string>({
    mutationFn: async (clientId) => {
      const data = await callGdpr<{ already_erased?: boolean; storage_pending?: number }>({
        action: 'erase_client',
        client_id: clientId,
      });
      return {
        alreadyErased: data.already_erased === true,
        storagePending: data.storage_pending ?? 0,
      };
    },
    // An erase touches clients, appointments, invoices, files, reviews and messages: refresh everything.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}

export type BusinessEraseCounts = Record<string, number>;

/** Owner only. Empties the business's Storage first, then deletes the business (one irreversible step). */
export function useEraseBusiness() {
  return useMutation<
    BusinessEraseCounts,
    DataRightsError,
    { businessId: string; confirmName: string }
  >({
    mutationFn: async ({ businessId, confirmName }) => {
      const data = await callGdpr<{ counts?: BusinessEraseCounts }>({
        action: 'erase_business',
        business_id: businessId,
        confirm_name: confirmName,
      });
      return data.counts ?? {};
    },
  });
}

export type DataRequest = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  email: string | null;
  createdAt: string;
  resolvedAt: string | null;
  clients: { id: string; fullName: string }[];
};

/** Customer export / erase requests from the portal (permission `clients.export`). Newest first, at most 100. */
export function useDataRequests(businessId: string | null, status: RequestStatus) {
  const { isAuthenticated } = useSession();
  return useQuery<DataRequest[], Error>({
    queryKey: dataRequestKeys.list({ businessId: businessId ?? 'none', filters: { status } }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('list_data_requests', {
        p_business_id: businessId ?? '',
        p_status: status,
      });
      if (error) throw new Error(error.message);
      const result = data as {
        ok?: boolean;
        code?: string;
        rows?: {
          id: string;
          kind: RequestKind;
          status: RequestStatus;
          email: string | null;
          created_at: string;
          resolved_at: string | null;
          clients: { id: string; full_name: string }[];
        }[];
      } | null;
      if (!result || result.ok !== true) throw new Error(result?.code ?? 'unknown');
      return (result.rows ?? []).map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        email: r.email,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        clients: r.clients.map((c) => ({ id: c.id, fullName: c.full_name })),
      }));
    },
  });
}

/** Closes a request without acting on it ('declined') or after acting ('done'). */
export function useResolveDataRequest(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<undefined, DataRightsError, { id: string; outcome: 'done' | 'declined' }>({
    mutationFn: async ({ id, outcome }) => {
      const { data, error } = await getSupabase().rpc('resolve_data_request', {
        p_id: id,
        p_outcome: outcome,
      });
      if (error) throw new DataRightsError('unknown');
      const result = data as { ok?: boolean; code?: string } | null;
      if (!result || result.ok !== true) throw new DataRightsError(result?.code ?? 'unknown');
      return undefined;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: dataRequestKeys.business(businessId ?? 'none'),
      }),
  });
}
