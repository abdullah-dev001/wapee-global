import { QueryClient } from '@tanstack/react-query';

import { DEFAULT_GC_TIME, staleTimes } from './staleTimes';

const MAX_RETRIES = 2;

/** HTTP-like status from Supabase/PostgREST/fetch errors, when present. */
function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/** Retry network/5xx errors; never retry client errors (auth, RLS, validation). */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = errorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: staleTimes.list,
        gcTime: DEFAULT_GC_TIME,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/** App-wide client. On logout or business switch call `queryClient.clear()`. */
export const queryClient = createQueryClient();
