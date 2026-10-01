import { useMemo, useState } from 'react';
import { Platform, type PressableProps } from 'react-native';

export type InteractionState = {
  hovered: boolean;
  focused: boolean;
  pressed: boolean;
};

type InteractionHandlers = Pick<
  PressableProps,
  'onHoverIn' | 'onHoverOut' | 'onFocus' | 'onBlur' | 'onPressIn' | 'onPressOut'
>;

const isWeb = Platform.OS === 'web';

/**
 * Tracks hover / focus / pressed for a Pressable.
 *
 * Hover is web-only (no hover on touch). The focus ring is drawn on web only;
 * on native, focus is not a visible state for touch controls.
 * Spread `handlers` onto the Pressable and read `state` for styling.
 */
export function useInteractionState(disabled = false): {
  state: InteractionState;
  handlers: InteractionHandlers;
  /** Show hover styling: web, hovered and enabled. */
  showHover: boolean;
  /** Show the focus ring: web, focused and enabled. */
  showFocusRing: boolean;
} {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  const handlers = useMemo<InteractionHandlers>(
    () => ({
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
      onFocus: () => {
        // Web: show the ring only for keyboard focus, never after a mouse click.
        // `:focus-visible` is the browser's own answer to that question. React
        // Native Web's synthetic event does not carry the DOM node, so read the
        // focused element directly.
        if (isWeb && typeof document !== 'undefined') {
          const active = document.activeElement;
          setFocused(active?.matches(':focus-visible') ?? true);
          return;
        }
        setFocused(true);
      },
      onBlur: () => setFocused(false),
      onPressIn: () => setPressed(true),
      onPressOut: () => setPressed(false),
    }),
    [],
  );

  // A disabled control reports no hover/press, so it cannot keep a stale state
  // when it becomes disabled mid-interaction.
  return {
    state: {
      hovered: hovered && !disabled,
      focused: focused && !disabled,
      pressed: pressed && !disabled,
    },
    handlers,
    showHover: isWeb && hovered && !disabled,
    showFocusRing: isWeb && focused && !disabled,
  };
}
