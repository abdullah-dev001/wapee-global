import { create } from 'zustand';

export type ReviewLinkShown = { token: string; expiresAt: string };

type ReviewLinkState = {
  link: ReviewLinkShown | null;
  show: (link: ReviewLinkShown) => void;
  hide: () => void;
};

/**
 * The review link to show in the dialog. Client-only UI state: the raw token
 * exists only in memory for as long as the dialog is open (it is never stored on
 * the server in raw form), and is dropped when the dialog closes or on logout.
 */
export const useReviewLinkStore = create<ReviewLinkState>((set) => ({
  link: null,
  show: (link) => set({ link }),
  hide: () => set({ link: null }),
}));

/** Convenience for non-React callers (mutation callbacks). */
export function showReviewLink(request: { token: string; expires_at: string } | undefined) {
  if (request?.token) {
    useReviewLinkStore.getState().show({ token: request.token, expiresAt: request.expires_at });
  }
}
