import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { callPublicFunction } from '@/features/booking-public/api/client';
import { createQueryKeys } from '@/lib/query';

import { embedState, pickParentOrigin } from '../widgetLogic';

const embedKeys = createQueryKeys('embed-verify');

export type EmbedGuard =
  /** Not framed (or not web): render normally. */
  | { status: 'open' }
  /** Framed: waiting for the server to confirm the embedding site. */
  | { status: 'checking' }
  /** Framed and not confirmed: show the "not available here" message. */
  | { status: 'blocked' };

/**
 * Best-effort embed check for the public booking page (web only). When the page
 * is framed it needs a `?embed=` token and a known parent origin, and the server
 * (`validate_widget` verify) must confirm both. Native is never framed.
 *
 * NOT a security boundary: the host's `frame-ancestors` header is.
 */
export function useEmbedGuard(slug: string | undefined, embedParam: string | null): EmbedGuard {
  const state = useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return embedState({ isFramed: false, embedParam: null, parentOrigin: null });
    }
    let isFramed = false;
    try {
      isFramed = window.self !== window.top;
    } catch {
      isFramed = true; // cross-origin access to `top` throws: that means framed
    }
    const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList })
      .ancestorOrigins;
    const parentOrigin = pickParentOrigin({
      ancestorOrigins: ancestors ? Array.from(ancestors) : null,
      referrer: typeof document !== 'undefined' ? document.referrer : null,
    });
    return embedState({ isFramed, embedParam, parentOrigin });
  }, [embedParam]);

  const verify = useQuery({
    queryKey: embedKeys.detail(
      { businessId: slug ?? 'none' },
      state.kind === 'check' ? `${state.origin}|${state.token}` : 'none',
    ),
    enabled: state.kind === 'check' && Boolean(slug),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (state.kind !== 'check') return false;
      await callPublicFunction('validate_widget', {
        action: 'verify',
        token: state.token,
        slug,
        origin: state.origin,
      });
      return true;
    },
  });

  if (state.kind === 'not_embedded') return { status: 'open' };
  if (state.kind === 'blocked') return { status: 'blocked' };
  if (verify.isPending) return { status: 'checking' };
  return verify.data === true ? { status: 'open' } : { status: 'blocked' };
}
