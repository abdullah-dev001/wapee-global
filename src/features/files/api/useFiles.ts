import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { rpcNull, unwrapRpc } from '@/lib/supabase/rpcResult';

import { FilesApiError, pickProblem, type FileCategory } from '../filesLogic';

export const fileKeys = createQueryKeys('client-files');
export const fileUrlKeys = createQueryKeys('client-file-urls');

const PAGE_SIZE = 20;

export type ClientFile = {
  id: string;
  kind: 'photo' | 'document';
  category: FileCategory;
  name: string;
  mime: string;
  size: number;
  appointmentId: string | null;
  createdAt: string;
};

export type FilesState = {
  photoConsent: boolean;
  recordedAt: string | null;
  recordedByName: string | null;
  canView: boolean;
  canUpload: boolean;
  canEditConsent: boolean;
};

/** Consent + what the caller may do. The RPC refuses (feature_unavailable / forbidden) when the tab must be hidden. */
export function useClientFilesState(
  businessId: string | null,
  clientId: string | null,
  enabled: boolean,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: fileKeys.detail({ businessId: businessId ?? 'none' }, `state:${clientId}`),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(clientId),
    staleTime: staleTimes.liveShort,
    retry: false,
    queryFn: async (): Promise<FilesState | null> => {
      const { data, error } = await getSupabase().rpc('get_client_files_state', {
        p_client_id: clientId ?? '',
      });
      if (error) throw new Error(error.message);
      const r = data as Record<string, unknown> | null;
      if (!r || r.ok !== true) return null;
      return {
        photoConsent: r.photo_consent === true,
        recordedAt: (r.recorded_at as string | null) ?? null,
        recordedByName: (r.recorded_by_name as string | null) ?? null,
        canView: r.can_view === true,
        canUpload: r.can_upload === true,
        canEditConsent: r.can_edit_consent === true,
      };
    },
  });
}

type FilePage = { rows: ClientFile[]; next: { at: string; id: string } | null };

/** A client's files (optionally one appointment), newest first, keyset pages of 20. */
export function useClientFiles(
  businessId: string | null,
  clientId: string | null,
  appointmentId: string | null,
  enabled: boolean,
) {
  const { isAuthenticated } = useSession();
  return useInfiniteQuery<FilePage>({
    queryKey: fileKeys.list({
      businessId: businessId ?? 'none',
      filters: { clientId, appointmentId },
    }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(clientId),
    staleTime: staleTimes.liveShort,
    initialPageParam: null as { at: string; id: string } | null,
    getNextPageParam: (last) => last.next,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as { at: string; id: string } | null;
      const { data, error } = await getSupabase().rpc('list_client_files', {
        p_client_id: clientId ?? '',
        p_appointment_id: appointmentId ?? rpcNull<string>(),
        p_limit: PAGE_SIZE,
        p_before_at: cursor?.at ?? rpcNull<string>(),
        p_before_id: cursor?.id ?? rpcNull<string>(),
      });
      const r = unwrapRpc<{ rows: Record<string, unknown>[]; has_more: boolean }>(data, error);
      const rows = r.rows.map((x) => ({
        id: String(x.id),
        kind: x.kind as ClientFile['kind'],
        category: x.category as FileCategory,
        name: String(x.name),
        mime: String(x.mime),
        size: Number(x.size),
        appointmentId: (x.appointment_id as string | null) ?? null,
        createdAt: String(x.created_at),
      }));
      const last = rows[rows.length - 1];
      return { rows, next: r.has_more && last ? { at: last.createdAt, id: last.id } : null };
    },
  });
}

/** Calls the `client_files` Edge Function as the signed-in user (their JWT is attached by supabase-js). */
async function callClientFiles<T>(body: Record<string, unknown>): Promise<T> {
  const response = await getSupabase().functions.invoke('client_files', { body });
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
    throw new FilesApiError(code);
  }
  const data = response.data as { ok?: boolean; code?: string; data?: T } | null;
  if (!data || data.ok !== true) throw new FilesApiError(data?.code ?? 'unknown');
  return data.data as T;
}

const URL_TTL_SECONDS = 300;

/**
 * Short-lived signed URLs for the visible files. They expire after 5 minutes, so the query goes stale
 * after 4 and refetches while the screen is open; nothing is stored beyond the cache.
 */
export function useFileUrls(businessId: string | null, fileIds: readonly string[]) {
  const { isAuthenticated } = useSession();
  const ids = [...fileIds].sort();
  return useQuery({
    queryKey: fileUrlKeys.list({ businessId: businessId ?? 'none', filters: { ids } }),
    enabled: isAuthenticated && Boolean(businessId) && ids.length > 0,
    staleTime: (URL_TTL_SECONDS - 60) * 1000,
    refetchInterval: (URL_TTL_SECONDS - 60) * 1000,
    queryFn: async () => {
      const result = await callClientFiles<{ urls: { file_id: string; url: string }[] }>({
        action: 'urls',
        file_ids: ids.slice(0, 50),
        ttl: URL_TTL_SECONDS,
      });
      return Object.fromEntries(result.urls.map((u) => [u.file_id, u.url]));
    },
  });
}

export type UploadInput = {
  clientId: string;
  appointmentId: string | null;
  category: FileCategory;
  uri: string;
  mime: string;
  name: string;
  size?: number | null;
};

/** prepare (RPC checks everything) -> PUT the bytes to the signed upload URL -> finish (server reads the first bytes). */
export function useUploadClientFile(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadInput) => {
      const early = pickProblem({ mime: input.mime, size: input.size });
      if (early) throw new FilesApiError(early);

      let bytes: ArrayBuffer;
      try {
        // `Response.arrayBuffer()` works on web, iOS and Android; `Blob.arrayBuffer()` is not reliable in RN.
        bytes = await (await fetch(input.uri)).arrayBuffer();
      } catch {
        throw new FilesApiError('upload_failed');
      }
      const authoritative = pickProblem({ mime: input.mime, size: bytes.byteLength });
      if (authoritative) throw new FilesApiError(authoritative);

      const prepared = await callClientFiles<{ file_id: string; upload_url: string }>({
        action: 'prepare',
        client_id: input.clientId,
        appointment_id: input.appointmentId,
        category: input.category,
        name: input.name,
        mime: input.mime,
        size: bytes.byteLength,
      });
      const put = await fetch(prepared.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': input.mime },
        body: bytes,
      });
      if (!put.ok) throw new FilesApiError('upload_failed');
      await callClientFiles({ action: 'finish', file_id: prepared.file_id });
      return prepared.file_id;
    },
    onSuccess: () => {
      if (businessId)
        void queryClient.invalidateQueries({ queryKey: fileKeys.business(businessId) });
    },
  });
}

export function useDeleteClientFile(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fileId: string; reason?: string }) => {
      const { data, error } = await getSupabase().rpc('delete_file', {
        p_file_id: input.fileId,
        p_reason: input.reason ?? rpcNull<string>(),
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => {
      if (businessId) {
        void queryClient.invalidateQueries({ queryKey: fileKeys.business(businessId) });
        void queryClient.invalidateQueries({ queryKey: fileUrlKeys.business(businessId) });
      }
    },
  });
}

export function useSetPhotoConsent(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; value: boolean }) => {
      const { data, error } = await getSupabase().rpc('set_photo_consent', {
        p_client_id: input.clientId,
        p_value: input.value,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => {
      if (businessId)
        void queryClient.invalidateQueries({ queryKey: fileKeys.business(businessId) });
    },
  });
}
