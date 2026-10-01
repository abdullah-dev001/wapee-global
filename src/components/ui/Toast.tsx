import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shadow, theme, useBreakpoint } from '@/lib/theme';
import { type ColorToken } from '@/lib/theme/colors';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

/**
 * Toast: short feedback after an action. Not defined in DESIGN_GUIDE (§12.23 reserves
 * `z-index 70`), so the look is built from the status tokens: tinted surface, 1px
 * border, radius md, matching the FormAlert pattern.
 *
 * Mount `<ToastProvider>` once near the root, then call `useToast().show(...)`.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export type ToastAction = {
  label: string;
  onPress: () => void;
};

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. Default 4000. Pass 0 to require a manual close. */
  duration?: number;
  /** Optional button, e.g. "Reload" on an update toast. */
  action?: ToastAction;
};

type ToastEntry = ToastOptions & { id: number; tone: ToastTone };

type ToastContextValue = {
  show: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;
const MAX_VISIBLE = 3;

const toneStyles: Record<
  ToastTone,
  { icon: LucideIcon; color: ColorToken; background: ColorToken; border: ColorToken }
> = {
  success: {
    icon: CircleCheck,
    color: 'success',
    background: 'successLight',
    border: 'successBorder',
  },
  error: { icon: CircleAlert, color: 'error', background: 'errorLight', border: 'errorBorder' },
  warning: {
    icon: TriangleAlert,
    color: 'warning',
    background: 'warningLight',
    border: 'warningBorder',
  },
  info: { icon: Info, color: 'info', background: 'infoLight', border: 'infoBorder' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ message, tone = 'info', duration = DEFAULT_DURATION, action }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) =>
        [...current, { id, message, tone, duration, action }].slice(-MAX_VISIBLE),
      );
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Returns `show` / `dismiss`. Throws if the provider is missing. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { isMobile } = useBreakpoint();

  if (toasts.length === 0) return null;

  return (
    <View
      style={[
        styles.viewport,
        {
          top: insets.top + theme.spacing[12],
          paddingHorizontal: theme.spacing[16],
        },
        isMobile ? styles.viewportMobile : styles.viewportDesktop,
      ]}
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </View>
  );
}

function ToastRow({ toast, onDismiss }: { toast: ToastEntry; onDismiss: () => void }) {
  const palette = toneStyles[toast.tone];
  const Icon = palette.icon;
  const { handlers, showHover } = useInteractionState(false);

  return (
    <Animated.View
      entering={FadeInDown.duration(theme.duration.base)}
      exiting={FadeOutUp.duration(theme.duration.fast)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        shadow('lg'),
        {
          backgroundColor: theme.colors[palette.background],
          borderColor: theme.colors[palette.border],
        },
      ]}
    >
      <Icon
        size={theme.iconSize.sm}
        strokeWidth={theme.iconStroke}
        color={theme.colors[palette.color]}
      />
      <Text variant="small" color={palette.color} style={styles.message}>
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          onPress={() => {
            toast.action?.onPress();
            onDismiss();
          }}
          accessibilityRole="button"
          style={styles.action}
        >
          <Text variant="caption" color={palette.color}>
            {toast.action.label}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        {...handlers}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={[styles.close, showHover ? { opacity: 0.7 } : null]}
      >
        <X size={theme.iconSize.xs} strokeWidth={2} color={theme.colors[palette.color]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    // Overlay must not block taps on the screen behind it.
    pointerEvents: 'box-none',
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    left: 0,
    right: 0,
    zIndex: theme.zIndex.toast,
    gap: theme.spacing[8],
  },
  viewportMobile: {
    alignItems: 'stretch',
  },
  viewportDesktop: {
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    width: '100%',
    maxWidth: 420,
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[12],
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
  },
  message: {
    flex: 1,
  },
  action: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[8],
  },
  close: {
    padding: theme.spacing[2],
  },
});
