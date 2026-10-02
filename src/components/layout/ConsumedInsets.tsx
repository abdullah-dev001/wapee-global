import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Which safe-area insets something above `Screen` has already absorbed.
 *
 * The problem this solves: on mobile the shell can render a bar above the screen
 * (the trial banner), and that bar has to carry the status-bar inset or it slides
 * under the notch. But every tab screen also passes `edges={['top']}` and adds
 * the same inset, so the gap would be applied twice.
 *
 * Rather than every screen knowing what the shell is doing, the shell declares
 * "top is already handled" and `Screen` skips it. Default is nothing consumed, so
 * a `Screen` outside the shell behaves exactly as before.
 */

export type ConsumedInsets = {
  top: boolean;
};

const ConsumedInsetsContext = createContext<ConsumedInsets>({ top: false });

export function ConsumedInsetsProvider({ top, children }: { top: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ top }), [top]);
  return <ConsumedInsetsContext.Provider value={value}>{children}</ConsumedInsetsContext.Provider>;
}

/** What a parent already absorbed. `Screen` subtracts these from its own padding. */
export function useConsumedInsets(): ConsumedInsets {
  return useContext(ConsumedInsetsContext);
}
