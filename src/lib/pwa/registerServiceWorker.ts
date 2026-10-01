import { Platform } from 'react-native';

export type ServiceWorkerHandlers = {
  /** A new version is installed and waiting. Show "Update available"; call `applyUpdate` on tap. */
  onUpdateAvailable?: (applyUpdate: () => void) => void;
};

/**
 * Registers /sw.js. Web only, production only (a SW in dev serves stale bundles).
 * Safe to call during static rendering (does nothing without `window`).
 */
export function registerServiceWorker(handlers: ServiceWorkerHandlers = {}): void {
  if (Platform.OS !== 'web' || __DEV__) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      const notifyIfWaiting = () => {
        const waiting = registration.waiting;
        if (waiting && navigator.serviceWorker.controller) {
          handlers.onUpdateAvailable?.(() => waiting.postMessage({ type: 'SKIP_WAITING' }));
        }
      };

      notifyIfWaiting();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', notifyIfWaiting);
      });

      // Reload once the new worker takes control.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    } catch (error) {
      console.error('[pwa] Service worker registration failed', error);
    }
  };

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
