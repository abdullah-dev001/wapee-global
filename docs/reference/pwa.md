# PWA

Moved from CLAUDE.md §4. Read only when the task touches PWA/service worker/manifest.

- Web build must be installable: `manifest.json` (name from brand config, `display: "standalone"`, `theme_color: "#024751"`, `background_color: "#f8fafb"`, all icon sizes incl. maskable + apple-touch-icon), service worker registered.
- Service worker caches **app shell and static assets only**. Never cache Supabase API responses or private files in the service worker (private data). Data caching is TanStack Query's job.
- Show an "Install app" hint; on iOS Safari show "Share → Add to Home Screen" instructions (iOS has no install prompt).
- Handle app updates: new service worker → show "Update available" toast → reload.
