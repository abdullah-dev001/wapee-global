import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';

/** A refusal from the data-rights RPCs / Edge Function; `code` is mapped to a message by the caller. */
export class DataRightsError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'DataRightsError';
    this.code = code;
  }
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
      const response = await getSupabase().functions.invoke('gdpr', {
        body: { action: 'erase_client', client_id: clientId },
      });
      if (response.error) {
        const context = (response.error as { context?: Response }).context;
        let code = 'unknown';
        if (context) {
          try {
            const parsed = (await context.clone().json()) as { code?: string };
            code = parsed.code ?? code;
          } catch {
            // keep the generic code
          }
        }
        throw new DataRightsError(code);
      }
      const body = response.data as {
        ok?: boolean;
        code?: string;
        data?: { already_erased?: boolean; storage_pending?: number };
      } | null;
      if (!body || body.ok !== true) throw new DataRightsError(body?.code ?? 'unknown');
      return {
        alreadyErased: body.data?.already_erased === true,
        storagePending: body.data?.storage_pending ?? 0,
      };
    },
    // An erase touches clients, appointments, invoices, files, reviews and messages: refresh everything.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
