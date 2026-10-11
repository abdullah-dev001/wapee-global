import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Chromium fires `beforeinstallprompt` with this event; it is not in the DOM lib types.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'wapee.installHintDismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** localStorage can throw in private mode / blocked storage, so both sides are guarded. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Ignore: the hint simply reappears next visit.
  }
}

export type InstallPrompt = {
  /** Show the hint bar. */
  visible: boolean;
  /** iOS Safari cannot prompt: show "Share → Add to Home Screen" instructions instead. */
  needsManualInstructions: boolean;
  /** Triggers the browser prompt. No-op when only instructions are possible. */
  install: () => void;
  /** Hides the hint and remembers the choice. */
  dismiss: () => void;
};

/**
 * "Install app" hint for the web build (CLAUDE.md §4).
 * Never shown when already installed, or once dismissed. Native returns `visible: false`.
 */
export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Read the browser once, during the first render, instead of in an effect:
  // these values cannot change for the life of the page.
  const [manual] = useState(
    () =>
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      !isStandalone() &&
      !readDismissed() &&
      isIosSafari(),
  );
  const [visible, setVisible] = useState(() => manual);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStandalone() || readDismissed()) return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Keep the event so the prompt can be shown from our own button.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    writeDismissed();
  }, []);

  const install = useCallback(() => {
    if (!deferred) return;
    void deferred.prompt();
    void deferred.userChoice.finally(() => {
      setDeferred(null);
      setVisible(false);
    });
  }, [deferred]);

  return { visible, needsManualInstructions: manual, install, dismiss };
}
