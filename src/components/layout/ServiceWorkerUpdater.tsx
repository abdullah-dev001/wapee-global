import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/ui/Toast';
import { registerServiceWorker } from '@/lib/pwa/registerServiceWorker';

/**
 * Registers the service worker and shows the "Update available" toast when a new
 * build is waiting (CLAUDE.md §4). Web + production only; the hook itself no-ops
 * elsewhere. Rendered inside ToastProvider.
 */
export function ServiceWorkerUpdater() {
  const { t } = useTranslation();
  const toast = useToast();
  // Register once; the toast callback must not re-register on every render.
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    registerServiceWorker({
      onUpdateAvailable: (applyUpdate) => {
        toast.show({
          message: t('pwa.updateTitle'),
          tone: 'info',
          duration: 0,
          action: { label: t('pwa.updateAction'), onPress: applyUpdate },
        });
      },
    });
  }, [toast, t]);

  return null;
}
